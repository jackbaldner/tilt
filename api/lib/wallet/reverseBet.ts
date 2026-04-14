import { interactiveTransaction, one, all, cuid } from "../db";
import { LedgerEntry } from "./types";

export interface ReverseBetInput {
  betId: string;
  idempotencyKey?: string;
}

export async function reverseBetResolution(input: ReverseBetInput): Promise<string[] | "duplicate"> {
  const naturalKey = input.idempotencyKey ?? `reverse:${input.betId}`;

  const existing = await one<{ id: string }>(
    "SELECT id FROM LedgerEntry WHERE idempotency_key = ?",
    [naturalKey]
  );
  if (existing) return "duplicate";

  // Find resolve entries for this bet that have NOT been reversed yet
  // (i.e., no LedgerEntry exists with reverses_entry_id pointing to them)
  const originals = await all<LedgerEntry>(
    `SELECT * FROM LedgerEntry
     WHERE ref_type = 'bet' AND ref_id = ? AND entry_type = 'resolve'
       AND id NOT IN (SELECT reverses_entry_id FROM LedgerEntry WHERE reverses_entry_id IS NOT NULL)
     ORDER BY created_at ASC, id ASC`,
    [input.betId]
  );

  if (originals.length === 0) {
    throw new Error(`reverseBetResolution: no un-reversed resolve entries for bet ${input.betId}`);
  }

  try {
    return await interactiveTransaction(async (tx) => {
      const reversingIds: string[] = [];
      for (let i = 0; i < originals.length; i++) {
        const orig = originals[i];
        // Inverse transfer: from = orig.to, to = orig.from
        await tx.run("UPDATE Wallet SET balance = balance - ? WHERE id = ?", [orig.amount, orig.to_wallet_id]);
        await tx.run("UPDATE Wallet SET balance = balance + ? WHERE id = ?", [orig.amount, orig.from_wallet_id]);
        const entryId = cuid();
        const entryKey = i === 0 ? naturalKey : `${naturalKey}:${i}`;
        await tx.run(
          `INSERT INTO LedgerEntry (id, from_wallet_id, to_wallet_id, amount, currency, entry_type, ref_type, ref_id, reverses_entry_id, idempotency_key)
           VALUES (?, ?, ?, ?, ?, 'reverse', 'bet', ?, ?, ?)`,
          [entryId, orig.to_wallet_id, orig.from_wallet_id, orig.amount, orig.currency, input.betId, orig.id, entryKey]
        );
        reversingIds.push(entryId);
      }
      return reversingIds;
    });
  } catch (err: unknown) {
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes("UNIQUE constraint failed") && msg.includes("idempotency_key")) {
      return "duplicate";
    }
    throw err;
  }
}

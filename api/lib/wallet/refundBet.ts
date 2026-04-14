import { interactiveTransaction, one, all, cuid } from "../db";
import { getOrCreateWallet } from "./internal";
import { Currency } from "./types";

export interface RefundBetInput {
  betId: string;
  reason: string; // 'lone_joiner' | 'mutual_cancel' | 'tie' | 'dispute_void'
  currency?: Currency;
  idempotencyKey?: string;
}

interface BetSideRow {
  userId: string;
  stake: number;
  createdAt: string;
}

export async function refundBet(input: RefundBetInput): Promise<string[] | "duplicate"> {
  const currency = input.currency ?? "CHIPS";
  const naturalKey = input.idempotencyKey ?? `refund:${input.betId}`;

  const existing = await one<{ id: string }>(
    "SELECT id FROM LedgerEntry WHERE idempotency_key = ?",
    [naturalKey]
  );
  if (existing) return "duplicate";

  const sides = await all<BetSideRow>(
    "SELECT userId, stake, createdAt FROM BetSide WHERE betId = ? ORDER BY createdAt ASC, userId ASC",
    [input.betId]
  );
  if (sides.length === 0) return [];

  const escrowWallet = await getOrCreateWallet("bet_escrow", input.betId, currency);
  // Pre-create user wallets
  const userWallets = new Map<string, string>();
  for (const s of sides) {
    const w = await getOrCreateWallet("user", s.userId, currency);
    userWallets.set(s.userId, w.id);
  }

  try {
    return await interactiveTransaction(async (tx) => {
      const entryIds: string[] = [];
      for (let i = 0; i < sides.length; i++) {
        const side = sides[i];
        const userWalletId = userWallets.get(side.userId)!;
        await tx.run("UPDATE Wallet SET balance = balance - ? WHERE id = ?", [side.stake, escrowWallet.id]);
        await tx.run("UPDATE Wallet SET balance = balance + ? WHERE id = ?", [side.stake, userWalletId]);
        const entryId = cuid();
        const entryKey = i === 0 ? naturalKey : `${naturalKey}:${i}`;
        await tx.run(
          `INSERT INTO LedgerEntry (id, from_wallet_id, to_wallet_id, amount, currency, entry_type, ref_type, ref_id, idempotency_key)
           VALUES (?, ?, ?, ?, ?, 'refund', 'bet', ?, ?)`,
          [entryId, escrowWallet.id, userWalletId, side.stake, currency, input.betId, entryKey]
        );
        entryIds.push(entryId);
      }
      return entryIds;
    });
  } catch (err: unknown) {
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes("UNIQUE constraint failed") && msg.includes("idempotency_key")) {
      return "duplicate";
    }
    throw err;
  }
}

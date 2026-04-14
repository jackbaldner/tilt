import { interactiveTransaction, one, all, cuid } from "../db";
import { getOrCreateWallet } from "./internal";
import { Currency } from "./types";

export interface ResolveBetInput {
  betId: string;
  winningOption: string;
  currency?: Currency;
  rakeBps?: number;
  idempotencyKey?: string;
}

interface BetSideRow {
  id: string;
  userId: string;
  option: string;
  stake: number;
  createdAt: string;
}

export async function resolveBet(input: ResolveBetInput): Promise<string[] | "duplicate"> {
  const currency = input.currency ?? "CHIPS";
  const rakeBps = input.rakeBps ?? 0;
  const naturalKey = input.idempotencyKey ?? `resolve:${input.betId}`;

  // Fast-path idempotency check
  const existing = await one<{ id: string }>(
    "SELECT id FROM LedgerEntry WHERE idempotency_key = ?",
    [naturalKey]
  );
  if (existing) return "duplicate";

  // Load sides (read-only — safe outside transaction)
  const sides = await all<BetSideRow>(
    `SELECT id, userId, option, stake, createdAt FROM BetSide WHERE betId = ? ORDER BY createdAt ASC, id ASC`,
    [input.betId]
  );
  if (sides.length === 0) {
    throw new Error(`resolveBet: no sides found for bet ${input.betId}`);
  }

  const winners = sides.filter((s) => s.option === input.winningOption);
  if (winners.length === 0) {
    throw new Error(
      `resolveBet: winning option "${input.winningOption}" has no joiners — use refundBet (push) instead`
    );
  }

  // Pre-create wallets outside transaction
  const escrowWallet = await getOrCreateWallet("bet_escrow", input.betId, currency);
  const houseWalletId = currency === "CHIPS" ? "sys_house_chips" : "sys_house_coins";
  // Pre-create winner wallets so we don't have to within the transaction
  const winnerWallets = new Map<string, string>();
  for (const w of winners) {
    const ww = await getOrCreateWallet("user", w.userId, currency);
    winnerWallets.set(w.userId, ww.id);
  }

  try {
    return await interactiveTransaction(async (tx) => {
      const escrow = await tx.one<{ balance: number }>(
        "SELECT balance FROM Wallet WHERE id = ?",
        [escrowWallet.id]
      );
      const pot = escrow?.balance ?? 0;
      if (pot === 0) {
        throw new Error(`resolveBet: escrow for bet ${input.betId} is empty`);
      }

      const entryIds: string[] = [];

      // 1. Rake
      const rakeAmount = Math.floor((pot * rakeBps) / 10000);
      if (rakeAmount > 0) {
        await tx.run("UPDATE Wallet SET balance = balance - ? WHERE id = ?", [rakeAmount, escrowWallet.id]);
        await tx.run("UPDATE Wallet SET balance = balance + ? WHERE id = ?", [rakeAmount, houseWalletId]);
        const rakeEntryId = cuid();
        await tx.run(
          `INSERT INTO LedgerEntry (id, from_wallet_id, to_wallet_id, amount, currency, entry_type, ref_type, ref_id, idempotency_key)
           VALUES (?, ?, ?, ?, ?, 'resolve', 'bet', ?, ?)`,
          [rakeEntryId, escrowWallet.id, houseWalletId, rakeAmount, currency, input.betId, `${naturalKey}:rake`]
        );
        entryIds.push(rakeEntryId);
      }

      // 2. Distributable: split equally among winners; remainder to earliest (winners[0])
      const distributable = pot - rakeAmount;
      const sharePerWinner = Math.floor(distributable / winners.length);
      const remainder = distributable - sharePerWinner * winners.length;

      for (let i = 0; i < winners.length; i++) {
        const winner = winners[i];
        const payout = sharePerWinner + (i === 0 ? remainder : 0);
        if (payout === 0) continue;

        const winnerWalletId = winnerWallets.get(winner.userId)!;
        await tx.run("UPDATE Wallet SET balance = balance - ? WHERE id = ?", [payout, escrowWallet.id]);
        await tx.run("UPDATE Wallet SET balance = balance + ? WHERE id = ?", [payout, winnerWalletId]);
        const entryId = cuid();
        // First winner uses the natural key (the "main" entry); others use derived keys
        const entryKey = i === 0 ? naturalKey : `${naturalKey}:winner:${i}`;
        await tx.run(
          `INSERT INTO LedgerEntry (id, from_wallet_id, to_wallet_id, amount, currency, entry_type, ref_type, ref_id, idempotency_key)
           VALUES (?, ?, ?, ?, ?, 'resolve', 'bet', ?, ?)`,
          [entryId, escrowWallet.id, winnerWalletId, payout, currency, input.betId, entryKey]
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

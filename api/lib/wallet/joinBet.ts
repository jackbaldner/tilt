import { interactiveTransaction, one, cuid } from "../db";
import { getOrCreateWallet } from "./internal";
import { Currency, InsufficientFundsError, Wallet } from "./types";

export interface JoinBetInput {
  betId: string;
  userId: string;
  option: string;
  stake: number;
  currency?: Currency;
  idempotencyKey?: string;
}

export async function joinBet(input: JoinBetInput): Promise<string | "duplicate"> {
  const currency = input.currency ?? "CHIPS";
  const naturalKey = input.idempotencyKey ?? `join:${input.betId}:${input.userId}`;

  if (input.stake <= 0) {
    throw new Error(`joinBet: stake must be positive, got ${input.stake}`);
  }

  // Fast-path idempotency check
  const existing = await one<{ id: string }>(
    "SELECT id FROM LedgerEntry WHERE idempotency_key = ?",
    [naturalKey]
  );
  if (existing) return "duplicate";

  // Pre-create wallets outside the transaction (each is its own tx)
  const userWallet = await getOrCreateWallet("user", input.userId, currency);
  const escrowWallet = await getOrCreateWallet("bet_escrow", input.betId, currency);

  try {
    return await interactiveTransaction(async (tx) => {
      // Read user balance INSIDE the transaction
      const user = await tx.one<Wallet>("SELECT * FROM Wallet WHERE id = ?", [userWallet.id]);
      if (!user) throw new Error(`User wallet ${userWallet.id} disappeared`);
      if (user.balance < input.stake) {
        throw new InsufficientFundsError(user.id, input.stake, user.balance);
      }

      // Insert BetSide first (UNIQUE constraint is the natural lock against double-join)
      const sideId = cuid();
      await tx.run(
        `INSERT INTO BetSide (id, betId, userId, option, stake)
         VALUES (?, ?, ?, ?, ?)`,
        [sideId, input.betId, input.userId, input.option, input.stake]
      );

      // Move chips
      await tx.run("UPDATE Wallet SET balance = balance - ? WHERE id = ?", [input.stake, userWallet.id]);
      await tx.run("UPDATE Wallet SET balance = balance + ? WHERE id = ?", [input.stake, escrowWallet.id]);

      // Write ledger entry
      const entryId = cuid();
      await tx.run(
        `INSERT INTO LedgerEntry
           (id, from_wallet_id, to_wallet_id, amount, currency, entry_type, ref_type, ref_id, idempotency_key)
         VALUES (?, ?, ?, ?, ?, 'join', 'bet', ?, ?)`,
        [entryId, userWallet.id, escrowWallet.id, input.stake, currency, input.betId, naturalKey]
      );

      return entryId;
    });
  } catch (err: unknown) {
    const msg = String((err as Error)?.message ?? err);
    // Catch UNIQUE constraint on either idempotency_key (concurrent same key)
    // or BetSide.betId/userId (double-join via natural key path).
    if (msg.includes("UNIQUE constraint failed")) {
      if (msg.includes("idempotency_key") || msg.includes("BetSide")) {
        return "duplicate";
      }
    }
    throw err;
  }
}

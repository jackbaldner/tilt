import { interactiveTransaction, one, cuid, type InteractiveTx } from "../db";
import { getOrCreateWalletInTx } from "./internal";
import { Currency, InsufficientFundsError, Wallet } from "./types";

export interface JoinBetInput {
  betId: string;
  userId: string;
  option: string;
  stake: number;
  currency?: Currency;
  idempotencyKey?: string;
}

export interface JoinBetResult {
  entryId: string;
  sideId: string;
  userWalletId: string;
  escrowWalletId: string;
}

/**
 * In-transaction body of joinBet. Caller provides the tx. Does NOT do a
 * fast-path idempotency check — if the idempotency_key or BetSide unique
 * constraint is hit, the entire outer transaction rolls back. Callers who
 * need graceful duplicate handling should use the top-level `joinBet`
 * wrapper instead, which catches the constraint violation and returns
 * the sentinel `"duplicate"`.
 */
export async function joinBetInTx(
  tx: InteractiveTx,
  input: JoinBetInput
): Promise<JoinBetResult> {
  if (input.stake <= 0) {
    throw new Error(`joinBet: stake must be positive, got ${input.stake}`);
  }

  const currency = input.currency ?? "CHIPS";
  const naturalKey = input.idempotencyKey ?? `join:${input.betId}:${input.userId}`;

  const userWallet = await getOrCreateWalletInTx(tx, "user", input.userId, currency);
  const escrowWallet = await getOrCreateWalletInTx(tx, "bet_escrow", input.betId, currency);

  // Re-read user wallet balance inside the tx (we just wrote to it via
  // getOrCreateWalletInTx, which may have created a 0-balance row).
  const userRow = await tx.one<Wallet>("SELECT * FROM Wallet WHERE id = ?", [userWallet.id]);
  if (!userRow) throw new Error(`User wallet ${userWallet.id} disappeared mid-transaction`);
  if (userRow.balance < input.stake) {
    throw new InsufficientFundsError(userRow.id, input.stake, userRow.balance);
  }

  // Insert BetSide first. The (betId, userId) UNIQUE constraint is the
  // natural lock against double-joining. We specify status and createdAt
  // explicitly so we don't depend on schema defaults being present in prod.
  const sideId = cuid();
  const nowIso = new Date().toISOString();
  await tx.run(
    `INSERT INTO BetSide (id, betId, userId, option, stake, status, createdAt)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    [sideId, input.betId, input.userId, input.option, input.stake, nowIso]
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

  return {
    entryId,
    sideId,
    userWalletId: userWallet.id,
    escrowWalletId: escrowWallet.id,
  };
}

/**
 * Top-level joinBet with fast-path idempotency check and graceful duplicate
 * handling. Use this when there's no surrounding transaction.
 */
export async function joinBet(input: JoinBetInput): Promise<JoinBetResult | "duplicate"> {
  const currency = input.currency ?? "CHIPS";
  const naturalKey = input.idempotencyKey ?? `join:${input.betId}:${input.userId}`;

  if (input.stake <= 0) {
    throw new Error(`joinBet: stake must be positive, got ${input.stake}`);
  }

  // Fast-path idempotency check (avoid entering the tx entirely if already done)
  const existing = await one<{ id: string }>(
    "SELECT id FROM LedgerEntry WHERE idempotency_key = ?",
    [naturalKey]
  );
  if (existing) return "duplicate";

  try {
    return await interactiveTransaction((tx) => joinBetInTx(tx, { ...input, currency, idempotencyKey: naturalKey }));
  } catch (err: unknown) {
    const msg = String((err as Error)?.message ?? err);
    // UNIQUE constraint on either LedgerEntry.idempotency_key (concurrent
    // same key) or BetSide.betId/userId (double-join via natural key path).
    if (msg.includes("UNIQUE constraint failed")) {
      if (msg.includes("idempotency_key") || msg.includes("BetSide")) {
        return "duplicate";
      }
    }
    throw err;
  }
}

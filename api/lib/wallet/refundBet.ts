import { interactiveTransaction, one, cuid, type InteractiveTx } from "../db";
import { getOrCreateWalletInTx } from "./internal";
import { Currency } from "./types";

export interface RefundBetInput {
  betId: string;
  /** 'lone_joiner' | 'mutual_cancel' | 'tie' | 'dispute_void' — encoded into the natural idempotency key. */
  reason: string;
  currency?: Currency;
  idempotencyKey?: string;
}

export interface RefundBetRefund {
  userId: string;
  /** Chips refunded (always equal to the user's original stake for this bet). */
  amount: number;
  entryId: string;
}

export interface RefundBetResult {
  refunds: RefundBetRefund[];
  entryIds: string[];
}

interface BetSideRow {
  userId: string;
  stake: number;
  createdAt: string;
}

/**
 * In-transaction body of refundBet. Returns the per-joiner refund map
 * so routes can correctly mark BetSide rows as voided and record
 * accurate stats.
 *
 * Unlike resolveBet, this is a no-op (not an error) when no sides exist.
 * That lets callers call refundBet unconditionally in void scenarios.
 */
export async function refundBetInTx(
  tx: InteractiveTx,
  input: RefundBetInput
): Promise<RefundBetResult> {
  const currency = input.currency ?? "CHIPS";
  const naturalKey = input.idempotencyKey ?? `refund:${input.betId}:${input.reason}`;

  const sides = await tx.all<BetSideRow>(
    "SELECT userId, stake, createdAt FROM BetSide WHERE betId = ? ORDER BY createdAt ASC, userId ASC",
    [input.betId]
  );
  if (sides.length === 0) return { refunds: [], entryIds: [] };

  const escrowWallet = await getOrCreateWalletInTx(tx, "bet_escrow", input.betId, currency);

  const refunds: RefundBetRefund[] = [];
  const entryIds: string[] = [];

  for (let i = 0; i < sides.length; i++) {
    const side = sides[i];
    const userWallet = await getOrCreateWalletInTx(tx, "user", side.userId, currency);
    await tx.run("UPDATE Wallet SET balance = balance - ? WHERE id = ?", [side.stake, escrowWallet.id]);
    await tx.run("UPDATE Wallet SET balance = balance + ? WHERE id = ?", [side.stake, userWallet.id]);
    const entryId = cuid();
    const entryKey = i === 0 ? naturalKey : `${naturalKey}:${i}`;
    await tx.run(
      `INSERT INTO LedgerEntry (id, from_wallet_id, to_wallet_id, amount, currency, entry_type, ref_type, ref_id, idempotency_key)
       VALUES (?, ?, ?, ?, ?, 'refund', 'bet', ?, ?)`,
      [entryId, escrowWallet.id, userWallet.id, side.stake, currency, input.betId, entryKey]
    );
    refunds.push({ userId: side.userId, amount: side.stake, entryId });
    entryIds.push(entryId);
  }

  return { refunds, entryIds };
}

/**
 * Top-level refundBet with fast-path idempotency and graceful duplicate
 * handling. Use this when there's no surrounding transaction.
 */
export async function refundBet(
  input: RefundBetInput
): Promise<RefundBetResult | "duplicate"> {
  const naturalKey = input.idempotencyKey ?? `refund:${input.betId}:${input.reason}`;

  const existing = await one<{ id: string }>(
    "SELECT id FROM LedgerEntry WHERE idempotency_key = ?",
    [naturalKey]
  );
  if (existing) return "duplicate";

  try {
    return await interactiveTransaction((tx) => refundBetInTx(tx, { ...input, idempotencyKey: naturalKey }));
  } catch (err: unknown) {
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes("UNIQUE constraint failed") && msg.includes("idempotency_key")) {
      return "duplicate";
    }
    throw err;
  }
}

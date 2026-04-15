import { interactiveTransaction, one, all, cuid, type InteractiveTx } from "../db";
import { getOrCreateWalletInTx } from "./internal";
import { Currency } from "./types";

export interface ResolveBetInput {
  betId: string;
  winningOption: string;
  currency?: Currency;
  rakeBps?: number;
  idempotencyKey?: string;
}

export interface ResolveBetPayout {
  userId: string;
  /** Actual chips credited to this winner (gross, not profit). */
  payout: number;
  /** Stake this winner put in at join time (for profit calculation). */
  stake: number;
  entryId: string;
}

export interface ResolveBetResult {
  /** Absolute rake amount siphoned to the House wallet. */
  rakeAmount: number;
  rakeEntryId: string | null;
  /** Per-winner payout details in deterministic order (earliest joiner first). */
  payouts: ResolveBetPayout[];
  /**
   * All ledger entry IDs created by this resolution (rake + winner entries),
   * in the order they were written. Preserved for backwards compatibility
   * with callers that previously got `string[]`.
   */
  entryIds: string[];
}

interface BetSideRow {
  id: string;
  userId: string;
  option: string;
  stake: number;
  createdAt: string;
}

/**
 * In-transaction body of resolveBet. Caller provides the tx.
 *
 * Returns the full payout map so routes can correctly update user stats
 * (totalChipsWon/totalChipsLost, biggestWin, etc.) based on *actual*
 * per-winner payouts rather than the bet's total pot.
 *
 * Throws if the bet has no joiners or if the winning option has no takers
 * — the refund path (`refundBetInTx`) handles those cases instead.
 */
export async function resolveBetInTx(
  tx: InteractiveTx,
  input: ResolveBetInput
): Promise<ResolveBetResult> {
  const currency = input.currency ?? "CHIPS";
  const rakeBps = input.rakeBps ?? 0;
  const naturalKey = input.idempotencyKey ?? `resolve:${input.betId}`;

  const sides = await tx.all<BetSideRow>(
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

  const escrowWallet = await getOrCreateWalletInTx(tx, "bet_escrow", input.betId, currency);
  const houseWallet = await getOrCreateWalletInTx(tx, "system", "SYSTEM_HOUSE", currency);

  const escrowRow = await tx.one<{ balance: number }>(
    "SELECT balance FROM Wallet WHERE id = ?",
    [escrowWallet.id]
  );
  const pot = escrowRow?.balance ?? 0;
  if (pot === 0) {
    throw new Error(`resolveBet: escrow for bet ${input.betId} is empty`);
  }

  const entryIds: string[] = [];
  const payouts: ResolveBetPayout[] = [];

  // 1. Rake
  const rakeAmount = Math.floor((pot * rakeBps) / 10000);
  let rakeEntryId: string | null = null;
  if (rakeAmount > 0) {
    await tx.run("UPDATE Wallet SET balance = balance - ? WHERE id = ?", [rakeAmount, escrowWallet.id]);
    await tx.run("UPDATE Wallet SET balance = balance + ? WHERE id = ?", [rakeAmount, houseWallet.id]);
    rakeEntryId = cuid();
    await tx.run(
      `INSERT INTO LedgerEntry (id, from_wallet_id, to_wallet_id, amount, currency, entry_type, ref_type, ref_id, idempotency_key)
       VALUES (?, ?, ?, ?, ?, 'resolve', 'bet', ?, ?)`,
      [rakeEntryId, escrowWallet.id, houseWallet.id, rakeAmount, currency, input.betId, `${naturalKey}:rake`]
    );
    entryIds.push(rakeEntryId);
  }

  // 2. Distributable split. Equal split among winners; integer remainder
  // goes to the earliest joiner so we never lose chips to rounding.
  const distributable = pot - rakeAmount;
  const sharePerWinner = Math.floor(distributable / winners.length);
  const remainder = distributable - sharePerWinner * winners.length;

  for (let i = 0; i < winners.length; i++) {
    const winner = winners[i];
    const payout = sharePerWinner + (i === 0 ? remainder : 0);
    if (payout === 0) continue;

    const winnerWallet = await getOrCreateWalletInTx(tx, "user", winner.userId, currency);
    await tx.run("UPDATE Wallet SET balance = balance - ? WHERE id = ?", [payout, escrowWallet.id]);
    await tx.run("UPDATE Wallet SET balance = balance + ? WHERE id = ?", [payout, winnerWallet.id]);
    const entryId = cuid();
    // First winner uses the natural key (the main entry); others use derived keys
    const entryKey = i === 0 ? naturalKey : `${naturalKey}:winner:${i}`;
    await tx.run(
      `INSERT INTO LedgerEntry (id, from_wallet_id, to_wallet_id, amount, currency, entry_type, ref_type, ref_id, idempotency_key)
       VALUES (?, ?, ?, ?, ?, 'resolve', 'bet', ?, ?)`,
      [entryId, escrowWallet.id, winnerWallet.id, payout, currency, input.betId, entryKey]
    );
    entryIds.push(entryId);
    payouts.push({
      userId: winner.userId,
      payout,
      stake: winner.stake,
      entryId,
    });
  }

  return { rakeAmount, rakeEntryId, payouts, entryIds };
}

/**
 * Top-level resolveBet with fast-path idempotency and graceful duplicate
 * handling. Use this when there's no surrounding transaction.
 */
export async function resolveBet(
  input: ResolveBetInput
): Promise<ResolveBetResult | "duplicate"> {
  const naturalKey = input.idempotencyKey ?? `resolve:${input.betId}`;

  const existing = await one<{ id: string }>(
    "SELECT id FROM LedgerEntry WHERE idempotency_key = ?",
    [naturalKey]
  );
  if (existing) return "duplicate";

  try {
    return await interactiveTransaction((tx) => resolveBetInTx(tx, { ...input, idempotencyKey: naturalKey }));
  } catch (err: unknown) {
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes("UNIQUE constraint failed") && msg.includes("idempotency_key")) {
      return "duplicate";
    }
    throw err;
  }
}

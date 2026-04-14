import { one } from "../db";
import { getOrCreateWallet, transferAtomic } from "./internal";
import { Currency } from "./types";

export interface GrantInput {
  userId: string;
  currency: Currency;
  amount: number;
  reason: string;
  idempotencyKey?: string;
}

const MINT_WALLET_IDS: Record<Currency, string> = {
  CHIPS: "sys_mint_chips",
  COINS: "sys_mint_coins",
};

export async function grant(input: GrantInput): Promise<string | "duplicate"> {
  if (input.amount <= 0) {
    throw new Error(`grant: amount must be positive, got ${input.amount}`);
  }

  const naturalKey = input.idempotencyKey ?? `grant:${input.reason}:${input.userId}`;

  const existing = await one<{ id: string }>(
    "SELECT id FROM LedgerEntry WHERE idempotency_key = ?",
    [naturalKey]
  );
  if (existing) return "duplicate";

  const userWallet = await getOrCreateWallet("user", input.userId, input.currency);

  try {
    return await transferAtomic({
      fromWalletId: MINT_WALLET_IDS[input.currency],
      toWalletId: userWallet.id,
      amount: input.amount,
      currency: input.currency,
      entryType: "grant",
      refType: "grant",
      refId: input.reason,
      reversesEntryId: null,
      idempotencyKey: naturalKey,
    });
  } catch (err: any) {
    // The UNIQUE constraint on LedgerEntry.idempotency_key is the source of truth.
    // If a concurrent caller beat us to it, treat as duplicate (not a real error).
    const msg = String(err?.message ?? err);
    if (msg.includes("UNIQUE constraint failed") && msg.includes("idempotency_key")) {
      return "duplicate";
    }
    throw err;
  }
}

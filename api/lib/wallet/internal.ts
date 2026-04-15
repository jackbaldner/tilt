import { interactiveTransaction, cuid, type InteractiveTx } from "../db";
import {
  Currency,
  EntryType,
  Wallet,
  WalletOwnerType,
  InsufficientFundsError,
} from "./types";

/**
 * Upsert a wallet row using ON CONFLICT DO NOTHING for concurrency safety.
 * Works inside an existing interactive transaction.
 */
export async function getOrCreateWalletInTx(
  tx: InteractiveTx,
  ownerType: WalletOwnerType,
  ownerId: string,
  currency: Currency
): Promise<Wallet> {
  const newId = cuid();
  await tx.run(
    `INSERT INTO Wallet (id, owner_type, owner_id, currency, balance)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT (owner_type, owner_id, currency) DO NOTHING`,
    [newId, ownerType, ownerId, currency]
  );
  const row = await tx.one<Wallet>(
    "SELECT * FROM Wallet WHERE owner_type = ? AND owner_id = ? AND currency = ?",
    [ownerType, ownerId, currency]
  );
  if (!row) {
    throw new Error(`getOrCreateWallet: failed to find wallet after upsert`);
  }
  return row;
}

/**
 * Public wrapper that opens its own interactive transaction. Safe for
 * routes that aren't already inside one.
 */
export async function getOrCreateWallet(
  ownerType: WalletOwnerType,
  ownerId: string,
  currency: Currency
): Promise<Wallet> {
  return interactiveTransaction((tx) => getOrCreateWalletInTx(tx, ownerType, ownerId, currency));
}

export interface TransferInput {
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  currency: Currency;
  entryType: EntryType;
  refType: string | null;
  refId: string | null;
  reversesEntryId: string | null;
  idempotencyKey: string | null;
}

/**
 * Atomic debit + credit + ledger insert, run inside an existing transaction.
 * Wallets with owner_type='system' AND owner_id='SYSTEM_MINT' (the Mint
 * wallets for each currency) are the only wallets allowed to have negative
 * balances.
 */
export async function transferAtomicInTx(
  tx: InteractiveTx,
  input: TransferInput
): Promise<string> {
  if (input.amount <= 0) {
    throw new Error(`transferAtomic: amount must be positive, got ${input.amount}`);
  }
  if (input.fromWalletId === input.toWalletId) {
    throw new Error(`transferAtomic: from and to wallets must differ`);
  }

  const from = await tx.one<Wallet>("SELECT * FROM Wallet WHERE id = ?", [input.fromWalletId]);
  const to = await tx.one<Wallet>("SELECT * FROM Wallet WHERE id = ?", [input.toWalletId]);
  if (!from) throw new Error(`Source wallet ${input.fromWalletId} not found`);
  if (!to) throw new Error(`Destination wallet ${input.toWalletId} not found`);
  if (from.currency !== input.currency || to.currency !== input.currency) {
    throw new Error(`Currency mismatch in transfer`);
  }

  const isMint = from.owner_type === "system" && from.owner_id === "SYSTEM_MINT";
  if (!isMint && from.balance < input.amount) {
    throw new InsufficientFundsError(from.id, input.amount, from.balance);
  }

  await tx.run("UPDATE Wallet SET balance = balance - ? WHERE id = ?", [input.amount, input.fromWalletId]);
  await tx.run("UPDATE Wallet SET balance = balance + ? WHERE id = ?", [input.amount, input.toWalletId]);

  const entryId = cuid();
  await tx.run(
    `INSERT INTO LedgerEntry
       (id, from_wallet_id, to_wallet_id, amount, currency, entry_type,
        ref_type, ref_id, reverses_entry_id, idempotency_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entryId,
      input.fromWalletId,
      input.toWalletId,
      input.amount,
      input.currency,
      input.entryType,
      input.refType,
      input.refId,
      input.reversesEntryId,
      input.idempotencyKey,
    ]
  );

  return entryId;
}

/**
 * Public wrapper for transferAtomic that opens its own transaction.
 */
export async function transferAtomic(input: TransferInput): Promise<string> {
  return interactiveTransaction((tx) => transferAtomicInTx(tx, input));
}

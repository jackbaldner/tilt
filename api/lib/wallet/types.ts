export type Currency = "CHIPS" | "COINS";

export type WalletOwnerType = "user" | "bet_escrow" | "system";

export type EntryType = "grant" | "join" | "resolve" | "refund" | "reverse";

export interface Wallet {
  id: string;
  owner_type: WalletOwnerType;
  owner_id: string;
  currency: Currency;
  balance: number;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  from_wallet_id: string;
  to_wallet_id: string;
  amount: number;
  currency: Currency;
  entry_type: EntryType;
  ref_type: string | null;
  ref_id: string | null;
  reverses_entry_id: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface IdempotencyRequest {
  key: string;
  user_id: string;
  request_hash: string;
  response_json: string;
  status_code: number;
  created_at: string;
}

export class InsufficientFundsError extends Error {
  constructor(walletId: string, requested: number, available: number) {
    super(`Insufficient funds in wallet ${walletId}: requested ${requested}, available ${available}`);
    this.name = "InsufficientFundsError";
  }
}

export class WalletNotFoundError extends Error {
  constructor(ownerType: WalletOwnerType, ownerId: string, currency: Currency) {
    super(`Wallet not found: ${ownerType}/${ownerId}/${currency}`);
    this.name = "WalletNotFoundError";
  }
}

export class IdempotencyConflictError extends Error {
  constructor(key: string) {
    super(`Idempotency key reused with different request: ${key}`);
    this.name = "IdempotencyConflictError";
  }
}

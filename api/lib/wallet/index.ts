import { one } from "../db";
import { Currency } from "./types";

export * from "./types";
export { ensureWalletSchema } from "./migrate";

export async function getBalance(userId: string, currency: Currency = "CHIPS"): Promise<number> {
  const row = await one<{ balance: number }>(
    "SELECT balance FROM Wallet WHERE owner_type = 'user' AND owner_id = ? AND currency = ?",
    [userId, currency]
  );
  return row?.balance ?? 0;
}

export { grant, type GrantInput } from "./grant";

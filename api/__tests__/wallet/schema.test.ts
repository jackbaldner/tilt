import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet schema", () => {
  beforeEach(() => vi.resetModules());

  it("creates all tables and seeds system wallets", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { all, one } = await import("../../lib/db");

    await ensureWalletSchema();

    const tables = await all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const names = tables.map((t) => t.name);
    expect(names).toContain("Wallet");
    expect(names).toContain("LedgerEntry");
    expect(names).toContain("IdempotencyRequest");

    const mintChips = await one<{ balance: number }>(
      "SELECT balance FROM Wallet WHERE id = 'sys_mint_chips'"
    );
    expect(mintChips?.balance).toBe(0);

    const houseChips = await one<{ balance: number }>(
      "SELECT balance FROM Wallet WHERE id = 'sys_house_chips'"
    );
    expect(houseChips?.balance).toBe(0);

    const mintCoins = await one<{ balance: number }>(
      "SELECT balance FROM Wallet WHERE id = 'sys_mint_coins'"
    );
    expect(mintCoins?.balance).toBe(0);

    const houseCoins = await one<{ balance: number }>(
      "SELECT balance FROM Wallet WHERE id = 'sys_house_coins'"
    );
    expect(houseCoins?.balance).toBe(0);
  });

  it("is idempotent (safe to run twice)", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    await ensureWalletSchema();
    await ensureWalletSchema();
    // No error = pass
  });

  it("enforces currency CHECK constraint", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();

    // Currency must be CHIPS or COINS
    await expect(
      run("INSERT INTO Wallet (id, owner_type, owner_id, currency) VALUES ('w1', 'user', 'u1', 'BOGUS')")
    ).rejects.toThrow();
  });
});

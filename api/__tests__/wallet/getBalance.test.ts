import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet.getBalance", () => {
  beforeEach(() => vi.resetModules());

  it("returns 0 for a user with no wallet yet", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    await ensureWalletSchema();
    expect(await wallet.getBalance("u1", "CHIPS")).toBe(0);
  });

  it("returns balance after seeding", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { getOrCreateWallet } = await import("../../lib/wallet/internal");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();

    const w = await getOrCreateWallet("user", "u1", "CHIPS");
    await run("UPDATE Wallet SET balance = 1500 WHERE id = ?", [w.id]);

    expect(await wallet.getBalance("u1", "CHIPS")).toBe(1500);
  });

  it("defaults to CHIPS currency when not specified", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { getOrCreateWallet } = await import("../../lib/wallet/internal");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();

    const w = await getOrCreateWallet("user", "u1", "CHIPS");
    await run("UPDATE Wallet SET balance = 750 WHERE id = ?", [w.id]);

    expect(await wallet.getBalance("u1")).toBe(750);
  });

  it("ignores wallets in a different currency", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { getOrCreateWallet } = await import("../../lib/wallet/internal");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();

    const chipsW = await getOrCreateWallet("user", "u1", "CHIPS");
    const coinsW = await getOrCreateWallet("user", "u1", "COINS");
    await run("UPDATE Wallet SET balance = 100 WHERE id = ?", [chipsW.id]);
    await run("UPDATE Wallet SET balance = 999 WHERE id = ?", [coinsW.id]);

    expect(await wallet.getBalance("u1", "CHIPS")).toBe(100);
    expect(await wallet.getBalance("u1", "COINS")).toBe(999);
  });
});

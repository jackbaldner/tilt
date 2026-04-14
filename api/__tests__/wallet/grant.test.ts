import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet.grant", () => {
  beforeEach(() => vi.resetModules());

  it("grants chips from mint to user", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    await ensureWalletSchema();

    await wallet.grant({ userId: "u1", currency: "CHIPS", amount: 1000, reason: "signup" });

    expect(await wallet.getBalance("u1", "CHIPS")).toBe(1000);

    const { one } = await import("../../lib/db");
    const mint = await one<{ balance: number }>("SELECT balance FROM Wallet WHERE id = 'sys_mint_chips'");
    expect(mint?.balance).toBe(-1000);
  });

  it("is idempotent via natural key (signup)", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    await ensureWalletSchema();

    await wallet.grant({ userId: "u1", currency: "CHIPS", amount: 1000, reason: "signup" });
    await wallet.grant({ userId: "u1", currency: "CHIPS", amount: 1000, reason: "signup" });

    expect(await wallet.getBalance("u1", "CHIPS")).toBe(1000);
  });

  it("respects custom idempotency key", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    await ensureWalletSchema();

    await wallet.grant({ userId: "u1", currency: "CHIPS", amount: 500, reason: "promo:winter", idempotencyKey: "promo-abc" });
    const result = await wallet.grant({ userId: "u1", currency: "CHIPS", amount: 500, reason: "promo:winter", idempotencyKey: "promo-abc" });
    expect(result).toBe("duplicate");
    expect(await wallet.getBalance("u1", "CHIPS")).toBe(500);
  });

  it("rejects negative or zero amounts", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    await ensureWalletSchema();

    await expect(
      wallet.grant({ userId: "u1", currency: "CHIPS", amount: 0, reason: "signup" })
    ).rejects.toThrow();
    await expect(
      wallet.grant({ userId: "u1", currency: "CHIPS", amount: -100, reason: "signup" })
    ).rejects.toThrow();
  });

  it("can grant COINS currency", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    await ensureWalletSchema();

    await wallet.grant({ userId: "u1", currency: "COINS", amount: 250, reason: "purchase" });
    expect(await wallet.getBalance("u1", "COINS")).toBe(250);
  });

  it("returns 'duplicate' under concurrent same-key grants (race)", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    await ensureWalletSchema();

    const results = await Promise.all([
      wallet.grant({ userId: "u1", currency: "CHIPS", amount: 1000, reason: "signup" }),
      wallet.grant({ userId: "u1", currency: "CHIPS", amount: 1000, reason: "signup" }),
      wallet.grant({ userId: "u1", currency: "CHIPS", amount: 1000, reason: "signup" }),
    ]);

    // Exactly one succeeded, others should be "duplicate"
    const dupes = results.filter((r) => r === "duplicate").length;
    const successes = results.filter((r) => r !== "duplicate").length;
    expect(dupes).toBe(2);
    expect(successes).toBe(1);
    expect(await wallet.getBalance("u1", "CHIPS")).toBe(1000);
  });

  it("first call returns a real entry ID (not duplicate)", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    await ensureWalletSchema();

    const result = await wallet.grant({ userId: "u1", currency: "CHIPS", amount: 100, reason: "signup" });
    expect(typeof result).toBe("string");
    expect(result).not.toBe("duplicate");
    expect((result as string).length).toBeGreaterThan(0);
  });
});

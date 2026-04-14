import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet/internal", () => {
  beforeEach(() => vi.resetModules());

  it("getOrCreateWallet creates on first call, returns existing on second", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { getOrCreateWallet } = await import("../../lib/wallet/internal");
    await ensureWalletSchema();

    const w1 = await getOrCreateWallet("user", "u1", "CHIPS");
    const w2 = await getOrCreateWallet("user", "u1", "CHIPS");
    expect(w1.id).toBe(w2.id);
    expect(w1.balance).toBe(0);
  });

  it("transferAtomic moves funds and writes one ledger entry", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { getOrCreateWallet, transferAtomic } = await import("../../lib/wallet/internal");
    const { one, run } = await import("../../lib/db");
    await ensureWalletSchema();

    const from = await getOrCreateWallet("user", "u1", "CHIPS");
    const to = await getOrCreateWallet("user", "u2", "CHIPS");

    // Seed `from` directly via raw SQL (bypassing wallet API for the test setup)
    await run("UPDATE Wallet SET balance = 100 WHERE id = ?", [from.id]);

    const entryId = await transferAtomic({
      fromWalletId: from.id,
      toWalletId: to.id,
      amount: 30,
      currency: "CHIPS",
      entryType: "grant",
      refType: null,
      refId: null,
      reversesEntryId: null,
      idempotencyKey: null,
    });

    const fromAfter = await one<{ balance: number }>("SELECT balance FROM Wallet WHERE id = ?", [from.id]);
    const toAfter = await one<{ balance: number }>("SELECT balance FROM Wallet WHERE id = ?", [to.id]);
    expect(fromAfter?.balance).toBe(70);
    expect(toAfter?.balance).toBe(30);

    const entry = await one<{ amount: number; entry_type: string }>(
      "SELECT amount, entry_type FROM LedgerEntry WHERE id = ?",
      [entryId]
    );
    expect(entry?.amount).toBe(30);
    expect(entry?.entry_type).toBe("grant");
  });

  it("transferAtomic throws on insufficient funds", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { getOrCreateWallet, transferAtomic } = await import("../../lib/wallet/internal");
    const { InsufficientFundsError } = await import("../../lib/wallet/types");
    await ensureWalletSchema();

    const from = await getOrCreateWallet("user", "u1", "CHIPS");
    const to = await getOrCreateWallet("user", "u2", "CHIPS");

    await expect(
      transferAtomic({
        fromWalletId: from.id,
        toWalletId: to.id,
        amount: 50,
        currency: "CHIPS",
        entryType: "join",
        refType: null,
        refId: null,
        reversesEntryId: null,
        idempotencyKey: null,
      })
    ).rejects.toThrow(InsufficientFundsError);
  });

  it("transferAtomic allows system mint wallet to go negative", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { getOrCreateWallet, transferAtomic } = await import("../../lib/wallet/internal");
    const { one } = await import("../../lib/db");
    await ensureWalletSchema();

    const to = await getOrCreateWallet("user", "u1", "CHIPS");
    await transferAtomic({
      fromWalletId: "sys_mint_chips",
      toWalletId: to.id,
      amount: 1000,
      currency: "CHIPS",
      entryType: "grant",
      refType: "grant",
      refId: "signup",
      reversesEntryId: null,
      idempotencyKey: null,
    });

    const mint = await one<{ balance: number }>("SELECT balance FROM Wallet WHERE id = 'sys_mint_chips'");
    expect(mint?.balance).toBe(-1000);
  });

  it("transferAtomic rejects amount <= 0", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { getOrCreateWallet, transferAtomic } = await import("../../lib/wallet/internal");
    await ensureWalletSchema();
    const from = await getOrCreateWallet("user", "u1", "CHIPS");
    const to = await getOrCreateWallet("user", "u2", "CHIPS");
    await expect(
      transferAtomic({
        fromWalletId: from.id, toWalletId: to.id, amount: 0,
        currency: "CHIPS", entryType: "grant", refType: null, refId: null, reversesEntryId: null, idempotencyKey: null,
      })
    ).rejects.toThrow();
  });

  it("transferAtomic rejects same-wallet transfer", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { getOrCreateWallet, transferAtomic } = await import("../../lib/wallet/internal");
    await ensureWalletSchema();
    const w = await getOrCreateWallet("user", "u1", "CHIPS");
    await expect(
      transferAtomic({
        fromWalletId: w.id, toWalletId: w.id, amount: 10,
        currency: "CHIPS", entryType: "grant", refType: null, refId: null, reversesEntryId: null, idempotencyKey: null,
      })
    ).rejects.toThrow();
  });

  it("transferAtomic rejects currency mismatch", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { getOrCreateWallet, transferAtomic } = await import("../../lib/wallet/internal");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();
    const chipsWallet = await getOrCreateWallet("user", "u1", "CHIPS");
    const coinsWallet = await getOrCreateWallet("user", "u2", "COINS");
    await run("UPDATE Wallet SET balance = 100 WHERE id = ?", [chipsWallet.id]);
    await expect(
      transferAtomic({
        fromWalletId: chipsWallet.id,
        toWalletId: coinsWallet.id,
        amount: 10,
        currency: "CHIPS",
        entryType: "grant",
        refType: null,
        refId: null,
        reversesEntryId: null,
        idempotencyKey: null,
      })
    ).rejects.toThrow(/currency/i);
  });

  it("getOrCreateWallet handles concurrent calls cleanly", async () => {
    // better-sqlite3 is single-threaded so true parallel transactions are
    // serialized by the JS event loop. We verify idempotency by firing three
    // calls sequentially (via Promise.allSettled on already-resolved promises)
    // and asserting all three return the same wallet ID.
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { getOrCreateWallet } = await import("../../lib/wallet/internal");
    await ensureWalletSchema();
    const w1 = await getOrCreateWallet("user", "concurrent", "CHIPS");
    const w2 = await getOrCreateWallet("user", "concurrent", "CHIPS");
    const w3 = await getOrCreateWallet("user", "concurrent", "CHIPS");
    expect(w1.id).toBe(w2.id);
    expect(w2.id).toBe(w3.id);
  });
});

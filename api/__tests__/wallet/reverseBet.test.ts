import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet.reverseBetResolution", () => {
  beforeEach(() => vi.resetModules());

  async function setup() {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();
    await run("CREATE TABLE Bet (id TEXT PRIMARY KEY, stake INTEGER NOT NULL, totalPot INTEGER DEFAULT 0)");
    await run("CREATE TABLE BetSide (id TEXT PRIMARY KEY, betId TEXT, userId TEXT, option TEXT, stake INTEGER, status TEXT DEFAULT 'active', createdAt TEXT DEFAULT (datetime('now')), UNIQUE(betId, userId))");
    await run("INSERT INTO Bet (id, stake) VALUES ('b1', 50)");
    await wallet.grant({ userId: "alice", currency: "CHIPS", amount: 1000, reason: "signup" });
    await wallet.grant({ userId: "bob", currency: "CHIPS", amount: 1000, reason: "signup" });
    return wallet;
  }

  it("undoes a prior resolve, restoring escrow balance", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "no", stake: 50 });
    await wallet.resolveBet({ betId: "b1", winningOption: "yes" });

    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1050);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(950);

    await wallet.reverseBetResolution({ betId: "b1" });

    // Funds back in escrow, users restored to post-join state
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(950);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(950);

    const { one } = await import("../../lib/db");
    const escrow = await one<{ balance: number }>(
      "SELECT balance FROM Wallet WHERE owner_type='bet_escrow' AND owner_id='b1'"
    );
    expect(escrow?.balance).toBe(100);

    // Original ledger entries are NOT deleted; reverse entries exist
    const reverseCount = await one<{ c: number }>(
      "SELECT COUNT(*) as c FROM LedgerEntry WHERE entry_type='reverse'"
    );
    expect(reverseCount?.c).toBeGreaterThan(0);
    const originalCount = await one<{ c: number }>(
      "SELECT COUNT(*) as c FROM LedgerEntry WHERE entry_type='resolve'"
    );
    expect(originalCount?.c).toBeGreaterThan(0);
  });

  it("is idempotent (won't reverse twice)", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "no", stake: 50 });
    await wallet.resolveBet({ betId: "b1", winningOption: "yes" });

    await wallet.reverseBetResolution({ betId: "b1" });
    const result = await wallet.reverseBetResolution({ betId: "b1" });
    expect(result).toBe("duplicate");
  });

  it("throws if no resolve entries exist", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    // No resolve has happened
    await expect(
      wallet.reverseBetResolution({ betId: "b1" })
    ).rejects.toThrow();
  });

  it("reverses a resolve that had rake (rake comes back from House)", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "no", stake: 50 });
    await wallet.resolveBet({ betId: "b1", winningOption: "yes", rakeBps: 500 });

    const { one } = await import("../../lib/db");
    const houseBefore = await one<{ balance: number }>("SELECT balance FROM Wallet WHERE id = 'sys_house_chips'");
    expect(houseBefore?.balance).toBe(5);

    await wallet.reverseBetResolution({ betId: "b1" });

    const houseAfter = await one<{ balance: number }>("SELECT balance FROM Wallet WHERE id = 'sys_house_chips'");
    expect(houseAfter?.balance).toBe(0);
    // Escrow should hold the original pot (100)
    const escrow = await one<{ balance: number }>(
      "SELECT balance FROM Wallet WHERE owner_type = 'bet_escrow' AND owner_id = 'b1'"
    );
    expect(escrow?.balance).toBe(100);
  });

  it("can re-resolve the same bet to a different outcome after reversal", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "no", stake: 50 });
    await wallet.resolveBet({ betId: "b1", winningOption: "yes" });
    await wallet.reverseBetResolution({ betId: "b1" });

    // Re-resolve the other way with a fresh idempotency key
    await wallet.resolveBet({ betId: "b1", winningOption: "no", idempotencyKey: "b1:rev1" });

    expect(await wallet.getBalance("alice", "CHIPS")).toBe(950);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(1050);
  });
});

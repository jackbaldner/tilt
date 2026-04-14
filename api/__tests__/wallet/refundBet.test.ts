import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet.refundBet", () => {
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

  it("refunds all joiners proportional to stake", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "no", stake: 50 });

    await wallet.refundBet({ betId: "b1", reason: "tie" });

    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1000);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(1000);

    const { one } = await import("../../lib/db");
    const escrow = await one<{ balance: number }>(
      "SELECT balance FROM Wallet WHERE owner_type='bet_escrow' AND owner_id='b1'"
    );
    expect(escrow?.balance).toBe(0);
  });

  it("is idempotent", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.refundBet({ betId: "b1", reason: "lone_joiner" });
    const result = await wallet.refundBet({ betId: "b1", reason: "lone_joiner" });
    expect(result).toBe("duplicate");
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1000);
  });

  it("returns empty array when no sides exist", async () => {
    const wallet = await setup();
    const result = await wallet.refundBet({ betId: "b1", reason: "lone_joiner" });
    expect(result).toEqual([]);
  });

  it("handles single-joiner refund (lone_joiner case)", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.refundBet({ betId: "b1", reason: "lone_joiner" });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1000);
  });
});

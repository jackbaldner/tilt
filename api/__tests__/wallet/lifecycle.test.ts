import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet lifecycle (end-to-end)", () => {
  beforeEach(() => vi.resetModules());

  it("simulates a real user lifecycle", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();
    await run("CREATE TABLE Bet (id TEXT PRIMARY KEY, stake INTEGER NOT NULL, totalPot INTEGER DEFAULT 0)");
    await run("CREATE TABLE BetSide (id TEXT PRIMARY KEY, betId TEXT, userId TEXT, option TEXT, stake INTEGER, status TEXT DEFAULT 'active', createdAt TEXT DEFAULT (datetime('now')), UNIQUE(betId, userId))");

    // 1. Sign up two users
    await wallet.grant({ userId: "alice", currency: "CHIPS", amount: 1000, reason: "signup" });
    await wallet.grant({ userId: "bob", currency: "CHIPS", amount: 1000, reason: "signup" });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1000);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(1000);

    // 2. Alice creates a bet (bet1) for 50 chips, picks "yes"
    await run("INSERT INTO Bet (id, stake) VALUES ('bet1', 50)");
    await wallet.joinBet({ betId: "bet1", userId: "alice", option: "yes", stake: 50 });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(950);

    // 3. Bob joins with "no"
    await wallet.joinBet({ betId: "bet1", userId: "bob", option: "no", stake: 50 });

    // 4. Bet resolves yes — Alice wins
    await wallet.resolveBet({ betId: "bet1", winningOption: "yes" });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1050);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(950);

    // 5. Another bet, dispute reverses it
    await run("INSERT INTO Bet (id, stake) VALUES ('bet2', 100)");
    await wallet.joinBet({ betId: "bet2", userId: "alice", option: "yes", stake: 100 });
    await wallet.joinBet({ betId: "bet2", userId: "bob", option: "no", stake: 100 });
    await wallet.resolveBet({ betId: "bet2", winningOption: "yes" });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1150);

    await wallet.reverseBetResolution({ betId: "bet2" });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(950);

    // Re-resolve the other way with a fresh idempotency key
    await wallet.resolveBet({ betId: "bet2", winningOption: "no", idempotencyKey: "bet2:rev1" });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(950);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(1050); // 850 + 200

    // 6. Lone-joiner refund scenario
    await run("INSERT INTO Bet (id, stake) VALUES ('bet3', 25)");
    await wallet.joinBet({ betId: "bet3", userId: "alice", option: "yes", stake: 25 });
    await wallet.refundBet({ betId: "bet3", reason: "lone_joiner" });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(950);

    // 7. Reconciliation passes after all the activity
    const report = await wallet.reconcileAll();
    expect(report.ok).toBe(true);
    expect(report.invariantHolds).toBe(true);
  });
});

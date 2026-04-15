import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Regression tests for the C2 bug (multi-winner stats math) and C1 bug
 * (refund branches running "you won!" bookkeeping).
 *
 * The old resolve route credited every winner with `totalPot - their_stake`,
 * which is the right answer when there's exactly 1 winner but wildly
 * wrong with N winners (overstates profit by ~(N-1) × share). Now the
 * wallet's resolveBet returns per-winner payouts and routes use those.
 *
 * These tests verify the wallet layer's math directly. The route-level
 * bookkeeping that uses these payouts is tested manually against prod in
 * the deploy smoke test, since the routes don't have a test harness.
 */

describe("multi-winner payout stats math (C2 regression)", () => {
  beforeEach(() => vi.resetModules());

  async function setup(stake: number, userCount: number = 3) {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();
    await run(
      "CREATE TABLE Bet (id TEXT PRIMARY KEY, stake INTEGER NOT NULL, totalPot INTEGER DEFAULT 0)"
    );
    await run(
      "CREATE TABLE BetSide (id TEXT PRIMARY KEY, betId TEXT, userId TEXT, option TEXT, stake INTEGER, status TEXT DEFAULT 'active', createdAt TEXT DEFAULT (datetime('now')), UNIQUE(betId, userId))"
    );
    await run("INSERT INTO Bet (id, stake) VALUES ('b1', ?)", [stake]);
    for (let i = 1; i <= userCount; i++) {
      await wallet.grant({ userId: `u${i}`, currency: "CHIPS", amount: 1000, reason: "signup" });
    }
    return wallet;
  }

  it("1 winner vs 2 losers: winner gets pot - own_stake, not totalPot", async () => {
    const wallet = await setup(50);
    // u1 on YES alone, u2 and u3 on NO → pot=150, 1 winner (u1), payout=150
    await wallet.joinBet({ betId: "b1", userId: "u1", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "u2", option: "no", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "u3", option: "no", stake: 50 });

    const result = await wallet.resolveBet({ betId: "b1", winningOption: "yes" });
    if (result === "duplicate") throw new Error("unexpected duplicate");

    // Single winner takes the full pot
    expect(result.payouts).toHaveLength(1);
    expect(result.payouts[0].userId).toBe("u1");
    expect(result.payouts[0].payout).toBe(150);
    // Profit = 150 - 50 = 100
    const profit = result.payouts[0].payout - result.payouts[0].stake;
    expect(profit).toBe(100);

    expect(await wallet.getBalance("u1", "CHIPS")).toBe(1100); // 950 + 150
  });

  it("2 winners vs 1 loser: each winner gets pot/2, NOT totalPot - stake", async () => {
    const wallet = await setup(50);
    // u1 on NO alone, u2 and u3 on YES → pot=150, 2 winners
    // Old bug: each winner's totalChipsWon would be credited 150-50=100
    // Correct: each winner gets 75, profit = 75-50 = 25
    await wallet.joinBet({ betId: "b1", userId: "u1", option: "no", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "u2", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "u3", option: "yes", stake: 50 });

    const result = await wallet.resolveBet({ betId: "b1", winningOption: "yes" });
    if (result === "duplicate") throw new Error("unexpected duplicate");

    expect(result.payouts).toHaveLength(2);
    const u2Payout = result.payouts.find((p) => p.userId === "u2")!;
    const u3Payout = result.payouts.find((p) => p.userId === "u3")!;
    expect(u2Payout.payout).toBe(75);
    expect(u3Payout.payout).toBe(75);
    // Profit = 75 - 50 = 25 (old buggy route would have said 100 each)
    expect(u2Payout.payout - u2Payout.stake).toBe(25);
    expect(u3Payout.payout - u3Payout.stake).toBe(25);

    // Balance verification: 950 (after join) + 75 (payout) = 1025
    expect(await wallet.getBalance("u2", "CHIPS")).toBe(1025);
    expect(await wallet.getBalance("u3", "CHIPS")).toBe(1025);
    expect(await wallet.getBalance("u1", "CHIPS")).toBe(950);
  });

  it("3 winners vs 1 loser with remainder: earliest gets the extra chip", async () => {
    const wallet = await setup(10, 4);
    // pot = 40, 3 winners, share = 13, remainder = 1 → u1 gets 14, u2+u3 get 13
    await wallet.joinBet({ betId: "b1", userId: "u1", option: "yes", stake: 10 });
    await new Promise((r) => setTimeout(r, 1100));
    await wallet.joinBet({ betId: "b1", userId: "u2", option: "yes", stake: 10 });
    await new Promise((r) => setTimeout(r, 1100));
    await wallet.joinBet({ betId: "b1", userId: "u3", option: "yes", stake: 10 });
    await wallet.joinBet({ betId: "b1", userId: "u4", option: "no", stake: 10 });

    const result = await wallet.resolveBet({ betId: "b1", winningOption: "yes" });
    if (result === "duplicate") throw new Error("unexpected duplicate");

    expect(result.payouts).toHaveLength(3);
    const u1 = result.payouts.find((p) => p.userId === "u1")!;
    const u2 = result.payouts.find((p) => p.userId === "u2")!;
    const u3 = result.payouts.find((p) => p.userId === "u3")!;
    expect(u1.payout).toBe(14);
    expect(u2.payout).toBe(13);
    expect(u3.payout).toBe(13);
    // Total distributed = 40 = full pot (no chips lost to rounding)
    expect(u1.payout + u2.payout + u3.payout).toBe(40);
  });
});

describe("refund paths don't run 'you won' logic (C1 regression)", () => {
  beforeEach(() => vi.resetModules());

  async function setup() {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();
    await run(
      "CREATE TABLE Bet (id TEXT PRIMARY KEY, stake INTEGER NOT NULL, totalPot INTEGER DEFAULT 0)"
    );
    await run(
      "CREATE TABLE BetSide (id TEXT PRIMARY KEY, betId TEXT, userId TEXT, option TEXT, stake INTEGER, status TEXT DEFAULT 'active', createdAt TEXT DEFAULT (datetime('now')), UNIQUE(betId, userId))"
    );
    await run("INSERT INTO Bet (id, stake) VALUES ('b1', 50)");
    await wallet.grant({ userId: "alice", currency: "CHIPS", amount: 1000, reason: "signup" });
    return wallet;
  }

  it("lone-joiner refund: user gets their stake back, nothing else changes", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(950);

    const result = await wallet.refundBet({ betId: "b1", reason: "lone_joiner" });
    if (result === "duplicate") throw new Error("unexpected duplicate");

    expect(result.refunds).toHaveLength(1);
    expect(result.refunds[0].userId).toBe("alice");
    expect(result.refunds[0].amount).toBe(50); // stake refunded, no profit
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1000); // back to starting
  });

  it("tie refund: everyone gets their stake back, no profits", async () => {
    const wallet = await setup();
    const { run } = await import("../../lib/db");
    await wallet.grant({ userId: "bob", currency: "CHIPS", amount: 1000, reason: "signup" });

    // Both on "yes" — if we tried to resolve "no" as winner, it would be a tie refund
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "yes", stake: 50 });

    const result = await wallet.refundBet({ betId: "b1", reason: "tie" });
    if (result === "duplicate") throw new Error("unexpected duplicate");

    expect(result.refunds).toHaveLength(2);
    expect(result.refunds.every((r) => r.amount === 50)).toBe(true);
    // Both back to starting — NO profit recorded, NO winners
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1000);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(1000);
  });

  it("reconciliation invariant holds after a full resolve + refund lifecycle", async () => {
    const wallet = await setup();
    const { run } = await import("../../lib/db");
    await wallet.grant({ userId: "bob", currency: "CHIPS", amount: 1000, reason: "signup" });
    await wallet.grant({ userId: "carol", currency: "CHIPS", amount: 1000, reason: "signup" });

    // Bet 1: normal resolve
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "no", stake: 50 });
    await wallet.resolveBet({ betId: "b1", winningOption: "yes" });

    // Bet 2: lone-joiner refund
    await run("INSERT INTO Bet (id, stake) VALUES ('b2', 50)");
    await wallet.joinBet({ betId: "b2", userId: "carol", option: "yes", stake: 50 });
    await wallet.refundBet({ betId: "b2", reason: "lone_joiner" });

    // Bet 3: tie refund
    await run("INSERT INTO Bet (id, stake) VALUES ('b3', 50)");
    await wallet.joinBet({ betId: "b3", userId: "alice", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b3", userId: "bob", option: "yes", stake: 50 });
    await wallet.refundBet({ betId: "b3", reason: "tie" });

    // After all that: reconciliation must still hold
    const report = await wallet.reconcileAll();
    expect(report.ok).toBe(true);
    expect(report.invariantHolds).toBe(true);
    expect(report.totalBalanceSum).toBe(0);
  });
});

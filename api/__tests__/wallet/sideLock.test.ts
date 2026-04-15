import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Integration test for the 1:1 side-lock rule. Exercises the rule via a
 * real Circle + Bet + BetSide schema and the wallet's existing joinBet
 * flow. Verifies that private circles block double-joining and group
 * circles don't.
 *
 * The rule itself (the pure `shouldBlockJoin` function) is unit-tested
 * separately in `__tests__/circleDisplay.test.ts`. This file proves the
 * rule stays correct when composed with real DB state and wallet ops.
 */

describe("1:1 side-lock integration", () => {
  beforeEach(() => vi.resetModules());

  async function setup() {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();
    // Minimum schema needed for the test
    await run(
      "CREATE TABLE Circle (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, emoji TEXT, ownerId TEXT)"
    );
    await run(
      "CREATE TABLE Bet (id TEXT PRIMARY KEY, circleId TEXT, stake INTEGER NOT NULL, totalPot INTEGER DEFAULT 0)"
    );
    await run(
      "CREATE TABLE BetSide (id TEXT PRIMARY KEY, betId TEXT, userId TEXT, option TEXT, stake INTEGER, status TEXT DEFAULT 'active', createdAt TEXT DEFAULT (datetime('now')), UNIQUE(betId, userId))"
    );
    await wallet.grant({ userId: "alice", currency: "CHIPS", amount: 1000, reason: "signup" });
    await wallet.grant({ userId: "bob", currency: "CHIPS", amount: 1000, reason: "signup" });
    return wallet;
  }

  it("pure rule: blocks joining a taken option in a private circle", async () => {
    const wallet = await setup();
    const { run, all } = await import("../../lib/db");
    const { shouldBlockJoin } = await import("../../lib/circleDisplay");

    await run(
      "INSERT INTO Circle (id, name, description, ownerId) VALUES (?, ?, ?, ?)",
      ["private-c1", "__private__alice__bob", "Alice vs Bob", "alice"]
    );
    await run("INSERT INTO Bet (id, circleId, stake) VALUES (?, ?, ?)", ["b1", "private-c1", 50]);
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "Yes", stake: 50 });

    const sides = await all<{ option: string }>(
      "SELECT option FROM BetSide WHERE betId = ?",
      ["b1"]
    );
    const blocked = shouldBlockJoin(true, sides, "Yes");
    expect(blocked.blocked).toBe(true);
    expect(blocked.reason).toMatch(/already taken/i);

    const allowed = shouldBlockJoin(true, sides, "No");
    expect(allowed.blocked).toBe(false);
  });

  it("group circles permit multiple joiners on the same option", async () => {
    const wallet = await setup();
    const { run, all } = await import("../../lib/db");
    const { shouldBlockJoin } = await import("../../lib/circleDisplay");

    await run(
      "INSERT INTO Circle (id, name, description, ownerId) VALUES (?, ?, ?, ?)",
      ["group-c1", "Fantasy League", null, "alice"]
    );
    await run("INSERT INTO Bet (id, circleId, stake) VALUES (?, ?, ?)", ["b1", "group-c1", 50]);
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "Yes", stake: 50 });

    const sides = await all<{ option: string }>("SELECT option FROM BetSide WHERE betId = ?", ["b1"]);
    const result = shouldBlockJoin(false, sides, "Yes");
    expect(result.blocked).toBe(false);

    // And the wallet layer actually lets bob join the same option (we
    // don't route through the rule here because it's group mode).
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "Yes", stake: 50 });
    const finalSides = await all<{ option: string; userId: string }>(
      "SELECT option, userId FROM BetSide WHERE betId = ?",
      ["b1"]
    );
    expect(finalSides).toHaveLength(2);
    expect(finalSides.every((s) => s.option === "Yes")).toBe(true);
  });

  it("private circle with one per side resolves normally", async () => {
    const wallet = await setup();
    const { run, all } = await import("../../lib/db");
    const { shouldBlockJoin } = await import("../../lib/circleDisplay");

    await run(
      "INSERT INTO Circle (id, name, description, ownerId) VALUES (?, ?, ?, ?)",
      ["private-c1", "__private__alice__bob", "Alice vs Bob", "alice"]
    );
    await run("INSERT INTO Bet (id, circleId, stake) VALUES (?, ?, ?)", ["b1", "private-c1", 50]);
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "Yes", stake: 50 });

    // Bob checks the other side — not blocked
    let sides = await all<{ option: string }>("SELECT option FROM BetSide WHERE betId = ?", ["b1"]);
    expect(shouldBlockJoin(true, sides, "No").blocked).toBe(false);

    await wallet.joinBet({ betId: "b1", userId: "bob", option: "No", stake: 50 });

    // Now both sides are taken; any further attempt to join either side should be blocked
    sides = await all<{ option: string }>("SELECT option FROM BetSide WHERE betId = ?", ["b1"]);
    expect(shouldBlockJoin(true, sides, "Yes").blocked).toBe(true);
    expect(shouldBlockJoin(true, sides, "No").blocked).toBe(true);

    // Resolve — normal resolve flow works
    const result = await wallet.resolveBet({ betId: "b1", winningOption: "Yes" });
    if (result === "duplicate") throw new Error("unexpected duplicate");
    expect(result.payouts).toHaveLength(1);
    expect(result.payouts[0].userId).toBe("alice");
    expect(result.payouts[0].payout).toBe(100);
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1050);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(950);
  });
});

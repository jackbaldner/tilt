import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Tests for the in-tx wallet helpers (joinBetInTx, resolveBetInTx,
 * refundBetInTx). These are the ones route handlers use when they need
 * the wallet op to be part of a larger atomic transaction.
 *
 * The top-level wrappers (joinBet, resolveBet, refundBet) already have
 * their own tests. This file exercises the transactional composition
 * that used to be impossible.
 */

describe("wallet in-tx helpers", () => {
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
    return wallet;
  }

  describe("joinBetInTx", () => {
    it("composes with additional writes in the same transaction", async () => {
      const wallet = await setup();
      const { interactiveTransaction, run, one } = await import("../../lib/db");

      await run("INSERT INTO Bet (id, stake) VALUES ('b1', 50)");
      await wallet.grant({ userId: "alice", currency: "CHIPS", amount: 1000, reason: "signup" });

      const result = await interactiveTransaction(async (tx) => {
        const joinResult = await wallet.joinBetInTx(tx, {
          betId: "b1",
          userId: "alice",
          option: "yes",
          stake: 50,
        });
        // Additional write in the same tx — bump totalPot
        await tx.run("UPDATE Bet SET totalPot = totalPot + ? WHERE id = ?", [50, "b1"]);
        return joinResult;
      });

      expect(result.entryId).toBeTruthy();
      expect(result.sideId).toBeTruthy();
      expect(result.userWalletId).toBeTruthy();
      expect(result.escrowWalletId).toBeTruthy();

      // Verify final state
      expect(await wallet.getBalance("alice", "CHIPS")).toBe(950);
      const bet = await one<{ totalPot: number }>("SELECT totalPot FROM Bet WHERE id = 'b1'");
      expect(bet?.totalPot).toBe(50);
      const side = await one<{ option: string }>(
        "SELECT option FROM BetSide WHERE betId = 'b1' AND userId = 'alice'"
      );
      expect(side?.option).toBe("yes");
    });

    it("rolls back the entire transaction on insufficient funds", async () => {
      const wallet = await setup();
      const { interactiveTransaction, run, one } = await import("../../lib/db");
      const { InsufficientFundsError } = await import("../../lib/wallet/types");

      await run("INSERT INTO Bet (id, stake) VALUES ('b1', 50)");
      // alice has no chips

      await expect(
        interactiveTransaction(async (tx) => {
          // Additional write happens before the failing joinBetInTx
          await tx.run("UPDATE Bet SET totalPot = 999 WHERE id = ?", ["b1"]);
          await wallet.joinBetInTx(tx, {
            betId: "b1",
            userId: "alice",
            option: "yes",
            stake: 50,
          });
        })
      ).rejects.toThrow(InsufficientFundsError);

      // Verify the totalPot update rolled back (still 0, not 999)
      const bet = await one<{ totalPot: number }>("SELECT totalPot FROM Bet WHERE id = 'b1'");
      expect(bet?.totalPot).toBe(0);
    });

    it("rolls back the transaction when BetSide duplicate is hit", async () => {
      const wallet = await setup();
      const { interactiveTransaction, run } = await import("../../lib/db");

      await run("INSERT INTO Bet (id, stake) VALUES ('b1', 50)");
      await wallet.grant({ userId: "alice", currency: "CHIPS", amount: 1000, reason: "signup" });
      await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
      // Alice is now joined at 950 balance

      // Now try to join again inside a tx — should fail and roll back
      await expect(
        interactiveTransaction(async (tx) => {
          await wallet.joinBetInTx(tx, {
            betId: "b1",
            userId: "alice",
            option: "no",
            stake: 50,
          });
        })
      ).rejects.toThrow(); // UNIQUE constraint failed

      // Balance unchanged
      expect(await wallet.getBalance("alice", "CHIPS")).toBe(950);
    });
  });

  describe("resolveBetInTx", () => {
    it("returns per-winner payouts with correct stake info", async () => {
      const wallet = await setup();
      const { interactiveTransaction, run } = await import("../../lib/db");

      await run("INSERT INTO Bet (id, stake) VALUES ('b1', 50)");
      await wallet.grant({ userId: "alice", currency: "CHIPS", amount: 1000, reason: "signup" });
      await wallet.grant({ userId: "bob", currency: "CHIPS", amount: 1000, reason: "signup" });
      await wallet.grant({ userId: "carol", currency: "CHIPS", amount: 1000, reason: "signup" });

      // 1 alice on NO, 2 (bob+carol) on YES
      await wallet.joinBet({ betId: "b1", userId: "alice", option: "no", stake: 50 });
      await wallet.joinBet({ betId: "b1", userId: "bob", option: "yes", stake: 50 });
      await wallet.joinBet({ betId: "b1", userId: "carol", option: "yes", stake: 50 });

      const result = await interactiveTransaction(async (tx) => {
        return wallet.resolveBetInTx(tx, { betId: "b1", winningOption: "yes" });
      });

      // Pot = 150, 2 winners, each gets floor(150/2) = 75
      expect(result.payouts).toHaveLength(2);
      // Remainder is 0 here (150 / 2 = 75 exactly)
      const bobPayout = result.payouts.find((p) => p.userId === "bob");
      const carolPayout = result.payouts.find((p) => p.userId === "carol");
      expect(bobPayout?.payout).toBe(75);
      expect(bobPayout?.stake).toBe(50);
      expect(carolPayout?.payout).toBe(75);
      expect(carolPayout?.stake).toBe(50);
      // Profit per winner = 75 - 50 = 25 (up from the old bug which would
      // have credited each with 150 - 50 = 100)
    });

    it("returns correct payouts for 3-way tie with integer remainder", async () => {
      const wallet = await setup();
      const { interactiveTransaction, run } = await import("../../lib/db");

      // stake=10 gives us a pot we can't divide evenly
      await run("INSERT INTO Bet (id, stake) VALUES ('b1', 10)");
      await wallet.grant({ userId: "u1", currency: "CHIPS", amount: 1000, reason: "signup" });
      await wallet.grant({ userId: "u2", currency: "CHIPS", amount: 1000, reason: "signup" });
      await wallet.grant({ userId: "u3", currency: "CHIPS", amount: 1000, reason: "signup" });
      await wallet.grant({ userId: "u4", currency: "CHIPS", amount: 1000, reason: "signup" });

      // u4 on NO, u1+u2+u3 on YES — total pot = 40, 3 winners → 13, 13, 13 with remainder 1
      await wallet.joinBet({ betId: "b1", userId: "u1", option: "yes", stake: 10 });
      await new Promise((r) => setTimeout(r, 1100)); // SQLite datetime resolution
      await wallet.joinBet({ betId: "b1", userId: "u2", option: "yes", stake: 10 });
      await new Promise((r) => setTimeout(r, 1100));
      await wallet.joinBet({ betId: "b1", userId: "u3", option: "yes", stake: 10 });
      await wallet.joinBet({ betId: "b1", userId: "u4", option: "no", stake: 10 });

      const result = await interactiveTransaction(async (tx) => {
        return wallet.resolveBetInTx(tx, { betId: "b1", winningOption: "yes" });
      });

      // Earliest joiner (u1) gets the remainder chip
      expect(result.payouts.find((p) => p.userId === "u1")?.payout).toBe(14); // 13 + 1 remainder
      expect(result.payouts.find((p) => p.userId === "u2")?.payout).toBe(13);
      expect(result.payouts.find((p) => p.userId === "u3")?.payout).toBe(13);
      // Total distributed = 14 + 13 + 13 = 40 = full pot
      const totalDistributed = result.payouts.reduce((s, p) => s + p.payout, 0);
      expect(totalDistributed).toBe(40);
    });
  });

  describe("refundBetInTx", () => {
    it("returns a detailed refund map that routes can use to void BetSide rows", async () => {
      const wallet = await setup();
      const { interactiveTransaction, run } = await import("../../lib/db");

      await run("INSERT INTO Bet (id, stake) VALUES ('b1', 50)");
      await wallet.grant({ userId: "alice", currency: "CHIPS", amount: 1000, reason: "signup" });
      await wallet.grant({ userId: "bob", currency: "CHIPS", amount: 1000, reason: "signup" });

      await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
      await wallet.joinBet({ betId: "b1", userId: "bob", option: "no", stake: 50 });

      const result = await interactiveTransaction(async (tx) => {
        const refundResult = await wallet.refundBetInTx(tx, { betId: "b1", reason: "tie" });
        // Simulate the real route: use the refund map to mark BetSide rows voided
        for (const refund of refundResult.refunds) {
          await tx.run(
            "UPDATE BetSide SET status = 'voided' WHERE betId = ? AND userId = ?",
            ["b1", refund.userId]
          );
        }
        return refundResult;
      });

      expect(result.refunds).toHaveLength(2);
      expect(result.refunds.every((r) => r.amount === 50)).toBe(true);

      // Balances restored
      expect(await wallet.getBalance("alice", "CHIPS")).toBe(1000);
      expect(await wallet.getBalance("bob", "CHIPS")).toBe(1000);

      // All sides marked voided
      const { all } = await import("../../lib/db");
      const sides = await all<{ status: string }>(
        "SELECT status FROM BetSide WHERE betId = 'b1'"
      );
      expect(sides.every((s) => s.status === "voided")).toBe(true);
    });

    it("returns empty result when called on a bet with no sides (no error)", async () => {
      const wallet = await setup();
      const { interactiveTransaction, run } = await import("../../lib/db");
      await run("INSERT INTO Bet (id, stake) VALUES ('b1', 50)");

      const result = await interactiveTransaction(async (tx) => {
        return wallet.refundBetInTx(tx, { betId: "b1", reason: "lone_joiner" });
      });

      expect(result.refunds).toEqual([]);
      expect(result.entryIds).toEqual([]);
    });
  });
});

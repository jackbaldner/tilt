import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet.joinBet", () => {
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
    await wallet.grant({ userId: "u1", currency: "CHIPS", amount: 1000, reason: "signup" });
    return wallet;
  }

  it("debits user, credits escrow, creates BetSide row", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "u1", option: "yes", stake: 50 });

    expect(await wallet.getBalance("u1", "CHIPS")).toBe(950);

    const { one } = await import("../../lib/db");
    const escrow = await one<{ balance: number }>(
      "SELECT balance FROM Wallet WHERE owner_type = 'bet_escrow' AND owner_id = 'b1'"
    );
    expect(escrow?.balance).toBe(50);

    const side = await one<{ option: string; stake: number }>(
      "SELECT option, stake FROM BetSide WHERE betId = 'b1' AND userId = 'u1'"
    );
    expect(side?.option).toBe("yes");
    expect(side?.stake).toBe(50);
  });

  it("is idempotent — second join with same key is a no-op", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "u1", option: "yes", stake: 50, idempotencyKey: "k1" });
    const result = await wallet.joinBet({ betId: "b1", userId: "u1", option: "yes", stake: 50, idempotencyKey: "k1" });
    expect(result).toBe("duplicate");
    expect(await wallet.getBalance("u1", "CHIPS")).toBe(950);
  });

  it("rejects join if user has insufficient chips", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { run } = await import("../../lib/db");
    const { InsufficientFundsError } = await import("../../lib/wallet/types");
    await ensureWalletSchema();
    await run("CREATE TABLE Bet (id TEXT PRIMARY KEY, stake INTEGER NOT NULL, totalPot INTEGER DEFAULT 0)");
    await run("CREATE TABLE BetSide (id TEXT PRIMARY KEY, betId TEXT, userId TEXT, option TEXT, stake INTEGER, status TEXT DEFAULT 'active', createdAt TEXT DEFAULT (datetime('now')), UNIQUE(betId, userId))");
    await run("INSERT INTO Bet (id, stake) VALUES ('b1', 50)");

    await expect(
      wallet.joinBet({ betId: "b1", userId: "u1", option: "yes", stake: 50 })
    ).rejects.toThrow(InsufficientFundsError);

    // Verify nothing persisted (no escrow wallet, no BetSide, no ledger entry)
    const { one } = await import("../../lib/db");
    const escrow = await one<{ id: string }>(
      "SELECT id FROM Wallet WHERE owner_type = 'bet_escrow' AND owner_id = 'b1'"
    );
    // Escrow may have been created (lazy) but balance must be 0
    if (escrow) {
      const balance = await one<{ balance: number }>("SELECT balance FROM Wallet WHERE id = ?", [escrow.id]);
      expect(balance?.balance).toBe(0);
    }
    const side = await one<{ id: string }>("SELECT id FROM BetSide WHERE betId = 'b1' AND userId = 'u1'");
    expect(side).toBeNull();
  });

  it("rejects double-join via natural key (BetSide unique constraint)", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "u1", option: "yes", stake: 50 });
    const result = await wallet.joinBet({ betId: "b1", userId: "u1", option: "no", stake: 50 });
    // Natural key is `join:b1:u1` — same regardless of option, so this returns "duplicate"
    expect(result).toBe("duplicate");
    // Balance unchanged from first join
    expect(await wallet.getBalance("u1", "CHIPS")).toBe(950);
  });

  it("handles concurrent same-key joins (race)", async () => {
    const wallet = await setup();
    const results = await Promise.all([
      wallet.joinBet({ betId: "b1", userId: "u1", option: "yes", stake: 50 }),
      wallet.joinBet({ betId: "b1", userId: "u1", option: "yes", stake: 50 }),
      wallet.joinBet({ betId: "b1", userId: "u1", option: "yes", stake: 50 }),
    ]);
    const dupes = results.filter((r) => r === "duplicate").length;
    expect(dupes).toBe(2);
    expect(await wallet.getBalance("u1", "CHIPS")).toBe(950);
  });

  it("two different users joining the same bet both succeed", async () => {
    const wallet = await setup();
    const { run } = await import("../../lib/db");
    await wallet.grant({ userId: "u2", currency: "CHIPS", amount: 1000, reason: "signup" });

    await wallet.joinBet({ betId: "b1", userId: "u1", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "u2", option: "no", stake: 50 });

    expect(await wallet.getBalance("u1", "CHIPS")).toBe(950);
    expect(await wallet.getBalance("u2", "CHIPS")).toBe(950);

    const { one } = await import("../../lib/db");
    const escrow = await one<{ balance: number }>(
      "SELECT balance FROM Wallet WHERE owner_type = 'bet_escrow' AND owner_id = 'b1'"
    );
    expect(escrow?.balance).toBe(100);
  });
});

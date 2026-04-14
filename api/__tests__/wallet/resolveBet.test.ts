import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet.resolveBet", () => {
  beforeEach(() => vi.resetModules());

  async function setup(stake = 50) {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();
    await run("CREATE TABLE Bet (id TEXT PRIMARY KEY, stake INTEGER NOT NULL, totalPot INTEGER DEFAULT 0, resolvedOption TEXT)");
    await run("CREATE TABLE BetSide (id TEXT PRIMARY KEY, betId TEXT, userId TEXT, option TEXT, stake INTEGER, status TEXT DEFAULT 'active', createdAt TEXT DEFAULT (datetime('now')), UNIQUE(betId, userId))");
    await run("INSERT INTO Bet (id, stake) VALUES ('b1', ?)", [stake]);
    await wallet.grant({ userId: "alice", currency: "CHIPS", amount: 1000, reason: "signup" });
    await wallet.grant({ userId: "bob", currency: "CHIPS", amount: 1000, reason: "signup" });
    await wallet.grant({ userId: "carol", currency: "CHIPS", amount: 1000, reason: "signup" });
    return wallet;
  }

  it("1v1: winner takes pot", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "no", stake: 50 });

    await wallet.resolveBet({ betId: "b1", winningOption: "yes" });

    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1050);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(950);

    const { one } = await import("../../lib/db");
    const escrow = await one<{ balance: number }>(
      "SELECT balance FROM Wallet WHERE owner_type='bet_escrow' AND owner_id='b1'"
    );
    expect(escrow?.balance).toBe(0);
  });

  it("1v2 underdog wins: solo winner takes the full pot", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "no", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "carol", option: "yes", stake: 50 });

    await wallet.resolveBet({ betId: "b1", winningOption: "no" });

    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1100);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(950);
    expect(await wallet.getBalance("carol", "CHIPS")).toBe(950);
  });

  it("1v2 favorite wins: 2 winners split, each gets less than they put in", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "no", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "carol", option: "yes", stake: 50 });

    await wallet.resolveBet({ betId: "b1", winningOption: "yes" });

    expect(await wallet.getBalance("alice", "CHIPS")).toBe(950);
    // pot = 150, 2 winners, 75 each
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(1025);
    expect(await wallet.getBalance("carol", "CHIPS")).toBe(1025);
  });

  it("is idempotent", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "no", stake: 50 });
    await wallet.resolveBet({ betId: "b1", winningOption: "yes" });
    const result = await wallet.resolveBet({ betId: "b1", winningOption: "yes" });
    expect(result).toBe("duplicate");
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1050);
  });

  it("integer remainder goes to earliest joiner on winning side", async () => {
    // pot=10, 3 winners → share=3, remainder=1
    const wallet = await setup(10);
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 10 });
    // Sleep 5ms so createdAt differs (SQLite datetime() resolution is 1 second so this matters)
    await new Promise((r) => setTimeout(r, 1100));
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "yes", stake: 10 });
    await new Promise((r) => setTimeout(r, 1100));
    await wallet.joinBet({ betId: "b1", userId: "carol", option: "yes", stake: 10 });
    await new Promise((r) => setTimeout(r, 1100));
    // Add a loser so there's actually a pot to split
    await wallet.grant({ userId: "dan", currency: "CHIPS", amount: 1000, reason: "signup" });
    await wallet.joinBet({ betId: "b1", userId: "dan", option: "no", stake: 10 });

    // pot = 40, 3 winners, share=13, remainder=1 → alice (earliest) gets 14, bob/carol get 13
    await wallet.resolveBet({ betId: "b1", winningOption: "yes" });

    expect(await wallet.getBalance("alice", "CHIPS")).toBe(990 + 14); // 1004
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(990 + 13);   // 1003
    expect(await wallet.getBalance("carol", "CHIPS")).toBe(990 + 13); // 1003
  });

  it("rake siphons to House wallet", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "no", stake: 50 });

    // 5% rake
    await wallet.resolveBet({ betId: "b1", winningOption: "yes", rakeBps: 500 });

    // pot=100, rake=5, distributable=95, alice gets 95
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(950 + 95); // 1045
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(950);

    const { one } = await import("../../lib/db");
    const house = await one<{ balance: number }>("SELECT balance FROM Wallet WHERE id = 'sys_house_chips'");
    expect(house?.balance).toBe(5);
  });

  it("throws if winning option has no joiners", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "yes", stake: 50 });

    await expect(
      wallet.resolveBet({ betId: "b1", winningOption: "no" })
    ).rejects.toThrow();
  });

  it("throws if no sides exist", async () => {
    const wallet = await setup();
    await expect(
      wallet.resolveBet({ betId: "b1", winningOption: "yes" })
    ).rejects.toThrow();
  });
});

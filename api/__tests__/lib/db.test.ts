import { describe, it, expect, beforeEach, vi } from "vitest";

describe("interactiveTransaction", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("supports read-then-write within a transaction", async () => {
    const { run, interactiveTransaction, one } = await import("../../lib/db");
    await run("CREATE TABLE counter (id TEXT PRIMARY KEY, n INTEGER NOT NULL)");
    await run("INSERT INTO counter (id, n) VALUES ('a', 5)");

    const result = await interactiveTransaction(async (tx) => {
      const row = await tx.one<{ n: number }>("SELECT n FROM counter WHERE id = ?", ["a"]);
      const newN = (row?.n ?? 0) + 10;
      await tx.run("UPDATE counter SET n = ? WHERE id = ?", [newN, "a"]);
      return newN;
    });

    expect(result).toBe(15);
    const after = await one<{ n: number }>("SELECT n FROM counter WHERE id = ?", ["a"]);
    expect(after?.n).toBe(15);
  });

  it("rolls back on thrown error", async () => {
    const { run, one, interactiveTransaction } = await import("../../lib/db");
    await run("CREATE TABLE counter (id TEXT PRIMARY KEY, n INTEGER NOT NULL)");
    await run("INSERT INTO counter (id, n) VALUES ('a', 5)");

    await expect(
      interactiveTransaction(async (tx) => {
        await tx.run("UPDATE counter SET n = 99 WHERE id = ?", ["a"]);
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    const after = await one<{ n: number }>("SELECT n FROM counter WHERE id = ?", ["a"]);
    expect(after?.n).toBe(5);
  });

  it("rolls back when SQL itself fails mid-transaction", async () => {
    const { run, one, interactiveTransaction } = await import("../../lib/db");
    await run("CREATE TABLE counter (id TEXT PRIMARY KEY, n INTEGER NOT NULL)");
    await run("INSERT INTO counter (id, n) VALUES ('a', 5)");

    await expect(
      interactiveTransaction(async (tx) => {
        await tx.run("UPDATE counter SET n = 99 WHERE id = ?", ["a"]);
        // Constraint violation: PRIMARY KEY conflict
        await tx.run("INSERT INTO counter (id, n) VALUES ('a', 1)");
      })
    ).rejects.toThrow();

    const after = await one<{ n: number }>("SELECT n FROM counter WHERE id = ?", ["a"]);
    expect(after?.n).toBe(5);
  });

  it("serializes parallel calls without nested-transaction errors", async () => {
    const { run, interactiveTransaction } = await import("../../lib/db");
    await run("CREATE TABLE counter (id TEXT PRIMARY KEY, n INTEGER NOT NULL)");
    await run("INSERT INTO counter (id, n) VALUES ('a', 0)");

    const inc = () =>
      interactiveTransaction(async (tx) => {
        const row = await tx.one<{ n: number }>("SELECT n FROM counter WHERE id = 'a'");
        await tx.run("UPDATE counter SET n = ? WHERE id = 'a'", [(row?.n ?? 0) + 1]);
      });

    await Promise.all([inc(), inc(), inc(), inc(), inc()]);

    const { one } = await import("../../lib/db");
    const final = await one<{ n: number }>("SELECT n FROM counter WHERE id = 'a'");
    expect(final?.n).toBe(5);
  });
});

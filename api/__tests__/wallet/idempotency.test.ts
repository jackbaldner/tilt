import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet.idempotency", () => {
  beforeEach(() => vi.resetModules());

  it("stores and replays a request", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { lookupIdempotencyRequest, storeIdempotencyRequest, hashRequest } = await import("../../lib/wallet/idempotency");
    await ensureWalletSchema();

    const req = { method: "POST", path: "/api/bets", body: { foo: "bar" } };
    const hash = hashRequest(req);

    expect(await lookupIdempotencyRequest("k1", "u1", hash)).toBeNull();

    await storeIdempotencyRequest("k1", "u1", hash, 200, { id: "bet-123" });

    const replay = await lookupIdempotencyRequest("k1", "u1", hash);
    expect(replay).toEqual({ statusCode: 200, response: { id: "bet-123" } });
  });

  it("throws on hash mismatch (key reuse with different request)", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { lookupIdempotencyRequest, storeIdempotencyRequest, hashRequest } = await import("../../lib/wallet/idempotency");
    const { IdempotencyConflictError } = await import("../../lib/wallet/types");
    await ensureWalletSchema();

    await storeIdempotencyRequest("k1", "u1", hashRequest({ a: 1 }), 200, { ok: true });
    await expect(
      lookupIdempotencyRequest("k1", "u1", hashRequest({ a: 2 }))
    ).rejects.toThrow(IdempotencyConflictError);
  });

  it("throws on user mismatch (key reuse by different user)", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { lookupIdempotencyRequest, storeIdempotencyRequest, hashRequest } = await import("../../lib/wallet/idempotency");
    const { IdempotencyConflictError } = await import("../../lib/wallet/types");
    await ensureWalletSchema();

    const hash = hashRequest({ a: 1 });
    await storeIdempotencyRequest("k1", "user-a", hash, 200, { ok: true });
    await expect(
      lookupIdempotencyRequest("k1", "user-b", hash)
    ).rejects.toThrow(IdempotencyConflictError);
  });

  it("hashRequest produces stable hashes for equal payloads", async () => {
    const { hashRequest } = await import("../../lib/wallet/idempotency");
    expect(hashRequest({ a: 1, b: 2 })).toBe(hashRequest({ a: 1, b: 2 }));
  });
});

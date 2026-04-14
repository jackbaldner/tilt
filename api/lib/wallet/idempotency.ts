import { createHash } from "crypto";
import { one, run } from "../db";
import { IdempotencyConflictError } from "./types";

export function hashRequest(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export interface ReplayedResponse {
  statusCode: number;
  response: unknown;
}

export async function lookupIdempotencyRequest(
  key: string,
  userId: string,
  expectedHash: string
): Promise<ReplayedResponse | null> {
  const row = await one<{
    user_id: string;
    request_hash: string;
    response_json: string;
    status_code: number;
  }>("SELECT user_id, request_hash, response_json, status_code FROM IdempotencyRequest WHERE key = ?", [key]);

  if (!row) return null;
  if (row.user_id !== userId || row.request_hash !== expectedHash) {
    throw new IdempotencyConflictError(key);
  }
  return { statusCode: row.status_code, response: JSON.parse(row.response_json) };
}

export async function storeIdempotencyRequest(
  key: string,
  userId: string,
  requestHash: string,
  statusCode: number,
  response: unknown
): Promise<void> {
  await run(
    `INSERT OR IGNORE INTO IdempotencyRequest (key, user_id, request_hash, response_json, status_code)
     VALUES (?, ?, ?, ?, ?)`,
    [key, userId, requestHash, JSON.stringify(response), statusCode]
  );
}

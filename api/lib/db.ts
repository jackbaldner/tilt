import Database from "better-sqlite3";
import { randomUUID } from "crypto";

const DB_PATH = "/Users/jackbaldner/tilt/api/prisma/dev.db";

// Singleton DB connection
const globalForDb = globalThis as unknown as { db: Database.Database | undefined };

export function getDb(): Database.Database {
  if (!globalForDb.db) {
    globalForDb.db = new Database(DB_PATH);
    globalForDb.db.pragma("journal_mode = WAL");
    globalForDb.db.pragma("foreign_keys = ON");
  }
  return globalForDb.db;
}

// Helper to generate cuid-compatible IDs
export function cuid() {
  return randomUUID().replace(/-/g, "").slice(0, 25);
}

export function now() {
  return new Date().toISOString();
}

// Type-safe query helpers
export function one<T>(sql: string, params?: any[]): T | null {
  const db = getDb();
  const stmt = db.prepare(sql);
  return (params ? stmt.get(...params) : stmt.get()) as T | null;
}

export function all<T>(sql: string, params?: any[]): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  return (params ? stmt.all(...params) : stmt.all()) as T[];
}

export function run(sql: string, params?: any[]): Database.RunResult {
  const db = getDb();
  const stmt = db.prepare(sql);
  return params ? stmt.run(...params) : stmt.run();
}

export function transaction<T>(fn: (db: Database.Database) => T): T {
  const db = getDb();
  const t = db.transaction(fn);
  return t(db);
}

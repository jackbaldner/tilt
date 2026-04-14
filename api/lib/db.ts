import { randomUUID } from "crypto";

// ─── ID & time helpers ────────────────────────────────────────────────────────

export function cuid() {
  return randomUUID().replace(/-/g, "").slice(0, 25);
}

export function now() {
  return new Date().toISOString();
}

// ─── Database abstraction ─────────────────────────────────────────────────────
//
// • Local dev   → better-sqlite3 (synchronous, file-based)
// • Production  → @libsql/client (async, Turso/libSQL remote)
//
// The public API is synchronous-looking (one/all/run/transaction) in both
// modes because Next.js route handlers can be async and we always await the
// libSQL client calls before returning.

const USE_TURSO = Boolean(process.env.TURSO_DATABASE_URL);

// ─── libSQL (Turso) path ──────────────────────────────────────────────────────

let libsqlClient: import("@libsql/client").Client | null = null;

async function getLibsqlClient() {
  if (!libsqlClient) {
    const { createClient } = await import("@libsql/client");
    libsqlClient = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return libsqlClient;
}

// ─── better-sqlite3 (local) path ─────────────────────────────────────────────

const DB_PATH = process.env.SQLITE_PATH ?? "/Users/jackbaldner/tilt/api/prisma/dev.db";

// Mutex chain for serializing local interactiveTransaction calls.
// libSQL/Turso handles serialization server-side; this only applies to the
// better-sqlite3 path where we manually open transactions with BEGIN IMMEDIATE.
// Without this, parallel async callers would race between awaits and trigger
// the nested-transaction guard or a SQLite "cannot start a transaction within
// a transaction" error.
let localTxMutex: Promise<unknown> = Promise.resolve();

let localDb: import("better-sqlite3").Database | null = null;

function getLocalDb() {
  if (!localDb) {
    // Dynamic require so the module is never loaded when running on Turso
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    localDb = new Database(DB_PATH);
    (localDb as any).pragma("journal_mode = WAL");
    (localDb as any).pragma("foreign_keys = ON");
  }
  return localDb as import("better-sqlite3").Database;
}

// ─── Public helpers ───────────────────────────────────────────────────────────

export async function one<T>(sql: string, params?: unknown[]): Promise<T | null> {
  if (USE_TURSO) {
    const client = await getLibsqlClient();
    const res = await client.execute({ sql, args: (params ?? []) as import("@libsql/client").InValue[] });
    if (res.rows.length === 0) return null;
    return rowToObject<T>(res.columns, res.rows[0]);
  }
  const db = getLocalDb();
  const stmt = db.prepare(sql);
  const row = (params ? stmt.get(...params) : stmt.get()) as T | undefined;
  return row ?? null;
}

export async function all<T>(sql: string, params?: unknown[]): Promise<T[]> {
  if (USE_TURSO) {
    const client = await getLibsqlClient();
    const res = await client.execute({ sql, args: (params ?? []) as import("@libsql/client").InValue[] });
    return res.rows.map((row) => rowToObject<T>(res.columns, row));
  }
  const db = getLocalDb();
  const stmt = db.prepare(sql);
  return (params ? stmt.all(...params) : stmt.all()) as T[];
}

export async function run(sql: string, params?: unknown[]): Promise<void> {
  if (USE_TURSO) {
    const client = await getLibsqlClient();
    await client.execute({ sql, args: (params ?? []) as import("@libsql/client").InValue[] });
    return;
  }
  const db = getLocalDb();
  const stmt = db.prepare(sql);
  params ? stmt.run(...params) : stmt.run();
}

export async function transaction<T>(fn: (helpers: {
  run: (sql: string, params?: unknown[]) => void;
  one: <R>(sql: string, params?: unknown[]) => R | null;
  all: <R>(sql: string, params?: unknown[]) => R[];
}) => T): Promise<T> {
  if (USE_TURSO) {
    const client = await getLibsqlClient();
    // Collect statements then execute as a batch
    const statements: Array<{ sql: string; args: import("@libsql/client").InValue[] }> = [];
    let result: T;

    // We run fn synchronously collecting statements, then batch-execute
    const helpers = {
      run: (sql: string, params?: unknown[]) => {
        statements.push({ sql, args: (params ?? []) as import("@libsql/client").InValue[] });
      },
      one: <R>(_sql: string, _params?: unknown[]): R | null => null, // reads inside transactions not supported in batch mode
      all: <R>(_sql: string, _params?: unknown[]): R[] => [],
    };
    result = fn(helpers);
    if (statements.length > 0) {
      await client.batch(statements, "write");
    }
    return result;
  }

  // better-sqlite3: synchronous transaction
  const db = getLocalDb();
  const helpers = {
    run: (sql: string, params?: unknown[]) => {
      db.prepare(sql).run(...(params ?? []));
    },
    one: <R>(sql: string, params?: unknown[]): R | null => {
      const stmt = db.prepare(sql);
      return (params ? stmt.get(...params) : stmt.get()) as R | null;
    },
    all: <R>(sql: string, params?: unknown[]): R[] => {
      const stmt = db.prepare(sql);
      return (params ? stmt.all(...params) : stmt.all()) as R[];
    },
  };

  const t = db.transaction((h: typeof helpers) => fn(h));
  return t(helpers);
}

// ─── InteractiveTransaction ───────────────────────────────────────────────────
//
// Unlike `transaction()` which batches writes only, this supports reading rows
// mid-transaction. Turso uses client.transaction("write"); local uses
// better-sqlite3's synchronous db.transaction() with async-compatible wrappers.

export interface InteractiveTx {
  run(sql: string, params?: unknown[]): Promise<void>;
  one<T>(sql: string, params?: unknown[]): Promise<T | null>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export async function interactiveTransaction<T>(
  fn: (tx: InteractiveTx) => Promise<T>
): Promise<T> {
  if (USE_TURSO) {
    const client = await getLibsqlClient();
    const tx = await client.transaction("write");
    try {
      const helpers: InteractiveTx = {
        run: async (sql, params) => {
          await tx.execute({ sql, args: (params ?? []) as import("@libsql/client").InValue[] });
        },
        one: async <R>(sql: string, params?: unknown[]) => {
          const res = await tx.execute({ sql, args: (params ?? []) as import("@libsql/client").InValue[] });
          if (res.rows.length === 0) return null;
          return rowToObject<R>(res.columns, res.rows[0]);
        },
        all: async <R>(sql: string, params?: unknown[]) => {
          const res = await tx.execute({ sql, args: (params ?? []) as import("@libsql/client").InValue[] });
          return res.rows.map((row) => rowToObject<R>(res.columns, row));
        },
      };
      const result = await fn(helpers);
      await tx.commit();
      return result;
    } catch (err) {
      try { await tx.rollback(); } catch { /* swallow rollback error */ }
      throw err;
    }
  }

  // better-sqlite3: serialize via mutex so parallel async callers queue cleanly.
  // Each caller enqueues itself behind the previous one; the chain never stalls
  // because release() always fires in the finally block.
  const previous = localTxMutex;
  let release!: (value?: unknown) => void;
  localTxMutex = new Promise((resolve) => { release = resolve; });

  try {
    await previous; // wait for any in-flight transaction to finish

    // Nested-transaction guard: catches programmer errors where someone calls
    // interactiveTransaction from inside another interactiveTransaction
    // synchronously. The mutex handles the parallel/async case; this handles
    // the truly-nested case.
    const db = getLocalDb();
    if (db.inTransaction) {
      throw new Error("interactiveTransaction cannot be nested");
    }
    db.prepare("BEGIN IMMEDIATE").run();
    try {
      const helpers: InteractiveTx = {
        run: async (sql, params) => {
          db.prepare(sql).run(...(params ?? []));
        },
        one: async <R>(sql: string, params?: unknown[]) => {
          const stmt = db.prepare(sql);
          return (params ? stmt.get(...params) : stmt.get()) as R | null;
        },
        all: async <R>(sql: string, params?: unknown[]) => {
          const stmt = db.prepare(sql);
          return (params ? stmt.all(...params) : stmt.all()) as R[];
        },
      };
      const result = await fn(helpers);
      db.prepare("COMMIT").run();
      return result;
    } catch (err) {
      try { db.prepare("ROLLBACK").run(); } catch { /* swallow rollback error */ }
      throw err;
    }
  } finally {
    release(); // always unblock the next queued caller
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function rowToObject<T>(columns: string[], row: import("@libsql/client").Row): T {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  return obj as T;
}

// ─── execScript ──────────────────────────────────────────────────────────────
//
// Execute a multi-statement SQL script (e.g. DDL migrations).
// • better-sqlite3: db.exec() natively handles multi-statement scripts.
// • libSQL/Turso:   client.executeMultiple() is purpose-built for SQL scripts.

export async function execScript(sql: string): Promise<void> {
  if (USE_TURSO) {
    const client = await getLibsqlClient();
    await client.executeMultiple(sql);
    return;
  }
  const db = getLocalDb();
  db.exec(sql);
}

// Legacy: expose getDb for any code that called it directly (local only)
export function getDb() {
  return getLocalDb();
}

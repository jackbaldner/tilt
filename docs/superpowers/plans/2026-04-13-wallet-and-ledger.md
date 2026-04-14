# Wallet & Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ad-hoc `User.chips` storage with a real-money-ready double-entry wallet & ledger system.

**Architecture:** Single-chokepoint module (`api/lib/wallet/`) owns all balance reads/writes. Per-user wallets, per-bet escrow wallets, system Mint/House wallets. Append-only `LedgerEntry` table. Cached balances reconciled nightly. Idempotency via natural keys + client-provided keys.

**Tech Stack:** Next.js 16.2.2, TypeScript, better-sqlite3 (local) / @libsql/client (Turso production), Vitest for tests.

**Spec:** [`docs/superpowers/specs/2026-04-13-wallet-and-ledger-design.md`](../specs/2026-04-13-wallet-and-ledger-design.md)

---

## File Structure

**Created:**
- `api/vitest.config.ts` — test runner config
- `api/__tests__/_helpers/db.ts` — fresh in-memory DB per test
- `api/__tests__/wallet/*.test.ts` — one test file per wallet operation
- `api/lib/wallet/index.ts` — public API barrel export
- `api/lib/wallet/types.ts` — Wallet, LedgerEntry, IdempotencyRequest types
- `api/lib/wallet/internal.ts` — private helpers (wallet creation, balance updates, ledger insert)
- `api/lib/wallet/grant.ts` — `grant()` operation
- `api/lib/wallet/joinBet.ts` — `joinBet()` operation
- `api/lib/wallet/resolveBet.ts` — `resolveBet()` operation
- `api/lib/wallet/refundBet.ts` — `refundBet()` operation
- `api/lib/wallet/reverseBet.ts` — `reverseBet()` operation
- `api/lib/wallet/reconcile.ts` — `reconcileWallet()`, `reconcileAll()`
- `api/lib/wallet/idempotency.ts` — idempotency lookup & store
- `api/lib/wallet/schema.sql` — DDL for new tables
- `api/scripts/migrate-wallet-ledger.ts` — one-shot migration script
- `api/app/api/cron/reconcile/route.ts` — Vercel cron entry point for nightly reconciliation

**Modified:**
- `api/package.json` — add vitest, @vitest/* devDeps; add `test` script
- `api/lib/db.ts` — add `interactiveTransaction()` helper supporting reads in both modes
- `api/prisma/schema.prisma` — drop `User.chips`, `CircleMember.chips`, `Transaction`; document new tables (reference only — Prisma client not used)
- `api/app/api/auth/mobile-token/route.ts` — call `wallet.grant()` for new users
- `api/app/api/bets/route.ts` — call `wallet.joinBet()` at bet creation (proposer's stake)
- `api/app/api/bets/[id]/sides/route.ts` — call `wallet.joinBet()` for joiners
- `api/app/api/bets/[id]/resolve/route.ts` — call `wallet.resolveBet()` / `wallet.refundBet()`
- `api/app/api/users/me/route.ts` — read balance from wallet
- `api/app/api/users/[id]/stats/route.ts` — read balance from wallet
- `api/app/api/circles/[id]/leaderboard/route.ts` — read balances from wallets
- `vercel.json` (create if missing at repo root or in `api/`) — register cron schedule

---

## Pre-flight: Read the Spec

- [ ] **Step 0:** Read `docs/superpowers/specs/2026-04-13-wallet-and-ledger-design.md` end-to-end before starting. Every design decision is documented there. If anything in this plan contradicts the spec, the spec wins — flag it and stop.

- [ ] **Step 0b:** Read `api/AGENTS.md` and `api/CLAUDE.md`. Note especially: Next.js 16.2.2 has breaking changes from older versions. Before writing any route handler code, consult `api/node_modules/next/dist/docs/` for the relevant API surface.

---

## Phase 1: Test Infrastructure

### Task 1: Add Vitest

**Files:**
- Modify: `api/package.json`
- Create: `api/vitest.config.ts`
- Create: `api/__tests__/_helpers/db.ts`
- Create: `api/__tests__/sanity.test.ts`

- [ ] **Step 1: Install vitest**

```bash
cd api && npm install -D vitest @vitest/ui
```

- [ ] **Step 2: Add `test` script to `api/package.json`**

In the `scripts` block, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `api/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    setupFiles: ["__tests__/_helpers/db.ts"],
  },
});
```

- [ ] **Step 4: Create `api/__tests__/_helpers/db.ts`**

```ts
import Database from "better-sqlite3";
import { beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

let testDbPath: string;

beforeEach(() => {
  // Each test gets its own temp file-based SQLite DB
  testDbPath = path.join(os.tmpdir(), `tilt-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  process.env.SQLITE_PATH = testDbPath;
  delete process.env.TURSO_DATABASE_URL;

  // Force re-init of localDb singleton between tests
  // (We achieve this by importing db.ts AFTER setting env vars in each test file)
});

afterEach(() => {
  if (testDbPath && fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});
```

> **Note:** `api/lib/db.ts` currently caches `localDb` as a module-level singleton. To make each test get a fresh DB, the test helper file uses a fresh import via `vi.resetModules()` in each test that needs the wallet module. We'll add a small helper for this in Task 6.

- [ ] **Step 5: Create `api/__tests__/sanity.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("test infrastructure", () => {
  it("vitest is wired up", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run sanity test**

```bash
cd api && npm test
```

Expected: `1 passed`.

- [ ] **Step 7: Commit**

```bash
git add api/package.json api/package-lock.json api/vitest.config.ts api/__tests__/
git commit -m "test: add vitest infrastructure"
```

---

### Task 2: Extend `db.ts` with `interactiveTransaction()`

**Why:** The existing `transaction()` helper batches writes only. Wallet operations need to read balances mid-transaction (e.g., check sufficient funds, look up escrow wallet). libSQL supports interactive transactions via `client.transaction("write")`; better-sqlite3 supports them natively.

**Files:**
- Modify: `api/lib/db.ts`
- Create: `api/__tests__/lib/db.test.ts`

- [ ] **Step 1: Write the failing test**

`api/__tests__/lib/db.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("interactiveTransaction", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("supports read-then-write within a transaction", async () => {
    const { run, interactiveTransaction } = await import("../../lib/db");
    await run("CREATE TABLE counter (id TEXT PRIMARY KEY, n INTEGER NOT NULL)");
    await run("INSERT INTO counter (id, n) VALUES ('a', 5)");

    const result = await interactiveTransaction(async (tx) => {
      const row = await tx.one<{ n: number }>("SELECT n FROM counter WHERE id = ?", ["a"]);
      const newN = (row?.n ?? 0) + 10;
      await tx.run("UPDATE counter SET n = ? WHERE id = ?", [newN, "a"]);
      return newN;
    });

    expect(result).toBe(15);
    const { one } = await import("../../lib/db");
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
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd api && npm test -- __tests__/lib/db.test.ts
```

Expected: FAIL — `interactiveTransaction is not exported`.

- [ ] **Step 3: Add `interactiveTransaction` to `api/lib/db.ts`**

Append to the end of the file (before the legacy `getDb` export):

```ts
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
      await tx.rollback();
      throw err;
    }
  }

  // better-sqlite3: synchronous transactions; we wrap in a Promise interface
  const db = getLocalDb();
  let result: T;
  let caught: unknown = null;

  const txFn = db.transaction(() => {
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

    // We need to drive the async fn synchronously inside the better-sqlite3
    // transaction wrapper. Since all our helpers resolve immediately in local
    // mode, we use a microtask-draining trick: we collect the promise and
    // throw if it's not already resolved by the time we exit.
    let resolved = false;
    fn(helpers).then(
      (r) => { result = r; resolved = true; },
      (e) => { caught = e; resolved = true; }
    );
    // Local mode helpers are sync under the hood, so the promise resolves
    // in the current tick. If anything in fn does real async work (network,
    // setTimeout, etc.) this will throw — that's intentional, transactions
    // must be self-contained.
    if (!resolved) {
      throw new Error("interactiveTransaction: async work inside local-mode tx is not allowed");
    }
    if (caught) throw caught;
  });

  txFn();
  return result!;
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd api && npm test -- __tests__/lib/db.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/lib/db.ts api/__tests__/lib/
git commit -m "feat(db): add interactiveTransaction helper supporting read-then-write"
```

---

## Phase 2: Schema

### Task 3: Wallet/Ledger DDL

**Files:**
- Create: `api/lib/wallet/schema.sql`
- Create: `api/lib/wallet/migrate.ts`
- Create: `api/__tests__/wallet/schema.test.ts`

- [ ] **Step 1: Create `api/lib/wallet/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS Wallet (
  id            TEXT PRIMARY KEY,
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('user', 'bet_escrow', 'system')),
  owner_id      TEXT NOT NULL,
  currency      TEXT NOT NULL CHECK (currency IN ('CHIPS', 'COINS')),
  balance       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_type, owner_id, currency)
);
CREATE INDEX IF NOT EXISTS idx_wallet_owner ON Wallet (owner_type, owner_id);

CREATE TABLE IF NOT EXISTS LedgerEntry (
  id                 TEXT PRIMARY KEY,
  from_wallet_id     TEXT NOT NULL REFERENCES Wallet(id),
  to_wallet_id       TEXT NOT NULL REFERENCES Wallet(id),
  amount             INTEGER NOT NULL CHECK (amount > 0),
  currency           TEXT NOT NULL CHECK (currency IN ('CHIPS', 'COINS')),
  entry_type         TEXT NOT NULL CHECK (entry_type IN ('grant', 'join', 'resolve', 'refund', 'reverse')),
  ref_type           TEXT,
  ref_id             TEXT,
  reverses_entry_id  TEXT REFERENCES LedgerEntry(id),
  idempotency_key    TEXT UNIQUE,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_from ON LedgerEntry (from_wallet_id);
CREATE INDEX IF NOT EXISTS idx_ledger_to ON LedgerEntry (to_wallet_id);
CREATE INDEX IF NOT EXISTS idx_ledger_ref ON LedgerEntry (ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON LedgerEntry (entry_type);

CREATE TABLE IF NOT EXISTS IdempotencyRequest (
  key            TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  request_hash   TEXT NOT NULL,
  response_json  TEXT NOT NULL,
  status_code    INTEGER NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_idempotency_created ON IdempotencyRequest (created_at);
```

- [ ] **Step 2: Create `api/lib/wallet/migrate.ts`**

```ts
import { run } from "../db";
import * as fs from "fs";
import * as path from "path";

export async function ensureWalletSchema() {
  const ddl = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  // SQLite supports multiple statements via .exec; for our async helpers
  // we split on `;` and run each non-empty statement individually.
  const statements = ddl
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await run(stmt);
  }

  // Insert system wallets if not present
  await run(
    `INSERT OR IGNORE INTO Wallet (id, owner_type, owner_id, currency, balance)
     VALUES ('sys_mint_chips', 'system', 'SYSTEM_MINT', 'CHIPS', 0)`
  );
  await run(
    `INSERT OR IGNORE INTO Wallet (id, owner_type, owner_id, currency, balance)
     VALUES ('sys_house_chips', 'system', 'SYSTEM_HOUSE', 'CHIPS', 0)`
  );
  await run(
    `INSERT OR IGNORE INTO Wallet (id, owner_type, owner_id, currency, balance)
     VALUES ('sys_mint_coins', 'system', 'SYSTEM_MINT', 'COINS', 0)`
  );
  await run(
    `INSERT OR IGNORE INTO Wallet (id, owner_type, owner_id, currency, balance)
     VALUES ('sys_house_coins', 'system', 'SYSTEM_HOUSE', 'COINS', 0)`
  );
}
```

- [ ] **Step 3: Write the failing test**

`api/__tests__/wallet/schema.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet schema", () => {
  beforeEach(() => vi.resetModules());

  it("creates all tables and seeds system wallets", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { all, one } = await import("../../lib/db");

    await ensureWalletSchema();

    const tables = await all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const names = tables.map((t) => t.name);
    expect(names).toContain("Wallet");
    expect(names).toContain("LedgerEntry");
    expect(names).toContain("IdempotencyRequest");

    const mintChips = await one<{ balance: number }>(
      "SELECT balance FROM Wallet WHERE id = 'sys_mint_chips'"
    );
    expect(mintChips?.balance).toBe(0);
  });

  it("is idempotent (safe to run twice)", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    await ensureWalletSchema();
    await ensureWalletSchema();
    // No error = pass
  });
});
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd api && npm test -- __tests__/wallet/schema.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add api/lib/wallet/schema.sql api/lib/wallet/migrate.ts api/__tests__/wallet/schema.test.ts
git commit -m "feat(wallet): add schema DDL and migration"
```

---

### Task 4: Wallet types module

**Files:**
- Create: `api/lib/wallet/types.ts`

- [ ] **Step 1: Create `api/lib/wallet/types.ts`**

```ts
export type Currency = "CHIPS" | "COINS";

export type WalletOwnerType = "user" | "bet_escrow" | "system";

export type EntryType = "grant" | "join" | "resolve" | "refund" | "reverse";

export interface Wallet {
  id: string;
  owner_type: WalletOwnerType;
  owner_id: string;
  currency: Currency;
  balance: number;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  from_wallet_id: string;
  to_wallet_id: string;
  amount: number;
  currency: Currency;
  entry_type: EntryType;
  ref_type: string | null;
  ref_id: string | null;
  reverses_entry_id: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface IdempotencyRequest {
  key: string;
  user_id: string;
  request_hash: string;
  response_json: string;
  status_code: number;
  created_at: string;
}

export class InsufficientFundsError extends Error {
  constructor(walletId: string, requested: number, available: number) {
    super(`Insufficient funds in wallet ${walletId}: requested ${requested}, available ${available}`);
    this.name = "InsufficientFundsError";
  }
}

export class WalletNotFoundError extends Error {
  constructor(ownerType: WalletOwnerType, ownerId: string, currency: Currency) {
    super(`Wallet not found: ${ownerType}/${ownerId}/${currency}`);
    this.name = "WalletNotFoundError";
  }
}

export class IdempotencyConflictError extends Error {
  constructor(key: string) {
    super(`Idempotency key reused with different request: ${key}`);
    this.name = "IdempotencyConflictError";
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add api/lib/wallet/types.ts
git commit -m "feat(wallet): add type definitions"
```

---

### Task 5: Internal helpers — wallet creation, balance update, ledger insert

**Files:**
- Create: `api/lib/wallet/internal.ts`
- Create: `api/__tests__/wallet/internal.test.ts`

- [ ] **Step 1: Write the failing test**

`api/__tests__/wallet/internal.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet/internal", () => {
  beforeEach(() => vi.resetModules());

  it("getOrCreateWallet creates on first call, returns existing on second", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { getOrCreateWallet } = await import("../../lib/wallet/internal");
    await ensureWalletSchema();

    const w1 = await getOrCreateWallet("user", "u1", "CHIPS");
    const w2 = await getOrCreateWallet("user", "u1", "CHIPS");
    expect(w1.id).toBe(w2.id);
    expect(w1.balance).toBe(0);
  });

  it("transferAtomic moves funds and writes one ledger entry", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { getOrCreateWallet, transferAtomic } = await import("../../lib/wallet/internal");
    const { one } = await import("../../lib/db");
    await ensureWalletSchema();

    const from = await getOrCreateWallet("user", "u1", "CHIPS");
    const to = await getOrCreateWallet("user", "u2", "CHIPS");

    // Seed `from` directly via raw SQL (bypassing wallet API for the test setup)
    const { run } = await import("../../lib/db");
    await run("UPDATE Wallet SET balance = 100 WHERE id = ?", [from.id]);

    const entryId = await transferAtomic({
      fromWalletId: from.id,
      toWalletId: to.id,
      amount: 30,
      currency: "CHIPS",
      entryType: "grant",
      refType: null,
      refId: null,
      reversesEntryId: null,
      idempotencyKey: null,
    });

    const fromAfter = await one<{ balance: number }>("SELECT balance FROM Wallet WHERE id = ?", [from.id]);
    const toAfter = await one<{ balance: number }>("SELECT balance FROM Wallet WHERE id = ?", [to.id]);
    expect(fromAfter?.balance).toBe(70);
    expect(toAfter?.balance).toBe(30);

    const entry = await one<{ amount: number; entry_type: string }>(
      "SELECT amount, entry_type FROM LedgerEntry WHERE id = ?",
      [entryId]
    );
    expect(entry?.amount).toBe(30);
    expect(entry?.entry_type).toBe("grant");
  });

  it("transferAtomic throws on insufficient funds", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { getOrCreateWallet, transferAtomic } = await import("../../lib/wallet/internal");
    const { InsufficientFundsError } = await import("../../lib/wallet/types");
    await ensureWalletSchema();

    const from = await getOrCreateWallet("user", "u1", "CHIPS");
    const to = await getOrCreateWallet("user", "u2", "CHIPS");

    await expect(
      transferAtomic({
        fromWalletId: from.id,
        toWalletId: to.id,
        amount: 50,
        currency: "CHIPS",
        entryType: "join",
        refType: null,
        refId: null,
        reversesEntryId: null,
        idempotencyKey: null,
      })
    ).rejects.toThrow(InsufficientFundsError);
  });

  it("transferAtomic allows system mint wallet to go negative", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const { getOrCreateWallet, transferAtomic } = await import("../../lib/wallet/internal");
    const { one } = await import("../../lib/db");
    await ensureWalletSchema();

    const to = await getOrCreateWallet("user", "u1", "CHIPS");
    await transferAtomic({
      fromWalletId: "sys_mint_chips",
      toWalletId: to.id,
      amount: 1000,
      currency: "CHIPS",
      entryType: "grant",
      refType: "grant",
      refId: "signup",
      reversesEntryId: null,
      idempotencyKey: null,
    });

    const mint = await one<{ balance: number }>("SELECT balance FROM Wallet WHERE id = 'sys_mint_chips'");
    expect(mint?.balance).toBe(-1000);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd api && npm test -- __tests__/wallet/internal.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `api/lib/wallet/internal.ts`**

```ts
import { interactiveTransaction } from "../db";
import { cuid } from "../db";
import {
  Currency,
  EntryType,
  Wallet,
  WalletOwnerType,
  InsufficientFundsError,
} from "./types";

export async function getOrCreateWallet(
  ownerType: WalletOwnerType,
  ownerId: string,
  currency: Currency
): Promise<Wallet> {
  return interactiveTransaction(async (tx) => {
    const existing = await tx.one<Wallet>(
      "SELECT * FROM Wallet WHERE owner_type = ? AND owner_id = ? AND currency = ?",
      [ownerType, ownerId, currency]
    );
    if (existing) return existing;

    const id = cuid();
    await tx.run(
      `INSERT INTO Wallet (id, owner_type, owner_id, currency, balance)
       VALUES (?, ?, ?, ?, 0)`,
      [id, ownerType, ownerId, currency]
    );
    const created = await tx.one<Wallet>("SELECT * FROM Wallet WHERE id = ?", [id]);
    return created!;
  });
}

export interface TransferInput {
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  currency: Currency;
  entryType: EntryType;
  refType: string | null;
  refId: string | null;
  reversesEntryId: string | null;
  idempotencyKey: string | null;
}

/**
 * Atomically debits `from`, credits `to`, and writes one LedgerEntry.
 * The system mint wallet ('sys_mint_chips' / 'sys_mint_coins') is the only
 * wallet allowed to go negative.
 */
export async function transferAtomic(input: TransferInput): Promise<string> {
  if (input.amount <= 0) {
    throw new Error(`transferAtomic: amount must be positive, got ${input.amount}`);
  }
  if (input.fromWalletId === input.toWalletId) {
    throw new Error(`transferAtomic: from and to wallets must differ`);
  }

  return interactiveTransaction(async (tx) => {
    const from = await tx.one<Wallet>("SELECT * FROM Wallet WHERE id = ?", [input.fromWalletId]);
    const to = await tx.one<Wallet>("SELECT * FROM Wallet WHERE id = ?", [input.toWalletId]);
    if (!from) throw new Error(`Source wallet ${input.fromWalletId} not found`);
    if (!to) throw new Error(`Destination wallet ${input.toWalletId} not found`);
    if (from.currency !== input.currency || to.currency !== input.currency) {
      throw new Error(`Currency mismatch in transfer`);
    }

    const isMint = from.owner_type === "system" && from.owner_id === "SYSTEM_MINT";
    if (!isMint && from.balance < input.amount) {
      throw new InsufficientFundsError(from.id, input.amount, from.balance);
    }

    await tx.run("UPDATE Wallet SET balance = balance - ? WHERE id = ?", [input.amount, from.id]);
    await tx.run("UPDATE Wallet SET balance = balance + ? WHERE id = ?", [input.amount, to.id]);

    const entryId = cuid();
    await tx.run(
      `INSERT INTO LedgerEntry
         (id, from_wallet_id, to_wallet_id, amount, currency, entry_type,
          ref_type, ref_id, reverses_entry_id, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entryId,
        input.fromWalletId,
        input.toWalletId,
        input.amount,
        input.currency,
        input.entryType,
        input.refType,
        input.refId,
        input.reversesEntryId,
        input.idempotencyKey,
      ]
    );

    return entryId;
  });
}
```

- [ ] **Step 4: Run tests**

```bash
cd api && npm test -- __tests__/wallet/internal.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add api/lib/wallet/internal.ts api/__tests__/wallet/internal.test.ts
git commit -m "feat(wallet): add internal getOrCreateWallet and transferAtomic helpers"
```

---

## Phase 3: Wallet Operations

### Task 6: `getBalance` and public `index.ts`

**Files:**
- Create: `api/lib/wallet/index.ts`
- Create: `api/__tests__/wallet/getBalance.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet.getBalance", () => {
  beforeEach(() => vi.resetModules());

  it("returns 0 for a user with no wallet yet", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    await ensureWalletSchema();
    expect(await wallet.getBalance("u1", "CHIPS")).toBe(0);
  });

  it("returns balance after seeding", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { getOrCreateWallet } = await import("../../lib/wallet/internal");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();

    const w = await getOrCreateWallet("user", "u1", "CHIPS");
    await run("UPDATE Wallet SET balance = 1500 WHERE id = ?", [w.id]);

    expect(await wallet.getBalance("u1", "CHIPS")).toBe(1500);
  });
});
```

- [ ] **Step 2: Create `api/lib/wallet/index.ts`**

```ts
import { one } from "../db";
import { Currency } from "./types";

export * from "./types";
export { ensureWalletSchema } from "./migrate";

export async function getBalance(userId: string, currency: Currency = "CHIPS"): Promise<number> {
  const row = await one<{ balance: number }>(
    "SELECT balance FROM Wallet WHERE owner_type = 'user' AND owner_id = ? AND currency = ?",
    [userId, currency]
  );
  return row?.balance ?? 0;
}
```

- [ ] **Step 3: Run tests**

```bash
cd api && npm test -- __tests__/wallet/getBalance.test.ts
```

Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add api/lib/wallet/index.ts api/__tests__/wallet/getBalance.test.ts
git commit -m "feat(wallet): add getBalance and public index"
```

---

### Task 7: `grant` operation

**Files:**
- Create: `api/lib/wallet/grant.ts`
- Modify: `api/lib/wallet/index.ts`
- Create: `api/__tests__/wallet/grant.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet.grant", () => {
  beforeEach(() => vi.resetModules());

  it("grants chips from mint to user", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    await ensureWalletSchema();

    await wallet.grant({ userId: "u1", currency: "CHIPS", amount: 1000, reason: "signup" });

    expect(await wallet.getBalance("u1", "CHIPS")).toBe(1000);

    const { one } = await import("../../lib/db");
    const mint = await one<{ balance: number }>("SELECT balance FROM Wallet WHERE id = 'sys_mint_chips'");
    expect(mint?.balance).toBe(-1000);
  });

  it("is idempotent via natural key (signup)", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    await ensureWalletSchema();

    await wallet.grant({ userId: "u1", currency: "CHIPS", amount: 1000, reason: "signup" });
    await wallet.grant({ userId: "u1", currency: "CHIPS", amount: 1000, reason: "signup" });

    expect(await wallet.getBalance("u1", "CHIPS")).toBe(1000);
  });

  it("rejects negative or zero amounts", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    await ensureWalletSchema();

    await expect(
      wallet.grant({ userId: "u1", currency: "CHIPS", amount: 0, reason: "signup" })
    ).rejects.toThrow();
    await expect(
      wallet.grant({ userId: "u1", currency: "CHIPS", amount: -100, reason: "signup" })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd api && npm test -- __tests__/wallet/grant.test.ts
```

- [ ] **Step 3: Create `api/lib/wallet/grant.ts`**

```ts
import { one } from "../db";
import { getOrCreateWallet, transferAtomic } from "./internal";
import { Currency } from "./types";

export interface GrantInput {
  userId: string;
  currency: Currency;
  amount: number;
  reason: string; // 'signup', 'migration_initial_grant', 'promo:<code>', etc.
  idempotencyKey?: string;
}

const MINT_WALLET_IDS: Record<Currency, string> = {
  CHIPS: "sys_mint_chips",
  COINS: "sys_mint_coins",
};

export async function grant(input: GrantInput): Promise<string | "duplicate"> {
  if (input.amount <= 0) {
    throw new Error(`grant: amount must be positive, got ${input.amount}`);
  }

  // Natural idempotency key for known reasons
  const naturalKey = input.idempotencyKey ?? `grant:${input.reason}:${input.userId}`;

  // Check if this grant already happened
  const existing = await one<{ id: string }>(
    "SELECT id FROM LedgerEntry WHERE idempotency_key = ?",
    [naturalKey]
  );
  if (existing) return "duplicate";

  const userWallet = await getOrCreateWallet("user", input.userId, input.currency);

  return transferAtomic({
    fromWalletId: MINT_WALLET_IDS[input.currency],
    toWalletId: userWallet.id,
    amount: input.amount,
    currency: input.currency,
    entryType: "grant",
    refType: "grant",
    refId: input.reason,
    reversesEntryId: null,
    idempotencyKey: naturalKey,
  });
}
```

- [ ] **Step 4: Re-export from `api/lib/wallet/index.ts`**

Add to the bottom of `index.ts`:
```ts
export { grant } from "./grant";
```

- [ ] **Step 5: Run tests**

```bash
cd api && npm test -- __tests__/wallet/grant.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add api/lib/wallet/grant.ts api/lib/wallet/index.ts api/__tests__/wallet/grant.test.ts
git commit -m "feat(wallet): add grant operation"
```

---

### Task 8: `joinBet` operation

**Files:**
- Create: `api/lib/wallet/joinBet.ts`
- Modify: `api/lib/wallet/index.ts`
- Create: `api/__tests__/wallet/joinBet.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
    await wallet.joinBet({ betId: "b1", userId: "u1", option: "yes", stake: 50, idempotencyKey: "k1" });
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
  });

  it("rejects double-join via natural key (BetSide unique constraint)", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "u1", option: "yes", stake: 50 });
    await expect(
      wallet.joinBet({ betId: "b1", userId: "u1", option: "no", stake: 50 })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd api && npm test -- __tests__/wallet/joinBet.test.ts
```

- [ ] **Step 3: Create `api/lib/wallet/joinBet.ts`**

> **Important:** The chip transfer and the `BetSide` INSERT must happen in **one transaction** so they cannot get out of sync. We inline the transfer logic instead of calling `transferAtomic` (which opens its own transaction — nesting is not safe).

```ts
import { interactiveTransaction, one, cuid } from "../db";
import { getOrCreateWallet } from "./internal";
import { Currency, InsufficientFundsError, Wallet } from "./types";

export interface JoinBetInput {
  betId: string;
  userId: string;
  option: string;
  stake: number;
  currency?: Currency; // defaults to CHIPS
  idempotencyKey?: string;
}

export async function joinBet(input: JoinBetInput): Promise<string | "duplicate"> {
  const currency = input.currency ?? "CHIPS";
  const naturalKey = input.idempotencyKey ?? `join:${input.betId}:${input.userId}`;

  // Idempotency short-circuit (outside transaction is fine — the UNIQUE
  // constraint on idempotency_key is the source of truth, this is just
  // an early exit).
  const existing = await one<{ id: string }>(
    "SELECT id FROM LedgerEntry WHERE idempotency_key = ?",
    [naturalKey]
  );
  if (existing) return "duplicate";

  // Wallet creation outside the transaction (creating a wallet is itself
  // an interactiveTransaction — nesting is not safe).
  const userWallet = await getOrCreateWallet("user", input.userId, currency);
  const escrowWallet = await getOrCreateWallet("bet_escrow", input.betId, currency);

  return interactiveTransaction(async (tx) => {
    // Re-read user wallet for current balance inside the transaction
    const user = await tx.one<Wallet>("SELECT * FROM Wallet WHERE id = ?", [userWallet.id]);
    if (!user) throw new Error(`User wallet ${userWallet.id} disappeared`);
    if (user.balance < input.stake) {
      throw new InsufficientFundsError(user.id, input.stake, user.balance);
    }

    // 1. Insert BetSide first — the (betId, userId) UNIQUE constraint is
    //    the natural lock against double-joining. If this throws, no chips
    //    have moved yet.
    const sideId = cuid();
    await tx.run(
      `INSERT INTO BetSide (id, betId, userId, option, stake)
       VALUES (?, ?, ?, ?, ?)`,
      [sideId, input.betId, input.userId, input.option, input.stake]
    );

    // 2. Move chips
    await tx.run("UPDATE Wallet SET balance = balance - ? WHERE id = ?", [input.stake, userWallet.id]);
    await tx.run("UPDATE Wallet SET balance = balance + ? WHERE id = ?", [input.stake, escrowWallet.id]);

    // 3. Write the ledger entry
    const entryId = cuid();
    await tx.run(
      `INSERT INTO LedgerEntry
         (id, from_wallet_id, to_wallet_id, amount, currency, entry_type, ref_type, ref_id, idempotency_key)
       VALUES (?, ?, ?, ?, ?, 'join', 'bet', ?, ?)`,
      [entryId, userWallet.id, escrowWallet.id, input.stake, currency, input.betId, naturalKey]
    );

    return entryId;
  });
}
```

- [ ] **Step 4: Export from `index.ts`**

```ts
export { joinBet } from "./joinBet";
```

- [ ] **Step 5: Run tests**

```bash
cd api && npm test -- __tests__/wallet/joinBet.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add api/lib/wallet/joinBet.ts api/lib/wallet/index.ts api/__tests__/wallet/joinBet.test.ts
git commit -m "feat(wallet): add joinBet operation"
```

---

### Task 9: `resolveBet` operation — happy path

**Files:**
- Create: `api/lib/wallet/resolveBet.ts`
- Modify: `api/lib/wallet/index.ts`
- Create: `api/__tests__/wallet/resolveBet.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet.resolveBet — happy path", () => {
  beforeEach(() => vi.resetModules());

  async function setup() {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();
    await run("CREATE TABLE Bet (id TEXT PRIMARY KEY, stake INTEGER NOT NULL, totalPot INTEGER DEFAULT 0, resolvedOption TEXT)");
    await run("CREATE TABLE BetSide (id TEXT PRIMARY KEY, betId TEXT, userId TEXT, option TEXT, stake INTEGER, status TEXT DEFAULT 'active', createdAt TEXT DEFAULT (datetime('now')), UNIQUE(betId, userId))");
    await run("INSERT INTO Bet (id, stake) VALUES ('b1', 50)");
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

    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1100); // 950 + 150 pot
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
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(1025); // 950 + 75
    expect(await wallet.getBalance("carol", "CHIPS")).toBe(1025);
  });

  it("is idempotent", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "no", stake: 50 });
    await wallet.resolveBet({ betId: "b1", winningOption: "yes" });
    await wallet.resolveBet({ betId: "b1", winningOption: "yes" });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1050);
  });
});
```

- [ ] **Step 2: Create `api/lib/wallet/resolveBet.ts`**

```ts
import { interactiveTransaction, one, all, cuid } from "../db";
import { getOrCreateWallet } from "./internal";
import { Currency, LedgerEntry } from "./types";

export interface ResolveBetInput {
  betId: string;
  winningOption: string;
  currency?: Currency;
  rakeBps?: number; // basis points; default 0
  idempotencyKey?: string;
}

interface BetSideRow {
  id: string;
  userId: string;
  option: string;
  stake: number;
  createdAt: string;
}

export async function resolveBet(input: ResolveBetInput): Promise<string[] | "duplicate"> {
  const currency = input.currency ?? "CHIPS";
  const rakeBps = input.rakeBps ?? 0;
  const naturalKey = input.idempotencyKey ?? `resolve:${input.betId}`;

  const existing = await one<{ id: string }>(
    "SELECT id FROM LedgerEntry WHERE idempotency_key = ?",
    [naturalKey]
  );
  if (existing) return "duplicate";

  const sides = await all<BetSideRow>(
    `SELECT id, userId, option, stake, createdAt FROM BetSide WHERE betId = ? ORDER BY createdAt ASC`,
    [input.betId]
  );
  if (sides.length === 0) {
    throw new Error(`resolveBet: no sides found for bet ${input.betId}`);
  }

  const winners = sides.filter((s) => s.option === input.winningOption);
  if (winners.length === 0) {
    throw new Error(
      `resolveBet: winning option "${input.winningOption}" has no joiners — use refundBet (push) instead`
    );
  }

  const escrowWallet = await getOrCreateWallet("bet_escrow", input.betId, currency);
  const houseWalletId = currency === "CHIPS" ? "sys_house_chips" : "sys_house_coins";

  return interactiveTransaction(async (tx) => {
    const escrow = await tx.one<{ balance: number }>(
      "SELECT balance FROM Wallet WHERE id = ?",
      [escrowWallet.id]
    );
    const pot = escrow?.balance ?? 0;
    if (pot === 0) {
      throw new Error(`resolveBet: escrow for bet ${input.betId} is empty`);
    }

    // 1. Siphon rake
    const rakeAmount = Math.floor((pot * rakeBps) / 10000);
    const distributable = pot - rakeAmount;
    const entryIds: string[] = [];

    if (rakeAmount > 0) {
      await tx.run("UPDATE Wallet SET balance = balance - ? WHERE id = ?", [rakeAmount, escrowWallet.id]);
      await tx.run("UPDATE Wallet SET balance = balance + ? WHERE id = ?", [rakeAmount, houseWalletId]);
      const rakeEntryId = cuid();
      await tx.run(
        `INSERT INTO LedgerEntry (id, from_wallet_id, to_wallet_id, amount, currency, entry_type, ref_type, ref_id, idempotency_key)
         VALUES (?, ?, ?, ?, ?, 'resolve', 'bet', ?, ?)`,
        [rakeEntryId, escrowWallet.id, houseWalletId, rakeAmount, currency, input.betId, `${naturalKey}:rake`]
      );
      entryIds.push(rakeEntryId);
    }

    // 2. Split distributable equally among winners; remainder to earliest joiner
    const sharePerWinner = Math.floor(distributable / winners.length);
    const remainder = distributable - sharePerWinner * winners.length;

    for (let i = 0; i < winners.length; i++) {
      const winner = winners[i];
      const payout = sharePerWinner + (i === 0 ? remainder : 0);
      if (payout === 0) continue;

      const winnerWallet = await getOrCreateWallet("user", winner.userId, currency);
      await tx.run("UPDATE Wallet SET balance = balance - ? WHERE id = ?", [payout, escrowWallet.id]);
      await tx.run("UPDATE Wallet SET balance = balance + ? WHERE id = ?", [payout, winnerWallet.id]);
      const entryId = cuid();
      // First winner's entry uses the natural key so retries dedupe; others use derived keys
      const entryKey = i === 0 ? naturalKey : `${naturalKey}:winner:${i}`;
      await tx.run(
        `INSERT INTO LedgerEntry (id, from_wallet_id, to_wallet_id, amount, currency, entry_type, ref_type, ref_id, idempotency_key)
         VALUES (?, ?, ?, ?, ?, 'resolve', 'bet', ?, ?)`,
        [entryId, escrowWallet.id, winnerWallet.id, payout, currency, input.betId, entryKey]
      );
      entryIds.push(entryId);
    }

    return entryIds;
  });
}
```

- [ ] **Step 3: Export from `index.ts`**

```ts
export { resolveBet } from "./resolveBet";
```

- [ ] **Step 4: Run tests**

```bash
cd api && npm test -- __tests__/wallet/resolveBet.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add api/lib/wallet/resolveBet.ts api/lib/wallet/index.ts api/__tests__/wallet/resolveBet.test.ts
git commit -m "feat(wallet): add resolveBet operation"
```

---

### Task 10: `refundBet` operation

**Files:**
- Create: `api/lib/wallet/refundBet.ts`
- Modify: `api/lib/wallet/index.ts`
- Create: `api/__tests__/wallet/refundBet.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet.refundBet", () => {
  beforeEach(() => vi.resetModules());

  async function setup() {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();
    await run("CREATE TABLE Bet (id TEXT PRIMARY KEY, stake INTEGER NOT NULL, totalPot INTEGER DEFAULT 0)");
    await run("CREATE TABLE BetSide (id TEXT PRIMARY KEY, betId TEXT, userId TEXT, option TEXT, stake INTEGER, status TEXT DEFAULT 'active', createdAt TEXT DEFAULT (datetime('now')), UNIQUE(betId, userId))");
    await run("INSERT INTO Bet (id, stake) VALUES ('b1', 50)");
    await wallet.grant({ userId: "alice", currency: "CHIPS", amount: 1000, reason: "signup" });
    await wallet.grant({ userId: "bob", currency: "CHIPS", amount: 1000, reason: "signup" });
    return wallet;
  }

  it("refunds all joiners proportional to stake", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "no", stake: 50 });

    await wallet.refundBet({ betId: "b1", reason: "tie" });

    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1000);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(1000);

    const { one } = await import("../../lib/db");
    const escrow = await one<{ balance: number }>(
      "SELECT balance FROM Wallet WHERE owner_type='bet_escrow' AND owner_id='b1'"
    );
    expect(escrow?.balance).toBe(0);
  });

  it("is idempotent", async () => {
    const wallet = await setup();
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.refundBet({ betId: "b1", reason: "lone_joiner" });
    await wallet.refundBet({ betId: "b1", reason: "lone_joiner" });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1000);
  });
});
```

- [ ] **Step 2: Create `api/lib/wallet/refundBet.ts`**

```ts
import { interactiveTransaction, one, all, cuid } from "../db";
import { getOrCreateWallet } from "./internal";
import { Currency } from "./types";

export interface RefundBetInput {
  betId: string;
  reason: string; // 'lone_joiner' | 'mutual_cancel' | 'tie' | 'dispute_void'
  currency?: Currency;
  idempotencyKey?: string;
}

interface BetSideRow {
  userId: string;
  stake: number;
}

export async function refundBet(input: RefundBetInput): Promise<string[] | "duplicate"> {
  const currency = input.currency ?? "CHIPS";
  const naturalKey = input.idempotencyKey ?? `refund:${input.betId}`;

  const existing = await one<{ id: string }>(
    "SELECT id FROM LedgerEntry WHERE idempotency_key = ?",
    [naturalKey]
  );
  if (existing) return "duplicate";

  const sides = await all<BetSideRow>(
    "SELECT userId, stake FROM BetSide WHERE betId = ? ORDER BY createdAt ASC",
    [input.betId]
  );
  if (sides.length === 0) return [];

  const escrowWallet = await getOrCreateWallet("bet_escrow", input.betId, currency);

  return interactiveTransaction(async (tx) => {
    const entryIds: string[] = [];
    for (let i = 0; i < sides.length; i++) {
      const side = sides[i];
      const userWallet = await getOrCreateWallet("user", side.userId, currency);
      await tx.run("UPDATE Wallet SET balance = balance - ? WHERE id = ?", [side.stake, escrowWallet.id]);
      await tx.run("UPDATE Wallet SET balance = balance + ? WHERE id = ?", [side.stake, userWallet.id]);
      const entryId = cuid();
      const entryKey = i === 0 ? naturalKey : `${naturalKey}:${i}`;
      await tx.run(
        `INSERT INTO LedgerEntry (id, from_wallet_id, to_wallet_id, amount, currency, entry_type, ref_type, ref_id, idempotency_key)
         VALUES (?, ?, ?, ?, ?, 'refund', 'bet', ?, ?)`,
        [entryId, escrowWallet.id, userWallet.id, side.stake, currency, input.betId, entryKey]
      );
      entryIds.push(entryId);
    }
    return entryIds;
  });
}
```

- [ ] **Step 3: Export and run tests**

Add `export { refundBet } from "./refundBet";` to `index.ts`. Run:
```bash
cd api && npm test -- __tests__/wallet/refundBet.test.ts
```
Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add api/lib/wallet/refundBet.ts api/lib/wallet/index.ts api/__tests__/wallet/refundBet.test.ts
git commit -m "feat(wallet): add refundBet operation"
```

---

### Task 11: `reverseBetResolution` operation

**Files:**
- Create: `api/lib/wallet/reverseBet.ts`
- Modify: `api/lib/wallet/index.ts`
- Create: `api/__tests__/wallet/reverseBet.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet.reverseBetResolution", () => {
  beforeEach(() => vi.resetModules());

  it("undoes a prior resolve, restoring escrow balance", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { run, one } = await import("../../lib/db");
    await ensureWalletSchema();
    await run("CREATE TABLE Bet (id TEXT PRIMARY KEY, stake INTEGER, totalPot INTEGER DEFAULT 0)");
    await run("CREATE TABLE BetSide (id TEXT PRIMARY KEY, betId TEXT, userId TEXT, option TEXT, stake INTEGER, status TEXT DEFAULT 'active', createdAt TEXT DEFAULT (datetime('now')), UNIQUE(betId, userId))");
    await run("INSERT INTO Bet (id, stake) VALUES ('b1', 50)");
    await wallet.grant({ userId: "alice", currency: "CHIPS", amount: 1000, reason: "signup" });
    await wallet.grant({ userId: "bob", currency: "CHIPS", amount: 1000, reason: "signup" });

    await wallet.joinBet({ betId: "b1", userId: "alice", option: "yes", stake: 50 });
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "no", stake: 50 });
    await wallet.resolveBet({ betId: "b1", winningOption: "yes" });

    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1050);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(950);

    await wallet.reverseBetResolution({ betId: "b1" });

    // Funds back in escrow, users restored to post-join state
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(950);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(950);
    const escrow = await one<{ balance: number }>(
      "SELECT balance FROM Wallet WHERE owner_type='bet_escrow' AND owner_id='b1'"
    );
    expect(escrow?.balance).toBe(100);

    // Ledger has reversing entries (originals not deleted)
    const reverseCount = await one<{ c: number }>(
      "SELECT COUNT(*) as c FROM LedgerEntry WHERE entry_type='reverse'"
    );
    expect(reverseCount?.c).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Create `api/lib/wallet/reverseBet.ts`**

```ts
import { interactiveTransaction, one, all, cuid } from "../db";
import { LedgerEntry } from "./types";

export interface ReverseBetInput {
  betId: string;
  idempotencyKey?: string;
}

export async function reverseBetResolution(input: ReverseBetInput): Promise<string[] | "duplicate"> {
  const naturalKey = input.idempotencyKey ?? `reverse:${input.betId}`;

  const existing = await one<{ id: string }>(
    "SELECT id FROM LedgerEntry WHERE idempotency_key = ?",
    [naturalKey]
  );
  if (existing) return "duplicate";

  // Find all original resolve entries for this bet
  const originals = await all<LedgerEntry>(
    `SELECT * FROM LedgerEntry
     WHERE ref_type = 'bet' AND ref_id = ? AND entry_type = 'resolve'
       AND reverses_entry_id IS NULL
       AND id NOT IN (SELECT reverses_entry_id FROM LedgerEntry WHERE reverses_entry_id IS NOT NULL)
     ORDER BY created_at ASC`,
    [input.betId]
  );
  if (originals.length === 0) {
    throw new Error(`reverseBetResolution: no un-reversed resolve entries for bet ${input.betId}`);
  }

  return interactiveTransaction(async (tx) => {
    const reversingIds: string[] = [];
    for (let i = 0; i < originals.length; i++) {
      const orig = originals[i];
      // Inverse transfer: from = orig.to, to = orig.from
      await tx.run("UPDATE Wallet SET balance = balance - ? WHERE id = ?", [orig.amount, orig.to_wallet_id]);
      await tx.run("UPDATE Wallet SET balance = balance + ? WHERE id = ?", [orig.amount, orig.from_wallet_id]);
      const entryId = cuid();
      const entryKey = i === 0 ? naturalKey : `${naturalKey}:${i}`;
      await tx.run(
        `INSERT INTO LedgerEntry (id, from_wallet_id, to_wallet_id, amount, currency, entry_type, ref_type, ref_id, reverses_entry_id, idempotency_key)
         VALUES (?, ?, ?, ?, ?, 'reverse', 'bet', ?, ?, ?)`,
        [entryId, orig.to_wallet_id, orig.from_wallet_id, orig.amount, orig.currency, input.betId, orig.id, entryKey]
      );
      reversingIds.push(entryId);
    }
    return reversingIds;
  });
}
```

- [ ] **Step 3: Export and run tests**

Add `export { reverseBetResolution } from "./reverseBet";` to `index.ts`. Run:
```bash
cd api && npm test -- __tests__/wallet/reverseBet.test.ts
```
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add api/lib/wallet/reverseBet.ts api/lib/wallet/index.ts api/__tests__/wallet/reverseBet.test.ts
git commit -m "feat(wallet): add reverseBetResolution operation"
```

---

## Phase 4: Reconciliation

### Task 12: `reconcileWallet` and `reconcileAll`

**Files:**
- Create: `api/lib/wallet/reconcile.ts`
- Modify: `api/lib/wallet/index.ts`
- Create: `api/__tests__/wallet/reconcile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet.reconcile", () => {
  beforeEach(() => vi.resetModules());

  it("reports ok when all wallets match ledger", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    await ensureWalletSchema();
    await wallet.grant({ userId: "u1", currency: "CHIPS", amount: 1000, reason: "signup" });

    const report = await wallet.reconcileAll();
    expect(report.ok).toBe(true);
    expect(report.invariantHolds).toBe(true);
    expect(report.drifted).toEqual([]);
  });

  it("detects drift when balance is corrupted", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();
    await wallet.grant({ userId: "u1", currency: "CHIPS", amount: 1000, reason: "signup" });

    // Corrupt the balance
    await run("UPDATE Wallet SET balance = 9999 WHERE owner_type='user' AND owner_id='u1'");

    const report = await wallet.reconcileAll();
    expect(report.ok).toBe(false);
    expect(report.drifted.length).toBe(1);
    expect(report.drifted[0].drift).toBe(9999 - 1000);
  });

  it("detects invariant violation when sum != 0", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();
    await wallet.grant({ userId: "u1", currency: "CHIPS", amount: 1000, reason: "signup" });

    // Inject an orphaned credit (no matching debit)
    await run("UPDATE Wallet SET balance = balance + 500 WHERE owner_type='user' AND owner_id='u1'");

    const report = await wallet.reconcileAll();
    expect(report.invariantHolds).toBe(false);
  });
});
```

- [ ] **Step 2: Create `api/lib/wallet/reconcile.ts`**

```ts
import { all, one } from "../db";

export interface WalletDrift {
  walletId: string;
  ownerType: string;
  ownerId: string;
  currency: string;
  cachedBalance: number;
  ledgerBalance: number;
  drift: number;
}

export interface ReconciliationReport {
  ok: boolean;
  invariantHolds: boolean;
  walletCount: number;
  drifted: WalletDrift[];
  totalBalanceSum: number;
}

export async function reconcileWallet(walletId: string): Promise<WalletDrift | null> {
  const wallet = await one<{
    id: string;
    owner_type: string;
    owner_id: string;
    currency: string;
    balance: number;
  }>("SELECT * FROM Wallet WHERE id = ?", [walletId]);
  if (!wallet) return null;

  const credits = await one<{ s: number | null }>(
    "SELECT COALESCE(SUM(amount), 0) AS s FROM LedgerEntry WHERE to_wallet_id = ?",
    [walletId]
  );
  const debits = await one<{ s: number | null }>(
    "SELECT COALESCE(SUM(amount), 0) AS s FROM LedgerEntry WHERE from_wallet_id = ?",
    [walletId]
  );
  const ledgerBalance = (credits?.s ?? 0) - (debits?.s ?? 0);
  const drift = wallet.balance - ledgerBalance;

  if (drift === 0) return null;
  return {
    walletId: wallet.id,
    ownerType: wallet.owner_type,
    ownerId: wallet.owner_id,
    currency: wallet.currency,
    cachedBalance: wallet.balance,
    ledgerBalance,
    drift,
  };
}

export async function reconcileAll(): Promise<ReconciliationReport> {
  const wallets = await all<{ id: string }>("SELECT id FROM Wallet");
  const drifted: WalletDrift[] = [];
  for (const w of wallets) {
    const d = await reconcileWallet(w.id);
    if (d) drifted.push(d);
  }

  const totalRow = await one<{ s: number | null }>("SELECT COALESCE(SUM(balance), 0) AS s FROM Wallet");
  const totalBalanceSum = totalRow?.s ?? 0;

  return {
    ok: drifted.length === 0 && totalBalanceSum === 0,
    invariantHolds: totalBalanceSum === 0,
    walletCount: wallets.length,
    drifted,
    totalBalanceSum,
  };
}
```

- [ ] **Step 3: Export and run tests**

Add `export { reconcileWallet, reconcileAll, type ReconciliationReport, type WalletDrift } from "./reconcile";` to `index.ts`. Run:
```bash
cd api && npm test -- __tests__/wallet/reconcile.test.ts
```
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add api/lib/wallet/reconcile.ts api/lib/wallet/index.ts api/__tests__/wallet/reconcile.test.ts
git commit -m "feat(wallet): add reconcileWallet and reconcileAll"
```

---

### Task 13: Idempotency request store (API-level helper)

**Files:**
- Create: `api/lib/wallet/idempotency.ts`
- Modify: `api/lib/wallet/index.ts`
- Create: `api/__tests__/wallet/idempotency.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
});
```

- [ ] **Step 2: Create `api/lib/wallet/idempotency.ts`**

```ts
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
```

- [ ] **Step 3: Export and run tests**

Add to `index.ts`:
```ts
export { lookupIdempotencyRequest, storeIdempotencyRequest, hashRequest } from "./idempotency";
```

Run:
```bash
cd api && npm test -- __tests__/wallet/idempotency.test.ts
```
Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add api/lib/wallet/idempotency.ts api/lib/wallet/index.ts api/__tests__/wallet/idempotency.test.ts
git commit -m "feat(wallet): add idempotency lookup/store helpers"
```

---

## Phase 5: End-to-End Lifecycle Test

### Task 14: Full user lifecycle test

**Files:**
- Create: `api/__tests__/wallet/lifecycle.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("wallet lifecycle (end-to-end)", () => {
  beforeEach(() => vi.resetModules());

  it("simulates a real user lifecycle", async () => {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();
    await run("CREATE TABLE Bet (id TEXT PRIMARY KEY, stake INTEGER NOT NULL, totalPot INTEGER DEFAULT 0)");
    await run("CREATE TABLE BetSide (id TEXT PRIMARY KEY, betId TEXT, userId TEXT, option TEXT, stake INTEGER, status TEXT DEFAULT 'active', createdAt TEXT DEFAULT (datetime('now')), UNIQUE(betId, userId))");

    // 1. Sign up
    await wallet.grant({ userId: "alice", currency: "CHIPS", amount: 1000, reason: "signup" });
    await wallet.grant({ userId: "bob", currency: "CHIPS", amount: 1000, reason: "signup" });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1000);

    // 2. Alice creates a bet (bet1) for 50 chips, picks "yes"
    await run("INSERT INTO Bet (id, stake) VALUES ('bet1', 50)");
    await wallet.joinBet({ betId: "bet1", userId: "alice", option: "yes", stake: 50 });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(950);

    // 3. Bob joins with "no"
    await wallet.joinBet({ betId: "bet1", userId: "bob", option: "no", stake: 50 });

    // 4. Bet resolves yes — Alice wins
    await wallet.resolveBet({ betId: "bet1", winningOption: "yes" });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1050);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(950);

    // 5. Another bet, dispute reverses it
    await run("INSERT INTO Bet (id, stake) VALUES ('bet2', 100)");
    await wallet.joinBet({ betId: "bet2", userId: "alice", option: "yes", stake: 100 });
    await wallet.joinBet({ betId: "bet2", userId: "bob", option: "no", stake: 100 });
    await wallet.resolveBet({ betId: "bet2", winningOption: "yes" });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1150);

    await wallet.reverseBetResolution({ betId: "bet2" });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(950);

    // Re-resolve the other way
    await wallet.resolveBet({ betId: "bet2", winningOption: "no", idempotencyKey: "bet2:rev1" });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(950);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(1050); // 850 + 200

    // 6. Lone-joiner refund scenario
    await run("INSERT INTO Bet (id, stake) VALUES ('bet3', 25)");
    await wallet.joinBet({ betId: "bet3", userId: "alice", option: "yes", stake: 25 });
    await wallet.refundBet({ betId: "bet3", reason: "lone_joiner" });
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(950);

    // 7. Reconciliation passes
    const report = await wallet.reconcileAll();
    expect(report.ok).toBe(true);
    expect(report.invariantHolds).toBe(true);
  });
});
```

- [ ] **Step 2: Run**

```bash
cd api && npm test -- __tests__/wallet/lifecycle.test.ts
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add api/__tests__/wallet/lifecycle.test.ts
git commit -m "test(wallet): add end-to-end lifecycle test"
```

---

## Phase 6: API Route Integration

> **For every task in this phase:** Before modifying a route, **read the existing route file** to understand its current pattern (auth, request parsing, response shape). Match the existing patterns. Do not introduce new conventions.

### Task 15: `mobile-token` route — call `wallet.grant` for new users

**Files:**
- Modify: `api/app/api/auth/mobile-token/route.ts`

- [ ] **Step 1: Read the existing route**

```bash
cat api/app/api/auth/mobile-token/route.ts
```

Identify the spot where a new user is created (look for `INSERT INTO User`).

- [ ] **Step 2: Add a `wallet.grant` call after user creation**

After the `INSERT INTO User`, before returning the JWT, add:

```ts
import { grant } from "@/lib/wallet";
// ...
await grant({
  userId: newUserId,
  currency: "CHIPS",
  amount: 1000,
  reason: "signup",
});
```

The natural idempotency key (`grant:signup:<userId>`) will prevent double-granting on retries.

- [ ] **Step 3: Remove `chips: 1000` from the User INSERT**

The `User.chips` column is being dropped. Remove it from the INSERT statement.

- [ ] **Step 4: Manual smoke test**

```bash
cd api && npm run dev
# In another terminal:
curl -X POST http://localhost:3000/api/auth/mobile-token \
  -H "Content-Type: application/json" \
  -d '{"email": "test-$(date +%s)@example.com", "name": "Test User"}'
```

Then verify the new user has a CHIPS wallet with balance 1000:
```bash
sqlite3 api/prisma/dev.db "SELECT * FROM Wallet WHERE owner_type='user' ORDER BY created_at DESC LIMIT 1"
```

- [ ] **Step 5: Commit**

```bash
git add api/app/api/auth/mobile-token/route.ts
git commit -m "feat(auth): grant 1000 CHIPS via wallet on signup"
```

---

### Task 16: Bet creation route — call `wallet.joinBet` for proposer

**Files:**
- Modify: `api/app/api/bets/route.ts`

- [ ] **Step 1: Read the existing route**

```bash
cat api/app/api/bets/route.ts
```

Identify where a new bet is created. Note the current chip-deduction logic if any.

- [ ] **Step 2: After `INSERT INTO Bet`, call `wallet.joinBet` for the proposer**

The proposer must specify their side and stake at creation (per spec — bet creation = bet creation + stake in one action). The request body should include `proposerOption` (which side they're picking).

```ts
import { joinBet } from "@/lib/wallet";
// ...
const idempotencyKey = req.headers.get("idempotency-key") ?? undefined;
await joinBet({
  betId: newBetId,
  userId: proposerId,
  option: body.proposerOption,
  stake: body.stake,
  idempotencyKey: idempotencyKey ? `${idempotencyKey}:proposer` : undefined,
});
```

- [ ] **Step 3: Remove any old `User.chips` updates from this route**

- [ ] **Step 4: Validate the request requires `proposerOption`**

If `body.proposerOption` is missing, return `400` with a clear error. The schema already requires it implicitly because every bet must have a side; making it explicit at the API surface prevents bugs.

- [ ] **Step 5: Commit**

```bash
git add api/app/api/bets/route.ts
git commit -m "feat(bets): proposer stakes via wallet at bet creation"
```

---

### Task 17: Bet sides (join) route — call `wallet.joinBet`

**Files:**
- Modify: `api/app/api/bets/[id]/sides/route.ts`

- [ ] **Step 1: Read existing route**

- [ ] **Step 2: Replace the chip-handling logic with `wallet.joinBet`**

```ts
import { joinBet } from "@/lib/wallet";
// ...
const idempotencyKey = req.headers.get("idempotency-key") ?? undefined;
const result = await joinBet({
  betId: params.id,
  userId: currentUserId,
  option: body.option,
  stake: bet.stake,
  idempotencyKey,
});
```

Handle the `"duplicate"` return value: if `result === "duplicate"`, return the existing `BetSide` (look it up by `(betId, userId)`).

- [ ] **Step 3: Remove old `User.chips` and direct `Transaction` writes**

- [ ] **Step 4: Commit**

```bash
git add api/app/api/bets/[id]/sides/route.ts
git commit -m "feat(bets): join via wallet.joinBet"
```

---

### Task 18: Bet resolve route — call `wallet.resolveBet` or `wallet.refundBet`

**Files:**
- Modify: `api/app/api/bets/[id]/resolve/route.ts`

- [ ] **Step 1: Read existing route**

- [ ] **Step 2: Replace resolution logic**

```ts
import { resolveBet, refundBet } from "@/lib/wallet";
// ...
// Determine whether this is a resolve, a refund (push/lone joiner), or a void
const sides = await all<{ option: string }>(
  "SELECT DISTINCT option FROM BetSide WHERE betId = ?",
  [params.id]
);
const sidesCovered = sides.map((s) => s.option);

if (sidesCovered.length < 2) {
  // Lone-joiner auto-void
  await refundBet({ betId: params.id, reason: "lone_joiner" });
} else if (!sidesCovered.includes(body.winningOption)) {
  // Push: nobody picked the winning option
  await refundBet({ betId: params.id, reason: "tie" });
} else {
  await resolveBet({ betId: params.id, winningOption: body.winningOption });
}
```

- [ ] **Step 3: Remove old `User.chips` updates**

- [ ] **Step 4: Commit**

```bash
git add api/app/api/bets/[id]/resolve/route.ts
git commit -m "feat(bets): resolve via wallet operations"
```

---

### Task 19: User profile/stats routes — read balance from wallet

**Files:**
- Modify: `api/app/api/users/me/route.ts`
- Modify: `api/app/api/users/[id]/stats/route.ts`
- Modify: `api/app/api/circles/[id]/leaderboard/route.ts`

For each file:

- [ ] **Step 1: Read the existing file**

- [ ] **Step 2: Replace `User.chips` reads with `wallet.getBalance(userId, 'CHIPS')`**

```ts
import { getBalance } from "@/lib/wallet";
// ...
const chips = await getBalance(userId, "CHIPS");
// Use `chips` in place of the old user.chips field
```

- [ ] **Step 3: Remove any references to the dropped `User.chips` column from SELECTs**

- [ ] **Step 4: Commit**

```bash
git add api/app/api/users/me/route.ts api/app/api/users/[id]/stats/route.ts api/app/api/circles/[id]/leaderboard/route.ts
git commit -m "feat(api): read chip balances from wallet module"
```

---

### Task 20: Audit for any remaining `User.chips` / `CircleMember.chips` / `Transaction` references

**Files:**
- Various

- [ ] **Step 1: Search the codebase**

```bash
cd api && grep -rn "User.chips\|user\.chips\|CircleMember.chips\|chips:\s*[0-9]" app/ lib/ --include="*.ts"
grep -rn "Transaction" app/ lib/ --include="*.ts"
```

- [ ] **Step 2: For each match, decide:**
  - If it's a *write* to `User.chips` or `Transaction` → replace with the appropriate `wallet.*` call.
  - If it's a *read* of `User.chips` → replace with `wallet.getBalance(userId)`.
  - If it's a `Transaction` table query → drop or migrate to `LedgerEntry` query.

- [ ] **Step 3: Re-run the search to confirm nothing remains**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove all direct User.chips / Transaction references"
```

---

## Phase 7: Migration & Cutover

### Task 21: Migration script

**Files:**
- Create: `api/scripts/migrate-wallet-ledger.ts`

- [ ] **Step 1: Create the script**

```ts
/* eslint-disable no-console */
import { run, all, one } from "../lib/db";
import { ensureWalletSchema } from "../lib/wallet/migrate";
import { grant, reconcileAll } from "../lib/wallet";

async function main() {
  console.log("→ Ensuring wallet schema...");
  await ensureWalletSchema();

  console.log("→ Wiping in-progress bet state...");
  // Delete BetSide rows for any bet that's not in a terminal state
  const openBets = await all<{ id: string }>(
    "SELECT id FROM Bet WHERE resolution = 'pending'"
  );
  for (const b of openBets) {
    await run("DELETE FROM BetSide WHERE betId = ?", [b.id]);
    await run("DELETE FROM Bet WHERE id = ?", [b.id]);
  }
  console.log(`  Removed ${openBets.length} open bets.`);

  console.log("→ Re-granting all existing users 1000 chips...");
  const users = await all<{ id: string }>("SELECT id FROM User");
  for (const u of users) {
    await grant({
      userId: u.id,
      currency: "CHIPS",
      amount: 1000,
      reason: "migration_initial_grant",
    });
  }
  console.log(`  Granted to ${users.length} users.`);

  console.log("→ Dropping legacy columns and tables...");
  // SQLite doesn't support DROP COLUMN cleanly in older versions, but modern
  // SQLite (3.35+) and libSQL do. Use ALTER TABLE DROP COLUMN.
  try {
    await run("ALTER TABLE User DROP COLUMN chips");
  } catch (e) {
    console.warn("  Could not drop User.chips (may already be gone):", e);
  }
  try {
    await run("ALTER TABLE CircleMember DROP COLUMN chips");
  } catch (e) {
    console.warn("  Could not drop CircleMember.chips:", e);
  }
  try {
    await run("DROP TABLE IF EXISTS `Transaction`");
  } catch (e) {
    console.warn("  Could not drop Transaction:", e);
  }

  console.log("→ Running reconciliation...");
  const report = await reconcileAll();
  if (!report.ok) {
    console.error("✗ Reconciliation FAILED:", report);
    process.exit(1);
  }
  console.log(`✓ Migration complete. ${report.walletCount} wallets, invariant holds.`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Add a script entry to `api/package.json`**

```json
"migrate:wallet": "tsx scripts/migrate-wallet-ledger.ts"
```

Install `tsx` if not already present:
```bash
cd api && npm install -D tsx
```

- [ ] **Step 3: Test the script against a backup of dev.db**

```bash
cp api/prisma/dev.db api/prisma/dev.db.bak
cd api && npm run migrate:wallet
```

Expected output: "Migration complete. N wallets, invariant holds."

If anything fails: `cp api/prisma/dev.db.bak api/prisma/dev.db` to restore.

- [ ] **Step 4: Commit**

```bash
git add api/scripts/migrate-wallet-ledger.ts api/package.json api/package-lock.json
git commit -m "feat: add wallet/ledger migration script"
```

---

### Task 22: Update `prisma/schema.prisma` (reference only)

**Files:**
- Modify: `api/prisma/schema.prisma`

The schema file is reference-only (Prisma client isn't used) but should reflect reality.

- [ ] **Step 1: Remove `chips` from `User` model**

- [ ] **Step 2: Remove `chips` from `CircleMember` model**

- [ ] **Step 3: Remove the `Transaction` model**

- [ ] **Step 4: Remove the `transactions` relation from `User` and `Bet`**

- [ ] **Step 5: Add Wallet, LedgerEntry, IdempotencyRequest models** for documentation purposes (these will not be used by Prisma but document the new shape).

- [ ] **Step 6: Commit**

```bash
git add api/prisma/schema.prisma
git commit -m "docs(schema): update Prisma schema to reflect wallet/ledger"
```

---

### Task 23: Reconciliation cron route

**Files:**
- Create: `api/app/api/cron/reconcile/route.ts`
- Modify or create: `vercel.json` (at repo root or in `api/`)

- [ ] **Step 1: Create the route**

`api/app/api/cron/reconcile/route.ts`:
```ts
import { NextResponse } from "next/server";
import { reconcileAll } from "@/lib/wallet";

export async function GET(req: Request) {
  // Vercel cron sets this header on cron-triggered requests
  const cronSecret = req.headers.get("authorization");
  if (process.env.CRON_SECRET && cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const report = await reconcileAll();

  if (!report.ok) {
    // Fire Discord webhook alert
    const webhook = process.env.DISCORD_ALERT_WEBHOOK;
    if (webhook) {
      const message = report.invariantHolds
        ? `⚠️ Wallet drift detected on ${report.drifted.length} wallets`
        : `🚨 CRITICAL: total wallet sum is ${report.totalBalanceSum} (should be 0)`;
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message + "\n```" + JSON.stringify(report, null, 2) + "```" }),
      }).catch(() => {});
    }
  }

  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}
```

- [ ] **Step 2: Add cron schedule to `vercel.json`**

If `vercel.json` doesn't exist at the repo root or in `api/`, create one in `api/`:
```json
{
  "crons": [
    {
      "path": "/api/cron/reconcile",
      "schedule": "0 7 * * *"
    }
  ]
}
```

(7am UTC daily.)

- [ ] **Step 3: Add `CRON_SECRET` and `DISCORD_ALERT_WEBHOOK` to `.env`**

Document required env vars in `api/.env.example` if it exists (or create one):
```
CRON_SECRET=<random-string>
DISCORD_ALERT_WEBHOOK=<discord-webhook-url>
```

- [ ] **Step 4: Commit**

```bash
git add api/app/api/cron/reconcile/route.ts api/vercel.json api/.env.example
git commit -m "feat(cron): nightly wallet reconciliation with Discord alerts"
```

---

### Task 24: Final test run + smoke test in dev

- [ ] **Step 1: Run the full test suite**

```bash
cd api && npm test
```

Expected: all tests pass.

- [ ] **Step 2: Restore the test database backup** (if you used one)

```bash
cp api/prisma/dev.db.bak api/prisma/dev.db
```

- [ ] **Step 3: Run the migration script for real**

```bash
cd api && npm run migrate:wallet
```

- [ ] **Step 4: Start the dev server**

```bash
cd api && npm run dev
```

- [ ] **Step 5: Manual end-to-end smoke test from mobile or curl:**
  1. Sign up a new user → check `Wallet` shows balance 1000
  2. Create a bet, pick a side → check the user balance decremented and the bet escrow has the stake
  3. Have a second user join the other side → check both wallets and escrow
  4. Resolve the bet → check the winner's balance updated and escrow is 0
  5. Hit `/api/cron/reconcile` (with the bearer secret) → expect `{ "ok": true, ... }`

- [ ] **Step 6: Commit any final fixes**

If any of the smoke tests reveal bugs, fix them, run the relevant unit tests again, and commit per task. Do not skip the test-first cycle.

---

## Out-of-Scope (deferred to separate plans)

These items are mentioned in the spec but require their own design and plan:

1. **Bet cancellation flow** (solo + unanimous-consent void requests). The wallet primitive (`refundBet({ reason: 'mutual_cancel' })`) is built and tested by this plan, but the API routes, state machine, notifications, and approval UI are out of scope. They need their own design conversation about UX before implementation.

2. **Mobile UI: uneven-side warning and "needs takers" badge.** The spec calls these out as required behavior at the join screen, but they live in the `mobile/` Expo app and are unrelated to the wallet/ledger schema. Track separately.

3. **Property-based / fuzz tests for resolution math.** Useful but not blocking. The unit tests in Task 9 cover the main edge cases (1v1, 1v2 underdog, 1v2 favorite, idempotency). A follow-up plan can add fast-check or similar.

4. **`User.chips` references in mobile app code.** This plan only touches `api/`. The Expo mobile app may have local references to `user.chips` that need to be updated to read from a new API field (e.g., `user.balance` or a new `/api/users/me/balance` endpoint). Audit the mobile app in a separate plan.

5. **API-level idempotency middleware wiring.** The helpers (`lookupIdempotencyRequest`, `storeIdempotencyRequest`, `hashRequest`) are built and tested in Task 13, but they are *not* yet wrapping the chip-touching API routes with the full lookup-replay-store cycle. Tasks 16–18 pass through `Idempotency-Key` headers to the wallet operations (which use the natural-key path), but the response replay layer is deferred to a follow-up plan. The natural keys provide sufficient protection against double-charging in the meantime.

---

## Self-Review Checklist

Before declaring this plan complete, the implementer should verify:

- [ ] Every spec section has at least one corresponding task
- [ ] All five entry types (`grant`, `join`, `resolve`, `refund`, `reverse`) have an operation, tests, and an integration point in an API route
- [ ] Reconciliation is exercised by tests and runs on a schedule
- [ ] No file in `api/` outside of `api/lib/wallet/` writes directly to `Wallet` or `LedgerEntry`
- [ ] No file outside of `api/lib/wallet/` reads `User.chips` (the column doesn't exist anymore — TypeScript will catch this if there's a User type, but grep to be sure)
- [ ] The migration script produces an `ok: true` reconciliation report at the end
- [ ] Smoke test covers signup → bet creation → join → resolve → reconcile

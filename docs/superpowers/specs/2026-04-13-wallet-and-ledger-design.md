# Tilt Wallet & Ledger Design

**Date:** 2026-04-13
**Status:** Approved (pending spec review)
**Scope:** Replace ad-hoc chip storage with a real-money-ready double-entry wallet and ledger system.

## Goal

Today, Tilt stores user chip balances as a single integer column on the `User` table and logs activity to a flat `Transaction` table. This works for a virtual-currency demo but cannot survive the eventual transition to real money (sweepstakes-model coins purchasable for cash). This design replaces the current system with a double-entry ledger and per-currency wallets that:

1. Keep the app virtual-currency-only today (no real money, no payment processor, no licensing exposure).
2. Are structurally ready for a second purchasable-and-redeemable currency to be turned on later with zero schema migration.
3. Are mathematically auditable — chips cannot silently appear or disappear without setting off an alarm.
4. Centralize all money-handling code in a single module that is the only thing in the codebase allowed to read or write balances.

Out of scope: payment processing, KYC, sweepstakes legal/compliance work, the SQLite→Postgres migration (deferred to separate `/ultraplan` workstream), and any UI work beyond the join-time warnings called out in this spec.

## Design Decisions (from brainstorming)

| # | Decision | Rationale |
|---|---|---|
| 1 | **Chips are global to a user**, not per-circle. | Confirmed by user — circles are a social/organizational feature, not separate sandboxes. `CircleMember.chips` is removed. |
| 2 | **Dual-currency schema from day 1** (`CHIPS` + `COINS`). | One extra column today saves a painful migration later when sweepstakes launches. App code stays single-currency until COINS flips on. |
| 3 | **Double-entry ledger** with per-bet escrow wallets. | Auditable, regulator-friendly, makes solvency provable. Real-money systems require this shape; bolting it on later is a rewrite. |
| 4 | **System wallets**: `SYSTEM_MINT` (source of free grants, balance goes negative) + `SYSTEM_HOUSE` (rake destination, `rake_bps = 0` for chips today). | Preserves the "sum of all wallets = 0" invariant. Enables future rake without schema change. |
| 5 | **Bet lifecycle edge cases:** | |
| 5a | Lone joiner at resolve → auto-void, refund. | |
| 5b | Cancellation: solo before 2nd joiner, **unanimous consent** after. | Prevents foul play (cancelling a bet you're about to lose) while still allowing typo fixes and broken-bet escapes. |
| 5c | Tie/push → refund all stakes proportionally. | |
| 5d | Dispute reversal → reversing entries (never delete history). | Real-money standard. |
| 6 | **Stake model: fixed equal stake per bet.** | Each joiner puts in `Bet.stake`. Open lobby allows multiple joiners per side; pot splits among the winning side proportionally to stake. |
| 7 | **Idempotency: natural keys + client idempotency keys.** | Belt and suspenders. Natural keys catch app bugs at the DB level; client keys catch network/retry duplication at the API boundary. |
| 8 | **Balance: cached column on `Wallet`** + nightly reconciliation. | Fast reads, drift caught by reconciliation. Single wallet module owns all writes. |
| 9 | **Bet creation = bet creation + side selection + stake** in one action. | Per user: "when someone makes a bet they should set the terms and that should be what they are putting in." No bets exist without the proposer's chips already in escrow. |
| 10 | **Open-lobby bets** with multiple joiners per side. | Per user — supports both 1v1 friend bets and multi-friend pile-ons. |
| 11 | **Migration: nuke and re-grant.** | All current chip data is test data; can be wiped. Single deploy, no backfill. |

## Architecture

### Module Boundary

A new module at `api/lib/wallet.ts` is the **only** place in the codebase allowed to read or write wallet balances or insert ledger entries. Every API route that touches money calls a function on this module.

Public functions (initial set):

- `getBalance(userId, currency) → number`
- `getWallet(ownerType, ownerId, currency) → Wallet`
- `grant({ userId, currency, amount, reason, idempotencyKey })` — Mint → user
- `joinBet({ betId, userId, side, stake, idempotencyKey })` — user → bet escrow, also creates `BetSide` row
- `resolveBet({ betId, winningOption, idempotencyKey })` — bet escrow → winner(s), with optional rake siphon to House
- `refundBet({ betId, reason, idempotencyKey })` — bet escrow → all joiners (proportional)
- `reverseBetResolution({ betId, idempotencyKey })` — emits reversing entries that undo a prior resolution
- `reconcileWallet(walletId) → { ok, drift }` — re-sums ledger and compares to cached balance
- `reconcileAll() → ReconciliationReport` — batch version, called by nightly job

Lint rule / convention: no other file in `api/` may import `better-sqlite3` for the purpose of writing to `Wallet` or `LedgerEntry`. Code review enforces.

### Schema (new tables)

```sql
CREATE TABLE Wallet (
  id            TEXT PRIMARY KEY,
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('user', 'bet_escrow', 'system')),
  owner_id      TEXT NOT NULL,         -- user_id, bet_id, or system wallet name
  currency      TEXT NOT NULL CHECK (currency IN ('CHIPS', 'COINS')),
  balance       INTEGER NOT NULL DEFAULT 0,  -- minor units; cached, ledger is source of truth
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (owner_type, owner_id, currency)
);
CREATE INDEX idx_wallet_owner ON Wallet (owner_type, owner_id);

CREATE TABLE LedgerEntry (
  id                 TEXT PRIMARY KEY,
  from_wallet_id     TEXT NOT NULL REFERENCES Wallet(id),
  to_wallet_id       TEXT NOT NULL REFERENCES Wallet(id),
  amount             INTEGER NOT NULL CHECK (amount > 0),  -- always positive
  currency           TEXT NOT NULL CHECK (currency IN ('CHIPS', 'COINS')),
  entry_type         TEXT NOT NULL CHECK (entry_type IN ('grant', 'join', 'resolve', 'refund', 'reverse')),
  ref_type           TEXT,             -- 'bet' | 'bet_side' | 'grant' | null
  ref_id             TEXT,
  reverses_entry_id  TEXT REFERENCES LedgerEntry(id),  -- only set for type='reverse'
  idempotency_key    TEXT UNIQUE,      -- nullable; set for API-driven entries
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ledger_from ON LedgerEntry (from_wallet_id);
CREATE INDEX idx_ledger_to ON LedgerEntry (to_wallet_id);
CREATE INDEX idx_ledger_ref ON LedgerEntry (ref_type, ref_id);
CREATE INDEX idx_ledger_type ON LedgerEntry (entry_type);

CREATE TABLE IdempotencyRequest (
  key            TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  request_hash   TEXT NOT NULL,        -- hash of method+path+body; mismatch = error
  response_json  TEXT NOT NULL,
  status_code    INTEGER NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_idempotency_created ON IdempotencyRequest (created_at);  -- TTL cleanup
```

### Schema (modified existing tables)

- `User.chips` — **dropped**.
- `CircleMember.chips` — **dropped**.
- `Transaction` table — **dropped**. `LedgerEntry` is its replacement.
- `Bet`, `BetSide`, `Circle`, `CircleMember`, etc. — unchanged.

### System Wallets

Created once during migration:

| Owner | Currency | Purpose |
|---|---|---|
| `system / SYSTEM_MINT` | `CHIPS` | Source of all free chip grants. Balance goes negative; `-balance` = chips in circulation. |
| `system / SYSTEM_HOUSE` | `CHIPS` | Destination of rake. `rake_bps = 0` today (configurable). |
| `system / SYSTEM_MINT` | `COINS` | Dormant until sweepstakes launches. |
| `system / SYSTEM_HOUSE` | `COINS` | Dormant until sweepstakes launches. |

### Per-Bet Escrow Wallets

Created lazily on first call to `joinBet` for a given bet: `bet_escrow / <bet_id> / <currency>`. The escrow wallet's currency must match the bet's currency. After bet resolution or void, the escrow's balance is zero (all chips have been moved out).

## Money Movement Taxonomy

Every chip movement in Tilt is exactly one of these five entry types. No exceptions.

### 1. `grant`
- **From:** `SYSTEM_MINT`
- **To:** user wallet
- **When:** New user signup (1000-chip welcome grant), promotional grants, manual admin grants.
- **Idempotency:** `grant:signup:<user_id>` natural key for signup grants.

### 2. `join`
- **From:** user wallet
- **To:** bet escrow wallet
- **When:** User joins a bet (including the proposer at bet creation).
- **Idempotency:** `(bet_id, user_id)` is unique on `BetSide` (natural key) + client-provided header.

### 3. `resolve`
- **From:** bet escrow wallet
- **To:** winner(s) wallets, plus optional siphon to `SYSTEM_HOUSE` for rake.
- **When:** Bet is resolved with a winning option that has at least one joiner.
- **Math:** Pot = `bet.stake × number_of_joiners` (since stakes are fixed and equal per bet). If `rake_bps > 0`, first emit `escrow → House` for `floor(pot * rake_bps / 10000)`. Then split the remaining pot **equally** among winning-side joiners (stakes are equal, so equal split is correct). Use integer division; remainder chips go to the winner with the earliest `BetSide.createdAt` (deterministic tiebreak — never lose chips to rounding).
- **Idempotency:** `(bet_id, "resolve")` natural key + client-provided header.

### 4. `refund`
- **From:** bet escrow wallet
- **To:** each joiner's wallet
- **When:** Lone-joiner auto-void, mutual cancellation, tie/push, or any other void path.
- **Math:** Each joiner gets back exactly what they put in. Sum of refund entries = escrow balance before refund.
- **Idempotency:** `(bet_id, "refund")` natural key + client-provided header.

### 5. `reverse`
- **From / To:** Inverse of an existing entry's from/to (i.e., from is the original `to_wallet_id`, to is the original `from_wallet_id`).
- **Amount:** Same as the original.
- **`reverses_entry_id`:** Set to the original entry's ID.
- **When:** Dispute overturns a prior resolution. The reverse entries undo the original resolve entries; then a fresh `resolve` (or `refund`) fires for the new outcome.
- **Idempotency:** `(original_entry_id, "reverse")` natural key.

## Bet Lifecycle

### States

```
                                    ┌─────────────────────────────┐
                                    │                             ▼
  [creation]                        │                       ┌─────────┐
       │                            │                       │ Voided  │
       ▼                            │                       └─────────┘
  ┌─────────┐    resolveAt    ┌─────────┐    resolve    ┌─────────┐
  │  Open   │────────────────▶│ Locked  │──────────────▶│Resolved │
  └─────────┘                  └─────────┘                └─────────┘
       │                            │                          │
       │ cancel (solo or unanimous) │                          │ dispute opened
       ▼                            ▼                          ▼
  ┌─────────┐                  ┌─────────┐                ┌─────────┐
  │ Voided  │                  │ Voided  │                │Disputed │
  └─────────┘                  └─────────┘                └─────────┘
                                                               │
                                                               ▼
                                                    Resolved (overturned)
                                                              or
                                                          Voided
```

### Transitions and money moves

| From → To | Trigger | Money moves |
|---|---|---|
| `(none) → Open` | Proposer creates bet | `join` entry: proposer → escrow |
| `Open → Open` | Another user joins | `join` entry: joiner → escrow |
| `Open → Locked` | `resolveAt` time reached | None |
| `Locked → Resolved` | Resolution submitted with winning option that has joiners | `resolve` entries: escrow → winners (+ optional rake) |
| `Locked → Voided` | Lone-joiner auto-void at resolve time | `refund` entries: escrow → each joiner |
| `Open → Voided` | Solo cancel (only proposer joined) | `refund` entries: escrow → proposer |
| `Open → Voided` | Unanimous-consent cancel (after 2nd joiner) | `refund` entries: escrow → each joiner |
| `Locked → Voided` | Tie/push: winning option has no joiners | `refund` entries: escrow → all joiners |
| `Resolved → Disputed` | Dispute opened | None — money is "frozen" pending dispute outcome |
| `Disputed → Resolved` | Dispute confirms original outcome | None |
| `Disputed → Resolved` | Dispute overturns to a new outcome | `reverse` entries (undo old resolve) + new `resolve` entries for new outcome |
| `Disputed → Voided` | Dispute overturns to "no winner" | `reverse` entries (undo old resolve) + `refund` entries |

### Cancellation rules (detail)

- **Solo cancel.** Allowed only when `BetSide` count == 1 (proposer is the only side filled). Triggered by proposer from app. Immediate void.
- **Unanimous-consent cancel.** Once a 2nd `BetSide` row exists, solo cancel is disabled. Any joined user can open a "void request." All joined users get a notification. Bet only voids when 100% of joined users have approved. Any single decline kills the request. UI surfaces pending requests on the bet detail page.

### Open-lobby semantics

A bet has fixed `stake`. Joiners pick a side (`option`) and put in exactly `stake` chips. Multiple joiners per side allowed (up to bet lock). At resolution:

- Pot = `stake × number_of_joiners`
- Winning side = users who picked the resolved option
- Each winner gets back `stake × (total_joiners / winning_joiners)` chips minus rake share
- If `winning_joiners > losing_joiners`, winners get back *less* than they put in (because they were on the heavily-favored side). This is mathematically correct pari-mutuel-style behavior.

### UI requirements (must be enforced when join screen is built)

1. **Join-time uneven-side warning.** When a user is about to join a side that already has more chips than the other side, the join modal shows: *"Heads up — your side already has more chips than the other side. If you win, you'll get back less than you put in."* with the actual projected payout displayed.
2. **"Needs takers" badge.** When viewing a bet with uneven sides, the lighter side gets a visual highlight indicating it needs takers, gently steering new joiners toward balancing.

## Safety Nets

### 1. Single-chokepoint module
The `wallet.ts` module is the only place in the codebase that reads or writes balances. Convention enforced via code review. A future enhancement could add a lint rule that flags any direct `Wallet` or `LedgerEntry` mutation outside this module.

### 2. Nightly reconciliation job
A scheduled job runs `reconcileAll()` once per 24 hours (mechanism TBD — Vercel cron, GitHub Actions cron, or external scheduler — left to the implementation plan):

- For every `Wallet`, compute `expected_balance = SUM(amount where to=W) - SUM(amount where from=W)` from `LedgerEntry`.
- Compare to `Wallet.balance`. If they differ by even 1 unit, mark the wallet as `flagged`, freeze it (block all writes), and emit an alert (Discord webhook).
- Run the system invariant check: `SUM(Wallet.balance) == 0` across all wallets, all currencies. If non-zero, emit a CRITICAL alert and halt all chip-moving API routes until investigated.

### 3. Total-equals-zero invariant
Because every ledger entry is a transfer between two wallets (no creation, no destruction), the sum of all wallet balances must always be exactly zero. The Mint wallet is negative by exactly the amount of chips in circulation; user wallets and escrows are positive; House is positive by accumulated rake. They sum to zero. Any drift from zero indicates a bug — the only correct response is to halt and investigate.

## Idempotency

Two layers, both required:

### Natural keys
Built into the schema and enforced by the database:
- `BetSide (bet_id, user_id)` — already unique. Prevents double-joining.
- `LedgerEntry.idempotency_key` — UNIQUE constraint. Enforced for all entries that have one.
- Application-level natural keys for entries:
  - Signup grant: `grant:signup:<user_id>`
  - Bet join: `join:<bet_id>:<user_id>`
  - Bet resolve: `resolve:<bet_id>`
  - Bet refund: `refund:<bet_id>`
  - Reverse: `reverse:<original_entry_id>`

### Client-provided idempotency keys
Mobile app generates a UUID per user-initiated chip-moving action and sends it as `Idempotency-Key` header. API routes:

1. Look up the key in `IdempotencyRequest`.
2. If found and `request_hash` matches → replay the stored response with stored status code. Skip processing.
3. If found and `request_hash` differs → return 422 (key reuse with different request).
4. If not found → process normally, then store the request hash + response under the key.

TTL: rows older than 24 hours are eligible for cleanup by a background job.

## Migration Plan

Single deploy, no backfill (all current chip state is test data).

### Step 1: Schema migration
- Create `Wallet`, `LedgerEntry`, `IdempotencyRequest` tables.
- Drop `User.chips` column.
- Drop `CircleMember.chips` column.
- Drop `Transaction` table.
- Insert system wallets: `SYSTEM_MINT` (CHIPS + COINS) and `SYSTEM_HOUSE` (CHIPS + COINS), all balance 0.

### Step 2: Wipe in-progress bet state
- For every bet in `Open` status: delete `BetSide` rows, delete the bet.
- For every bet in `Resolved`/`Voided`/`Disputed` status: leave the row in place for historical display, but no chips associated (the new wallet system has nothing to reconcile against).

### Step 3: Re-grant existing users
- For every user in `User`: call `wallet.grant({ userId, currency: 'CHIPS', amount: 1000, reason: 'migration_initial_grant', idempotencyKey: 'grant:migration:<user_id>' })`.
- Verify invariant: `SUM(Wallet.balance) == 0`.

### Step 4: Cutover (same deploy)
- All API routes that touched `User.chips`, `CircleMember.chips`, or `Transaction` are updated to call `wallet.ts` functions.

### Rollback
- Revert the deploy. The migration script is destructive (drops columns), so a true rollback requires restoring from a pre-migration backup. Acceptable risk because all chip data is currently test data.

## Testing Strategy

### Unit tests
For every public function in `wallet.ts`, with a fresh in-memory SQLite database per test:
- Operation produces correct ledger entries
- Operation produces correct balance changes
- Operation respects idempotency (calling twice with same key → no double effect, second call returns first result)
- Invariant holds after operation

### Property-based tests
Generate random bets with random side counts, random stakes, random winners. For each:
- Resolve the bet
- Assert: total chips in (joins) == total chips out (resolves + rake)
- Assert: invariant holds across all wallets
- Assert: no winner gets a fractional chip (integer math only)
- Assert: deterministic tiebreak for remainder chips

### End-to-end lifecycle test
A single test that simulates a real user lifecycle, run on every CI build:
1. New user signs up → assert balance = 1000
2. Creates a bet for 50 chips → assert balance = 950, escrow = 50
3. Friend joins opposing side → assert friend balance = 950, escrow = 100
4. Bet resolves in user's favor → assert balance = 1050, escrow = 0
5. Creates a bet, friend joins, dispute is opened → assert money frozen
6. Dispute overturns → assert reversing entries exist, final balance correct
7. Creates a bet alone, resolveAt passes → assert auto-void, refund, balance restored
8. Run reconciliation → assert no drift, invariant holds

### Reconciliation job tests
Test the reconciliation job itself with deliberately corrupted state:
- Manually set a `Wallet.balance` to a wrong value → assert reconciliation flags and freezes the wallet
- Manually insert a one-sided ledger entry → assert invariant check fails and CRITICAL alert is emitted

## Out of Scope

- **SQLite → Postgres migration** (deferred to `/ultraplan` workstream).
- **Vercel serverless / SQLite write contention** (same).
- **Real money / sweepstakes implementation.** This design only ensures the schema is *ready*; turning on COINS as a purchasable currency requires a separate spec covering KYC, payment processor integration, payout flows, legal review, and sweepstakes rules.
- **Rake rate tuning.** `rake_bps` is configurable but not exposed in the UI. Default 0 for chips.
- **UI work** beyond the join-time warning and "needs takers" badge enforcement.
- **Migration of historical `Transaction` rows.** All current chip data is test data; no backfill needed.

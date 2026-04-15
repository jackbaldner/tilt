# Bet Modes, Side-Locking, and Custom Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distinguish 1:1 from group bets, lock the challenged friend to the opposite side in 1:1 mode, support customizable multi-option bet labels, and hide every user-facing trace of the internal `__private__` circle plumbing.

**Architecture:** Pure shared helpers (`circleDisplay.ts`, `betValidation.ts`) with mobile mirrors. The backend enforces every rule (side-lock, binary-in-1:1, options validation) as source of truth; the web and mobile UIs are polish layers. No schema changes.

**Tech Stack:** Next.js 16, TypeScript, Turso/libSQL, Vitest, React Native (Expo).

**Spec:** [`docs/superpowers/specs/2026-04-15-bet-modes-and-custom-options-design.md`](../specs/2026-04-15-bet-modes-and-custom-options-design.md)

---

## File Structure

**Created:**
- `api/lib/circleDisplay.ts` — pure helpers: `isPrivateCircleName`, `resolveCircleDisplay`, `shouldBlockJoin`
- `api/lib/betValidation.ts` — pure `validateOptionsArray`
- `api/__tests__/circleDisplay.test.ts` — unit tests
- `api/__tests__/betValidation.test.ts` — unit tests
- `api/__tests__/wallet/sideLock.test.ts` — integration test via `joinBet` + circle/BetSide setup
- `mobile/lib/circleDisplay.ts` — mirror of the API helper
- `mobile/lib/betValidation.ts` — mirror of the API helper
- `mobile/__tests__/circleDisplay.test.ts` — mirror test
- `mobile/__tests__/betValidation.test.ts` — mirror test

**Modified:**
- `api/app/api/bets/route.ts` — use `validateOptionsArray` + enforce 1:1 binary rule on create
- `api/app/api/bets/[id]/sides/route.ts` — use `shouldBlockJoin` to enforce side-lock before `joinBetInTx`
- `api/app/api/circles/route.ts` — filter `__private__` circles from GET responses
- `api/app/api/circles/[id]/route.ts` — return `displayName` + `isPrivate` in GET; already blocks private rename (unchanged)
- `api/app/(app)/bet/new/page.tsx` — options editor with add/remove + 1:1 nudge
- `api/app/(app)/bet/[id]/page.tsx` — side-lock UI (disabled card for taken side in 1:1)
- `api/app/(app)/circle/[id]/page.tsx` — redirect `__private__` circles to the single bet or `/friends`
- `api/app/(app)/dashboard/page.tsx` — consume the new `displayName` field; no additional filter needed since API excludes privates
- `mobile/app/bet/create.tsx` — options editor + 1:1 binary rule
- `mobile/app/bet/[id].tsx` — side-lock UI matching web
- `mobile/app/circle/[id].tsx` — private circle handling mirror
- `mobile/components/bet/BetCard.tsx` — friendly circle name via `resolveCircleDisplay`

---

## Pre-flight

- [ ] **Step 0:** Read the spec end-to-end: `docs/superpowers/specs/2026-04-15-bet-modes-and-custom-options-design.md`. The Decisions table and Section 4 (Backend Enforcement) are the binding contract.

- [ ] **Step 0b:** Run the full test suite to confirm a green baseline before making changes:

```bash
cd /Users/jackbaldner/tilt/api && npm test
```

Expected: `83 passed`. If not, stop and investigate.

---

## Phase 1: Shared helpers (pure, TDD)

### Task 1: `circleDisplay.ts` with private detection, display resolution, and side-lock rule

**Files:**
- Create: `api/lib/circleDisplay.ts`
- Create: `api/__tests__/circleDisplay.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/__tests__/circleDisplay.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  isPrivateCircleName,
  resolveCircleDisplay,
  shouldBlockJoin,
} from "../lib/circleDisplay";

describe("isPrivateCircleName", () => {
  it("recognizes the __private__ prefix", () => {
    expect(isPrivateCircleName("__private__abc123")).toBe(true);
    expect(isPrivateCircleName("__private__65bc__721d")).toBe(true);
  });

  it("does not match non-private names", () => {
    expect(isPrivateCircleName("My Circle")).toBe(false);
    expect(isPrivateCircleName("private")).toBe(false);
    expect(isPrivateCircleName("__privater__")).toBe(false);
    expect(isPrivateCircleName("")).toBe(false);
  });

  it("does not match names that contain __private__ in the middle", () => {
    expect(isPrivateCircleName("my __private__ circle")).toBe(false);
  });
});

describe("resolveCircleDisplay", () => {
  it("returns the name as-is for non-private circles", () => {
    expect(
      resolveCircleDisplay({ name: "Fantasy League", description: "Our weekly fantasy bets" })
    ).toEqual({ name: "Fantasy League", isPrivate: false });
  });

  it("uses description for private circles when present", () => {
    expect(
      resolveCircleDisplay({
        name: "__private__abc__def",
        description: "Jack vs Lexi",
      })
    ).toEqual({ name: "Jack vs Lexi", isPrivate: true });
  });

  it("falls back to constructing from members when description is empty", () => {
    expect(
      resolveCircleDisplay(
        {
          name: "__private__abc__def",
          description: null,
          members: [
            { userId: "me", user: { name: "Jack" } },
            { userId: "them", user: { name: "Lexi" } },
          ],
        },
        "me"
      )
    ).toEqual({ name: "Challenge with Lexi", isPrivate: true });
  });

  it("falls back to 'Friend challenge' when no description and no other member found", () => {
    expect(
      resolveCircleDisplay({
        name: "__private__abc__def",
        description: null,
      })
    ).toEqual({ name: "Friend challenge", isPrivate: true });
  });

  it("trims whitespace-only descriptions as empty", () => {
    expect(
      resolveCircleDisplay({ name: "__private__abc", description: "   " })
    ).toEqual({ name: "Friend challenge", isPrivate: true });
  });
});

describe("shouldBlockJoin", () => {
  it("does not block joins in non-private (group) circles", () => {
    const result = shouldBlockJoin("Fantasy League", [{ option: "Yes" }], "Yes");
    expect(result.blocked).toBe(false);
  });

  it("does not block joins in private circles when the option is still available", () => {
    const result = shouldBlockJoin("__private__abc", [{ option: "Yes" }], "No");
    expect(result.blocked).toBe(false);
  });

  it("blocks joins in private circles when the option is already taken", () => {
    const result = shouldBlockJoin("__private__abc", [{ option: "Yes" }], "Yes");
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/already taken/i);
  });

  it("handles null circle name (bet with no circle) as non-private", () => {
    const result = shouldBlockJoin(null, [{ option: "Yes" }], "Yes");
    expect(result.blocked).toBe(false);
  });

  it("handles undefined circle name as non-private", () => {
    const result = shouldBlockJoin(undefined, [{ option: "Yes" }], "Yes");
    expect(result.blocked).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /Users/jackbaldner/tilt/api && npm test -- __tests__/circleDisplay.test.ts
```

Expected: FAIL — "Cannot find module '../lib/circleDisplay'".

- [ ] **Step 3: Implement `api/lib/circleDisplay.ts`**

```ts
/**
 * Pure helpers for circle display and 1:1 bet-mode rules.
 *
 * A "private circle" is an internal container created by the friend-
 * challenge flow to host a 1:1 bet between two users. Its `Circle.name`
 * starts with `__private__` and this string is never user-facing —
 * `Circle.description` holds the friendly display name. Every user-
 * facing render must go through `resolveCircleDisplay` to avoid leaking
 * the raw name into the UI.
 *
 * Mirror lives at `mobile/lib/circleDisplay.ts` and must stay in sync.
 */

export function isPrivateCircleName(name: string | null | undefined): boolean {
  return typeof name === "string" && name.startsWith("__private__");
}

export interface CircleDisplay {
  name: string;
  isPrivate: boolean;
}

export interface CircleForDisplay {
  name: string;
  description?: string | null;
  members?: Array<{ userId: string; user?: { name?: string | null } }>;
}

/**
 * Turn a raw circle row into a user-safe display object. Private circles
 * get their name replaced with something friendly:
 *   1. `description` if non-empty (populated by the friend-challenge route
 *      as "${proposer} vs ${friend}"),
 *   2. otherwise "Challenge with {other member's name}" if we know who
 *      the current user is and the other member is loaded,
 *   3. otherwise the generic "Friend challenge".
 */
export function resolveCircleDisplay(
  circle: CircleForDisplay,
  currentUserId?: string
): CircleDisplay {
  const isPrivate = isPrivateCircleName(circle.name);
  if (!isPrivate) {
    return { name: circle.name, isPrivate: false };
  }

  const trimmedDescription = circle.description?.trim();
  if (trimmedDescription) {
    return { name: trimmedDescription, isPrivate: true };
  }

  if (currentUserId && circle.members) {
    const other = circle.members.find((m) => m.userId !== currentUserId);
    if (other?.user?.name) {
      return { name: `Challenge with ${other.user.name}`, isPrivate: true };
    }
  }

  return { name: "Friend challenge", isPrivate: true };
}

export interface SideLockCheck {
  blocked: boolean;
  reason?: string;
}

/**
 * Decide whether a user's attempt to join an option should be blocked.
 * In private (1:1) circles, each side is limited to exactly one joiner
 * — so if the chosen option already has a taker, the join is blocked.
 * Group circles and circle-less bets have no such rule.
 */
export function shouldBlockJoin(
  circleName: string | null | undefined,
  existingSides: Array<{ option: string }>,
  optionToJoin: string
): SideLockCheck {
  if (!isPrivateCircleName(circleName)) {
    return { blocked: false };
  }
  const taken = existingSides.some((s) => s.option === optionToJoin);
  if (taken) {
    return {
      blocked: true,
      reason: "That side is already taken in this 1:1 challenge",
    };
  }
  return { blocked: false };
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd /Users/jackbaldner/tilt/api && npm test -- __tests__/circleDisplay.test.ts
```

Expected: 15 tests passing (3 groups × several tests each).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
cd /Users/jackbaldner/tilt/api && npm test
```

Expected: 83 + 15 = 98 tests passing.

- [ ] **Step 6: Commit**

```bash
cd /Users/jackbaldner/tilt
git add api/lib/circleDisplay.ts api/__tests__/circleDisplay.test.ts
git commit -m "feat(lib): add circleDisplay helpers for private circle handling"
```

---

### Task 2: `betValidation.ts` with `validateOptionsArray`

**Files:**
- Create: `api/lib/betValidation.ts`
- Create: `api/__tests__/betValidation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/__tests__/betValidation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateOptionsArray } from "../lib/betValidation";

describe("validateOptionsArray", () => {
  it("rejects non-array input", () => {
    const r = validateOptionsArray("not an array");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/array/i);
  });

  it("rejects arrays with non-string items", () => {
    const r = validateOptionsArray(["Yes", 42]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/string/i);
  });

  it("rejects empty arrays", () => {
    const r = validateOptionsArray([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at least 2/i);
  });

  it("rejects arrays with only one option", () => {
    const r = validateOptionsArray(["Yes"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at least 2/i);
  });

  it("accepts a valid binary options array", () => {
    const r = validateOptionsArray(["Yes", "No"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toEqual(["Yes", "No"]);
  });

  it("trims whitespace from labels", () => {
    const r = validateOptionsArray(["  Yes  ", "  No  "]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toEqual(["Yes", "No"]);
  });

  it("rejects empty-after-trim labels", () => {
    const r = validateOptionsArray(["Yes", "   "]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/empty/i);
  });

  it("rejects labels longer than 50 characters", () => {
    const long = "a".repeat(51);
    const r = validateOptionsArray(["Yes", long]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/50 characters/i);
  });

  it("accepts labels that are exactly 50 characters", () => {
    const at50 = "a".repeat(50);
    const r = validateOptionsArray(["Yes", at50]);
    expect(r.ok).toBe(true);
  });

  it("rejects case-insensitive duplicates", () => {
    const r = validateOptionsArray(["Yes", "yes"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/duplicate/i);
  });

  it("accepts a 20-option array", () => {
    const opts = Array.from({ length: 20 }, (_, i) => `Option ${i + 1}`);
    const r = validateOptionsArray(opts);
    expect(r.ok).toBe(true);
  });

  it("rejects a 21-option array", () => {
    const opts = Array.from({ length: 21 }, (_, i) => `Option ${i + 1}`);
    const r = validateOptionsArray(opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at most 20/i);
  });

  it("accepts exactly 2 options when requireExactly: 2 is set", () => {
    const r = validateOptionsArray(["Yes", "No"], { requireExactly: 2 });
    expect(r.ok).toBe(true);
  });

  it("rejects 3 options when requireExactly: 2 is set", () => {
    const r = validateOptionsArray(["A", "B", "C"], { requireExactly: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/exactly 2/i);
  });

  it("preserves creation order in normalized output", () => {
    const r = validateOptionsArray(["Third", "First", "Second"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toEqual(["Third", "First", "Second"]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /Users/jackbaldner/tilt/api && npm test -- __tests__/betValidation.test.ts
```

- [ ] **Step 3: Implement `api/lib/betValidation.ts`**

```ts
/**
 * Pure validation for bet option arrays. Used by both the bet creation
 * route (server-side source of truth) and the bet creation form
 * (client-side preflight so users see errors without a round trip).
 *
 * Mirror lives at `mobile/lib/betValidation.ts` and must stay in sync.
 */

export type ValidateOptionsResult =
  | { ok: true; normalized: string[] }
  | { ok: false; error: string };

export interface ValidateOptionsOpts {
  /**
   * If set, the array must contain exactly this many options. Used to
   * enforce the 1:1-binary constraint (exactly 2 options in private
   * circles).
   */
  requireExactly?: number;
}

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 20;
const MAX_LABEL_LENGTH = 50;

export function validateOptionsArray(
  options: unknown,
  opts: ValidateOptionsOpts = {}
): ValidateOptionsResult {
  if (!Array.isArray(options)) {
    return { ok: false, error: "Options must be an array" };
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const raw of options) {
    if (typeof raw !== "string") {
      return { ok: false, error: "Each option must be a string" };
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return { ok: false, error: "Option labels cannot be empty" };
    }
    if (trimmed.length > MAX_LABEL_LENGTH) {
      return {
        ok: false,
        error: `Option labels cannot exceed ${MAX_LABEL_LENGTH} characters`,
      };
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: `Duplicate option: "${trimmed}"` };
    }
    seen.add(key);
    normalized.push(trimmed);
  }

  if (normalized.length < MIN_OPTIONS) {
    return { ok: false, error: `At least ${MIN_OPTIONS} options are required` };
  }
  if (normalized.length > MAX_OPTIONS) {
    return { ok: false, error: `At most ${MAX_OPTIONS} options are allowed` };
  }
  if (opts.requireExactly !== undefined && normalized.length !== opts.requireExactly) {
    return {
      ok: false,
      error: `This bet type requires exactly ${opts.requireExactly} options`,
    };
  }

  return { ok: true, normalized };
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd /Users/jackbaldner/tilt/api && npm test -- __tests__/betValidation.test.ts
```

Expected: 15 tests passing.

- [ ] **Step 5: Run the full suite**

```bash
cd /Users/jackbaldner/tilt/api && npm test
```

Expected: 98 + 15 = 113 tests passing.

- [ ] **Step 6: Commit**

```bash
cd /Users/jackbaldner/tilt
git add api/lib/betValidation.ts api/__tests__/betValidation.test.ts
git commit -m "feat(lib): add validateOptionsArray for bet option validation"
```

---

## Phase 2: Backend enforcement

### Task 3: Tighten `/api/bets` POST validation

**Files:**
- Modify: `api/app/api/bets/route.ts`

- [ ] **Step 1: Read the current validation block**

```bash
cd /Users/jackbaldner/tilt
sed -n '55,85p' api/app/api/bets/route.ts
```

Confirm the current manual validation (`title`, `type`, `stake`, `options.length`, `proposerOption`).

- [ ] **Step 2: Replace inline options validation with `validateOptionsArray`**

Edit `api/app/api/bets/route.ts`. At the top, add the import:

```ts
import { validateOptionsArray } from "@/lib/betValidation";
import { isPrivateCircleName } from "@/lib/circleDisplay";
```

In the POST function, replace the existing options validation block (currently checks `!Array.isArray(options) || options.length < 2`) with:

```ts
  // Validate options array (trim, dedup, length bounds)
  const optionsResult = validateOptionsArray(options);
  if (!optionsResult.ok) {
    return NextResponse.json({ error: optionsResult.error }, { status: 400 });
  }
  const normalizedOptions = optionsResult.normalized;

  if (!proposerOption) {
    return NextResponse.json({ error: "proposerOption is required" }, { status: 400 });
  }
  if (!normalizedOptions.includes(proposerOption)) {
    return NextResponse.json({ error: "proposerOption must be one of the options" }, { status: 400 });
  }
```

And replace every subsequent reference to `options` in the POST body serialization (the `JSON.stringify(options)` call) with `JSON.stringify(normalizedOptions)`.

- [ ] **Step 3: Add the 1:1-binary enforcement for private circles**

After the existing `circleId` membership check (around line 70-80), add:

```ts
  // If this bet is being placed in a private (1:1) circle, enforce the
  // binary rule: exactly 2 options. The `validateOptionsArray` helper
  // is called with `requireExactly: 2` as a second pass.
  if (circleId) {
    const circle = await one<{ name: string }>("SELECT name FROM Circle WHERE id = ?", [circleId]);
    if (circle && isPrivateCircleName(circle.name)) {
      const privateResult = validateOptionsArray(normalizedOptions, { requireExactly: 2 });
      if (!privateResult.ok) {
        return NextResponse.json(
          { error: "1:1 challenges must have exactly 2 options" },
          { status: 400 }
        );
      }
    }
  }
```

- [ ] **Step 4: Type check**

```bash
cd /Users/jackbaldner/tilt/api && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Run the full test suite**

```bash
cd /Users/jackbaldner/tilt/api && npm test
```

Expected: 113 passing (no regressions — existing bet creation tests still work because the default Yes/No options still validate).

- [ ] **Step 6: Commit**

```bash
cd /Users/jackbaldner/tilt
git add api/app/api/bets/route.ts
git commit -m "feat(bets): use validateOptionsArray + enforce 1:1 binary rule on create"
```

---

### Task 4: Add side-lock to `/api/bets/[id]/sides` POST

**Files:**
- Modify: `api/app/api/bets/[id]/sides/route.ts`

- [ ] **Step 1: Add the import + load the circle name alongside the bet**

Edit `api/app/api/bets/[id]/sides/route.ts`. At the top, add:

```ts
import { shouldBlockJoin } from "@/lib/circleDisplay";
```

Find the block where the bet is loaded (`const bet = await one<any>(...)`) and after the existing membership/option validation, BEFORE the `existingSide` check, add a block that loads the circle and applies the side-lock rule:

```ts
  // 1:1 side-lock: in private circles, each option can only have one
  // joiner. Look up the circle name + current sides, then consult the
  // pure `shouldBlockJoin` rule. Done outside the transaction so we
  // reject cleanly without opening a DB connection.
  let circleName: string | null = null;
  if (bet.circleId) {
    const circle = await one<{ name: string }>("SELECT name FROM Circle WHERE id = ?", [bet.circleId]);
    circleName = circle?.name ?? null;
  }
  if (circleName) {
    const currentSides = await one<{ options: string }>(
      "SELECT json_group_array(option) AS options FROM BetSide WHERE betId = ?",
      [betId]
    );
    // SQLite returns the JSON array as a string; parse once.
    let parsedSides: Array<{ option: string }> = [];
    try {
      const arr = JSON.parse(currentSides?.options ?? "[]") as string[];
      parsedSides = arr.filter((o): o is string => typeof o === "string").map((o) => ({ option: o }));
    } catch {
      parsedSides = [];
    }
    const lock = shouldBlockJoin(circleName, parsedSides, option);
    if (lock.blocked) {
      return NextResponse.json({ error: lock.reason ?? "Side already taken" }, { status: 409 });
    }
  }
```

Note: the `json_group_array` / `json_object` functions work in both SQLite and libSQL. If the `json_group_array` call is flagged in local testing, fall back to a plain `SELECT option FROM BetSide WHERE betId = ?` and map to `{ option }` shape.

- [ ] **Step 2: Type check**

```bash
cd /Users/jackbaldner/tilt/api && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Run the full test suite**

```bash
cd /Users/jackbaldner/tilt/api && npm test
```

Expected: 113 passing. No existing tests hit the side-lock path yet (none use private circles), so this code is exercised only by the new test in Task 5.

- [ ] **Step 4: Commit**

```bash
cd /Users/jackbaldner/tilt
git add api/app/api/bets/[id]/sides/route.ts
git commit -m "feat(bets): add 1:1 side-lock rule in join route"
```

---

### Task 5: Integration test for the side-lock rule

**Files:**
- Create: `api/__tests__/wallet/sideLock.test.ts`

Since the rule is enforced at the route layer and tests don't hit the HTTP layer, we test the pure rule + the underlying wallet layer together. The `shouldBlockJoin` pure function is already unit-tested in Task 1. This file focuses on the interaction with a real DB and the wallet's existing join flow to prove private circles behave correctly end-to-end.

- [ ] **Step 1: Write the test**

Create `api/__tests__/wallet/sideLock.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("1:1 side-lock integration", () => {
  beforeEach(() => vi.resetModules());

  async function setup() {
    const { ensureWalletSchema } = await import("../../lib/wallet/migrate");
    const wallet = await import("../../lib/wallet");
    const { run } = await import("../../lib/db");
    await ensureWalletSchema();
    // Minimum schema needed for the test
    await run(
      "CREATE TABLE Circle (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, emoji TEXT, ownerId TEXT)"
    );
    await run(
      "CREATE TABLE Bet (id TEXT PRIMARY KEY, circleId TEXT, stake INTEGER NOT NULL, totalPot INTEGER DEFAULT 0)"
    );
    await run(
      "CREATE TABLE BetSide (id TEXT PRIMARY KEY, betId TEXT, userId TEXT, option TEXT, stake INTEGER, status TEXT DEFAULT 'active', createdAt TEXT DEFAULT (datetime('now')), UNIQUE(betId, userId))"
    );
    await wallet.grant({ userId: "alice", currency: "CHIPS", amount: 1000, reason: "signup" });
    await wallet.grant({ userId: "bob", currency: "CHIPS", amount: 1000, reason: "signup" });
    return wallet;
  }

  it("pure rule: side-lock blocks joining a taken option in a private circle", async () => {
    // This replays the route-layer check via the pure helper and a DB-backed
    // side count. The route logic is the same three lines: load circle,
    // load sides, call shouldBlockJoin.
    const wallet = await setup();
    const { run, all } = await import("../../lib/db");
    const { shouldBlockJoin } = await import("../../lib/circleDisplay");

    await run(
      "INSERT INTO Circle (id, name, description, ownerId) VALUES (?, ?, ?, ?)",
      ["private-c1", "__private__alice__bob", "Alice vs Bob", "alice"]
    );
    await run("INSERT INTO Bet (id, circleId, stake) VALUES (?, ?, ?)", ["b1", "private-c1", 50]);
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "Yes", stake: 50 });

    const sides = await all<{ option: string }>(
      "SELECT option FROM BetSide WHERE betId = ?",
      ["b1"]
    );
    const blocked = shouldBlockJoin("__private__alice__bob", sides, "Yes");
    expect(blocked.blocked).toBe(true);
    expect(blocked.reason).toMatch(/already taken/i);

    const allowed = shouldBlockJoin("__private__alice__bob", sides, "No");
    expect(allowed.blocked).toBe(false);
  });

  it("group circles permit multiple joiners on the same option", async () => {
    const wallet = await setup();
    const { run, all } = await import("../../lib/db");
    const { shouldBlockJoin } = await import("../../lib/circleDisplay");

    await run(
      "INSERT INTO Circle (id, name, description, ownerId) VALUES (?, ?, ?, ?)",
      ["group-c1", "Fantasy League", null, "alice"]
    );
    await run("INSERT INTO Bet (id, circleId, stake) VALUES (?, ?, ?)", ["b1", "group-c1", 50]);
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "Yes", stake: 50 });

    const sides = await all<{ option: string }>("SELECT option FROM BetSide WHERE betId = ?", ["b1"]);
    const result = shouldBlockJoin("Fantasy League", sides, "Yes");
    expect(result.blocked).toBe(false);

    // And the wallet layer actually lets bob join the same option
    await wallet.joinBet({ betId: "b1", userId: "bob", option: "Yes", stake: 50 });
    const finalSides = await all<{ option: string }>(
      "SELECT option, userId FROM BetSide WHERE betId = ?",
      ["b1"]
    );
    expect(finalSides).toHaveLength(2);
    expect(finalSides.every((s) => s.option === "Yes")).toBe(true);
  });

  it("private circles with both sides filled (one per side) resolve normally", async () => {
    const wallet = await setup();
    const { run, all } = await import("../../lib/db");
    const { shouldBlockJoin } = await import("../../lib/circleDisplay");

    await run(
      "INSERT INTO Circle (id, name, description, ownerId) VALUES (?, ?, ?, ?)",
      ["private-c1", "__private__alice__bob", "Alice vs Bob", "alice"]
    );
    await run("INSERT INTO Bet (id, circleId, stake) VALUES (?, ?, ?)", ["b1", "private-c1", 50]);
    await wallet.joinBet({ betId: "b1", userId: "alice", option: "Yes", stake: 50 });

    // Bob checks the other side — not blocked
    let sides = await all<{ option: string }>("SELECT option FROM BetSide WHERE betId = ?", ["b1"]);
    expect(shouldBlockJoin("__private__alice__bob", sides, "No").blocked).toBe(false);

    await wallet.joinBet({ betId: "b1", userId: "bob", option: "No", stake: 50 });

    // Now both sides are taken; any further attempt to join either side should be blocked
    sides = await all<{ option: string }>("SELECT option FROM BetSide WHERE betId = ?", ["b1"]);
    expect(shouldBlockJoin("__private__alice__bob", sides, "Yes").blocked).toBe(true);
    expect(shouldBlockJoin("__private__alice__bob", sides, "No").blocked).toBe(true);

    // Resolve — normal resolve flow works
    const result = await wallet.resolveBet({ betId: "b1", winningOption: "Yes" });
    if (result === "duplicate") throw new Error("unexpected duplicate");
    expect(result.payouts).toHaveLength(1);
    expect(result.payouts[0].userId).toBe("alice");
    expect(result.payouts[0].payout).toBe(100);
    expect(await wallet.getBalance("alice", "CHIPS")).toBe(1050);
    expect(await wallet.getBalance("bob", "CHIPS")).toBe(950);
  });
});
```

- [ ] **Step 2: Run the new test**

```bash
cd /Users/jackbaldner/tilt/api && npm test -- __tests__/wallet/sideLock.test.ts
```

Expected: 3 tests passing.

- [ ] **Step 3: Run the full suite**

```bash
cd /Users/jackbaldner/tilt/api && npm test
```

Expected: 113 + 3 = 116 tests passing.

- [ ] **Step 4: Commit**

```bash
cd /Users/jackbaldner/tilt
git add api/__tests__/wallet/sideLock.test.ts
git commit -m "test(wallet): integration test for 1:1 side-lock rule"
```

---

### Task 6: `/api/circles` routes — filter private + return displayName

**Files:**
- Modify: `api/app/api/circles/route.ts`
- Modify: `api/app/api/circles/[id]/route.ts`

- [ ] **Step 1: Update `api/app/api/circles/route.ts` GET to exclude private circles**

Find the GET function. After the `circles` query, before the `Promise.all` enrichment, add a filter:

```ts
  // Private circles (1:1 friend-challenge containers) are plumbing, not
  // user-facing circles. Exclude them from the list entirely.
  const visibleCircles = circles.filter((c: any) => !c.name.startsWith("__private__"));

  const enriched = await Promise.all(visibleCircles.map(async (c: any) => {
    // ... existing enrichment logic
```

Replace the `circles.map` with `visibleCircles.map` inside the Promise.all so only visible circles are enriched.

- [ ] **Step 2: Update `api/app/api/circles/[id]/route.ts` GET to return displayName + isPrivate**

Add the import at the top:

```ts
import { resolveCircleDisplay } from "@/lib/circleDisplay";
```

In the GET function, after building the `members` array and before the final response, compute the display name:

```ts
  const display = resolveCircleDisplay(
    { name: circle.name, description: circle.description, members: members.map((m: any) => ({ userId: m.userId, user: { name: m.userName } })) },
    auth.id
  );
```

Then in the returned `NextResponse.json(...)` object, override `name` with `display.name` and add `isPrivate`:

```ts
  return NextResponse.json({
    circle: {
      ...circle,
      name: display.name,        // friendly name (raw name hidden)
      isPrivate: display.isPrivate,
      _rawName: circle.name,     // preserved for internal debugging
      owner,
      members: members.map((m: any, i: number) => ({
        ...m,
        chips: memberBalances[i],
        user: { id: m.userId, name: m.userName, image: m.userImage, chips: memberBalances[i] },
      })),
      _count: { bets: betCount, members: members.length },
    },
  });
```

- [ ] **Step 3: Type check + test run**

```bash
cd /Users/jackbaldner/tilt/api && npx tsc --noEmit 2>&1 | head -20 && npm test
```

Expected: no type errors, 116 tests passing.

- [ ] **Step 4: Commit**

```bash
cd /Users/jackbaldner/tilt
git add api/app/api/circles/route.ts api/app/api/circles/[id]/route.ts
git commit -m "feat(circles): filter private circles from list, return friendly displayName"
```

---

## Phase 3: Web frontend

### Task 7: Bet creation form — options editor with add/remove

**Files:**
- Modify: `api/app/(app)/bet/new/page.tsx`

- [ ] **Step 1: Read the current form to find the insertion point**

```bash
cd /Users/jackbaldner/tilt
sed -n '290,330p' 'api/app/(app)/bet/new/page.tsx'
```

Identify the "Your side" Yes/No picker block we added yesterday. It'll be replaced with a full options editor + side picker.

- [ ] **Step 2: Add options state and handlers**

Near the other `useState` calls in the component, replace the `proposerOption` state and add options state:

```ts
  const [options, setOptions] = useState<string[]>(["Yes", "No"]);
  const [proposerOption, setProposerOption] = useState<string | null>(null);
```

(The existing `proposerOption` state stays; just confirm its type is `string | null` rather than `"Yes" | "No" | null`.)

Add handlers above the return statement:

```ts
  function updateOption(index: number, value: string) {
    setOptions((prev) => {
      const next = [...prev];
      const old = next[index];
      next[index] = value;
      // If the proposer had picked this slot, update their pick to match the new label
      if (proposerOption === old) setProposerOption(value);
      return next;
    });
  }

  function addOption() {
    setOptions((prev) => (prev.length >= 20 ? prev : [...prev, ""]));
  }

  function removeOption(index: number) {
    setOptions((prev) => {
      if (prev.length <= 2) return prev;
      const removed = prev[index];
      if (proposerOption === removed) setProposerOption(null);
      return prev.filter((_, i) => i !== index);
    });
  }

  // 1:1 binary constraint: if a specific friend is selected, the form
  // requires exactly 2 options. If the user adds a third while a friend
  // is selected, we surface an inline warning but don't block editing.
  const is1v1 = selectedFriend !== null;
  const optionsConstraintError =
    is1v1 && options.length !== 2
      ? `1:1 challenges are binary. Remove extras or click "Anyone" to add more options.`
      : null;
```

- [ ] **Step 3: Replace the "Your side" JSX block with the options editor + side picker**

Find the existing `{/* Your side */}` block and replace it with:

```tsx
        {/* Options editor */}
        <div>
          <label className="block text-sm font-medium text-muted mb-2">Options</label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  maxLength={50}
                  placeholder={`Option ${i + 1}`}
                  className="flex-1 bg-white border border-border rounded-xl px-3 py-2 text-text text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    className="w-9 h-9 rounded-xl bg-surface border border-border text-muted hover:text-loss hover:border-loss/40 transition-colors flex items-center justify-center"
                    aria-label="Remove option"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          {!is1v1 && options.length < 20 && (
            <button
              type="button"
              onClick={addOption}
              className="mt-2 text-sm text-accent hover:text-accent-2 font-medium"
            >
              + Add option
            </button>
          )}
          {optionsConstraintError && (
            <p className="mt-2 text-xs text-loss">{optionsConstraintError}</p>
          )}
        </div>

        {/* Your side — derives from options */}
        <div>
          <label className="block text-sm font-medium text-muted mb-2">Your side</label>
          <div className="flex flex-wrap gap-2">
            {options.map((opt, i) => {
              const selected = proposerOption === opt && opt.trim().length > 0;
              const disabled = !opt.trim();
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => setProposerOption(opt)}
                  className={`py-2 px-4 rounded-xl border text-sm font-semibold transition-colors ${
                    disabled
                      ? "bg-surface border-border text-subtle cursor-not-allowed"
                      : selected
                      ? "bg-accent border-accent text-white"
                      : "bg-white border-border text-muted hover:border-border-2"
                  }`}
                >
                  {opt.trim() || `Option ${i + 1}`}
                </button>
              );
            })}
          </div>
        </div>
```

- [ ] **Step 4: Update the POST body to send the options array**

Find the `body: JSON.stringify({...})` block inside `handleSubmit`. Replace the hardcoded `options: ["Yes", "No"]` with:

```ts
          options,
```

Also, add a guard before the POST that runs the same validation client-side:

```ts
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (optionsConstraintError) {
      setError(optionsConstraintError);
      return;
    }
    if (!proposerOption) {
      setError("Pick your side");
      return;
    }
    // ... rest of existing logic
```

Replace the submit button's `disabled` check with:

```tsx
          disabled={
            submitting ||
            !title.trim() ||
            finalStake < 1 ||
            !proposerOption ||
            !options.includes(proposerOption) ||
            optionsConstraintError !== null
          }
```

- [ ] **Step 5: Type check**

```bash
cd /Users/jackbaldner/tilt/api && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
cd /Users/jackbaldner/tilt
git add 'api/app/(app)/bet/new/page.tsx'
git commit -m "feat(bet/new): options editor with add/remove + 1:1 binary nudge"
```

---

### Task 8: Web bet detail page — side-lock UI for 1:1 bets

**Files:**
- Modify: `api/app/(app)/bet/[id]/page.tsx`

- [ ] **Step 1: Read the current option card rendering**

```bash
cd /Users/jackbaldner/tilt
grep -n "option" 'api/app/(app)/bet/[id]/page.tsx' | head -30
```

Find where `bet.options.map(...)` renders the option cards.

- [ ] **Step 2: Import `isPrivateCircleName`**

At the top of the file:

```ts
import { isPrivateCircleName } from "@/lib/circleDisplay";
```

- [ ] **Step 3: Compute whether the bet is a 1:1 and which side is taken**

Near the top of the component, after the `bet` variable is loaded, add:

```ts
  const is1v1 = bet ? isPrivateCircleName(bet.circle?.name ?? null) || bet.isPrivate : false;
  const myEntry = bet?.sides?.find((s: any) => s.userId === user?.id);
  const sidesByOption: Record<string, any> = {};
  for (const s of bet?.sides ?? []) {
    sidesByOption[s.option] = s;
  }
```

(The existing code likely already has `myEntry` — reuse it instead of redeclaring.)

- [ ] **Step 4: Update the option card rendering to show taken state in 1:1**

Find the `bet.options.map((opt) => { ... })` block. Replace it with a version that:

- For 1:1 mode + a taken side + viewer is not the taker → render muted/disabled with the taker's name and "Taken" badge.
- For 1:1 mode + an available side + viewer has not joined → highlight with "Your side" label.
- For all other cases → existing behavior (normal tappable cards).

The pattern:

```tsx
            {bet.options.map((opt: string) => {
              const takenBySide = sidesByOption[opt];
              const takenByMe = takenBySide && takenBySide.userId === user?.id;
              const takenByOther = takenBySide && takenBySide.userId !== user?.id;
              const lockedInPrivate = is1v1 && takenByOther && !myEntry;
              const isMyAvailableSideInPrivate =
                is1v1 && !takenBySide && !myEntry;

              const isClickable =
                !myEntry &&
                bet.resolution === "pending" &&
                !lockedInPrivate;

              return (
                <button
                  key={opt}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && pickSide(opt)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
                    lockedInPrivate
                      ? "bg-surface border-border opacity-60 cursor-not-allowed"
                      : isMyAvailableSideInPrivate
                      ? "bg-accent/5 border-accent text-text hover:bg-accent/10"
                      : takenByMe
                      ? "bg-accent/10 border-accent text-text"
                      : !myEntry && bet.resolution === "pending"
                      ? "bg-white border-border hover:border-border-2"
                      : "bg-white border-border text-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-text">{opt}</p>
                      {takenBySide && (
                        <p className="text-xs text-subtle mt-0.5">
                          {takenByMe ? "You" : takenBySide.user?.name ?? "Taken"}
                        </p>
                      )}
                    </div>
                    {lockedInPrivate && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-border flex-shrink-0">
                        Taken
                      </span>
                    )}
                    {isMyAvailableSideInPrivate && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 flex-shrink-0">
                        Your side →
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
```

Note: the exact class names and surrounding markup depend on the existing structure. If the existing option cards use different Tailwind patterns, preserve those and only add the `lockedInPrivate` / `isMyAvailableSideInPrivate` branches. The key invariants:

- Locked cards have reduced opacity, show "Taken", and have `disabled={true}` + `cursor-not-allowed`
- Available cards in a 1:1 are highlighted with accent color and "Your side →"
- Group mode cards render exactly as they did before

- [ ] **Step 5: Hide the circle breadcrumb when `is1v1`**

Find the "posted in {circle}" section (if present) and wrap it in `{!is1v1 && (...)}`. In a 1:1, the circle chrome is irrelevant — the user sees the proposer and the bet directly.

If there's a separate "Challenge from {name}" header component, render it conditionally when `is1v1`. If not, skip this step — the `isPrivate` filter on the circle name already prevents the raw `__private__...` from appearing.

- [ ] **Step 6: Type check**

```bash
cd /Users/jackbaldner/tilt/api && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 7: Commit**

```bash
cd /Users/jackbaldner/tilt
git add 'api/app/(app)/bet/[id]/page.tsx'
git commit -m "feat(bet/[id]): side-lock UI for 1:1 bets — taken/available visual states"
```

---

### Task 9: Web circle detail page — redirect for private circles

**Files:**
- Modify: `api/app/(app)/circle/[id]/page.tsx`

- [ ] **Step 1: Add the redirect logic at the top of the component**

After the `circle` is loaded and before the existing render, add:

```tsx
  // Private (1:1 friend-challenge) circles are plumbing — users should
  // never see the "circle" view. Redirect to the single bet inside, or
  // to /friends if the circle has no bets.
  useEffect(() => {
    if (!circle) return;
    const isPrivate =
      (circle as any).isPrivate ?? circle.name.startsWith("__private__");
    if (!isPrivate) return;

    if (bets.length === 1) {
      router.replace(`/bet/${bets[0].id}`);
    } else {
      router.replace("/friends");
    }
  }, [circle, bets, router]);
```

- [ ] **Step 2: Render a lightweight loading view while redirecting**

Just before the existing render return, add:

```tsx
  const isPrivate = circle
    ? ((circle as any).isPrivate ?? circle.name.startsWith("__private__"))
    : false;

  if (isPrivate) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-8 text-center">
        <p className="text-muted text-sm">Loading…</p>
      </div>
    );
  }
```

This prevents the raw name from flashing on screen while the `useEffect` redirect fires.

- [ ] **Step 3: Type check**

```bash
cd /Users/jackbaldner/tilt/api && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
cd /Users/jackbaldner/tilt
git add 'api/app/(app)/circle/[id]/page.tsx'
git commit -m "feat(circle/[id]): redirect private circles to bet or friends"
```

---

### Task 10: Dashboard and other circle references — use friendly displayName

**Files:**
- Modify: `api/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Audit for any remaining `circle.name` reads**

```bash
cd /Users/jackbaldner/tilt
grep -n "circle\.name\|circle\.emoji" 'api/app/(app)/dashboard/page.tsx' | head -20
```

- [ ] **Step 2: Update if there are any unconditional renders**

Since Task 6 changed `/api/circles` GET to exclude private circles, the dashboard shouldn't see them anymore. The `__private__`-aware filter we added yesterday is now redundant but still harmless — leave it as defense in depth.

Any `circle.name` render on the dashboard now refers to real circles, so no changes should be strictly necessary. But if you find any place that reads `bet.circle?.name` (inside a bet card) that could still render a private name for bets that came in via a different endpoint, update it to use `resolveCircleDisplay`.

- [ ] **Step 3: Check bet cards that show circle context**

The dashboard's BetCard has `bet.circle.name` rendered via `{bet.circle?.emoji} {bet.circle?.name}`. In 1:1 bets, this would render the raw name. Add the import and transform:

```tsx
import { resolveCircleDisplay } from "@/lib/circleDisplay";
// ...
// inside BetCard component, where the circle chip is rendered:
{bet.circle && (() => {
  const display = resolveCircleDisplay({
    name: bet.circle.name,
    description: (bet.circle as any).description,
  });
  if (display.isPrivate) {
    // In 1:1 bets, the "circle" is not a real location — don't show it
    return null;
  }
  return (
    <p className="text-xs text-subtle mt-1">
      {bet.circle.emoji} {display.name}
    </p>
  );
})()}
```

The key change: in a 1:1 bet, suppress the circle chip entirely. Users see just the bet title and the proposer.

- [ ] **Step 4: Type check**

```bash
cd /Users/jackbaldner/tilt/api && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
cd /Users/jackbaldner/tilt
git add 'api/app/(app)/dashboard/page.tsx'
git commit -m "feat(dashboard): suppress private circle context in bet cards"
```

---

## Phase 4: Mobile mirrors

> **Note:** Jack lives on the web; mobile is dormant but we mirror to prevent drift when it's re-enabled.

### Task 11: Mobile shared helpers (mirror of Tasks 1 + 2)

**Files:**
- Create: `mobile/lib/circleDisplay.ts` (identical to `api/lib/circleDisplay.ts`)
- Create: `mobile/lib/betValidation.ts` (identical to `api/lib/betValidation.ts`)
- Create: `mobile/__tests__/circleDisplay.test.ts` (identical to `api/__tests__/circleDisplay.test.ts` with the import path updated)
- Create: `mobile/__tests__/betValidation.test.ts` (identical to `api/__tests__/betValidation.test.ts` with the import path updated)

- [ ] **Step 1: Copy the helpers**

```bash
cd /Users/jackbaldner/tilt
cp api/lib/circleDisplay.ts mobile/lib/circleDisplay.ts
cp api/lib/betValidation.ts mobile/lib/betValidation.ts
```

Edit each copy's top JSDoc comment to note that IT is the mirror and `api/lib/*.ts` is the source of truth.

In `mobile/lib/circleDisplay.ts`, change the header comment's "Mirror lives at" line to:

```ts
/**
 * ...
 * Mirror of `api/lib/circleDisplay.ts` — keep in sync manually.
 */
```

Same for `mobile/lib/betValidation.ts`.

- [ ] **Step 2: Create the test files**

Copy the api tests, update the import path:

```bash
cp api/__tests__/circleDisplay.test.ts mobile/__tests__/circleDisplay.test.ts
cp api/__tests__/betValidation.test.ts mobile/__tests__/betValidation.test.ts
```

Edit each mobile test file to change the import path from `"../lib/circleDisplay"` to `"@/lib/circleDisplay"` (mobile uses the `@/` alias to root, matching `mobile/vitest.config.ts`).

- [ ] **Step 3: Run mobile tests**

```bash
cd /Users/jackbaldner/tilt/mobile && npm test
```

Expected: previous 12 tests + 15 circleDisplay + 15 betValidation = 42 tests passing.

- [ ] **Step 4: Commit**

```bash
cd /Users/jackbaldner/tilt
git add mobile/lib/circleDisplay.ts mobile/lib/betValidation.ts mobile/__tests__/circleDisplay.test.ts mobile/__tests__/betValidation.test.ts
git commit -m "feat(mobile/lib): mirror circleDisplay and betValidation helpers"
```

---

### Task 12: Mobile bet creation — options editor + 1:1 rule

**Files:**
- Modify: `mobile/app/bet/create.tsx`

- [ ] **Step 1: Import the helpers**

```ts
import { validateOptionsArray } from "@/lib/betValidation";
```

- [ ] **Step 2: Client-side validation on submit**

In the `createMutation.mutationFn`, before the POST, run the validation and throw a clear error if it fails:

```ts
const validation = validateOptionsArray(options);
if (!validation.ok) {
  throw new Error(validation.error);
}
const is1v1 = selectedFriend !== null;
if (is1v1) {
  const privateValidation = validateOptionsArray(options, { requireExactly: 2 });
  if (!privateValidation.ok) {
    throw new Error("1:1 challenges must be binary. Remove extras or clear the friend selection.");
  }
}
```

The existing `options` state is already editable in the mobile UI (the multiple_choice bet type path). No UI restructuring is needed — just add the 1:1 nudge so users see the same constraint the web has.

Find the `canSubmit` computation and add the 1:1 options check:

```ts
  const canSubmit =
    selectedFriend !== null &&
    title.trim().length > 0 &&
    options.length >= 2 &&
    proposerOption !== null &&
    options.includes(proposerOption) &&
    stake > 0 &&
    (user?.chips ?? 0) >= stake &&
    // 1:1 challenges are binary
    (selectedFriend === null || options.length === 2);
```

- [ ] **Step 3: Add an inline warning banner when 1:1 is broken**

Just above the submit button, add:

```tsx
{selectedFriend !== null && options.length !== 2 && (
  <Text style={{ color: Colors.loss, fontSize: 12, marginBottom: 12 }}>
    1:1 challenges are binary. Remove extras to continue.
  </Text>
)}
```

- [ ] **Step 4: Run mobile tests (sanity check — nothing should break)**

```bash
cd /Users/jackbaldner/tilt/mobile && npm test
```

Expected: 42 tests passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/jackbaldner/tilt
git add mobile/app/bet/create.tsx
git commit -m "feat(mobile/bet/create): 1:1 binary rule in mobile form"
```

---

### Task 13: Mobile bet detail + circle detail + BetCard — friendly names + side-lock

**Files:**
- Modify: `mobile/app/bet/[id].tsx`
- Modify: `mobile/app/circle/[id].tsx`
- Modify: `mobile/components/bet/BetCard.tsx`

- [ ] **Step 1: Import helpers in each file**

Add to the top of each file:

```ts
import { isPrivateCircleName, resolveCircleDisplay } from "@/lib/circleDisplay";
```

- [ ] **Step 2: `BetCard.tsx` — suppress private circle chip**

Find where `bet.circle` is rendered (look for `bet.circle?.name` or `bet.circle?.emoji`). Wrap it in a check:

```tsx
{bet.circle && !isPrivateCircleName(bet.circle.name) && (
  <Text>{bet.circle.emoji} {bet.circle.name}</Text>
)}
```

- [ ] **Step 3: `mobile/app/circle/[id].tsx` — redirect private circles**

At the top of the component, after `circle` is loaded:

```ts
useEffect(() => {
  if (!circle) return;
  if (!isPrivateCircleName(circle.name)) return;
  if (bets.length === 1) {
    router.replace(`/bet/${bets[0].id}` as any);
  } else {
    router.replace("/friends" as any);
  }
}, [circle, bets, router]);

if (circle && isPrivateCircleName(circle.name)) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={Colors.primary} />
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: `mobile/app/bet/[id].tsx` — add the side-lock UI for 1:1 bets**

The mobile bet detail uses a list of tappable option rows. Mirror the web's approach:

- Compute `is1v1 = isPrivateCircleName(bet?.circle?.name ?? "")`
- For each option, compute `takenBySide` and `lockedInPrivate`
- Render locked options with reduced opacity, a "Taken" badge, and no `onPress`
- Render available options with an accent highlight and a "Your side" label

The exact JSX depends on the existing mobile component structure. The key: match the logic from Task 8.

- [ ] **Step 5: Run tests + type check**

```bash
cd /Users/jackbaldner/tilt/mobile && npx tsc --noEmit 2>&1 | head -20 && npm test
```

Expected: no errors, 42 tests passing.

- [ ] **Step 6: Commit**

```bash
cd /Users/jackbaldner/tilt
git add mobile/app/bet/[id].tsx mobile/app/circle/[id].tsx mobile/components/bet/BetCard.tsx
git commit -m "feat(mobile): mirror private circle redirects + 1:1 side-lock UI"
```

---

## Phase 5: Deploy and smoke test

### Task 14: Deploy, verify, clean up

**Files:**
- None (operational task)

- [ ] **Step 1: Run the full test suite one last time**

```bash
cd /Users/jackbaldner/tilt/api && npm test
cd /Users/jackbaldner/tilt/mobile && npm test
```

Expected: api 116 passing, mobile 42 passing.

- [ ] **Step 2: Type check both workspaces**

```bash
cd /Users/jackbaldner/tilt/api && npx tsc --noEmit 2>&1 | head -30
cd /Users/jackbaldner/tilt/mobile && npx tsc --noEmit 2>&1 | head -30
```

Expected: clean.

- [ ] **Step 3: Push to GitHub**

```bash
cd /Users/jackbaldner/tilt && git push origin main
```

- [ ] **Step 4: Deploy to production (from the `api/` subdirectory — per the memory rule)**

```bash
cd /Users/jackbaldner/tilt/api && vercel --prod --yes 2>&1 | tail -10
```

Expected: deployment succeeds. URL alias `api-three-vert-96.vercel.app` picks up the new build within a minute.

- [ ] **Step 5: Smoke test against prod — side-lock**

```bash
# Sign up two test accounts via curl and capture tokens
TS=$(date +%s)
U1=$(curl -s -X POST https://api-three-vert-96.vercel.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"lockA${TS}\",\"email\":\"lockA-${TS}@tilt.local\",\"password\":\"testpass123\"}")
U2=$(curl -s -X POST https://api-three-vert-96.vercel.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"lockB${TS}\",\"email\":\"lockB-${TS}@tilt.local\",\"password\":\"testpass123\"}")
T1=$(echo "$U1" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
T2=$(echo "$U2" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
ID1=$(echo "$U1" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")
ID2=$(echo "$U2" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")

# Become friends: U1 requests, U2 auto-accepts via the reverse-request path
# (this only works if the friendship POST endpoint supports identifier lookup;
#  for this smoke test, we can instead create the friendship directly via
#  tsx against prod Turso if the HTTP path is too complex)

# Simpler: just create a __private__ circle directly and test the side-lock via joins.
# Skip the friendship ceremony for this smoke test; the real verification happens
# in the manual UI test.
```

- [ ] **Step 6: Smoke test against prod — manually click through in the browser**

Open `https://api-three-vert-96.vercel.app` in your browser. Do the following:

1. Sign up two test accounts (use incognito windows).
2. Add each other as friends.
3. From Account A, create a 1:1 challenge targeted at Account B:
   - Title: "Side lock test"
   - Options: "Alpha" / "Beta" (custom labels!)
   - Stake: 50
   - Your side: Alpha
4. From Account B, open the new bet. Verify:
   - Alpha card is shown in a muted/disabled state with "A" avatar and "Taken" badge
   - Beta card is highlighted with "Your side →"
   - Clicking Alpha does nothing (or shows a toast)
   - Clicking Beta → confirmation alert → Accept → balance decreases by 50
5. Navigate to `/circle/<private-circle-id>` directly by copying the ID from the URL of the bet detail page. Expected: redirected to `/bet/<bet-id>` or to `/friends`. The raw `__private__...` string should never appear in the rendered page.
6. From Account A, create a GROUP bet (pick "Anyone" or create from a real circle). Add a 3rd and 4th option ("Red / Green / Blue / Yellow"). Pick Red. Submit. Expected: bet created successfully with 4 options.
7. From Account A, try to create a 1:1 challenge with a specific friend AND 3 options. Expected: inline error "1:1 challenges are binary...".
8. Run reconciliation against prod:

```bash
cd /Users/jackbaldner/tilt/api && TURSO_DATABASE_URL='...' TURSO_AUTH_TOKEN='...' npx tsx -e "
import { reconcileAll } from './lib/wallet';
async function main() {
  const r = await reconcileAll();
  console.log(JSON.stringify({ ok: r.ok, invariant: r.invariantHolds, wallets: r.walletCount, sum: r.totalBalanceSum }));
  process.exit(r.ok ? 0 : 1);
}
main();
"
```

Expected: `{"ok":true,"invariant":true,...,"sum":0}`.

- [ ] **Step 7: Clean up test data**

Follow the same cleanup pattern used yesterday (delete test users, wallets, ledger entries, circles, bets; credit mint for the grants). Verify reconciliation still passes.

- [ ] **Step 8: No commit**

This task is operational — no new code to commit. The preceding task commits are what land in prod.

---

## Self-Review Checklist

Before declaring complete, verify:

- [ ] Spec's Decision #1 (mode derived from circle) → enforced in `sides` route via `shouldBlockJoin` and on create via `isPrivateCircleName` check. Task 3 + Task 4.
- [ ] Decision #2 (mode selected implicitly) → no new UI mode toggle; recipient picker drives it. Task 7.
- [ ] Decision #3 (1:1 shows both cards with taken state) → Task 8 + Task 13.
- [ ] Decision #4 (1:1 binary enforced) → server validates in Task 3; client shows nudge in Task 7 (web) and Task 12 (mobile).
- [ ] Decision #5 (group bets 2-20 options) → `validateOptionsArray` in Task 2; UI in Task 7.
- [ ] Decision #6 (case-insensitive dedup, 50-char cap) → Task 2 tests + implementation.
- [ ] Decision #7 (`__private__` invisible everywhere) → Task 6 (API list filter + detail transform), Task 8/9/10 (web UI), Task 13 (mobile UI).
- [ ] Decision #8 (no destructive migration) → plan doesn't touch historical bad state.
- [ ] Decision #9 (shared pure helpers with mobile mirrors) → Task 1 (circleDisplay), Task 2 (betValidation), Task 11 (mobile mirrors).
- [ ] All four bug/feature goals from the spec are addressed by at least one task.
- [ ] No task references a function or type that isn't defined in an earlier task.
- [ ] No "TODO" / "TBD" / "add error handling" placeholder text anywhere in the plan.

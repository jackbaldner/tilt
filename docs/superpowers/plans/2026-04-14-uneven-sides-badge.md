# "Needs Takers" Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "🎯 NEEDS TAKERS" badge to bet list cards in the mobile app that surfaces one-sided pending bets to browsing users.

**Architecture:** One pure-function module (`mobile/lib/betMath.ts`) exports `isBetUneven(counts, options)`. `BetCard.tsx` computes side counts from `bet.sides` and conditionally renders a new badge in the existing top-row badge layout. No backend changes, no new screens, no new state.

**Tech Stack:** TypeScript, React Native (Expo SDK 54), Vitest (new test framework for `mobile/`).

**Spec:** [`docs/superpowers/specs/2026-04-14-uneven-sides-ux-design.md`](../specs/2026-04-14-uneven-sides-ux-design.md)

---

## File Structure

**Created:**
- `mobile/vitest.config.ts` — Vitest config for the mobile workspace
- `mobile/lib/betMath.ts` — `isBetUneven()` pure function
- `mobile/__tests__/betMath.test.ts` — unit tests

**Modified:**
- `mobile/package.json` — add vitest devDeps and `test` / `test:watch` scripts
- `mobile/components/bet/BetCard.tsx` — add `options` to `BetCardProps`, compute `needsTakers`, render badge

---

## Pre-flight: Read the Spec

- [ ] **Step 0:** Read `docs/superpowers/specs/2026-04-14-uneven-sides-ux-design.md` end-to-end. The spec is the source of truth. Note especially the "What Was Cut" section explaining why there is NO pre-join warning in this plan.

---

## Task 1: Add Vitest to mobile workspace

**Files:**
- Modify: `mobile/package.json`
- Create: `mobile/vitest.config.ts`
- Create: `mobile/__tests__/sanity.test.ts`

- [ ] **Step 1: Install vitest**

```bash
cd /Users/jackbaldner/tilt/mobile && npm install -D vitest
```

- [ ] **Step 2: Add `test` and `test:watch` scripts to `mobile/package.json`**

In the `scripts` block, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Keep the existing `start`, `android`, `ios`, `web` scripts as they are.

- [ ] **Step 3: Create `mobile/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import * as path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

The `@` alias matches `tsconfig.json` paths so imports like `@/lib/betMath` work in tests.

- [ ] **Step 4: Create `mobile/__tests__/sanity.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("test infrastructure", () => {
  it("vitest is wired up", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the sanity test**

Run:
```bash
cd /Users/jackbaldner/tilt/mobile && npm test
```

Expected: `Test Files 1 passed (1)`, `Tests 1 passed (1)`.

- [ ] **Step 6: Commit**

```bash
cd /Users/jackbaldner/tilt
git add mobile/package.json mobile/package-lock.json mobile/vitest.config.ts mobile/__tests__
git commit -m "test(mobile): add vitest infrastructure"
```

---

## Task 2: `betMath.ts` module with `isBetUneven`

**Files:**
- Create: `mobile/lib/betMath.ts`
- Create: `mobile/__tests__/betMath.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/betMath.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isBetUneven } from "@/lib/betMath";

describe("isBetUneven", () => {
  it("returns false when counts are empty (all zero is balanced)", () => {
    expect(isBetUneven({}, ["yes", "no"])).toBe(false);
  });

  it("returns true when proposer is alone (1 vs 0)", () => {
    expect(isBetUneven({ yes: 1 }, ["yes", "no"])).toBe(true);
  });

  it("returns false for balanced 1-1 split", () => {
    expect(isBetUneven({ yes: 1, no: 1 }, ["yes", "no"])).toBe(false);
  });

  it("returns true for 2-1 split", () => {
    expect(isBetUneven({ yes: 2, no: 1 }, ["yes", "no"])).toBe(true);
  });

  it("returns false for balanced 2-2 split", () => {
    expect(isBetUneven({ yes: 2, no: 2 }, ["yes", "no"])).toBe(false);
  });

  it("returns false when all three options are equally joined", () => {
    expect(isBetUneven({ a: 1, b: 1, c: 1 }, ["a", "b", "c"])).toBe(false);
  });

  it("returns true when one option has more takers in a 3-option bet", () => {
    expect(isBetUneven({ a: 2, b: 1, c: 1 }, ["a", "b", "c"])).toBe(true);
  });

  it("returns true when a declared option has zero joiners while others have takers", () => {
    expect(isBetUneven({ a: 1, b: 1 }, ["a", "b", "c"])).toBe(true);
  });

  it("returns false when options array is empty (nothing to check)", () => {
    expect(isBetUneven({ yes: 1, no: 1 }, [])).toBe(false);
  });

  it("ignores counts for options not in the declared options array", () => {
    // `foo` is not in options so it should be ignored; yes and no are balanced
    expect(isBetUneven({ yes: 1, no: 1, foo: 5 }, ["yes", "no"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Users/jackbaldner/tilt/mobile && npm test -- __tests__/betMath.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/betMath'" or similar import error.

- [ ] **Step 3: Create `mobile/lib/betMath.ts`**

```ts
export type SideCounts = Record<string, number>;

/**
 * Returns true if the bet has any imbalance across declared options.
 * Treats unobserved options (missing from sideCounts) as zero.
 *
 * Examples:
 *   isBetUneven({ yes: 1 }, ["yes", "no"])        → true  (1 vs 0, proposer alone)
 *   isBetUneven({ yes: 1, no: 1 }, ["yes", "no"]) → false (balanced)
 *   isBetUneven({ yes: 2, no: 1 }, ["yes", "no"]) → true
 *   isBetUneven({}, ["yes", "no"])                 → false (all zero = balanced)
 *   isBetUneven({ ... }, [])                       → false (nothing declared to check)
 */
export function isBetUneven(
  sideCounts: SideCounts,
  options: string[]
): boolean {
  if (options.length === 0) return false;

  const counts = options.map((opt) => sideCounts[opt] ?? 0);
  const first = counts[0];
  return counts.some((c) => c !== first);
}
```

- [ ] **Step 4: Run the tests again — all 10 should pass**

```bash
cd /Users/jackbaldner/tilt/mobile && npm test -- __tests__/betMath.test.ts
```

Expected: `Tests 10 passed (10)`.

- [ ] **Step 5: Run the full suite to confirm nothing broke**

```bash
cd /Users/jackbaldner/tilt/mobile && npm test
```

Expected: `Tests 11 passed (11)` (10 betMath + 1 sanity).

- [ ] **Step 6: Commit**

```bash
cd /Users/jackbaldner/tilt
git add mobile/lib/betMath.ts mobile/__tests__/betMath.test.ts
git commit -m "feat(mobile): add isBetUneven helper in betMath.ts"
```

---

## Task 3: Add "Needs Takers" badge to `BetCard.tsx`

**Files:**
- Modify: `mobile/components/bet/BetCard.tsx`

- [ ] **Step 1: Read the existing component**

```bash
cat /Users/jackbaldner/tilt/mobile/components/bet/BetCard.tsx
```

Confirm the current structure has:
- A `BetCardProps` interface (around line 6)
- A top badge row with PENDING / TYPE / YOU badges (around lines 57–106)
- `myEntry` is computed from `bet.sides.find(s => s.userId === currentUserId)`

- [ ] **Step 2: Add `options` to `BetCardProps`**

In `mobile/components/bet/BetCard.tsx`, find the `BetCardProps` interface and add `options?: string[]` to the `bet` object type. The updated interface should look like:

```ts
interface BetCardProps {
  bet: {
    id: string;
    title: string;
    description?: string;
    type: string;
    stake: number;
    totalPot: number;
    resolution: string;
    resolvedOption?: string;
    createdAt: string;
    resolveAt?: string;
    options?: string[];
    proposer?: { id: string; name?: string };
    sides?: Array<{ userId: string; option: string; user?: { name?: string } }>;
    _count?: { comments: number };
  };
  currentUserId?: string;
  onPress: () => void;
}
```

- [ ] **Step 3: Compute `needsTakers` inside the component body**

In `mobile/components/bet/BetCard.tsx`, after the existing `myEntry`/`isResolved`/`isWin`/`isLoss` declarations (around line 34), add:

```ts
import { isBetUneven, type SideCounts } from "@/lib/betMath";
```

(Add this import at the top with the other imports.)

Then inside the component, after the existing computed values:

```ts
  const sideCountsMap: SideCounts = {};
  for (const s of bet.sides ?? []) {
    sideCountsMap[s.option] = (sideCountsMap[s.option] ?? 0) + 1;
  }
  const needsTakers =
    bet.resolution === "pending" &&
    !myEntry &&
    isBetUneven(sideCountsMap, bet.options ?? []);
```

- [ ] **Step 4: Render the badge in the existing badge row**

In the JSX, find the top badge row (currently contains the PENDING/TYPE/YOU badges). Add a new conditional badge AFTER the type badge and BEFORE the `myEntry` badge. The final badge row should look like:

```tsx
      {/* Status + Type badges */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <View
          style={{
            backgroundColor: `${statusColor}20`,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Text style={{ color: statusColor, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>
            {bet.resolution}
          </Text>
        </View>
        <View
          style={{
            backgroundColor: `${typeColor}20`,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Text style={{ color: typeColor, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>
            {bet.type.replace(/_/g, " ")}
          </Text>
        </View>
        {needsTakers && (
          <View
            style={{
              backgroundColor: `${Colors.accent}20`,
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 3,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 11 }}>🎯</Text>
            <Text style={{ color: Colors.accent, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>
              Needs takers
            </Text>
          </View>
        )}
        {myEntry && (
          <View
            style={{
              backgroundColor: isWin
                ? `${Colors.win}25`
                : isLoss
                ? `${Colors.loss}20`
                : `${Colors.primary}20`,
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text
              style={{
                color: isWin ? Colors.win : isLoss ? Colors.loss : Colors.primary,
                fontSize: 11,
                fontWeight: "700",
              }}
            >
              {isWin ? "WON" : isLoss ? "LOST" : `YOU: ${myEntry.option}`}
            </Text>
          </View>
        )}
      </View>
```

Note: only the new `needsTakers && (...)` block is added. The rest of the row is unchanged — match the existing structure exactly to avoid accidentally rewriting unrelated JSX.

- [ ] **Step 5: Type check the change**

```bash
cd /Users/jackbaldner/tilt/mobile && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (empty output, or only pre-existing unrelated warnings).

- [ ] **Step 6: Run the test suite**

```bash
cd /Users/jackbaldner/tilt/mobile && npm test
```

Expected: `Tests 11 passed (11)` (no changes in test count, we didn't add any new tests — React Native rendering isn't unit-tested, it's manually smoke-tested in Task 4).

- [ ] **Step 7: Commit**

```bash
cd /Users/jackbaldner/tilt
git add mobile/components/bet/BetCard.tsx
git commit -m "feat(mobile): add Needs Takers badge to BetCard"
```

---

## Task 4: Manual smoke test on device

**Purpose:** The React Native rendering (colors, positioning, spacing) can't be verified by automated tests. This task is a ~1-minute click-through on the actual app to confirm the badge looks right and hides/shows at the correct times.

- [ ] **Step 1: Ensure Vercel prod has the latest deploy**

Jack's plan is to upgrade Vercel to Pro and redeploy this branch together with the wallet work. If that's already happened, skip to step 2. If not, this smoke test can happen *locally* against the dev server by running:

```bash
cd /Users/jackbaldner/tilt/api && TURSO_DATABASE_URL='<prod url>' TURSO_AUTH_TOKEN='<prod token>' npm run dev
```

And pointing the mobile app at `http://<local IP>:3000`.

- [ ] **Step 2: Reload the mobile app**

In Expo Go or the TestFlight build, reload so the new `BetCard` code is picked up.

- [ ] **Step 3: Create a new bet in a circle**

- Open the app
- Go to an existing circle (or create one)
- Tap "New bet"
- Fill in: title, a stake like 50 chips, two options ("yes" / "no"), proposer picks "yes"
- Submit

- [ ] **Step 4: Verify badge appears**

- Navigate back to the circle's bet feed
- The newly-created bet's card should show THREE badges in its top row:
  - `PENDING`
  - `BINARY`
  - `🎯 NEEDS TAKERS` ← the new one
- The badge should match the existing badge style (same corner radius, similar padding, accent color background)

- [ ] **Step 5: Join from a second test account and verify badge hides**

- Sign in as a second test account (or use a separate device)
- Open the same bet, tap "no", confirm the bet placement
- Go back to the bet feed
- The `🎯 NEEDS TAKERS` badge should be GONE from this bet's card (sides are now 1-1 balanced)

- [ ] **Step 6: Verify badge hides for participants**

- Sign in as the original proposer (who picked "yes")
- Open the same bet feed
- The bet card should NOT show the `NEEDS TAKERS` badge even if sides become uneven later. (Because `!myEntry` is false — the proposer is already in.)

- [ ] **Step 7: Verify badge hides on resolved bets**

- From either account that can resolve (proposer or circle owner), resolve the bet in favor of either side
- Go back to the feed
- The resolved bet's card should NOT show the badge (`bet.resolution !== "pending"`)

- [ ] **Step 8: If any step above fails, DO NOT commit further — report the issue**

Common issues to watch for:
- Badge showing on resolved/voided bets → `bet.resolution === "pending"` check is wrong
- Badge showing when user is already a participant → `!myEntry` check is wrong or `currentUserId` is undefined
- Badge not showing on a 1-vs-0 proposer-alone bet → `isBetUneven` logic bug, or `bet.options` is missing from the API response
- Badge positioned incorrectly (next to the wrong badge, wrapping badly) → JSX ordering bug

If all 7 steps pass, the feature is done.

- [ ] **Step 9: No commit**

This task has no code changes — it's verification only. Do not create an empty commit.

---

## Self-Review Checklist

Before declaring this plan complete, the implementer should verify:

- [ ] `isBetUneven` has all 10 unit tests passing
- [ ] No file outside `mobile/lib/betMath.ts` contains bet-imbalance logic (DRY)
- [ ] `BetCardProps.bet.options` is declared in the TypeScript interface
- [ ] The badge uses `Colors.accent` (matching the spec) and the existing badge style (match the PENDING/BINARY badges)
- [ ] The `needsTakers` condition checks all three rules from the spec: pending resolution, not a participant, imbalanced sides
- [ ] Vitest is only added to `mobile/package.json` as a devDep (not a regular dep)
- [ ] No test was added that requires running React Native (component rendering tests are deliberately deferred to manual smoke test)

# Uneven-Sides UX Design ("Needs Takers" Badge)

**Date:** 2026-04-14
**Status:** Approved (pending spec review)
**Scope:** Mobile UX polish — surface one-sided bets to browsing users via a "Needs takers" badge on bet list cards.

## Goal

Encourage balanced bets within circles by making one-sided bets visually obvious in bet feeds. When a user sees a friend's bet that's missing takers on one side, a small badge makes the imbalance visible at a glance so they can jump in and balance it.

## What Was Cut (And Why)

This design originally included a second feature: an alert-time warning that fired when a user was about to join the heavier side of a bet, telling them they'd "get back less than their stake." **That warning was cut** because the underlying math claim is wrong: with fixed equal stakes, a winner on any non-solo side always takes back more than their stake (they split the full pot, not just the opposing side's chips). There's no case where joining the favorite "loses you money" — it just yields a smaller profit than joining the underdog would have.

The "Needs takers" badge addresses the user's underlying intent — steering people toward the underdog — through a positive nudge on the browsing surface instead of a confusing warning at the moment of commitment. One feature, one clear message, no math errors.

Out of scope for this spec:
- The originally-proposed pre-join warning (dropped for reasons above)
- Projected-payout display anywhere in the app
- Auto-matching browsers to the underdog side
- Blocking joins on the heavier side
- Any API/backend changes

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Badge lives on bet list cards** (`mobile/components/bet/BetCard.tsx`), in the existing top-row badge area alongside `PENDING` / `BINARY` / `YOU: yes`. | Targets the "browsing" mental state — users scanning feeds who haven't committed yet. Single location, single component change. |
| 2 | **Trigger rule: any imbalance when bet is pending.** Shows the badge if any two declared options have different joiner counts (treating unobserved options as 0). | Honest and simple. Includes the "proposer alone" case (1-vs-0) which is the most common one. |
| 3 | **Hidden when:** bet is not `pending`, user is already a participant, all sides are exactly balanced. | Don't show it when it's too late, when the user can't act on it, or when there's nothing to nudge. |
| 4 | **Shared pure-function module: `mobile/lib/betMath.ts`** (even though only one function lives there for now). | Future-proofing — if other bet math functions appear later, they have a home. Also unit-testable without a running app. |
| 5 | **Badge copy: "🎯 NEEDS TAKERS"** using the existing accent color and badge style. | Matches the existing badge pattern (uppercase, tight pill, small icon). Positive framing ("this bet wants you") instead of negative ("don't join this"). |

## Architecture

### New module: `mobile/lib/betMath.ts`

One exported pure function, no React, no DB, no network dependencies.

```ts
export type SideCounts = Record<string, number>;

/**
 * Returns true if the bet has any imbalance across declared options.
 * Treats unobserved options (missing from sideCounts) as zero.
 *
 * Examples:
 *   isBetUneven({ yes: 1 }, ["yes", "no"])          → true  (1 vs 0)
 *   isBetUneven({ yes: 1, no: 1 }, ["yes", "no"])   → false (balanced)
 *   isBetUneven({ yes: 2, no: 1 }, ["yes", "no"])   → true
 *   isBetUneven({}, ["yes", "no"])                   → false (all zero is balanced)
 *   isBetUneven({ yes: 1, no: 1, maybe: 0 }, ...)    → false (all 1 or 0 depending on what "balanced" means here)
 *
 * Implementation: collect the count for each option in `options`
 * (defaulting to 0 if absent from sideCounts). Return true iff any
 * two of those counts differ.
 */
export function isBetUneven(
  sideCounts: SideCounts,
  options: string[]
): boolean;
```

### Badge UX: `mobile/components/bet/BetCard.tsx`

The component currently renders a top row of badges: `PENDING` / `BINARY` / optionally `YOU: yes` / `WON` / `LOST`. We add one more badge to that row, conditionally.

Inside the component body, before the return:

```ts
const counts: SideCounts = {};
for (const s of bet.sides ?? []) {
  counts[s.option] = (counts[s.option] ?? 0) + 1;
}
const needsTakers =
  bet.resolution === "pending" &&
  !myEntry &&
  isBetUneven(counts, bet.options ?? []);
```

Inside the badge row JSX, after the type badge:

```tsx
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
```

### `BetCardProps` interface update

The current `BetCardProps` interface in `BetCard.tsx` doesn't declare `options`. The field is already present on bet data from the API (`bets/route.ts` does `JSON.parse(b.options)`) but TypeScript doesn't know about it. Add it:

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
    options?: string[];                                      // NEW
    proposer?: { id: string; name?: string };
    sides?: Array<{ userId: string; option: string; user?: { name?: string } }>;
    _count?: { comments: number };
  };
  currentUserId?: string;
  onPress: () => void;
}
```

## Testing Strategy

### Unit tests: `mobile/__tests__/betMath.test.ts`

Add Vitest to the `mobile/` workspace (mirror the `api/` setup from the earlier wallet work). Write tests for `isBetUneven`:

- `isBetUneven({}, ["yes", "no"])` → `false` (all zero = balanced)
- `isBetUneven({ yes: 1 }, ["yes", "no"])` → `true` (1 vs 0, proposer-alone case)
- `isBetUneven({ yes: 1, no: 1 }, ["yes", "no"])` → `false`
- `isBetUneven({ yes: 2, no: 1 }, ["yes", "no"])` → `true`
- `isBetUneven({ yes: 2, no: 2 }, ["yes", "no"])` → `false`
- 3-option: `isBetUneven({ a: 1, b: 1, c: 1 }, ["a", "b", "c"])` → `false`
- 3-option: `isBetUneven({ a: 2, b: 1, c: 1 }, ["a", "b", "c"])` → `true`
- 3-option: `isBetUneven({ a: 1, b: 1 }, ["a", "b", "c"])` → `true` (c=0, imbalanced)
- Missing options array edge case: `isBetUneven({ yes: 1, no: 1 }, [])` → `false` (no declared options, nothing to check)

### Manual smoke test (on a real device, ~1 minute)

1. Create a new bet with your test account; pick "yes" at any stake.
2. Go back to the circle's bet feed.
3. The new bet's card should show a `🎯 NEEDS TAKERS` badge in its top row.
4. Sign in with your second test account, join the same bet on "no".
5. Refresh the feed. The badge should DISAPPEAR (sides now balanced 1-1).
6. Have a third account join "yes" (or just hit "yes" again from the second account if the first didn't claim it).
7. Badge should REAPPEAR (now 2-1 imbalance).
8. Sign in as the user who's already a participant. The badge should NOT show on that bet from their view (they're already in, can't take it further).
9. Resolve the bet. Badge should NOT show (bet is no longer pending).

### What's not tested

- React Native rendering correctness (positioning, colors) — caught by the smoke test, not worth automated RN UI testing for 20 lines of JSX.
- The `currentUserId` prop being missing — if it's undefined, `myEntry` is falsy, badge still shows correctly (the user isn't a participant). That's the desired behavior for unauthenticated contexts.

## Out of Scope (for this spec)

- **Pre-join warnings** of any kind. Cut after spec review found the math error.
- **Projected-payout displays** in the bet detail screen.
- **Server-side changes.** The existing `/api/bets/*` endpoints already return everything the badge needs (`sides`, `options`, `resolution`).
- **Cancellation flow** — separate deferred feature from the wallet spec, still TBD.
- **Other mobile polish** (empty states, error handling, toasts beyond what exists) — tracked separately.

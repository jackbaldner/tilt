# Bet Modes, Side-Locking, and Custom Options Design

**Date:** 2026-04-15
**Status:** Approved (pending spec review)
**Scope:** Distinguish 1:1 challenges from group bets, lock challenged friends to the opposite side in 1:1 mode, support customizable and multi-option bet labels, and scrub all `__private__` circle plumbing from user-facing UI.

## Background

Two related product problems surfaced in the same session:

1. **Same-side bug in 1:1 challenges.** When Lexi sent Jack a 1:1 challenge ("I miss you most today") and picked "Yes", Jack was able to also pick "Yes" — so both users ended up on the same side and the bet became nonsensical. The current join flow has no rule preventing this because there's no distinction between 1:1 bets and group bets at the join layer.

2. **Yes/No labels are too rigid.** For bets like "Lakers vs Nuggets" or "Will Andrew be late to the party?", users want to customize the option labels. For bets like a March Madness pool, they want more than two options. The backend already handles N-winner math and the mobile app's `BET_TYPE_CONFIG` already has a `multiple_choice` type; the gap is purely in the web bet creation form which hardcodes `["Yes", "No"]`.

A third concern ("the `__private__` circle leaks into the UI when you navigate to its detail page") is folded into this spec because it's directly related to the 1:1 framing: the fix for that bug is to hide `__private__` circles from every user-facing surface, which is exactly what the "1:1 challenges are the primary experience, circles are ancillary plumbing" product principle demands.

## Goals

1. **1:1 challenges feel like a direct personal interaction.** "Lexi challenged you on X — accept?" No circle chrome, no "you're in the Jack vs Lexi circle" framing. The `__private__` circle that backs a 1:1 is plumbing the user never sees.
2. **Challenged friends cannot accidentally take the same side as the proposer.** The bet detail UI makes it visually obvious which side is taken and which is available.
3. **Bet labels are customizable.** Default to `Yes / No`, but let the proposer rename them (`Lakers / Nuggets`) or add more options in group mode (March Madness pool style).
4. **No new database columns.** All of this is implementable with the existing schema (`Circle.name` for the `__private__` marker, `Bet.options` as the JSON options array).
5. **The backend is the source of truth for every rule.** Client-side enforcement is polish; server validation is correctness.

## Product Principle

> Circles are ancillary. 1:1 is primary. More social = better.

Every design choice in this spec follows from this framing: the 1:1 path is the main experience, and the `__private__` circle is pure plumbing that users should never see or interact with.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Bet mode (`1:1` vs `group`) is derived from the bet's circle, not stored on the bet row.** A bet is 1:1 iff its `Circle.name` starts with `__private__`. Otherwise it's group. | Zero new columns. The existing `__private__` convention is reused. Client cannot lie to the server about mode — the rule is server-enforced via circle lookup. |
| 2 | **Mode is selected implicitly via the recipient picker.** Picking a specific friend → 1:1 (auto-creates or reuses the `__private__` circle). Picking "Anyone" → group, no circle. Creating from a circle page → that circle, group mode. | Matches natural intent ("if I pick Lexi, this is for Lexi"). No explicit mode toggle needed in the UI. Avoids adding a new UI concept. |
| 3 | **In 1:1 mode, both option cards are shown on the bet detail page.** The proposer's side is marked as taken (avatar, muted, non-tappable). The other side is highlighted and clickable. User taps to accept, confirmation alert fires, join submits. | User ("jack") explicitly picked this over the auto-accept one-button version because "you should have to click on No just so it's crystal clear." Explicit > magic. |
| 4 | **1:1 bets are strictly binary** (exactly 2 options). Enforced server-side on create. | "Opposite side" only makes sense with 2 options. Multi-option 1:1 is a confusing edge case (e.g., "which of 3 options does the friend take?") that has no clear user need. |
| 5 | **Group bets can have 2 to 20 options.** Users customize labels (`Lakers / Nuggets`), add more (`Lakers / Nuggets / Draw`), or remove any as long as ≥2 remain. | User gave the March Madness pool as the motivating use case. Backend already supports N winners via `resolveBetInTx`. |
| 6 | **Option labels are case-insensitive deduped and capped at 50 characters.** Empty-after-trim rejected. | Prevents `Lakers / lakers` confusion and oversized labels breaking the UI. |
| 7 | **`__private__` circles are invisible in every user-facing surface.** Dashboard, circle detail page, bet detail breadcrumb, list endpoints, notification bodies — anywhere `circle.name` would render, it's replaced with a friendly display name (`description` field, or constructed from member names). Navigation to `/circle/<private-id>` redirects to the single bet inside or back to the friend. | Directly addresses user's "that circle name is messed up in the app" complaint. Aligns with the "circles are ancillary" product principle. |
| 8 | **Existing bad-state bets are not migrated destructively.** The "I miss you most today" bet (both users on Yes) remains in the DB. Trying to resolve it with "No wins" will hit the new `tie_refund` path. Trying to resolve it with "Yes wins" will split the pot evenly between both Yes-side users (net zero). Either way, it resolves harmlessly under the new rules. | Migration is risk; the bet is already harmless post-C1/C2 fixes. User can choose to run a one-off cleanup if they want the circle completely gone. |
| 9 | **Shared pure helpers for cross-platform consistency.** New `api/lib/circleDisplay.ts` (web) + `mobile/lib/circleDisplay.ts` (mirror) for the `__private__` → friendly name transform. New `api/lib/betValidation.ts` + mirror for options array validation. Same "mirror + unit-test both" pattern as `betMath.ts` from yesterday. | Keeps web and mobile in lockstep. Pure functions are unit-testable without the DB. |

## Architecture

### Data model

**No schema changes.** This spec is entirely implementable with the existing tables:

- `Circle.name` starting with `__private__` marks the 1:1 plumbing circle (existing convention)
- `Circle.description` holds the friendly display name (existing, auto-populated at creation time by the friend-challenge route as `"${auth.name} vs ${friend.name}"`)
- `Bet.options` is a JSON array of option labels (existing)
- `BetSide.option` is the option label a user picked (existing)

### New modules

**`api/lib/circleDisplay.ts`** — pure functions for rendering circle names safely:

```ts
export function isPrivateCircleName(name: string): boolean {
  return name.startsWith("__private__");
}

export interface CircleDisplay {
  name: string;
  isPrivate: boolean;
}

export function resolveCircleDisplay(circle: {
  name: string;
  description?: string | null;
  members?: Array<{ userId: string; user?: { name?: string | null } }>;
}, currentUserId?: string): CircleDisplay {
  const isPrivate = isPrivateCircleName(circle.name);
  if (!isPrivate) return { name: circle.name, isPrivate: false };
  if (circle.description?.trim()) return { name: circle.description, isPrivate: true };
  const other = circle.members?.find((m) => m.userId !== currentUserId);
  if (other?.user?.name) return { name: `Challenge with ${other.user.name}`, isPrivate: true };
  return { name: "Friend challenge", isPrivate: true };
}
```

Mirrored at `mobile/lib/circleDisplay.ts` — identical source. Kept in sync manually (same pattern as `betMath.ts`).

**`api/lib/betValidation.ts`** — pure options-array validation:

```ts
export interface OptionsValidationError {
  message: string;
}

export function validateOptionsArray(
  options: unknown,
  opts: { requireExactly?: number } = {}
): { ok: true; normalized: string[] } | { ok: false; error: string } {
  if (!Array.isArray(options)) {
    return { ok: false, error: "Options must be an array" };
  }
  const trimmed: string[] = [];
  const seen = new Set<string>();
  for (const raw of options) {
    if (typeof raw !== "string") return { ok: false, error: "Each option must be a string" };
    const t = raw.trim();
    if (!t) return { ok: false, error: "Option labels cannot be empty" };
    if (t.length > 50) return { ok: false, error: "Option labels cannot exceed 50 characters" };
    const key = t.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `Duplicate option: "${t}"` };
    seen.add(key);
    trimmed.push(t);
  }
  if (trimmed.length < 2) return { ok: false, error: "At least 2 options are required" };
  if (trimmed.length > 20) return { ok: false, error: "At most 20 options are allowed" };
  if (opts.requireExactly !== undefined && trimmed.length !== opts.requireExactly) {
    return { ok: false, error: `This bet type requires exactly ${opts.requireExactly} options` };
  }
  return { ok: true, normalized: trimmed };
}
```

Mirrored at `mobile/lib/betValidation.ts`.

### Modified API routes

**`/api/bets` POST** — tightened validation:

1. Run `validateOptionsArray(body.options)`. If error, return 400 with the error message.
2. If `circleId` was provided, look up the circle. If it's `__private__`, re-run `validateOptionsArray` with `requireExactly: 2` and return 400 if it fails.
3. Reject any `body.name` (for circles) that starts with `__private__`.
4. Continue with the existing atomic `interactiveTransaction` (Bet INSERT + `joinBetInTx` + Activity + UserStats bump). No changes to that block.

**`/api/bets/[id]/sides` POST** — new side-lock rule:

1. Load the bet and its circle (existing).
2. Parse `body.option`, validate it's in `bet.options` (existing).
3. **NEW:** If `circle.name.startsWith("__private__")`, run a query: `SELECT COUNT(*) FROM BetSide WHERE betId = ? AND option = ?`. If count > 0, reject with 409 and error: `"That side is already taken in this 1:1 challenge"`.
4. Continue with the existing `interactiveTransaction` (joinBetInTx + totalPot + Activity + UserStats + Notification).

**`/api/circles/[id]` GET** — return friendly display:

- Compute `{ name, isPrivate }` via `resolveCircleDisplay(circle, currentUserId)`.
- Return circle with the resolved `name` overriding the raw one. Optionally add `isPrivate: true` as an explicit field for clients that want to branch on it.
- Preserve the raw name in `_rawName` for internal debugging if needed.

**`/api/circles` GET** — filter OR transform private circles:

- Currently returns all circles the user is in, including `__private__` ones.
- Change: exclude `__private__` circles from the response entirely. The dashboard already filters them client-side, but the API should do it too for consistency.
- Alternative: return them but with friendly names, and let clients decide. I prefer full exclusion because the "1:1 is not a circle" product framing says users shouldn't see these as circles at all.

**`/api/friends` GET** — no changes, but the client will start showing "Active challenges with {friend}" inline per friend as a follow-up (out of scope for this spec).

### Frontend changes

**`api/app/(app)/bet/new/page.tsx`** — the bet creation form:

- Add state: `options: string[]` (default `["Yes", "No"]`), `optionEdits: Record<number, string>` for inline edits.
- Replace the hardcoded Yes/No section with the new Options editor:
  - A vertical list of `<input type="text">` rows, one per option. Each shows a small × button to remove (disabled when `options.length === 2`).
  - A "+ Add option" button below the list, hidden when `selectedFriend !== null` (1:1 mode) or when `options.length >= 20`.
- The existing "Your side" radio list regenerates automatically from `options`.
- When the user clicks a specific friend, if `options.length > 2`, show an inline nudge: *"1:1 challenges are binary. Remove extra options or switch to 'Anyone'."*
- The POST body includes the current `options` array (instead of the hardcoded `["Yes", "No"]`).
- Validation on submit: reuse `validateOptionsArray` client-side so the user sees the error inline without a round-trip.

**`api/app/(app)/bet/[id]/page.tsx`** — the bet detail / join page:

- Compute `isPrivate` from the bet's circle (via the API's `isPrivate` field or `resolveCircleDisplay`).
- If `isPrivate` and the viewer is not the proposer and hasn't joined:
  - For each option card, compute `takenBy = sides.find(s => s.option === option)`.
  - If `takenBy` exists, render the card in a muted "taken" style: reduced opacity, show `takenBy.user.name`'s avatar and name, disable the `onClick` (or show a toast on tap: "That side is already taken").
  - If `takenBy` is null, render the card highlighted with a "Your side →" label and the normal tap behavior.
- If `isPrivate` and the viewer is the proposer: show both cards in their normal view-only proposer state.
- If `!isPrivate` (group bet): the current rendering is unchanged — both cards are tappable to join either side.
- The top of the bet detail page: if `isPrivate`, replace the "posted in {circle.name}" breadcrumb with a "Challenge from {proposer.name}" header. Hide the circle emoji chip.

**`api/app/(app)/circle/[id]/page.tsx`** — the circle detail page:

- On load, check `circle.isPrivate`. If true:
  - **If the circle has exactly 1 bet** (the common case), redirect to `/bet/<that-bet-id>`.
  - **If the circle has 0 bets** (shouldn't happen but possible from a bad state), redirect to `/friends`.
  - **If the circle has 2+ bets** (historical friend-challenge circles), redirect to `/friends` showing all bets with that friend.
- If `!isPrivate`, render the existing circle detail view unchanged.

**`api/app/(app)/dashboard/page.tsx`** — already filters `__private__` circles from "Your circles" (from yesterday's work). No additional changes needed since the API change also excludes them from `/api/circles`.

**`api/app/(app)/friends/page.tsx`** — no changes in this spec, but noted as a future enhancement: show "Active challenges with {friend}" per friend row, linking to the bet detail page directly. This would fully bypass the `__private__` circle as a navigation concept.

### Mobile mirror changes

All mobile changes mirror the web exactly:

- `mobile/lib/circleDisplay.ts` — new file, identical to `api/lib/circleDisplay.ts`.
- `mobile/lib/betValidation.ts` — new file, identical to `api/lib/betValidation.ts`.
- `mobile/app/bet/create.tsx` — options editor matching the web.
- `mobile/app/bet/[id].tsx` — side-lock UI for 1:1 bets.
- `mobile/app/circle/[id].tsx` — private circle redirect logic.
- `mobile/components/bet/BetCard.tsx` — uses `resolveCircleDisplay` for any circle context.

## Error Handling

- **Options validation errors on create**: API returns 400, web form shows inline error text next to the Options section. Submit button stays disabled until cleared.
- **Taken-side errors on join**: API returns 409 with a clear message. Client shows a toast and re-fetches the bet to sync state.
- **Private circle navigation edge cases**: if redirect target doesn't exist (e.g., friend deleted their account, bet was purged), fall back to `/dashboard` with a toast.
- **Network failures during options editing**: the form state is held locally; only submission hits the network, so intermediate edits never fail.

## Testing Strategy

### Unit tests (new files)

1. **`api/__tests__/circleDisplay.test.ts`** — `resolveCircleDisplay`:
   - Non-private circle → returns `name` as-is, `isPrivate: false`
   - Private circle with `description` → returns `description`
   - Private circle without `description` but with `members` → returns "Challenge with {other user's name}"
   - Private circle with no `description` and no `members` → returns "Friend challenge"
   - Private circle with `currentUserId` pointing at the only member → falls through to "Friend challenge"
   - `isPrivateCircleName` recognizes "`__private__abc`" but not "`__privater__`", "`My __private__ circle`", "`private`", etc.

2. **`api/__tests__/betValidation.test.ts`** — `validateOptionsArray`:
   - Empty array → error "At least 2 options"
   - 1-element array → error "At least 2 options"
   - 2-element valid → ok with normalized
   - 20-element valid → ok
   - 21-element → error "At most 20 options"
   - Duplicate case-insensitive → error
   - Whitespace-only label → error "empty"
   - 51-char label → error "50 characters"
   - `requireExactly: 2` with 3 options → error
   - `requireExactly: 2` with 2 options → ok
   - Trimming: `"  Yes  "` normalizes to `"Yes"`

3. **`api/__tests__/wallet/sideLock.test.ts`** — side-lock rule:
   - Create a private circle (`__private__ab__cd`) + a bet in it + one side filled by proposer. Try to join that same side as the other user → expect 409 / error.
   - Same scenario, join the OTHER side → succeeds.
   - Create a normal (non-private) circle bet, both users join the same side → succeeds (no lock in group mode).
   - The test goes through `joinBet` (the public top-level wrapper), not `joinBetInTx`, since the rule is enforced at the route layer. Actually, the rule should live either at the route or at a new helper that the route calls; tests exercise the helper.

4. **`api/__tests__/resolve-outcome.test.ts`** — extend existing file:
   - 3-option bet with 2 takers on one option → `resolve` outcome
   - 3-option bet where the winning option has no takers → `tie_refund`
   - 4-option bet where only 1 distinct user has joined → `lone_joiner_refund`

5. **Update `api/__tests__/wallet/multiWinnerStats.test.ts`** — add:
   - 3 winners with equal stakes on a 4-option bet → each gets pot/3, earliest gets remainder
   - 5 winners with unequal distribution across 4 options → correct split

### Manual smoke test (post-deploy)

Run against `api-three-vert-96.vercel.app`:

1. **1:1 side-lock positive path**: Create two accounts, become friends. Account A creates a 1:1 challenge against B with custom labels "Lakers / Nuggets" and picks "Lakers". Account B opens the bet → sees both cards, Lakers shows A's avatar as taken and is not tappable, Nuggets highlighted. Tap Nuggets → confirmation → bet joined.
2. **1:1 side-lock server enforcement**: Without using the UI, curl the sides endpoint attempting to join A's side. Expect 409.
3. **1:1 binary enforcement on create**: Via curl, POST to `/api/bets` with `circleId` pointing at a private circle and `options: ["a", "b", "c"]`. Expect 400.
4. **Custom labels group bet**: Account A creates a group bet with options "Red / Green / Blue", picks "Red". Accounts B and C join "Green" and "Blue" respectively. Account A resolves as "Blue" → C wins full pot, A and B lose stakes, stats recorded correctly.
5. **March Madness pool**: Account A creates a group bet with 8 options (names), picks one. Other accounts join various options. Resolve as one option → that user wins the pot.
6. **`__private__` invisibility**: Navigate directly to `https://...vercel.app/circle/<any private circle id>`. Expect redirect to the single bet inside OR to the friend profile. Expect NO raw `__private__...` string to appear anywhere in the DOM. Check the profile/transactions/notifications responses — none should contain the raw name.
7. **Reconciliation**: `reconcileAll()` returns `{ ok: true, invariantHolds: true, sum: 0 }`.

### Test cleanup

All smoke-test data (users, circles, bets, wallets, ledger entries) gets torn down via the same cleanup pattern used yesterday. Mint wallet credited back for any granted chips. Final reconciliation confirms invariant.

## Rollout

Single deploy from `cd api && vercel --prod`. No schema migration. No user-visible downtime. The only risk is the `__private__` UI rewrite inadvertently hiding something that should be visible — tests + manual smoke test catch that.

**If something breaks in prod post-deploy:** `git revert` the commit and redeploy. All changes are code-level, no DB changes, rollback is safe.

## Out of Scope

- **Decline flow.** The friend can still "decline" a 1:1 bet by ignoring it. An explicit Decline button that voids the bet and refunds the proposer is a future enhancement if users ask for it.
- **Multi-option 1:1 challenges.** Ruled out by design (1:1 is binary).
- **Reordering options** in the bet creation form. Users add them in order and that's the order they render. Drag-to-reorder is a future enhancement.
- **Removing the `__private__` circle hack entirely.** A future refactor could store 1:1 bets with `circleId = null` and a dedicated `challengedUserId`, dropping the hidden circle plumbing altogether. That's a bigger refactor with data migration, and the UI cleanup in this spec already achieves the user-facing goal.
- **Friends page redesign** showing "Active challenges with {friend}". Noted as a natural follow-up; not shipping here.
- **Destructive cleanup of the specific historical bad bet** ("I miss you most today"). Offered as an optional one-off script, not in the code changes.

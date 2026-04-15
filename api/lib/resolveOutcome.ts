/**
 * Pure function deciding what should happen when someone tries to resolve
 * a bet. Extracted from the resolve route so it can be unit-tested without
 * dragging in DB / wallet dependencies.
 *
 * Three possible outcomes:
 *
 *   - `lone_joiner_refund`: fewer than 2 distinct participants. There's
 *     nobody for the proposer to actually bet against, so everyone
 *     (i.e. the single joiner) gets refunded.
 *
 *   - `tie_refund`: 2+ participants exist but nobody picked the winning
 *     option the proposer named. Treated as a push — everyone refunded.
 *
 *   - `resolve`: the normal path. The winning option has at least one
 *     taker and there are at least 2 distinct users in the bet.
 */
export type ResolveOutcome =
  | { kind: "lone_joiner_refund" }
  | { kind: "tie_refund" }
  | { kind: "resolve" };

export function decideOutcome(
  distinctUserCount: number,
  distinctOptionsTaken: string[],
  winningOption: string
): ResolveOutcome {
  if (distinctUserCount < 2) return { kind: "lone_joiner_refund" };
  if (!distinctOptionsTaken.includes(winningOption)) return { kind: "tie_refund" };
  return { kind: "resolve" };
}

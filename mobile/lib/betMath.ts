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

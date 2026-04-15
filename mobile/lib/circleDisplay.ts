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
 * This is the MIRROR of `api/lib/circleDisplay.ts` — keep in sync manually.
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

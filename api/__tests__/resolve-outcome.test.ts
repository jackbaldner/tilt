import { describe, it, expect } from "vitest";
import { decideOutcome } from "../lib/resolveOutcome";

/**
 * Pure function tests for the bet resolution outcome decision tree.
 * This is the logic that used to be wrong in the resolve route:
 * refund branches were running the "you won!" bookkeeping anyway.
 */

describe("decideOutcome", () => {
  it("returns lone_joiner_refund when only one user has joined", () => {
    expect(decideOutcome(1, ["yes"], "yes")).toEqual({ kind: "lone_joiner_refund" });
  });

  it("returns lone_joiner_refund when zero users have joined", () => {
    // Shouldn't normally happen — creation requires the proposer to join —
    // but defend against it rather than silently running resolve math
    // against an empty bet.
    expect(decideOutcome(0, [], "yes")).toEqual({ kind: "lone_joiner_refund" });
  });

  it("returns tie_refund when 2+ users joined but the winning option has no takers", () => {
    // Two users both picked "yes", but the proposer tried to resolve "no" as the winner
    expect(decideOutcome(2, ["yes"], "no")).toEqual({ kind: "tie_refund" });
  });

  it("returns resolve when 2+ users and the winning option has at least one taker", () => {
    expect(decideOutcome(2, ["yes", "no"], "yes")).toEqual({ kind: "resolve" });
    expect(decideOutcome(2, ["yes", "no"], "no")).toEqual({ kind: "resolve" });
  });

  it("returns resolve for a 3-option bet where the winning option has a taker", () => {
    expect(decideOutcome(3, ["red", "green", "blue"], "red")).toEqual({ kind: "resolve" });
    expect(decideOutcome(3, ["red", "blue"], "blue")).toEqual({ kind: "resolve" });
  });

  it("returns tie_refund for a 3-option bet where the winning option has no takers", () => {
    expect(decideOutcome(3, ["red", "blue"], "green")).toEqual({ kind: "tie_refund" });
  });

  it("treats the user count check as the primary gate", () => {
    // Even if the winning option matches a side, if only 1 user joined,
    // it's still a lone-joiner refund (they're the only participant)
    expect(decideOutcome(1, ["yes"], "yes")).toEqual({ kind: "lone_joiner_refund" });
  });
});

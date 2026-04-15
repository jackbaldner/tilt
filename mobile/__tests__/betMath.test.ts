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
    expect(isBetUneven({ yes: 1, no: 1, foo: 5 }, ["yes", "no"])).toBe(false);
  });

  it("returns false for a single-option bet (nothing to be uneven against)", () => {
    expect(isBetUneven({ a: 3 }, ["a"])).toBe(false);
  });
});

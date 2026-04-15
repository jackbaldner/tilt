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

  it("handles null and undefined safely", () => {
    expect(isPrivateCircleName(null)).toBe(false);
    expect(isPrivateCircleName(undefined)).toBe(false);
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

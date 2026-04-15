import { describe, it, expect } from "vitest";
import { validateOptionsArray } from "@/lib/betValidation";

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

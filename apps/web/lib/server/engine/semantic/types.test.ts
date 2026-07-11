import { describe, expect, test } from "vitest";
import { GROUNDED_CRITERIA, sanitizeSemantic } from "./types";

const SEGS = ["Seg A", "Seg B"];

describe("sanitizeSemantic", () => {
  test("clamps in-range scores and keeps rationales", () => {
    const raw = {
      segments: {
        "Seg A": { solution_fit: { score: 0.7, rationale: "fits" }, need_intensity: { score: 0.5, rationale: "" } },
      },
      real_alternatives_considered: ["Foo", "Bar"],
    };
    const m = sanitizeSemantic(raw, SEGS)!;
    expect(m.segments["Seg A"].scores.solution_fit).toBe(0.7);
    expect(m.segments["Seg A"].rationales.solution_fit).toBe("fits");
    expect(m.real_alternatives_considered).toEqual(["Foo", "Bar"]);
    expect(m.source).toBe("fallback_formulas"); // caller overrides; default is neutral
  });

  test("out-of-range and non-finite scores are dropped, not clamped silently into a lie", () => {
    const raw = { segments: { "Seg A": {
      solution_fit: { score: 1.4 }, need_intensity: { score: NaN }, differentiation: { score: -0.2 },
      workflow_fit: { score: 0.6 },
    } } };
    const m = sanitizeSemantic(raw, SEGS)!;
    expect(m.segments["Seg A"].scores.solution_fit).toBeUndefined();
    expect(m.segments["Seg A"].scores.need_intensity).toBeUndefined();
    expect(m.segments["Seg A"].scores.differentiation).toBeUndefined();
    expect(m.segments["Seg A"].scores.workflow_fit).toBe(0.6);
  });

  test("non-grounded criteria are ignored even if present", () => {
    const raw = { segments: { "Seg A": { trust: { score: 0.9 }, solution_fit: { score: 0.5 } } } };
    const m = sanitizeSemantic(raw, SEGS)!;
    expect(m.segments["Seg A"].scores.trust).toBeUndefined();
    expect(m.segments["Seg A"].scores.solution_fit).toBe(0.5);
  });

  test("unknown segment keys are dropped; only expected segments survive", () => {
    const raw = { segments: { "Ghost": { solution_fit: { score: 0.5 } }, "Seg A": { solution_fit: { score: 0.4 } } } };
    const m = sanitizeSemantic(raw, SEGS)!;
    expect(m.segments["Ghost"]).toBeUndefined();
    expect(m.segments["Seg A"].scores.solution_fit).toBe(0.4);
  });

  test("returns null when the object has no usable segments field", () => {
    expect(sanitizeSemantic({ nope: 1 }, SEGS)).toBeNull();
    expect(sanitizeSemantic("string", SEGS)).toBeNull();
    expect(sanitizeSemantic(null, SEGS)).toBeNull();
  });

  test("GROUNDED_CRITERIA is exactly the five grounded criteria", () => {
    expect([...GROUNDED_CRITERIA]).toEqual([
      "solution_fit", "need_intensity", "differentiation", "workflow_fit", "problem_awareness",
    ]);
  });
});

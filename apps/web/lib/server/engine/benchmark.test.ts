import { describe, expect, test } from "vitest";
import { spearman, outcomeRank, failureModeHitRate, withinCategoryInversions } from "./benchmark";

describe("benchmark metrics", () => {
  test("spearman is 1 for perfectly concordant ranks", () => {
    expect(spearman([1, 2, 3, 4], [0.1, 0.2, 0.3, 0.9])).toBeCloseTo(1, 6);
  });
  test("spearman is -1 for perfectly discordant ranks", () => {
    expect(spearman([1, 2, 3, 4], [0.9, 0.3, 0.2, 0.1])).toBeCloseTo(-1, 6);
  });
  test("outcomeRank maps hit>moderate>flop", () => {
    expect(outcomeRank("hit")).toBe(2);
    expect(outcomeRank("moderate")).toBe(1);
    expect(outcomeRank("flop")).toBe(0);
  });
  test("failureModeHitRate counts a hit when any known mode is in top blockers", () => {
    const rate = failureModeHitRate([
      { known: ["pricing_acceptance"], topBlockers: ["pricing_acceptance", "trust"] },
      { known: ["differentiation"], topBlockers: ["trust", "workflow_fit"] },
    ]);
    expect(rate).toBeCloseTo(0.5, 6);
  });
  test("withinCategoryInversions counts flop-over-hit only within a category", () => {
    const rows = [
      { category: "b2b_saas", score: 0.3, rank: 2 }, // a hit scored low
      { category: "b2b_saas", score: 0.6, rank: 0 }, // a flop scored high → 1 inversion
      { category: "consumer_app", score: 0.5, rank: 2 },
    ];
    expect(withinCategoryInversions(rows)).toBe(1);
  });
  test("spearman averages tied ranks (correlation over a tied dimension)", () => {
    // b has a tie at the top two positions; correlation should be well-defined and < 1
    const r = spearman([1, 2, 3, 4], [0.1, 0.5, 0.5, 0.9]);
    expect(r).toBeCloseTo(0.9486833, 5); // rankdata([.1,.5,.5,.9]) = [1,2.5,2.5,4]
  });
  test("spearman returns 0 for length mismatch and n<2", () => {
    expect(spearman([1, 2, 3], [1, 2])).toBe(0);
    expect(spearman([1], [1])).toBe(0);
  });
  test("spearman returns 0 when one side is all ties (zero variance)", () => {
    expect(spearman([1, 2, 3], [5, 5, 5])).toBe(0);
  });
  test("withinCategoryInversions and failureModeHitRate handle empty input", () => {
    expect(withinCategoryInversions([])).toBe(0);
    expect(failureModeHitRate([])).toBe(1); // vacuous truth
  });
});

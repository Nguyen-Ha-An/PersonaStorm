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
});

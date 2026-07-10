import { describe, expect, test } from "vitest";
import { TRAIT_ORDER, DEFAULT_CORRELATIONS, buildCholesky, applyCholesky } from "./correlation";

describe("correlation", () => {
  test("TRAIT_ORDER covers exactly the 7 persona traits", () => {
    expect(TRAIT_ORDER).toEqual([
      "price_sensitivity", "skepticism", "novelty_seeking", "brand_trust",
      "social_influence", "risk_tolerance", "privacy_sensitivity",
    ]);
  });

  test("default correlations produce a valid Cholesky factor", () => {
    const L = buildCholesky(DEFAULT_CORRELATIONS, "test");
    expect(L.length).toBe(7);
    // L·Lᵀ diagonal must be 1 (unit variances preserved).
    for (let i = 0; i < 7; i++) {
      let d = 0;
      for (let k = 0; k <= i; k++) d += L[i][k] * L[i][k];
      expect(d).toBeCloseTo(1, 6);
    }
  });

  test("unverified pairs are shrunk toward zero", () => {
    const L = buildCholesky([["price_sensitivity", "skepticism", 0.8, "unverified"]], "test");
    // Realized correlation = L[1][0] (row skepticism, col price_sensitivity) = 0.8 × 0.5.
    expect(L[1][0]).toBeCloseTo(0.4, 6);
  });

  test("sourced pairs are not shrunk", () => {
    const L = buildCholesky([["price_sensitivity", "skepticism", 0.8, "sourced"]], "test");
    expect(L[1][0]).toBeCloseTo(0.8, 6);
  });

  test("non-positive-definite matrix throws with preset name", () => {
    const bad: [string, string, number, "sourced"][] = [
      ["price_sensitivity", "skepticism", 0.95, "sourced"],
      ["skepticism", "novelty_seeking", 0.95, "sourced"],
      ["price_sensitivity", "novelty_seeking", -0.95, "sourced"],
    ];
    expect(() => buildCholesky(bad, "sea_genz")).toThrow(/sea_genz/);
  });

  test("unknown trait name throws", () => {
    expect(() => buildCholesky([["not_a_trait", "skepticism", 0.3, "sourced"]], "test")).toThrow(/not_a_trait/);
  });

  test("applyCholesky with identity returns input", () => {
    const L = buildCholesky([], "test");
    const z = [0.1, -0.5, 1.2, 0, 0.3, -1, 2];
    expect(applyCholesky(L, z).map((v) => Math.round(v * 1e9) / 1e9)).toEqual(z);
  });
});

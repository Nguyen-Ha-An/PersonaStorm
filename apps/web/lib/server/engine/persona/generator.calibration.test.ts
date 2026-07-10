import { describe, expect, test } from "vitest";
import { PersonaGenerator } from "./generator";
import { TRAIT_ORDER } from "./correlation";

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

describe("calibrated generator", () => {
  test("returns priorsMeta and stays deterministic per seed", () => {
    const a = new PersonaGenerator(42).generate("sea_genz", 100);
    const b = new PersonaGenerator(42).generate("sea_genz", 100);
    expect(a.priorsMeta.source).toMatch(/data_files|embedded_unverified/);
    expect(a.personas.map((p) => p.price_sensitivity)).toEqual(b.personas.map((p) => p.price_sensitivity));
  });

  test("declared correlations are realized in the sampled population", () => {
    // DEFAULT_CORRELATIONS: novelty↔risk 0.4 unverified → effective 0.2.
    const { personas } = new PersonaGenerator(7).generate("us_smb", 1000);
    const r = pearson(personas.map((p) => p.novelty_seeking), personas.map((p) => p.risk_tolerance));
    // clip() attenuates; assert direction + rough magnitude.
    expect(r).toBeGreaterThan(0.08);
    expect(r).toBeLessThan(0.4);
  });

  test("diversity report includes coherence", () => {
    const { report } = new PersonaGenerator(7).generate("parents", 300);
    expect(report.coherence).toBeGreaterThan(0.9);
    expect(report.coherence).toBeLessThanOrEqual(1);
  });
});

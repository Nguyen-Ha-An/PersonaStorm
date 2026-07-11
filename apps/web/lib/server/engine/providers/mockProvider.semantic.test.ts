import { describe, expect, test } from "vitest";
import { MockPersonaProvider } from "./mockProvider";
import { PersonaGenerator } from "../persona/generator";
import type { SemanticMatrix } from "../semantic/types";

const STIMULUS = "A planning tool for teams. $12/mo. Free trial.";

function matrixFor(segment: string, solutionFit: number): SemanticMatrix {
  return {
    segments: { [segment]: { scores: { solution_fit: solutionFit }, rationales: {} } },
    real_alternatives_considered: [],
    source: "nvidia",
  };
}

describe("semantic blend", () => {
  test("a high semantic solution_fit raises the persona's solution_fit vs no matrix", async () => {
    const { personas } = new PersonaGenerator(5).generate("us_smb", 1);
    const p = personas[0];
    const provider = new MockPersonaProvider(5);
    const base = await provider.react(p, STIMULUS, "product_concept", null, "b2b_saas", null);
    const boosted = await provider.react(p, STIMULUS, "product_concept", null, "b2b_saas", matrixFor(p.segment, 0.95));
    expect(boosted.criteria_scores.solution_fit).toBeGreaterThan(base.criteria_scores.solution_fit);
  });

  test("a low semantic solution_fit lowers it", async () => {
    const { personas } = new PersonaGenerator(5).generate("us_smb", 1);
    const p = personas[0];
    const provider = new MockPersonaProvider(5);
    const base = await provider.react(p, STIMULUS, "product_concept", null, "b2b_saas", null);
    const lowered = await provider.react(p, STIMULUS, "product_concept", null, "b2b_saas", matrixFor(p.segment, 0.05));
    expect(lowered.criteria_scores.solution_fit).toBeLessThan(base.criteria_scores.solution_fit);
  });

  test("a missing grounded field in the matrix leaves that criterion at its formula value", async () => {
    const { personas } = new PersonaGenerator(5).generate("us_smb", 1);
    const p = personas[0];
    const provider = new MockPersonaProvider(5);
    const base = await provider.react(p, STIMULUS, "product_concept", null, "b2b_saas", null);
    // matrix has solution_fit only → differentiation unchanged
    const partial = await provider.react(p, STIMULUS, "product_concept", null, "b2b_saas", matrixFor(p.segment, 0.5));
    expect(partial.criteria_scores.differentiation).toBe(base.criteria_scores.differentiation);
  });

  test("determinism: same seed + same matrix → identical reaction", async () => {
    const { personas } = new PersonaGenerator(5).generate("us_smb", 1);
    const p = personas[0];
    const m = matrixFor(p.segment, 0.7);
    const r1 = await new MockPersonaProvider(5).react(p, STIMULUS, "product_concept", null, "b2b_saas", m);
    const r2 = await new MockPersonaProvider(5).react(p, STIMULUS, "product_concept", null, "b2b_saas", m);
    expect(r1.criteria_scores).toEqual(r2.criteria_scores);
  });
});

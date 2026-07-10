import { describe, expect, test } from "vitest";
import { buildCounterfactualPairs, summarizeCounterfactualAudit } from "./biasAudit";
import { PersonaGenerator } from "../persona/generator";
import { MockPersonaProvider } from "../providers/mockProvider";

describe("honest counterfactual audit", () => {
  test("mock-inert fields become not_applicable, not pass", async () => {
    const { personas } = new PersonaGenerator(17).generate("parents", 40);
    const { pairs, notes } = buildCounterfactualPairs(personas, 16, "mock");
    expect(pairs.some((p) => p.expected_inert)).toBe(true);
    expect(pairs.filter((p) => p.field === "life_stage").every((p) => !p.expected_inert)).toBe(true);

    const provider = new MockPersonaProvider(17);
    const stim = "HomeHero — chore app for families. $6/month, free trial.";
    const baseline = await Promise.all(personas.map((p) => provider.react(p, stim, "product_concept", null, null)));
    const cf = await Promise.all(pairs.map((p) => provider.react(p.counterfactual_persona, stim, "product_concept", null, null)));

    const audit = summarizeCounterfactualAudit(pairs, baseline, cf, notes);
    expect(audit.pairs_not_applicable).toBeGreaterThan(0);
    expect(audit.fields_not_applicable).toContain("region");
    // not_applicable pairs are excluded from the pass/warn/fail statistics:
    expect(audit.pairs_tested + audit.pairs_not_applicable).toBe(pairs.length);
    expect(audit.summary).toMatch(/cannot move|not applicable/i);
  });

  test("non-mock provider marks nothing inert", () => {
    const { personas } = new PersonaGenerator(17).generate("parents", 10);
    const { pairs } = buildCounterfactualPairs(personas, 10, "nvidia");
    expect(pairs.every((p) => !p.expected_inert)).toBe(true);
  });
});

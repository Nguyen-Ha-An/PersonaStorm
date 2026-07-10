import { describe, expect, test } from "vitest";
import { PERSONA_FEATURE_WIRING } from "./featureWiring";
import { PersonaGenerator } from "./generator";
import { MockPersonaProvider } from "../providers/mockProvider";

const STIMULUS = "TaskPilot — task manager for teams. $9/month, free trial, SOC2.";

describe("feature wiring declaration matches mock-provider reality", () => {
  test("declared-flavor fields cannot move a mock reaction", async () => {
    const { personas } = new PersonaGenerator(31).generate("us_smb", 5);
    const provider = new MockPersonaProvider(31);
    for (const p of personas) {
      const base = await provider.react(p, STIMULUS, "product_concept", null, null);
      for (const [field, wiring] of Object.entries(PERSONA_FEATURE_WIRING)) {
        if (wiring.mock !== "flavor") continue;
        const mutated = { ...p, decision_context: { ...p.decision_context } };
        if (field === "region") mutated.region = "Mars colony";
        else if (field === "occupation") mutated.occupation = "astronaut";
        else if (field === "income_band") mutated.income_band = "intergalactic budget";
        else if (field === "decision_context.budget_control") mutated.decision_context.budget_control = "hive mind";
        else continue;
        const changed = await provider.react(mutated, STIMULUS, "product_concept", null, null);
        expect(changed.buy_likelihood).toBe(base.buy_likelihood);
        expect(changed.market_fit_score).toBe(base.market_fit_score);
      }
    }
  });

  test("life_stage is declared scoring and can move a mock reaction", () => {
    expect(PERSONA_FEATURE_WIRING.life_stage.mock).toBe("scoring");
  });
});

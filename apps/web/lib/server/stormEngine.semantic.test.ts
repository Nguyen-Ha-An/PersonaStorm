// @vitest-environment node
import { describe, expect, test } from "vitest";
import { runStorm } from "./stormEngine";
import { getConfig } from "./env";

describe("semantic wiring in runStorm", () => {
  test("mock storm records semantic_source and stays deterministic", async () => {
    const input = {
      stormId: "sem-1", title: "PlanPal",
      stimulus: "PlanPal — a planning tool for small teams. $12/month. Free trial.",
      stimulusType: "product_concept", targetMarket: "us_smb", personaCount: 60, seed: 7,
    };
    const a = await runStorm(input, getConfig());
    const b = await runStorm(input, getConfig());
    expect(a.report.calibration_evidence!.semantic_source).toBe("fallback_formulas"); // mock assessor
    expect(a.report.overall?.market_fit_score).toBe(b.report.overall?.market_fit_score);
  }, 30000);
});

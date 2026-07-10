// @vitest-environment node
import { describe, expect, test } from "vitest";
import { runStorm } from "./stormEngine";
import { getConfig } from "./env";

describe("calibration evidence on the report", () => {
  test("mock storm reports priors, assumptions, audit and downgrades", async () => {
    const { report } = await runStorm(
      {
        stormId: "test-cal-1",
        title: "TaskPilot",
        stimulus: "TaskPilot — AI task manager for small teams. $9/month per seat. Free 14-day trial.",
        stimulusType: "product_concept",
        targetMarket: "us_smb",
        personaCount: 80,
        seed: 99,
      },
      getConfig(),
    );
    const ce = report.calibration_evidence;
    expect(ce).toBeDefined();
    expect(ce!.priors_source).toMatch(/data_files|embedded_unverified/);
    expect(ce!.priors_coverage).toBeGreaterThanOrEqual(0);
    expect(ce!.counterfactual_audit.status).toBeDefined();
    // 'us_smb' has high-price-sensitivity sub-segments → injection fires.
    expect(ce!.assumptions_fired.map((a) => a.id)).toContain("pricing_dealbreaker_injection");
    if (ce!.priors_source === "embedded_unverified") {
      expect(ce!.confidence_downgrades.length).toBeGreaterThan(0);
    }
  }, 30000);
});

// @vitest-environment node
import { describe, expect, test } from "vitest";
import { buildCalibrationEvidence, runStorm } from "./stormEngine";
import { AssumptionLedger } from "./engine/criteria/assumptions";
import { counterfactualAuditNotRun } from "./engine/quality/biasAudit";
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

describe("buildCalibrationEvidence downgrade branches", () => {
  const passAudit = { ...counterfactualAuditNotRun("x"), status: "pass" as const, summary: "clean" };

  test("embedded_unverified priors add the unvalidated-population downgrade", () => {
    const ce = buildCalibrationEvidence(
      { source: "embedded_unverified", coverage: 0, sourced_traits: 0, total_traits: 7, notes: ["fallback note"] },
      new AssumptionLedger(),
      passAudit,
    );
    expect(ce.confidence_downgrades[0]).toBe("fallback note");
    expect(ce.confidence_downgrades.some((d) => d.includes("embedded developer estimates"))).toBe(true);
  });

  test("not_run audit appends its summary as a downgrade", () => {
    const audit = counterfactualAuditNotRun(
      "Counterfactual audit skipped for provider 'nvidia' — counterfactual re-runs would cost live LLM calls.",
    );
    const ce = buildCalibrationEvidence(
      { source: "data_files", coverage: 0.43, sourced_traits: 3, total_traits: 7, notes: [] },
      new AssumptionLedger(),
      audit,
    );
    expect(ce.confidence_downgrades).toContain(audit.summary);
    expect(ce.priors_coverage).toBe(0.43);
  });

  test("clean run produces no downgrades", () => {
    const ce = buildCalibrationEvidence(
      { source: "data_files", coverage: 1, sourced_traits: 7, total_traits: 7, notes: [] },
      new AssumptionLedger(),
      passAudit,
    );
    expect(ce.confidence_downgrades).toEqual([]);
  });
});

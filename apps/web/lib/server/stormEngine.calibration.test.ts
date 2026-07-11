// @vitest-environment node
import { describe, expect, test } from "vitest";
import { buildCalibrationEvidence, runStorm } from "./stormEngine";
import type { FiredAssumption } from "./engine/criteria/assumptions";
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

  test("assumptions_fired counts never exceed the population size (audit probes must not inflate them)", async () => {
    const { report } = await runStorm(
      {
        stormId: "test-cal-audit-inflation",
        title: "TaskPilot",
        // Space-separated "AI" (not hyphenated) so the tokenizer treats it as
        // its own word and mentionsAi fires — this triggers the AI nudges
        // (ai_skeptic_trust_penalty, ai_novelty_activation_boost) across most
        // of the population. Pre-fix, those nudges PLUS 16 counterfactual
        // audit probes re-firing into the same ledger could push
        // personas_affected above the 80-persona population size.
        stimulus: "TaskPilot — an AI task manager for small teams. $9/month per seat. Free 14-day trial.",
        stimulusType: "product_concept",
        targetMarket: "us_smb",
        personaCount: 80,
        seed: 99,
      },
      getConfig(),
    );
    const ce = report.calibration_evidence;
    expect(ce).toBeDefined();
    for (const a of ce!.assumptions_fired) {
      expect(a.personas_affected).toBeLessThanOrEqual(80);
    }
  }, 30000);
});

describe("buildCalibrationEvidence downgrade branches", () => {
  const passAudit = { ...counterfactualAuditNotRun("x"), status: "pass" as const, summary: "clean" };
  const noAssumptions: FiredAssumption[] = [];

  test("embedded_unverified priors add the unvalidated-population downgrade", () => {
    const ce = buildCalibrationEvidence(
      { source: "embedded_unverified", coverage: 0, sourced_traits: 0, total_traits: 7, notes: ["fallback note"] },
      noAssumptions,
      passAudit,
      "fallback_formulas",
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
      noAssumptions,
      audit,
      "fallback_formulas",
    );
    expect(ce.confidence_downgrades).toContain(audit.summary);
    expect(ce.priors_coverage).toBe(0.43);
  });

  test("clean run produces no downgrades", () => {
    const ce = buildCalibrationEvidence(
      { source: "data_files", coverage: 1, sourced_traits: 7, total_traits: 7, notes: [] },
      noAssumptions,
      passAudit,
      "nvidia",
    );
    expect(ce.confidence_downgrades).toEqual([]);
  });

  test("low coverage (data_files) adds the almost-entirely-unsourced downgrade", () => {
    const ce = buildCalibrationEvidence(
      { source: "data_files", coverage: 0, sourced_traits: 0, total_traits: 7, notes: [] },
      noAssumptions,
      passAudit,
      "fallback_formulas",
    );
    expect(ce.confidence_downgrades.some((d) => d.includes("almost entirely unsourced"))).toBe(true);
  });

  test("assumptions_fired flows through unchanged", () => {
    const fired: FiredAssumption[] = [
      { id: "pricing_dealbreaker_injection", evidence_status: "unverified", personas_affected: 5 },
    ];
    const ce = buildCalibrationEvidence(
      { source: "data_files", coverage: 1, sourced_traits: 7, total_traits: 7, notes: [] },
      fired,
      passAudit,
      "fallback_formulas",
    );
    expect(ce.assumptions_fired).toEqual(fired);
  });

  test("nvidia semantic source sets semantic_source and emits no semantic downgrade", () => {
    const ce = buildCalibrationEvidence(
      { source: "data_files", coverage: 1, sourced_traits: 7, total_traits: 7, notes: [] },
      noAssumptions,
      passAudit,
      "nvidia",
    );
    expect(ce.semantic_source).toBe("nvidia");
    expect(ce.confidence_downgrades.some((d) => d.includes("Semantic grounding unavailable"))).toBe(false);
  });
});

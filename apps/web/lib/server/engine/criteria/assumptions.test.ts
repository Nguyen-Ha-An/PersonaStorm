import { describe, expect, test } from "vitest";
import { ASSUMPTION_DEFS, AssumptionLedger } from "./assumptions";

describe("assumptions registry", () => {
  test("known nudges are registered with evidence status", () => {
    expect(ASSUMPTION_DEFS.pricing_dealbreaker_injection.max_rate).toBe(0.4);
    expect(ASSUMPTION_DEFS.ai_skeptic_trust_penalty.evidence_status).toBeDefined();
  });

  test("ledger counts fires per id", () => {
    const ledger = new AssumptionLedger();
    ledger.fire("pricing_dealbreaker_injection");
    ledger.fire("pricing_dealbreaker_injection");
    ledger.fire("ai_skeptic_trust_penalty");
    const fired = ledger.fired();
    expect(fired.find((f) => f.id === "pricing_dealbreaker_injection")?.personas_affected).toBe(2);
    expect(fired.find((f) => f.id === "ai_skeptic_trust_penalty")?.personas_affected).toBe(1);
  });

  test("firing an unregistered assumption throws outside production", () => {
    const ledger = new AssumptionLedger();
    expect(() => ledger.fire("made_up_nudge")).toThrow(/unregistered/i);
  });

  test("unfired assumptions are not listed", () => {
    expect(new AssumptionLedger().fired()).toEqual([]);
  });
});

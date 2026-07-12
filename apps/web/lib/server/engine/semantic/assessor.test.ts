// @vitest-environment node
import { describe, expect, test } from "vitest";
import { MockSemanticAssessor, getSemanticAssessor } from "./assessor";
import { GROUNDED_CRITERIA } from "./types";
import { getConfig } from "../../env";

const SEGS = [
  { name: "Ops manager", occupations: ["ops"], income_bands: ["dept budget"], sub_segment_hint: "SMB ops" },
  { name: "Solo founder", occupations: ["founder"], income_bands: ["bootstrapped"], sub_segment_hint: "indie" },
];

describe("MockSemanticAssessor", () => {
  test("is deterministic and covers every segment × grounded criterion", async () => {
    const a = new MockSemanticAssessor(1337);
    const m1 = await a.assess("A dashboard for teams. $9/mo.", "b2b_saas", SEGS);
    const m2 = await a.assess("A dashboard for teams. $9/mo.", "b2b_saas", SEGS);
    expect(m1).toEqual(m2);
    for (const s of SEGS) {
      for (const c of GROUNDED_CRITERIA) {
        expect(m1.segments[s.name].scores[c]).toBeGreaterThanOrEqual(0);
        expect(m1.segments[s.name].scores[c]).toBeLessThanOrEqual(1);
      }
    }
    expect(m1.source).toBe("fallback_formulas");
  });

  test("different stimuli produce different matrices (not a constant)", async () => {
    const a = new MockSemanticAssessor(1337);
    const m1 = await a.assess("A dashboard for teams.", "b2b_saas", SEGS);
    const m2 = await a.assess("A toy for toddlers.", "consumer_app", SEGS);
    expect(m1.segments["Ops manager"].scores.solution_fit)
      .not.toBe(m2.segments["Ops manager"].scores.solution_fit);
  });
});

describe("getSemanticAssessor", () => {
  test("defaults to the mock assessor when no LLM configured", () => {
    const cfg = { ...getConfig(), semanticProvider: "mock" as const };
    expect(getSemanticAssessor(cfg).name).toBe("mock");
  });

  test("fireworks with a key yields the LLM assessor", () => {
    const cfg = {
      ...getConfig(),
      semanticProvider: "fireworks" as const,
      fireworksApiKey: "fw-key",
      fireworksBaseUrl: "https://api.fireworks.ai/inference/v1",
    };
    expect(getSemanticAssessor(cfg).name).toBe("llm");
  });

  test("fireworks on the hosted endpoint without a key degrades to mock", () => {
    const cfg = {
      ...getConfig(),
      semanticProvider: "fireworks" as const,
      fireworksApiKey: "",
      fireworksBaseUrl: "https://api.fireworks.ai/inference/v1",
    };
    expect(getSemanticAssessor(cfg).name).toBe("mock");
  });
});

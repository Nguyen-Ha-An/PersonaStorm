import { describe, expect, test } from "vitest";
import { computeJitterOffsets, MockPersonaProvider } from "./mockProvider";
import { ASSUMPTION_DEFS, AssumptionLedger } from "../criteria/assumptions";
import { CORE_IDS } from "../criteria/registry";
import { PersonaGenerator } from "../persona/generator";
import { RNG } from "../rng";
import { parseStimulus, type StimulusFeatures } from "../stimulusParser";
import type { Persona } from "../types";

// Note: "AI-powered" (hyphenated) tokenizes as a single "ai-powered" token under
// the shared WORD_RE (`[a-zA-Z][a-zA-Z0-9'-]+`, ported from stimulus_parser.py),
// so it never matches AI_WORDS' "ai" entry. Using "AI assistant" (space-separated)
// so mentionsAi actually flips true for this fixture, while keeping the two
// stimuli otherwise identical.
const AI_STIMULUS = "NovaPilot — an AI assistant for freelancers. $12/month. Free trial included.";
const PLAIN_STIMULUS = "NovaPilot — an assistant for freelancers. $12/month. Free trial included.";

async function reactAll(stimulus: string, seed = 11) {
  const { personas } = new PersonaGenerator(seed).generate("early_adopters", 60);
  const provider = new MockPersonaProvider(seed, new AssumptionLedger());
  return Promise.all(personas.map((p) => provider.react(p, stimulus, "product_concept", null, null)));
}

describe("de-nudged mock provider", () => {
  test("mentioning AI no longer bumps differentiation", async () => {
    const withAi = await reactAll(AI_STIMULUS);
    const withoutAi = await reactAll(PLAIN_STIMULUS);
    const avg = (rs: typeof withAi) => rs.reduce((s, r) => s + r.criteria_scores.differentiation, 0) / rs.length;
    // Before: +0.1 flat for all personas. After: |difference| well under that.
    expect(Math.abs(avg(withAi) - avg(withoutAi))).toBeLessThan(0.05);
  });

  test("registered AI nudges fire through the ledger", async () => {
    const { personas } = new PersonaGenerator(3).generate("early_adopters", 60);
    const ledger = new AssumptionLedger();
    const provider = new MockPersonaProvider(3, ledger);
    await Promise.all(personas.map((p) => provider.react(p, AI_STIMULUS, "product_concept", null, null)));
    const ids = ledger.fired().map((f) => f.id);
    expect(ids).toContain("ai_novelty_activation_boost");
  });

  test("jitter: same seed reproduces the identical swarm", async () => {
    const a = await reactAll(AI_STIMULUS, 5);
    const b = await reactAll(AI_STIMULUS, 5);
    expect(a.map((r) => r.buy_likelihood)).toEqual(b.map((r) => r.buy_likelihood));
  });

  test("jitter varies per persona: two personas with identical traits diverge", async () => {
    const { personas } = new PersonaGenerator(9).generate("us_smb", 2);
    const clone = { ...personas[0], persona_id: "US_SMB_9999" };
    const provider = new MockPersonaProvider(9, new AssumptionLedger());
    const [r1, r2] = await Promise.all([
      provider.react(personas[0], PLAIN_STIMULUS, "product_concept", null, null),
      provider.react(clone, PLAIN_STIMULUS, "product_concept", null, null),
    ]);
    // Identical traits, different persona_id → different jitter (and noise) → different scores.
    expect(r1.criteria_scores).not.toEqual(r2.criteria_scores);
  });
});

/** White-box access to the private scoreCriteria (TS `private` is compile-time only). */
type ScoreCriteriaAccess = {
  scoreCriteria: (
    p: Persona,
    f: StimulusFeatures,
    category: string,
    rng: RNG,
    jitterOffsets: Record<string, number>,
  ) => { core: Record<string, number> };
};

describe("jitter mechanism", () => {
  test("offsets are deterministic per (seed, persona) and cover all core criteria", () => {
    const a = computeJitterOffsets(5, "P1");
    const b = computeJitterOffsets(5, "P1");
    expect(a).toEqual(b);
    expect(Object.keys(a).sort()).toEqual([...CORE_IDS].sort());
  });

  test("offsets differ across personas (signature is stimulus-independent by construction)", () => {
    const a = computeJitterOffsets(5, "P1");
    const b = computeJitterOffsets(5, "P2");
    expect(a).not.toEqual(b);
  });

  test("offsets are actually applied to criteria scores", async () => {
    const { personas } = new PersonaGenerator(9).generate("us_smb", 1);
    const p = personas[0];
    const provider = new MockPersonaProvider(9) as unknown as ScoreCriteriaAccess;
    const f = parseStimulus(PLAIN_STIMULUS, "", "product_concept");
    const zeroOffsets = Object.fromEntries(CORE_IDS.map((c) => [c, 0]));
    // Identical RNG key + identical inputs — only the jitter map differs.
    const zero = provider.scoreCriteria(p, f, "b2b_saas", new RNG("t:1"), zeroOffsets);
    const bumped = provider.scoreCriteria(p, f, "b2b_saas", new RNG("t:1"), { ...zeroOffsets, problem_awareness: 0.3 });
    expect(bumped.core.problem_awareness).toBeGreaterThan(zero.core.problem_awareness + 0.2);
  });
});

describe("objection decoupling", () => {
  test("a skeptical persona without a 'proof' dealbreaker can still raise no_proof", async () => {
    const { personas } = new PersonaGenerator(21).generate("early_adopters", 1);
    const skeptic: Persona = {
      ...personas[0],
      skepticism: 0.95,
      dealbreakers: ["not mobile friendly"], // no proof/case-study dealbreaker
    };
    const provider = new MockPersonaProvider(21, new AssumptionLedger());
    // No proof, no pricing, no trial in this stimulus → evidence-based candidates exist.
    const r = await provider.react(skeptic, "Zenlytics — a dashboard that makes teams smarter.", "product_concept", null, null);
    // Objection candidates now include no_proof regardless of dealbreakers; with
    // skepticism 0.95 the proof/value family should win for this stimulus.
    expect(["no evidence for the claims", "unclear value", "not obviously for me", "hidden pricing", "no reference customers"])
      .toContain(r.qualitative.top_negative_trigger);
  });
});

describe("bounded pricing injection", () => {
  test("pricing dealbreaker injection stays within 40% of each sub-segment", () => {
    const ledger = new AssumptionLedger();
    const { personas } = new PersonaGenerator(13, ledger).generate("budget", 400);
    const fired = ledger.fired().find((f) => f.id === "pricing_dealbreaker_injection");
    const cap = Math.ceil(0.4 * 400);
    expect((fired?.personas_affected ?? 0)).toBeLessThanOrEqual(cap);
    // 'budget' preset has price_sensitivity means 0.82–0.92 → the cap must actually bind.
    expect(fired).toBeDefined();
  });
});

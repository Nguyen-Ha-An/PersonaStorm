import { describe, expect, test } from "vitest";
import { MockPersonaProvider } from "./mockProvider";
import { AssumptionLedger } from "../criteria/assumptions";
import { PersonaGenerator } from "../persona/generator";

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

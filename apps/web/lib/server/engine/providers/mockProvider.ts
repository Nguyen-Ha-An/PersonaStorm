/**
 * MockPersonaProvider — deterministic, trait-driven local reaction engine.
 * Port of apps/api/app/services/inference/mock_provider.py.
 *
 * Deterministic: rng seeded with (seed, persona_id, stimulus_hash).
 * Trait-driven: every core criterion (+ overlays) is a function of persona
 * traits + parsed features + small deterministic noise. market_fit is ALWAYS
 * the authoritative scorer's output, never invented here.
 */

import { RNG } from "../rng";
import { clamp, round } from "../text";
import { AssumptionLedger } from "../criteria/assumptions";
import { overlayIdsFor } from "../criteria/ageOverlays";
import { classifyCategory, isHighRisk } from "../criteria/classifier";
import { resolvePreset } from "../criteria/presets";
import { CORE_IDS, effective } from "../criteria/registry";
import { computeMarketFit, type MarketFitBreakdown } from "../criteria/scoring";
import { GROUNDED_CRITERIA, type SemanticMatrix } from "../semantic/types";
import { parseStimulus, anchorSet, type StimulusFeatures } from "../stimulusParser";
import { statusFor, type Persona, type PersonaReaction, type Qualitative, type ReactionStatus } from "../types";
import { reactBatchDefault, type PersonaInferenceProvider } from "./types";

/** Grounded-criteria semantic blend weight (spec §7): core = w·semantic + (1-w)·formula. */
export const SEMANTIC_BLEND_WEIGHT = 0.7;

const OBJECTION_TEMPLATES: Record<string, string[]> = {
  pricing_unclear: [
    "I can't find what this actually costs",
    "no price anywhere — that usually means 'expensive'",
    "pricing is hidden and I'm not booking a call to find out",
    "if the price isn't shown, I assume I can't afford it",
  ],
  price_too_high: [
    "${price} is more than I'd ever put into {anchor}",
    "at ${price} it has to replace something I already pay for, and it doesn't",
    "the ${price} price tag doesn't match the value I can see",
    "${price}? my whole budget for this kind of thing is smaller than that",
  ],
  no_proof: [
    "big claims, zero numbers or case studies",
    "show me one real result before asking me to commit",
    "nothing here proves it beats what I already do manually",
    "no evidence, just adjectives",
  ],
  ai_hype: [
    "'AI-powered' tells me nothing about what it actually does",
    "reads like AI hype without specifics",
    "every product says AI now — where's the actual capability?",
    "the AI framing feels bolted on to justify the price",
  ],
  subscription_lockin: [
    "another monthly subscription I'll forget to cancel",
    "subscription lock-in for something I'd use twice a month",
    "I'm cutting subscriptions, not adding them",
    "monthly billing for this feels like a trap",
  ],
  privacy_vague: [
    "it never says what happens to my data",
    "I'm not feeding my info into this without a clear privacy stance",
    "vague on data handling — that's a no for me",
  ],
  no_security_docs: [
    "no SOC2, no SSO mention — this dies in our security review",
    "there's no security documentation; procurement won't even look at it",
    "without a compliance page this can't enter our stack",
  ],
  no_trial: [
    "I'm not paying before trying it",
    "no free trial means no first step for me",
    "let me test it on my own work first — there's no way to",
  ],
  no_case_studies: [
    "no case studies from companies like ours",
    "who at our size actually uses this? it doesn't say",
    "I need a reference customer, not a feature list",
  ],
  onboarding_time: [
    "looks like hours of setup before any value shows up",
    "I don't have time to learn another system this quarter",
    "the value is buried behind a migration project",
  ],
  integration: [
    "doesn't say whether it plugs into the tools we already run",
    "if it doesn't fit our existing stack, it's an instant no",
    "one more disconnected tool is exactly what we don't need",
  ],
  credibility: [
    "never heard of them and nothing here builds trust",
    "feels too corporate and salesy for me to trust",
    "the copy oversells and that makes me trust it less",
  ],
  unclear_value: [
    "I read it twice and still can't tell what it does for me",
    "the pitch is a wall of buzzwords with no clear payoff",
    "what problem this solves is buried under jargon",
  ],
  generic_fit: [
    "I honestly can't tell what problem of mine this solves",
    "it's not obvious this is for someone like me",
    "the pitch never says who it's actually for",
  ],
};

const POSITIVE_TEMPLATES: Record<string, string[]> = {
  trial: ["the free trial makes it a no-risk look", "free tier means I can test it on a real task"],
  proof: ["the concrete numbers in the pitch", "actual evidence instead of adjectives"],
  price_fit: ["the price is inside my budget", "cheap enough to try without thinking twice"],
  novel_ai: ["the AI angle is genuinely interesting here", "curious whether the AI part actually delivers"],
  clarity: ["the pitch is unusually clear about what it does", "I understood it in one read — rare"],
  anchor: ["the {anchor} part actually maps to my problem", "specifically the {anchor} bit — that's my pain point"],
  none: ["honestly, not much grabbed me", "nothing here speaks to my situation"],
};

const EMOTIONS: Record<ReactionStatus, string[]> = {
  green: ["genuinely curious", "quietly excited", "impressed, but checking for the catch", "surprised how relevant this is"],
  yellow: ["interested but wary", "curious with one eyebrow raised", "on the fence", "want to believe it, can't yet"],
  red: ["eye-roll and close the tab", "instant distrust", "bored — seen this pitch before", "mildly annoyed by the hype"],
};

const AUDIENCES: Record<string, string[]> = {
  sea_genz: ["my group chat", "my classmates", "my followers"],
  us_smb: ["my ops team", "my founder friends", "our Monday standup"],
  parents: ["my spouse", "the parents' group chat", "my sister"],
  enterprise: ["my team in the vendor review", "our procurement channel", "my director"],
  budget: ["my roommate", "the deals forum", "my family"],
  early_adopters: ["my Discord", "my Twitter/X feed", "the team Slack"],
  custom: ["my friends", "my colleagues", "my community"],
};

const CRITERION_LABELS: Record<string, string> = {
  problem_awareness: "whether people recognize the problem",
  need_intensity: "how painful the problem really is",
  urgency: "whether people feel any urgency to solve it",
  solution_fit: "whether the product actually fits the need",
  value_clarity: "whether the value is clear",
  differentiation: "whether it feels different from alternatives",
  trust: "whether people trust the claims",
  proof_requirement: "how much proof people demand before buying",
  pricing_acceptance: "whether the price is acceptable",
  perceived_roi: "whether it's seen as worth the money",
  ease_of_understanding: "whether people quickly understand it",
  workflow_fit: "whether it fits people's existing habits",
  switching_willingness: "whether people will switch from what they use",
  activation_likelihood: "whether people would actually try it",
  repeat_usage_potential: "whether people would keep using it",
  shareability: "whether people would tell others",
  retention_potential: "whether people would keep paying",
};

const TEST_FOR_WEAKNESS: Record<string, string> = {
  pricing_acceptance: "pricing_test",
  perceived_roi: "pricing_test",
  value_clarity: "usability_test",
  ease_of_understanding: "usability_test",
  differentiation: "landing_page_ab_test",
  trust: "interview",
  proof_requirement: "interview",
  activation_likelihood: "ad_test",
  shareability: "ad_test",
};

const NEGATIVE_BY_KEY: Record<string, string> = {
  pricing_unclear: "hidden pricing",
  price_too_high: "price above budget",
  no_proof: "no evidence for the claims",
  no_case_studies: "no reference customers",
  ai_hype: "AI framing without substance",
  subscription_lockin: "subscription lock-in",
  privacy_vague: "unclear data handling",
  no_security_docs: "missing security/compliance",
  no_trial: "no way to try before paying",
  onboarding_time: "setup effort",
  integration: "unclear fit with existing tools",
  credibility: "weak credibility",
  unclear_value: "unclear value",
  generic_fit: "not obviously for me",
};

const OPENERS_NEUTRAL = ["", "", "", "Honestly, ", "For what it's worth, ", "Quick take: ", "My first reaction: ", "Gut feel — "];
const OPENERS_CASUAL = ["", "", "ngl, ", "ok so ", "real talk: ", "hmm — "];
const YELLOW_TAILS = ["", "", " Convince me and I'm in.", " I'd wait for reviews.", " Maybe next month.", " I'll sit on it.", " Someone else can go first."];

const FAM_MAP: Record<string, number> = { low: 0.2, medium: 0.5, high: 0.85 };

/** Persona-stable, stimulus-independent formula jitter (spec §6). Exported for direct testing. */
export function computeJitterOffsets(seed: number, personaId: string): Record<string, number> {
  const jrng = new RNG(`jitter:${seed}:${personaId}`);
  const offsets: Record<string, number> = {};
  for (const cid of CORE_IDS) offsets[cid] = jrng.gauss(0, 0.03);
  return offsets;
}

export class MockPersonaProvider implements PersonaInferenceProvider {
  readonly name = "mock";

  constructor(private seed: number = 1337, private ledger: AssumptionLedger = new AssumptionLedger()) {}

  async react(
    persona: Persona,
    stimulus: string,
    stimulusType: string,
    features: StimulusFeatures | null,
    category: string | null,
    semantic: SemanticMatrix | null = null,
  ): Promise<PersonaReaction> {
    const f = features ?? parseStimulus(stimulus, "", stimulusType);
    const stimHash = fnvHex(stimulus);
    const rng = new RNG(`${this.seed}:${persona.persona_id}:${stimHash}`);

    const cat = category ?? classifyCategory(f)[0];
    const highRisk = isHighRisk(f);

    const jitterOffsets = computeJitterOffsets(this.seed, persona.persona_id);

    const { core, overlay } = this.scoreCriteria(persona, f, cat, rng, jitterOffsets, semantic);

    const breakdown = computeMarketFit(core, overlay, cat, persona.life_stage, {
      isHighRisk: highRisk,
      isTeenPaidEdu: persona.life_stage === "teen_student" && cat === "education_product",
    });

    const buy = this.buyLikelihood(persona, core, rng);
    const status = statusFor(buy);

    const wtpBase = persona.monthly_budget_usd * (0.25 + 0.55 * (1.0 - persona.price_sensitivity));
    const maxPrice = this.maxPrice(persona, f, buy, wtpBase, core, status, rng);
    const pricingModel = this.pricingModel(f);

    const qualitative = this.qualitative(persona, f, core, buy, status, rng);
    const research = this.researchRecommendation(persona, f, core, rng);
    const reasoning = this.reasoning(core, cat, breakdown);

    return {
      persona_id: persona.persona_id,
      segment: persona.segment,
      sub_segment: persona.sub_segment,
      life_stage: persona.life_stage,
      buy_likelihood: round(buy, 3),
      market_fit_score: breakdown.market_fit_score,
      status,
      max_price: maxPrice,
      currency: "USD",
      recommended_pricing_model: pricingModel,
      criteria_scores: core,
      age_specific_scores: overlay,
      qualitative,
      research_recommendation: research,
      reasoning_summary: reasoning,
      market_fit_breakdown: breakdown,
      first_objection: qualitative.first_objection,
      quote: qualitative.quote,
      positive_trigger: qualitative.top_positive_trigger,
    };
  }

  reactBatch(
    personas: Persona[],
    stimulus: string,
    stimulusType: string,
    features: StimulusFeatures | null,
    concurrency: number,
    category: string | null,
    semantic: SemanticMatrix | null = null,
  ): Promise<PersonaReaction[]> {
    return reactBatchDefault(this, personas, stimulus, stimulusType, features, concurrency, category, semantic);
  }

  // ------------------------------------------------------------- criteria
  private scoreCriteria(
    p: Persona,
    f: StimulusFeatures,
    _category: string,
    rng: RNG,
    jitterOffsets: Record<string, number>,
    semantic: SemanticMatrix | null = null,
  ): { core: Record<string, number>; overlay: Record<string, number> } {
    const j = (scale = 0.05) => rng.gauss(0.0, scale);

    const wtpBase = p.monthly_budget_usd * (0.25 + 0.55 * (1.0 - p.price_sensitivity));
    let affordability: number;
    if (f.hasPricing && f.minPrice) {
      affordability = clamp(wtpBase / Math.max(1.0, f.minPrice), 0.0, 3.0) / 3.0;
    } else {
      affordability = 0.45;
    }

    const clarity = f.clarityScore;
    const jargon = f.jargonScore;
    const proof = f.hasProof ? 1.0 : 0.0;
    const trial = f.hasFreeTrial ? 1.0 : 0.0;
    const fam = FAM_MAP[p.category_familiarity] ?? 0.5;

    const core: Record<string, number> = {};

    core.problem_awareness = 0.45 + 0.3 * clarity + 0.15 * fam + j();
    core.need_intensity = 0.4 + 0.25 * (1.0 - fam) + 0.2 * clarity + 0.15 * p.novelty_seeking + j();
    core.urgency = 0.35 + 0.3 * core.need_intensity + 0.1 * p.novelty_seeking + j();

    core.solution_fit = 0.42 + 0.28 * clarity + 0.2 * proof - 0.1 * jargon + j();
    core.value_clarity = 0.3 + 0.55 * clarity - 0.25 * jargon + j();
    core.differentiation = 0.55 - 0.3 * fam + 0.15 * (p.novelty_seeking - 0.5) + j();

    core.trust = 0.55 - 0.3 * (p.skepticism - 0.5) + 0.18 * (p.brand_trust - 0.5) + 0.15 * proof - 0.08 * jargon + j();
    if (f.mentionsAi && p.skepticism > 0.6 && !f.hasProof) {
      this.ledger.fire("ai_skeptic_trust_penalty");
      core.trust -= 0.06;
    }
    core.proof_requirement = 0.35 + 0.35 * p.skepticism + 0.2 * (1.0 - p.brand_trust) - 0.18 * proof + j();

    let pa = 0.3 + 0.55 * affordability;
    if (f.hasPricing && f.minPrice && wtpBase < f.minPrice) pa -= 0.2 * p.price_sensitivity;
    if (!f.hasPricing) pa -= 0.1 * p.price_sensitivity;
    core.pricing_acceptance = pa + j();
    core.perceived_roi = 0.35 + 0.3 * core.solution_fit + 0.2 * proof + 0.15 * affordability + j();

    core.ease_of_understanding = 0.3 + 0.55 * clarity - 0.2 * jargon + j();
    core.workflow_fit = 0.42 + 0.25 * fam + 0.18 * clarity + j();
    core.switching_willingness = 0.38 + 0.3 * p.novelty_seeking - 0.15 * p.skepticism + 0.12 * trial + j();
    let act = 0.38 + 0.22 * clarity + 0.18 * trial + 0.12 * p.novelty_seeking;
    if (f.mentionsAi && p.novelty_seeking > 0.55) {
      this.ledger.fire("ai_novelty_activation_boost");
      act += 0.12 * p.novelty_seeking;
    }
    core.activation_likelihood = act + j();

    core.repeat_usage_potential = 0.4 + 0.25 * core.solution_fit + 0.15 * core.workflow_fit + j();
    core.shareability = 0.3 + 0.35 * p.social_influence + 0.2 * core.value_clarity + j();
    core.retention_potential = 0.38 + 0.25 * core.perceived_roi + 0.18 * core.repeat_usage_potential + j();

    const seg = semantic?.segments[p.segment];
    if (seg) {
      for (const cid of GROUNDED_CRITERIA) {
        const sv = seg.scores[cid];
        if (typeof sv === "number") {
          core[cid] = SEMANTIC_BLEND_WEIGHT * sv + (1 - SEMANTIC_BLEND_WEIGHT) * core[cid];
          this.ledger.fire("semantic_blend_weight");
        }
      }
    }

    const clamped: Record<string, number> = {};
    for (const cid of CORE_IDS) clamped[cid] = round(clamp(core[cid] + (jitterOffsets[cid] ?? 0)), 4);
    const overlay = this.scoreOverlay(p, f, clamped, rng);
    return { core: clamped, overlay };
  }

  private scoreOverlay(
    p: Persona,
    f: StimulusFeatures,
    core: Record<string, number>,
    rng: RNG,
  ): Record<string, number> {
    const ids = overlayIdsFor(p.life_stage);
    if (ids.length === 0) return {};

    const j = (scale = 0.05) => rng.gauss(0.0, scale);
    const dc = p.decision_context;
    let cheap: number;
    if (f.hasPricing && f.minPrice !== null) {
      cheap = clamp((p.monthly_budget_usd - f.minPrice) / Math.max(1.0, p.monthly_budget_usd));
    } else {
      cheap = 0.4;
    }
    const trend = f.mentionsAi ? 1.0 : 0.5;
    const social = p.social_influence;
    const privacyWorry = p.privacy_sensitivity;
    const needsParent = Boolean(dc.needs_parent_approval);

    const base: Record<string, number> = {};
    for (const cid of ids) base[cid] = clamp(0.45 + 0.2 * ((core.solution_fit ?? 0.5) - 0.5) + j());

    if ("peer_influence" in base) base.peer_influence = clamp(0.35 + 0.45 * social + j());
    if ("trend_alignment" in base) base.trend_alignment = clamp(0.3 + 0.45 * trend + 0.15 * p.novelty_seeking + j());
    if ("parent_approval" in base) base.parent_approval = clamp((needsParent ? 0.55 : 0.45) + 0.25 * cheap - 0.2 * privacyWorry + j());
    if ("allowance_affordability" in base) base.allowance_affordability = clamp(0.3 + 0.55 * cheap + j());
    if ("safety_concern" in base) base.safety_concern = clamp(0.3 + 0.35 * privacyWorry + (f.mentionsPrivacy && !f.mentionsSecurity ? 0.15 : 0.0) + j());
    if ("identity_fit" in base) base.identity_fit = clamp(0.35 + 0.35 * social + 0.15 * p.novelty_seeking + j());
    if ("school_relevance" in base) {
      const inSchool = (dc.school_context ?? "").includes("school");
      base.school_relevance = clamp((inSchool ? 0.45 : 0.35) + 0.3 * (core.solution_fit ?? 0.5) + j());
    }
    if ("attention_fit" in base) {
      const short = dc.attention_span === "short";
      base.attention_fit = clamp((short ? 0.4 : 0.55) + 0.2 * (core.ease_of_understanding ?? 0.5) + j());
    }

    if ("budget_fit" in base) base.budget_fit = clamp(0.3 + 0.55 * cheap + j());
    if ("household_budget_fit" in base) base.household_budget_fit = clamp(0.3 + 0.55 * cheap + j());
    if ("trialability" in base) base.trialability = clamp(0.35 + (f.hasFreeTrial ? 0.4 : 0.0) + j());
    if ("child_safety" in base) base.child_safety = clamp(0.45 + 0.2 * (1.0 - privacyWorry) + (f.mentionsSecurity ? 0.1 : 0.0) + j());
    if ("outcome_proof" in base) base.outcome_proof = clamp(0.35 + (f.hasProof ? 0.4 : 0.0) + j());
    if ("subscription_fatigue" in base) base.subscription_fatigue = clamp(0.3 + (f.mentionsSubscription ? 0.3 : 0.0) + 0.2 * (1.0 - p.risk_tolerance) + j());
    if ("productivity_gain" in base) base.productivity_gain = clamp(0.35 + 0.3 * (core.perceived_roi ?? 0.5) + j());
    if ("professional_credibility" in base) base.professional_credibility = clamp(0.35 + 0.3 * (core.trust ?? 0.5) + j());

    const out: Record<string, number> = {};
    for (const cid of ids) out[cid] = round(base[cid], 4);
    return out;
  }

  // ---------------------------------------------------------- buy likelihood
  private buyLikelihood(p: Persona, core: Record<string, number>, rng: RNG): number {
    const drivers = [
      core.need_intensity, core.solution_fit, core.pricing_acceptance,
      core.trust, core.activation_likelihood, core.switching_willingness,
    ];
    const base = drivers.reduce((s, v) => s + v, 0) / drivers.length;
    const interaction = 0.15 * core.need_intensity * core.solution_fit;
    const inertia = 0.1 + 0.1 * (1.0 - p.novelty_seeking);
    const score = base + interaction - inertia + rng.gauss(0.0, 0.05);
    return clamp(score, 0.02, 0.97);
  }

  // ----------------------------------------------------------------- pricing
  private maxPrice(
    p: Persona,
    f: StimulusFeatures,
    buy: number,
    wtpBase: number,
    core: Record<string, number>,
    status: string,
    rng: RNG,
  ): number {
    if (status === "red" && rng.random() < 0.3 + 0.35 * p.price_sensitivity) return 0.0;
    const pa = core.pricing_acceptance;
    const ceiling = wtpBase * (0.45 + 0.75 * buy) * (0.6 + 0.6 * pa);
    let wtp: number;
    if (f.hasPricing && f.minPrice) {
      const sensitivityFactor = 1.15 - 0.5 * p.price_sensitivity;
      const anchored = f.minPrice * (0.5 + 1.3 * buy) * sensitivityFactor;
      wtp = Math.min(ceiling, anchored);
    } else {
      wtp = ceiling;
    }
    wtp *= rng.uniform(0.85, 1.15);
    return roundPrice(Math.max(0.0, wtp));
  }

  private pricingModel(f: StimulusFeatures): string {
    const lower = f.raw.toLowerCase();
    const toks = new Set(f.tokens);
    if (["enterprise", "sso", "saml", "soc2", "soc-2", "procurement"].some((w) => lower.includes(w))) return "enterprise";
    if (lower.includes("freemium") || (toks.has("free") && !f.hasPricing)) return "freemium";
    if (["per seat", "/seat", "per user", "/user", " seats"].some((w) => lower.includes(w))) return "seat_based";
    if (["usage-based", "usage based", "pay-as-you-go", "pay as you go", "per request", "metered", "credits"].some((w) => lower.includes(w))) return "usage_based";
    if (f.mentionsSubscription) return "subscription";
    if (f.hasPricing) return "one_time";
    return "unknown";
  }

  // --------------------------------------------------------------- qualitative
  private qualitative(
    p: Persona,
    f: StimulusFeatures,
    core: Record<string, number>,
    buy: number,
    status: ReactionStatus,
    rng: RNG,
  ): Qualitative {
    const [objectionKey, objection] = this.pickObjection(p, f, core, buy, rng);
    const positive = this.pickPositive(p, f, buy, rng);
    const anchor = this.anchor(f, rng);
    const quote = this.quote(p, f, status, objection, positive, anchor, rng);
    const emotional = rng.choice(EMOTIONS[status]);
    const audience = rng.choice(AUDIENCES[p.preset] ?? AUDIENCES.custom);
    const wouldTell = {
      green: `I'd tell ${audience} to take a look at this`,
      yellow: `I'd mention it to ${audience}, but with a 'not sure yet'`,
      red: `I'd tell ${audience} not to bother`,
    }[status];

    const negative = NEGATIVE_BY_KEY[objectionKey] ?? "not convinced yet";
    const dealbreaker = this.dealbreaker(p, f);
    const proofNeeded = this.proofNeeded(f, core);

    return {
      first_objection: objection,
      top_positive_trigger: positive,
      top_negative_trigger: negative,
      dealbreaker,
      proof_needed: proofNeeded,
      emotional_reaction: emotional,
      would_tell: wouldTell,
      quote,
    };
  }

  private dealbreaker(p: Persona, f: StimulusFeatures): string {
    const db = [...p.dealbreakers];
    if (db.length === 0) return "";
    const matches = (fragment: string): string | null => {
      for (const d of db) if (d.toLowerCase().includes(fragment)) return d;
      return null;
    };
    if (!f.hasPricing) {
      const hit = matches("pricing") ?? matches("fees");
      if (hit) return hit;
    }
    if (!f.hasProof) {
      const hit = matches("proof") ?? matches("case");
      if (hit) return hit;
    }
    if (!f.mentionsSecurity) {
      const hit = matches("data") ?? matches("compliance") ?? matches("soc");
      if (hit) return hit;
    }
    if (!f.hasFreeTrial) {
      const hit = matches("trial") ?? matches("credit card");
      if (hit) return hit;
    }
    return db[0];
  }

  private proofNeeded(f: StimulusFeatures, core: Record<string, number>): string {
    const pr = core.proof_requirement;
    if (f.hasProof && pr < 0.5) return "the proof shown is roughly enough for me";
    if (pr >= 0.65) return "hard evidence: real numbers or a case study from someone like me";
    if (pr >= 0.45) return "a concrete before/after result or a reference customer";
    return "a quick demo would settle it";
  }

  private pickObjection(
    p: Persona,
    f: StimulusFeatures,
    core: Record<string, number>,
    buy: number,
    rng: RNG,
  ): [string, string] {
    const db = new Set(p.dealbreakers);
    const hasDb = (...fragments: string[]): boolean =>
      fragments.some((fr) => Array.from(db).some((d) => d.includes(fr)));

    const cands: [string, number][] = [];
    // Evidence-justified objections are candidates for EVERY persona, weighted
    // by the relevant trait; a matching dealbreaker BOOSTS weight ×1.5 instead
    // of gating inclusion (spec §9 — pools no longer predetermine blockers).
    const boosted = (base: number, ...fragments: string[]): number =>
      fragments.length > 0 && hasDb(...fragments) ? base * 1.5 : base;

    if (!f.hasPricing) cands.push(["pricing_unclear", boosted(0.7 * p.price_sensitivity, "pricing", "hidden fees")]);
    if (f.hasPricing && f.minPrice) {
      const wtp = p.monthly_budget_usd * (0.25 + 0.55 * (1 - p.price_sensitivity));
      if (f.minPrice > wtp) cands.push(["price_too_high", boosted(0.9 * p.price_sensitivity, "pricing", "hidden fees")]);
    }
    if (!f.hasProof) {
      cands.push(["no_proof", boosted(0.7 * p.skepticism, "proof")]);
      cands.push(["no_case_studies", boosted(0.45 * p.skepticism, "case studies")]);
    }
    if (f.mentionsAi && !f.hasProof) cands.push(["ai_hype", boosted(0.65 * p.skepticism, "AI hype")]);
    if (f.mentionsSubscription) cands.push(["subscription_lockin", boosted(0.5 * (1.0 - p.risk_tolerance), "lock-in", "cancel")]);
    if (!f.mentionsSecurity) {
      cands.push(["no_security_docs", boosted(0.55 * p.privacy_sensitivity, "SSO", "compliance")]);
      cands.push(["privacy_vague", boosted(0.5 * p.privacy_sensitivity, "data")]);
    }
    if (!f.hasFreeTrial) cands.push(["no_trial", boosted(0.5 * p.price_sensitivity, "trial", "credit card")]);
    cands.push(["onboarding_time", boosted(0.3 * (1.0 - p.novelty_seeking), "onboarding", "time", "another tool")]);
    if (hasDb("tools we already use")) cands.push(["integration", 0.6]);
    if (hasDb("corporate") || (f.jargonScore > 0.4 && p.brand_trust < 0.45)) cands.push(["credibility", 0.5 * (1.0 - p.brand_trust)]);
    if (core.value_clarity < 0.4 || core.ease_of_understanding < 0.4) cands.push(["unclear_value", 0.7 * (1.0 - core.value_clarity)]);
    if (cands.length === 0) cands.push(["generic_fit", 0.5]);

    let key = cands[0][0];
    let bestScore = -Infinity;
    for (const [k, w] of cands) {
      const s = w * (0.7 + 0.6 * rng.random());
      if (s > bestScore) {
        bestScore = s;
        key = k;
      }
    }
    const template = rng.choice(OBJECTION_TEMPLATES[key]);
    let text = template.replace("{price}", fmtPrice(f.minPrice)).replace("{anchor}", this.anchor(f, rng));
    if (buy >= 0.62) {
      text = rng.choice([`only thing I'd check: ${text}`, `minor worry — ${text}`, `before paying I'd still ask: ${text}`]);
    }
    return [key, text];
  }

  private pickPositive(p: Persona, f: StimulusFeatures, buy: number, rng: RNG): string {
    const pool: [string, number][] = [];
    if (f.hasFreeTrial) pool.push(["trial", 0.6 + 0.4 * p.price_sensitivity]);
    if (f.hasProof) pool.push(["proof", 0.5 + 0.5 * p.skepticism]);
    if (f.hasPricing && f.minPrice && f.minPrice <= p.monthly_budget_usd) pool.push(["price_fit", 0.6 * (1 - p.price_sensitivity) + 0.3]);
    if (f.mentionsAi && p.novelty_seeking > 0.55) pool.push(["novel_ai", 0.4 + 0.6 * p.novelty_seeking]);
    if (f.clarityScore > 0.65) pool.push(["clarity", 0.5]);
    if (f.anchors.length > 0) pool.push(["anchor", 0.55]);

    let key: string;
    if (pool.length === 0 || buy < 0.18) {
      key = "none";
    } else {
      key = pool[0][0];
      let bestScore = -Infinity;
      for (const [k, w] of pool) {
        const s = w * (0.7 + 0.6 * rng.random());
        if (s > bestScore) {
          bestScore = s;
          key = k;
        }
      }
    }
    return rng.choice(POSITIVE_TEMPLATES[key]).replace("{anchor}", this.anchor(f, rng));
  }

  private researchRecommendation(
    p: Persona,
    f: StimulusFeatures,
    core: Record<string, number>,
    rng: RNG,
  ): { should_validate_with_humans: boolean; validation_question: string; best_next_test: string } {
    let weakest = CORE_IDS[0];
    let weakestEff = Infinity;
    for (const cid of CORE_IDS) {
      const eff = effective(cid, core[cid]);
      if (eff < weakestEff) {
        weakestEff = eff;
        weakest = cid;
      }
    }
    const test = TEST_FOR_WEAKNESS[weakest] ?? "survey";
    const anchor = this.anchor(f, rng);
    const label = CRITERION_LABELS[weakest] ?? weakest.replace(/_/g, " ");
    const question = `With real users, validate ${label} for '${anchor}' before scaling spend.`;
    return { should_validate_with_humans: true, validation_question: question.slice(0, 300), best_next_test: test };
  }

  private anchor(f: StimulusFeatures, rng: RNG): string {
    const pool = f.anchors.slice(0, 6);
    const chosenPool = pool.length > 0 ? pool : f.title ? [f.title] : ["this"];
    const chosen = rng.choice(chosenPool);
    if (f.title && chosen.toLowerCase() === f.title.toLowerCase()) return f.title;
    return chosen;
  }

  private quote(
    p: Persona,
    f: StimulusFeatures,
    status: ReactionStatus,
    objection: string,
    positive: string,
    anchor: string,
    rng: RNG,
  ): string {
    const casual = p.preset === "sea_genz" || p.preset === "early_adopters" || p.age < 26;
    const opener = rng.choice(casual ? OPENERS_CASUAL : OPENERS_NEUTRAL);
    let opts: string[];
    if (status === "green") {
      opts = [
        `Okay, '${anchor}' is exactly what I keep struggling with — and ${positive}.`,
        `This one I'd actually try: ${positive}, and the ${anchor} part fits my situation.`,
        `Rare — a pitch that matches my problem. ${cap(positive)}.`,
        `The ${anchor} angle lands for me. ${cap(positive)}.`,
      ];
      if (casual) opts.push(`the ${anchor} part got me. ${cap(positive)} — I'd try it.`);
    } else if (status === "yellow") {
      const tail = rng.choice(YELLOW_TAILS);
      opts = [
        `I like the idea of ${anchor}, but ${objection}.${tail}`,
        `Half-convinced. ${cap(positive)}, but ${objection}.${tail}`,
        `I'd shortlist it, not buy it — ${objection}.${tail}`,
        `Tempted by the ${anchor} angle; held back because ${objection}.${tail}`,
      ];
    } else {
      opts = [
        `I'd close the page — ${objection}.`,
        `${cap(objection)}. That's where I stop reading.`,
        `Not for me: ${objection}.`,
        `This is a pass. ${cap(objection)}.`,
        `Nothing for me here — ${objection}.`,
      ];
      if (casual) opts.push(`scrolled past. ${objection}.`);
    }
    const body = rng.choice(opts);
    return opener ? `${opener}${body}` : body;
  }

  private reasoning(core: Record<string, number>, category: string, breakdown: MarketFitBreakdown): string {
    const preset = resolvePreset(category);
    const contribs = CORE_IDS.map((cid) => [cid, preset.weights[cid] * effective(cid, core[cid])] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);
    const names = contribs.map(([cid]) => (CRITERION_LABELS[cid] ?? cid).replace("whether ", "")).join(" and ");
    const verdict = breakdown.market_fit_score >= 0.55 ? "strong fit" : breakdown.market_fit_score < 0.4 ? "weak fit" : "mixed fit";
    return `Market fit here is driven most by ${names} (fit ${breakdown.market_fit_score.toFixed(2)} — ${verdict}).`.slice(0, 400);
  }
}

function cap(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

function fmtPrice(price: number | null): string {
  if (price === null) return "that price";
  // Python's :g format: trim trailing zeros.
  return String(price);
}

function roundPrice(v: number): number {
  if (v <= 0) return 0.0;
  if (v < 10) return Math.round(v * 2) / 2;
  if (v < 50) return Math.round(v);
  if (v < 200) return Math.round(v / 5) * 5;
  return Math.round(v / 10) * 10;
}

/** Short deterministic hash of the stimulus (analogue of sha1[:10]). */
function fnvHex(str: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

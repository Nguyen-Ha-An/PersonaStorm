/**
 * Persona Space Builder — port of apps/api/app/services/persona/generator.py.
 * Seeded end-to-end so a run is reproducible; traits sampled from per-sub-segment
 * Gaussians; dealbreakers get a trait-consistency pass.
 */

import { RNG } from "../rng";
import { round } from "../text";
import { lifeStageFor } from "../criteria/ageOverlays";
import type { DecisionContext, Persona, Familiarity } from "../types";
import {
  DB,
  resolvePreset,
  type PresetSpec,
  type SubSegmentSpec,
} from "./presets";
import { validateDiversity, type DiversityReport } from "./diversity";

const PRICING_DEALBREAKERS = new Set(["unclear pricing", "hidden fees", "requires credit card upfront"]);
const PRIVACY_DEALBREAKERS = new Set(["vague about what happens to my data", "compliance posture unknown (SOC2/GDPR)"]);

const GLOBAL_EXTRA_RATE = 0.35;
const GLOBAL_EXTRAS = Object.values(DB);

export class PersonaGenerator {
  constructor(private seed: number = 1337) {}

  generate(
    presetKey: string,
    count: number,
    customDescription?: string | null,
    maxRetries = 2,
  ): { personas: Persona[]; report: DiversityReport } {
    const preset = resolvePreset(presetKey, customDescription);
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rng = new RNG(`${this.seed + attempt}:${preset.key}:${count}`);
      const personas = this.sample(preset, count, rng);
      const report = validateDiversity(personas, preset.sub_segments.map((s) => s.name));
      if (report.ok || attempt >= maxRetries) return { personas, report };
      attempt += 1;
    }
  }

  private sample(preset: PresetSpec, count: number, rng: RNG): Persona[] {
    const allocations = allocate(count, preset.sub_segments.map((s) => s.weight));
    const personas: Persona[] = [];
    let idx = 0;
    preset.sub_segments.forEach((sub, i) => {
      const nn = allocations[i];
      for (let k = 0; k < nn; k++) {
        idx += 1;
        personas.push(this.one(preset, sub, idx, rng));
      }
    });
    rng.shuffle(personas);
    return personas;
  }

  private one(preset: PresetSpec, sub: SubSegmentSpec, idx: number, rng: RNG): Persona {
    const traits: Record<string, number> = {};
    for (const [name, [mean, std]] of Object.entries(sub.traits)) {
      traits[name] = clip(rng.gauss(mean, std));
    }
    const [bandLabel, [lo, hi]] = rng.choice(sub.income_bands);
    const budget = round(rng.uniform(lo, hi), 2);

    const dealbreakers = rng.sample(
      sub.dealbreaker_pool,
      Math.min(sub.dealbreaker_pool.length, rng.randint(3, 5)),
    );
    if (rng.random() < GLOBAL_EXTRA_RATE) {
      const extra = rng.choice(GLOBAL_EXTRAS);
      if (!dealbreakers.includes(extra)) dealbreakers.push(extra);
    }
    // Trait-consistency pass.
    if (traits.price_sensitivity > 0.72 && !dealbreakers.some((d) => PRICING_DEALBREAKERS.has(d))) {
      const poolPricing = sub.dealbreaker_pool.filter((d) => PRICING_DEALBREAKERS.has(d));
      dealbreakers[dealbreakers.length - 1] = poolPricing.length > 0 ? poolPricing[0] : "unclear pricing";
    }
    if (traits.privacy_sensitivity > 0.75 && !dealbreakers.some((d) => PRIVACY_DEALBREAKERS.has(d))) {
      dealbreakers.push("vague about what happens to my data");
    }

    const age = rng.randint(sub.age_range[0], sub.age_range[1]);
    const lifeStage = lifeStageFor(age);
    const decisionContext = this.decisionContext(lifeStage, rng);

    const persona: Persona = {
      persona_id: `${preset.id_prefix}_${String(idx).padStart(4, "0")}`,
      preset: preset.key,
      segment: sub.name,
      sub_segment: sub.name,
      age,
      region: rng.choice(sub.regions),
      income_band: bandLabel,
      occupation: rng.choice(sub.occupations),
      life_stage: lifeStage,
      decision_context: decisionContext,
      price_sensitivity: traits.price_sensitivity,
      skepticism: traits.skepticism,
      novelty_seeking: traits.novelty_seeking,
      brand_trust: traits.brand_trust,
      social_influence: traits.social_influence,
      risk_tolerance: traits.risk_tolerance,
      privacy_sensitivity: traits.privacy_sensitivity,
      category_familiarity: rng.choice(sub.familiarity) as Familiarity,
      research_style: rng.choice(sub.research_styles),
      buying_trigger: rng.choice(sub.buying_triggers),
      dealbreakers: dedupe(dealbreakers),
      monthly_budget_usd: budget,
    };
    return persona;
  }

  private decisionContext(lifeStage: string, rng: RNG): DecisionContext {
    const empty = (): DecisionContext => ({
      needs_parent_approval: null,
      budget_control: null,
      main_influence_sources: [],
      risk_owner: null,
      attention_span: null,
      school_context: null,
      decision_horizon: null,
    });

    if (lifeStage === "teen_student") {
      return {
        ...empty(),
        needs_parent_approval: true,
        budget_control: "allowance",
        risk_owner: "parent",
        attention_span: "short",
        main_influence_sources: rng.sample(["peers", "creators", "school"], 3),
        school_context: rng.choice([
          "in school, homework-heavy schedule",
          "in school, active in clubs/extracurriculars",
          "in school, prepping for exams",
        ]),
        decision_horizon: "days",
      };
    }
    if (lifeStage === "student_young_adult") {
      return {
        ...empty(),
        needs_parent_approval: false,
        budget_control: rng.choice(["self", "shared with roommates"]),
        risk_owner: "self",
        attention_span: rng.choice(["short", "medium"]),
        main_influence_sources: rng.sample(["peers", "creators", "online reviews"], 2),
        decision_horizon: rng.choice(["days", "weeks"]),
      };
    }
    if (lifeStage === "parent_family") {
      return {
        ...empty(),
        needs_parent_approval: false,
        budget_control: rng.choice(["household budget", "self"]),
        risk_owner: rng.choice(["self", "shared with spouse"]),
        attention_span: "medium",
        main_influence_sources: rng.sample(["other parents", "online reviews", "school"], 2),
        decision_horizon: rng.choice(["weeks", "months"]),
      };
    }
    return {
      ...empty(),
      needs_parent_approval: false,
      budget_control: rng.choice(["self", "employer/expense", "household budget"]),
      risk_owner: "self",
      attention_span: rng.choice(["medium", "long"]),
      main_influence_sources: rng.sample(["colleagues", "online reviews", "industry blogs"], 2),
      decision_horizon: rng.choice(["weeks", "months", "quarter"]),
    };
  }
}

/** Largest-remainder allocation so counts sum exactly to `total`. */
function allocate(total: number, weights: number[]): number[] {
  const s = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (total * w) / s);
  const counts = raw.map((r) => Math.floor(r));
  const remainder = total - counts.reduce((a, b) => a + b, 0);
  const fracs = Array.from({ length: raw.length }, (_, i) => i).sort(
    (a, b) => raw[b] - counts[b] - (raw[a] - counts[a]),
  );
  for (let i = 0; i < remainder; i++) counts[fracs[i % fracs.length]] += 1;
  return counts;
}

function clip(v: number): number {
  return round(Math.max(0.02, Math.min(0.98, v)), 3);
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

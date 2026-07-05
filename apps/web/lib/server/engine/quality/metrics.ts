/**
 * Response Quality Checker — computes every Trust Panel metric. Port of
 * apps/api/app/services/quality/metrics.py.
 *
 * Benchmark note: no benchmark sample corpus ships in the serverless runtime,
 * so benchmark_confidence is always "low" (honest — never overstate trust).
 * This matches the Python behavior when benchmark_dir is absent.
 */

import {
  clamp,
  normalizeObjection,
  rankCorrelation,
  round,
  shannonEntropyNorm,
  stddev,
} from "../text";
import type { StimulusFeatures } from "../stimulusParser";
import { anchorSet } from "../stimulusParser";
import type { Persona, PersonaReaction } from "../types";
import type { Level, QualityMetrics, Strength } from "../report";
import { criteriaConsistencyScore } from "./consistency";

const GENERIC_PHRASES = [
  "seems useful", "sounds useful", "interesting product", "sounds good",
  "i would consider it", "this product is innovative", "nice product",
  "cool idea", "looks good", "pretty good product", "might be useful",
];

export function computeQuality(
  personas: Persona[],
  reactions: PersonaReaction[],
  features: StimulusFeatures,
): QualityMetrics {
  const notes: string[] = [];
  const n = Math.max(1, reactions.length);
  const byId = new Map(personas.map((p) => [p.persona_id, p]));
  const paired = reactions.filter((r) => byId.has(r.persona_id)).map((r) => [byId.get(r.persona_id)!, r] as const);

  const adherence = personaAdherence(paired, features, notes);
  const grounding = productGrounding(reactions, features);
  const genericRate = genericRateOf(reactions, features);
  const entropyNorm = objectionEntropy(reactions);
  const dupRate = duplicateRate(reactions);
  const segVar = segmentVariance(reactions);
  const ageVar = ageCohortVariance(reactions);
  const consistency = criteriaConsistencyScore(personas, reactions);

  const concentration = likelihoodConcentration(reactions);
  const collapseScore = clamp(0.35 * dupRate + 0.35 * (1.0 - entropyNorm) + 0.3 * concentration);
  const collapseLevel: Level = collapseScore < 0.33 ? "low" : collapseScore < 0.6 ? "medium" : "high";
  if (collapseLevel !== "low") {
    notes.push(
      `Collapse signal: ${pct(dupRate)} duplicate objections, entropy ${entropyNorm.toFixed(2)}, likelihood concentration ${concentration.toFixed(2)}.`,
    );
  }

  const entropyLevel: Level = entropyNorm < 0.45 ? "low" : entropyNorm < 0.7 ? "medium" : "high";
  const varLevel = varianceStrength(segVar);
  const ageVarLevel = varianceStrength(ageVar);

  const benchLevel: Level = "low";
  const benchCat = features.category;
  notes.push(`No benchmark corpus in the serverless runtime — treat absolute numbers for '${benchCat}' as directional only.`);

  if (consistency < 0.6) {
    notes.push(
      `Internal consistency low: only ${pct(consistency)} of personas pass all consistency rules (trust/buy, price/WTP, proof/trust, uniform criteria) — many reactions contradict themselves.`,
    );
  }

  const segCount = new Set(reactions.map((r) => r.segment)).size;
  notes.push(`Metrics computed over ${n} reactions across ${segCount} segments; heuristic P0 estimators.`);

  return {
    persona_adherence: round(adherence, 3),
    product_grounding: round(grounding, 3),
    generic_response_rate: round(genericRate, 3),
    duplicate_objection_rate: round(dupRate, 3),
    objection_entropy: entropyLevel,
    objection_entropy_score: round(entropyNorm, 3),
    segment_variance: varLevel,
    segment_variance_score: round(segVar, 4),
    age_cohort_variance: ageVarLevel,
    criteria_consistency: round(consistency, 3),
    collapse_risk: collapseLevel,
    collapse_risk_score: round(collapseScore, 3),
    benchmark_confidence: benchLevel,
    benchmark_category: benchCat,
    notes,
  };
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function mapCorr(corr: number, expectedSign: number): number {
  return clamp(0.5 + expectedSign * corr * 1.4);
}

function personaAdherence(
  paired: readonly (readonly [Persona, PersonaReaction])[],
  features: StimulusFeatures,
  notes: string[],
): number {
  if (paired.length < 10) return 0.5;
  const ps = paired.map(([p]) => p.price_sensitivity);
  const priceRatio = paired.map(([p, r]) => r.max_price / Math.max(1.0, p.monthly_budget_usd));
  const skept = paired.map(([p]) => p.skepticism);
  const trust = paired.map(([p]) => p.brand_trust);
  const likelihood = paired.map(([, r]) => r.buy_likelihood);

  const components = [
    mapCorr(rankCorrelation(ps, priceRatio), -1),
    mapCorr(rankCorrelation(skept, likelihood), -1),
    mapCorr(rankCorrelation(trust, likelihood), 1),
  ];
  if (features.mentionsAi) {
    const novelty = paired.map(([p]) => p.novelty_seeking);
    components.push(mapCorr(rankCorrelation(novelty, likelihood), 1));
  }
  const score = components.reduce((s, v) => s + v, 0) / components.length;
  if (score < 0.55) notes.push("Persona adherence weak: trait-behavior correlations below target.");
  return score;
}

function mentionsStimulus(text: string, features: StimulusFeatures): boolean {
  const low = text.toLowerCase();
  for (const a of anchorSet(features)) if (low.includes(a)) return true;
  if (features.hasPricing && text.includes("$")) return true;
  return false;
}

function productGrounding(reactions: PersonaReaction[], features: StimulusFeatures): number {
  if (reactions.length === 0) return 0.0;
  const hits = reactions.filter((r) =>
    mentionsStimulus(`${r.first_objection} ${r.quote} ${r.positive_trigger}`, features),
  ).length;
  return hits / reactions.length;
}

function genericRateOf(reactions: PersonaReaction[], features: StimulusFeatures): number {
  if (reactions.length === 0) return 1.0;
  const isGeneric = (r: PersonaReaction): boolean => {
    const text = `${r.first_objection} ${r.quote}`.toLowerCase();
    if (!r.first_objection.trim()) return true;
    const hasPhrase = GENERIC_PHRASES.some((ph) => text.includes(ph));
    return hasPhrase && !mentionsStimulus(text, features);
  };
  return reactions.filter(isGeneric).length / reactions.length;
}

function objectionEntropy(reactions: PersonaReaction[]): number {
  const keys = reactions.filter((r) => r.first_objection).map((r) => normalizeObjection(r.first_objection));
  if (keys.length === 0) return 0.0;
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return shannonEntropyNorm(Array.from(counts.values()));
}

function duplicateRate(reactions: PersonaReaction[], sampleSize = 300): number {
  let keys = reactions.filter((r) => r.quote.trim()).map((r) => normalizeObjection(r.quote));
  if (keys.length === 0) return 1.0;
  if (keys.length > sampleSize) {
    // Deterministic subsample (seeded, mirrors random.Random(0).sample intent).
    keys = seededSample(keys, sampleSize);
  }
  return 1.0 - new Set(keys).size / keys.length;
}

function seededSample<T>(arr: T[], k: number): T[] {
  // Deterministic partial Fisher–Yates with a fixed seed (0).
  let state = 0x9e3779b9 >>> 0;
  const rand = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = arr.slice();
  const n = pool.length;
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rand() * (n - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, k);
}

function varianceStrength(v: number): Strength {
  return v < 0.03 ? "weak" : v < 0.07 ? "moderate" : "strong";
}

function groupedMeanVariance(reactions: PersonaReaction[], key: (r: PersonaReaction) => string): number {
  const byGroup = new Map<string, number[]>();
  for (const r of reactions) {
    const g = key(r) || "unknown";
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(r.buy_likelihood);
  }
  const means = Array.from(byGroup.values()).filter((v) => v.length > 0).map((v) => v.reduce((s, x) => s + x, 0) / v.length);
  return means.length >= 2 ? stddev(means) : 0.0;
}

function segmentVariance(reactions: PersonaReaction[]): number {
  return groupedMeanVariance(reactions, (r) => r.segment);
}

function ageCohortVariance(reactions: PersonaReaction[]): number {
  return groupedMeanVariance(reactions, (r) => r.life_stage);
}

function likelihoodConcentration(reactions: PersonaReaction[]): number {
  if (reactions.length === 0) return 1.0;
  const bins = new Array<number>(10).fill(0);
  for (const r of reactions) bins[Math.min(9, Math.floor(r.buy_likelihood * 10))] += 1;
  const maxShare = Math.max(...bins) / reactions.length;
  return clamp((maxShare - 0.15) / 0.85);
}

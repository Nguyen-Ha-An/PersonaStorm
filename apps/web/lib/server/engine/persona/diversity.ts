/**
 * Persona Diversity Validator — port of
 * apps/api/app/services/persona/diversity.py. Guards against a degenerate
 * persona space before inference.
 */

import { stddev, round } from "../text";
import type { Persona } from "../types";

const MIN_TRAIT_STD = 0.07;
const MIN_DEALBREAKER_UNIQUENESS = 0.3;

const TRAITS = [
  "price_sensitivity", "skepticism", "novelty_seeking", "brand_trust",
  "social_influence", "risk_tolerance", "privacy_sensitivity",
] as const;

export interface DiversityReport {
  ok: boolean;
  trait_std: Record<string, number>;
  sub_segment_counts: Record<string, number>;
  dealbreaker_uniqueness: number;
  age_std: number;
  life_stage_counts: Record<string, number>;
  warnings: string[];
}

export function diversityToDict(r: DiversityReport): Record<string, unknown> {
  const traitStd: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.trait_std)) traitStd[k] = round(v, 3);
  return {
    ok: r.ok,
    trait_std: traitStd,
    sub_segment_counts: r.sub_segment_counts,
    dealbreaker_uniqueness: round(r.dealbreaker_uniqueness, 3),
    age_std: round(r.age_std, 2),
    life_stage_counts: r.life_stage_counts,
    warnings: r.warnings,
  };
}

export function validateDiversity(personas: Persona[], expectedSubSegments: string[]): DiversityReport {
  const warnings: string[] = [];
  const n = personas.length;
  if (n === 0) {
    return {
      ok: false, trait_std: {}, sub_segment_counts: {}, dealbreaker_uniqueness: 0,
      age_std: 0, life_stage_counts: {}, warnings: ["no personas generated"],
    };
  }

  const traitStd: Record<string, number> = {};
  for (const t of TRAITS) {
    traitStd[t] = stddev(personas.map((p) => p[t] as number));
    if (traitStd[t] < MIN_TRAIT_STD) {
      warnings.push(`trait '${t}' spread too low (std=${traitStd[t].toFixed(3)} < ${MIN_TRAIT_STD})`);
    }
  }

  const segCounts: Record<string, number> = {};
  for (const p of personas) segCounts[p.sub_segment] = (segCounts[p.sub_segment] ?? 0) + 1;
  const minShare = n >= 200 ? 0.03 : 0.01;
  for (const seg of expectedSubSegments) {
    if ((segCounts[seg] ?? 0) < Math.max(1, Math.floor(n * minShare))) {
      warnings.push(`sub-segment '${seg}' underrepresented`);
    }
  }

  const combos = new Set(personas.map((p) => [...p.dealbreakers].sort().join("|")));
  const uniqueness = combos.size / n;
  if (n >= 100 && uniqueness < MIN_DEALBREAKER_UNIQUENESS) {
    warnings.push(`dealbreaker combination uniqueness low (${uniqueness.toFixed(2)} < ${MIN_DEALBREAKER_UNIQUENESS})`);
  }

  const ages = personas.map((p) => p.age);
  const ageStd = stddev(ages);
  const span = Math.max(...ages) - Math.min(...ages);
  const minAgeStd = Math.max(1.5, span / 8.0);
  if (ageStd < minAgeStd) {
    warnings.push(`age spread low (std=${ageStd.toFixed(1)} < ${minAgeStd.toFixed(1)} for span ${span.toFixed(0)})`);
  }

  const lifeStageCounts: Record<string, number> = {};
  for (const p of personas) lifeStageCounts[p.life_stage] = (lifeStageCounts[p.life_stage] ?? 0) + 1;
  if (Object.keys(lifeStageCounts).length <= 1) {
    const only = Object.keys(lifeStageCounts)[0] ?? "unknown";
    warnings.push(`age-cohort spread low: population collapses to a single life stage ('${only}')`);
  }

  return {
    ok: warnings.length === 0,
    trait_std: traitStd,
    sub_segment_counts: segCounts,
    dealbreaker_uniqueness: uniqueness,
    age_std: ageStd,
    life_stage_counts: lifeStageCounts,
    warnings,
  };
}

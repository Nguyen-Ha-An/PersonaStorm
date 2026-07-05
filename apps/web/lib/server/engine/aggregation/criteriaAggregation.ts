/**
 * Criteria aggregation + weakness diagnosis — port of
 * apps/api/app/services/aggregation/criteria_aggregation.py.
 */

import { round } from "../text";
import { CORE_IDS, CRITERION_BY_ID, effective, isBarrier } from "../criteria/registry";
import { resolvePreset } from "../criteria/presets";
import type { PersonaReaction } from "../types";
import type { CriterionBreakdown, CriterionCard } from "../report";

const HIGH = 0.66;
const LOW = 0.4;

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0.0;
}

function interpret(cid: string, label: string, avg: number): string {
  const eff = effective(cid, avg);
  const barrier = isBarrier(cid);
  const low = label.toLowerCase();
  if (barrier) {
    if (avg >= HIGH) return `Personas demand heavy ${low} — a real adoption barrier here.`;
    if (avg <= LOW) return `${label} is low — this is not blocking adoption.`;
    return `Moderate ${low}; watch it but not the top blocker.`;
  }
  if (eff >= HIGH) return `Strong ${low} — a clear asset to lead with.`;
  if (eff <= LOW) return `Weak ${low} — personas are unconvinced here.`;
  return `Middling ${low}; there is upside if sharpened.`;
}

export function buildCriteriaBreakdown(reactions: PersonaReaction[], category: string): CriterionBreakdown[] {
  const weights = resolvePreset(category).weights;
  const dicts = reactions.map((r) => r.criteria_scores);

  // Group by segment, preserving first-seen order + sorted by size desc.
  const bySeg = new Map<string, Record<string, number>[]>();
  reactions.forEach((r, i) => {
    const seg = r.segment || "unknown";
    if (!bySeg.has(seg)) bySeg.set(seg, []);
    bySeg.get(seg)!.push(dicts[i]);
  });
  const segOrder = Array.from(bySeg.entries()).sort((a, b) => b[1].length - a[1].length);

  const out: CriterionBreakdown[] = [];
  for (const cid of CORE_IDS) {
    const crit = CRITERION_BY_ID.get(cid)!;
    const avg = mean(dicts.map((d) => d[cid]));
    const segmentScores = segOrder.map(([seg, ds]) => ({
      segment: seg,
      score: round(mean(ds.map((d) => d[cid])), 4),
    }));
    out.push({
      criterion_id: cid,
      label: crit.label,
      average_score: round(avg, 4),
      higher_is_better: crit.higherIsBetter,
      weight: round(weights[cid] ?? 0.0, 4),
      segment_scores: segmentScores,
      interpretation: interpret(cid, crit.label, avg),
    });
  }
  return out;
}

export function diagnoseWeakness(
  breakdowns: CriterionBreakdown[],
): { weakest: CriterionCard[]; strongest: CriterionCard[]; topBlockers: string[]; topStrengths: string[] } {
  const card = (b: CriterionBreakdown): CriterionCard => ({
    criterion_id: b.criterion_id,
    label: b.label,
    average_score: b.average_score,
    weight: b.weight,
    interpretation: b.interpretation,
  });

  const scored = breakdowns.map((b) => ({ b, eff: effective(b.criterion_id, b.average_score) }));
  // Stable sort by effective score ascending.
  scored.sort((a, b) => a.eff - b.eff);
  const split = Math.floor(scored.length / 2);
  const weaknessPool = scored.slice(0, split);
  const strengthPool = scored.slice(split);

  const weakestScored = weaknessPool.map(({ b, eff }) => ({ b, score: b.weight * (1.0 - eff) }));
  const strongestScored = strengthPool.map(({ b, eff }) => ({ b, score: b.weight * eff }));

  weakestScored.sort((a, b) => b.score - a.score);
  strongestScored.sort((a, b) => b.score - a.score);

  const weakest = weakestScored.slice(0, 5);
  const strongest = strongestScored.slice(0, 5);

  return {
    weakest: weakest.map(({ b }) => card(b)),
    strongest: strongest.map(({ b }) => card(b)),
    topBlockers: weakest.slice(0, 3).map(({ b }) => b.label),
    topStrengths: strongest.slice(0, 3).map(({ b }) => b.label),
  };
}

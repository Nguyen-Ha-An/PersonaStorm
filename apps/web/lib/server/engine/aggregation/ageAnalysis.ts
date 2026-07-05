/**
 * Age-cohort aggregation — port of
 * apps/api/app/services/aggregation/age_analysis.py.
 */

import { round } from "../text";
import { CRITERION_BY_ID, effective } from "../criteria/registry";
import { overlayIdsFor } from "../criteria/ageOverlays";
import type { PersonaReaction } from "../types";
import type { AgeCohortReport } from "../report";

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0.0;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function topBarrier(lifeStage: string, cohort: PersonaReaction[]): string {
  const overlayIds = overlayIdsFor(lifeStage);
  if (overlayIds.length === 0) return "none identified";

  let bestId: string | null = null;
  let bestEff = 2.0;
  for (const cid of overlayIds) {
    const scores = cohort.filter((r) => cid in r.age_specific_scores).map((r) => r.age_specific_scores[cid]);
    if (scores.length === 0) continue;
    const eff = effective(cid, mean(scores));
    if (eff < bestEff) {
      bestEff = eff;
      bestId = cid;
    }
  }
  if (bestId === null) return "none identified";
  const crit = CRITERION_BY_ID.get(bestId);
  return crit ? crit.label : bestId.replace(/_/g, " ");
}

export function buildAgeCohorts(reactions: PersonaReaction[]): AgeCohortReport[] {
  const byStage = new Map<string, PersonaReaction[]>();
  for (const r of reactions) {
    const stage = r.life_stage || "unknown";
    if (!byStage.has(stage)) byStage.set(stage, []);
    byStage.get(stage)!.push(r);
  }

  const ordered = Array.from(byStage.entries()).sort((a, b) => b[1].length - a[1].length);
  const out: AgeCohortReport[] = [];
  for (const [stage, cohort] of ordered) {
    const n = cohort.length;
    const green = cohort.filter((r) => r.status === "green").length;
    const adoptionRate = green / n;
    const avgLike = mean(cohort.map((r) => r.buy_likelihood));
    const avgFit = mean(cohort.map((r) => r.market_fit_score));
    const barrier = topBarrier(stage, cohort);
    const stageLabel = stage.replace(/_/g, " ");

    let insight: string;
    if (adoptionRate >= 0.5) {
      insight = `${titleCase(stageLabel)} is a strong cohort (${pct(adoptionRate)} adoption); residual barrier: ${barrier}.`;
    } else if (adoptionRate <= 0.2) {
      insight = `${titleCase(stageLabel)} barely adopts (${pct(adoptionRate)}); dominant barrier: ${barrier}.`;
    } else {
      insight = `${titleCase(stageLabel)} is on the fence (${pct(adoptionRate)} adoption); converting them hinges on ${barrier}.`;
    }

    out.push({
      life_stage: stage,
      personas: n,
      adoption_rate: round(adoptionRate, 3),
      avg_buy_likelihood: round(avgLike, 3),
      avg_market_fit_score: round(avgFit, 3),
      top_barrier: barrier,
      insight,
    });
  }
  return out;
}

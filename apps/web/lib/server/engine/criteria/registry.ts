/**
 * Core criteria registry — single source of truth for criterion polarity.
 * Port of apps/api/app/services/criteria/registry.py (+ overlay registration
 * from age_overlays.py, folded in here so import order can't matter).
 */

export interface Criterion {
  id: string;
  label: string;
  description: string;
  higherIsBetter: boolean;
  group: string;
}

const CORE: Criterion[] = [
  { id: "problem_awareness", label: "Problem Awareness", description: "Does the persona recognize the problem?", higherIsBetter: true, group: "problem" },
  { id: "need_intensity", label: "Need Intensity", description: "How painful/important is the problem for this persona?", higherIsBetter: true, group: "problem" },
  { id: "urgency", label: "Urgency", description: "How soon would this persona want a solution?", higherIsBetter: true, group: "problem" },
  { id: "solution_fit", label: "Solution Fit", description: "How well does the product match the persona's actual need?", higherIsBetter: true, group: "value" },
  { id: "value_clarity", label: "Value Clarity", description: "How clearly does the persona understand the value?", higherIsBetter: true, group: "value" },
  { id: "differentiation", label: "Differentiation", description: "How different does it feel from existing alternatives?", higherIsBetter: true, group: "value" },
  { id: "trust", label: "Trust", description: "How much does the persona trust the product's claims?", higherIsBetter: true, group: "trust_risk" },
  { id: "proof_requirement", label: "Proof Requirement", description: "How much proof this persona needs before believing/buying (barrier).", higherIsBetter: false, group: "trust_risk" },
  { id: "pricing_acceptance", label: "Pricing Acceptance", description: "How acceptable is the current/implied price?", higherIsBetter: true, group: "pricing" },
  { id: "perceived_roi", label: "Perceived ROI", description: "Does the persona believe it's worth the cost?", higherIsBetter: true, group: "pricing" },
  { id: "ease_of_understanding", label: "Ease of Understanding", description: "How easy is it to understand what the product does?", higherIsBetter: true, group: "adoption" },
  { id: "workflow_fit", label: "Workflow Fit", description: "How naturally does it fit current habits/workflow?", higherIsBetter: true, group: "adoption" },
  { id: "switching_willingness", label: "Switching Willingness", description: "How willing to change from current alternatives?", higherIsBetter: true, group: "adoption" },
  { id: "activation_likelihood", label: "Activation Likelihood", description: "How likely to try it soon?", higherIsBetter: true, group: "adoption" },
  { id: "repeat_usage_potential", label: "Repeat Usage", description: "How likely to use it repeatedly?", higherIsBetter: true, group: "retention" },
  { id: "shareability", label: "Shareability", description: "How likely to tell others about it?", higherIsBetter: true, group: "virality" },
  { id: "retention_potential", label: "Retention Potential", description: "How likely to keep using/paying?", higherIsBetter: true, group: "retention" },
];

export const CORE_CRITERIA: readonly Criterion[] = CORE;
export const CORE_IDS: readonly string[] = CORE.map((c) => c.id);
export const CRITERION_BY_ID = new Map<string, Criterion>(CORE.map((c) => [c.id, c]));

/** Register additional criteria (age overlays), keeping the first definition. */
export function register(criteria: Criterion[]): void {
  for (const c of criteria) {
    if (!CRITERION_BY_ID.has(c.id)) CRITERION_BY_ID.set(c.id, c);
  }
}

export function isBarrier(cid: string): boolean {
  const c = CRITERION_BY_ID.get(cid);
  return c !== undefined && !c.higherIsBetter;
}

/** Barrier criteria are inverted so "effective" always means good-for-adoption. */
export function effective(cid: string, score: number): number {
  return isBarrier(cid) ? 1.0 - score : score;
}

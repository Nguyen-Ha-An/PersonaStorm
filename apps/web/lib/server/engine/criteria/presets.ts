/**
 * Category criteria-weight presets — port of
 * apps/api/app/services/criteria/presets.py.
 */

import { CORE_IDS } from "./registry";

export interface Preset {
  category: string;
  weights: Record<string, number>;
  ageOverlayLambda: number;
}

const FLOOR = 0.02; // every core criterion keeps a small non-zero weight

const RAW: Record<string, Record<string, number>> = {
  ai_tool: { trust: 0.14, differentiation: 0.13, proof_requirement: 0.12, value_clarity: 0.1, perceived_roi: 0.1, workflow_fit: 0.09, pricing_acceptance: 0.08, need_intensity: 0.08, activation_likelihood: 0.07, retention_potential: 0.05, shareability: 0.04 },
  b2b_saas: { perceived_roi: 0.15, workflow_fit: 0.14, trust: 0.12, switching_willingness: 0.11, pricing_acceptance: 0.1, proof_requirement: 0.1, solution_fit: 0.09, differentiation: 0.06, activation_likelihood: 0.05, retention_potential: 0.04 },
  consumer_app: { ease_of_understanding: 0.15, activation_likelihood: 0.14, shareability: 0.12, retention_potential: 0.11, value_clarity: 0.1, need_intensity: 0.09, solution_fit: 0.08, repeat_usage_potential: 0.07, differentiation: 0.05 },
  ecommerce_product: { perceived_roi: 0.13, pricing_acceptance: 0.13, trust: 0.12, value_clarity: 0.11, differentiation: 0.1, need_intensity: 0.09, solution_fit: 0.08, proof_requirement: 0.08, shareability: 0.05 },
  education_product: { trust: 0.14, proof_requirement: 0.12, perceived_roi: 0.12, pricing_acceptance: 0.11, need_intensity: 0.1, repeat_usage_potential: 0.09, solution_fit: 0.08, value_clarity: 0.07 },
  marketplace: { trust: 0.14, need_intensity: 0.12, activation_likelihood: 0.11, value_clarity: 0.1, pricing_acceptance: 0.09, differentiation: 0.09, retention_potential: 0.08, shareability: 0.07 },
  social_product: { shareability: 0.16, activation_likelihood: 0.13, retention_potential: 0.12, need_intensity: 0.1, ease_of_understanding: 0.1, value_clarity: 0.08, differentiation: 0.07 },
  hardware_product: { perceived_roi: 0.13, trust: 0.12, proof_requirement: 0.11, differentiation: 0.11, value_clarity: 0.1, pricing_acceptance: 0.1, need_intensity: 0.09, solution_fit: 0.08 },
  luxury_product: { differentiation: 0.16, trust: 0.13, perceived_roi: 0.11, shareability: 0.11, need_intensity: 0.1, value_clarity: 0.09, pricing_acceptance: 0.06, retention_potential: 0.06 },
  generic: {}, // all-floor => uniform
};

const LAMBDA: Record<string, number> = {
  ai_tool: 0.12, b2b_saas: 0.07, consumer_app: 0.2, ecommerce_product: 0.15, education_product: 0.25,
  marketplace: 0.15, social_product: 0.22, hardware_product: 0.15, luxury_product: 0.2, generic: 0.15,
};

export const CATEGORY_IDS: readonly string[] = Object.keys(RAW);

export function resolvePreset(category: string): Preset {
  const cat = category in RAW ? category : "generic";
  const raw: Record<string, number> = {};
  for (const cid of CORE_IDS) raw[cid] = RAW[cat][cid] ?? FLOOR;
  const total = Object.values(raw).reduce((s, w) => s + w, 0);
  const weights: Record<string, number> = {};
  for (const cid of CORE_IDS) weights[cid] = raw[cid] / total;
  return { category: cat, weights, ageOverlayLambda: LAMBDA[cat] };
}

/**
 * Authoritative market-fit scorer — port of
 * apps/api/app/services/criteria/scoring.py.
 *
 * market_fit_score is ALWAYS produced here (category-weighted core + age
 * overlay + bounded modifiers + hard gates), never invented by a provider.
 */

import { clamp, round } from "../text";
import { lambdaBump } from "./ageOverlays";
import { resolvePreset } from "./presets";
import { CORE_IDS, effective } from "./registry";

export interface Gate {
  gate_applied: boolean;
  gate_name: string;
  reason: string;
  score_multiplier: number;
}

export interface MarketFitBreakdown {
  market_fit_score: number;
  category_weighted_core_score: number;
  age_overlay_score: number;
  age_overlay_lambda: number;
  modifier_adjustment: number;
  modifier_reasons: string[];
  gates: Gate[];
}

export function computeMarketFit(
  core: Record<string, number>,
  overlay: Record<string, number>,
  category: string,
  lifeStage: string,
  opts: { isHighRisk?: boolean; isTeenPaidEdu?: boolean } = {},
): MarketFitBreakdown {
  const { isHighRisk = false, isTeenPaidEdu = false } = opts;
  const preset = resolvePreset(category);

  let categoryWeightedCore = 0;
  for (const cid of CORE_IDS) {
    categoryWeightedCore += preset.weights[cid] * effective(cid, core[cid] ?? 0.0);
  }

  const overlayKeys = Object.keys(overlay);
  let ageOverlayScore: number;
  if (overlayKeys.length > 0) {
    let sum = 0;
    for (const [cid, v] of Object.entries(overlay)) sum += effective(cid, v);
    ageOverlayScore = sum / overlayKeys.length;
  } else {
    ageOverlayScore = categoryWeightedCore;
  }

  const ageOverlayLambda = clamp(preset.ageOverlayLambda + lambdaBump(lifeStage), 0.05, 0.35);

  const raw =
    (1 - ageOverlayLambda) * categoryWeightedCore + ageOverlayLambda * ageOverlayScore;

  let modifierAdjustment = 0.0;
  const modifierReasons: string[] = [];

  if ((core.trust ?? 0) < 0.3 && (core.proof_requirement ?? 0) > 0.75) {
    modifierAdjustment += -0.05;
    modifierReasons.push("trust gap with high proof demand");
  }
  if ((core.need_intensity ?? 0) > 0.75 && (core.solution_fit ?? 0) > 0.75 && (core.urgency ?? 0) > 0.6) {
    modifierAdjustment += 0.04;
    modifierReasons.push("strong, urgent need well matched");
  }
  if ((core.pricing_acceptance ?? 0) < 0.25 && (core.perceived_roi ?? 0) < 0.35) {
    modifierAdjustment += -0.05;
    modifierReasons.push("price rejected and ROI unconvincing");
  }

  modifierAdjustment = clamp(modifierAdjustment, -0.1, 0.1);

  let score = clamp(raw + modifierAdjustment, 0.0, 1.0);

  const gates: Gate[] = [];

  if (lifeStage === "teen_student" && isTeenPaidEdu && (overlay.parent_approval ?? 1.0) < 0.2) {
    const gate: Gate = {
      gate_applied: true,
      gate_name: "Low parent approval",
      reason: "Teen personas cannot realistically purchase without parent approval.",
      score_multiplier: 0.75,
    };
    gates.push(gate);
    score *= gate.score_multiplier;
  }

  if (isHighRisk && (core.trust ?? 1.0) < 0.2) {
    const gate: Gate = {
      gate_applied: true,
      gate_name: "Trust floor for high-risk product",
      reason: "High-risk products fail without baseline trust.",
      score_multiplier: 0.6,
    };
    gates.push(gate);
    score *= gate.score_multiplier;
  }

  const marketFitScore = clamp(score, 0.0, 1.0);

  return {
    market_fit_score: round(marketFitScore, 4),
    category_weighted_core_score: round(categoryWeightedCore, 4),
    age_overlay_score: round(ageOverlayScore, 4),
    age_overlay_lambda: round(ageOverlayLambda, 4),
    modifier_adjustment: round(modifierAdjustment, 4),
    modifier_reasons: modifierReasons,
    gates,
  };
}

/**
 * Shared engine types — the TypeScript analogue of the Pydantic schemas in
 * apps/api/app/schemas/{persona,reaction}.py. The reaction keeps the flat
 * surface (buy_likelihood, status, max_price, market_fit_score, first_objection,
 * quote, positive_trigger) that aggregation, quality, and the SSE stream rely on.
 */

import type { MarketFitBreakdown } from "./criteria/scoring";

export type ReactionStatus = "green" | "yellow" | "red";

// Status thresholds — defined once so provider + frontend legend never drift.
export const GREEN_THRESHOLD = 0.62;
export const RED_THRESHOLD = 0.38;

export function statusFor(buyLikelihood: number): ReactionStatus {
  if (buyLikelihood >= GREEN_THRESHOLD) return "green";
  if (buyLikelihood < RED_THRESHOLD) return "red";
  return "yellow";
}

export type Familiarity = "low" | "medium" | "high";

export interface DecisionContext {
  needs_parent_approval: boolean | null;
  budget_control: string | null;
  main_influence_sources: string[];
  risk_owner: string | null;
  attention_span: string | null;
  school_context: string | null;
  decision_horizon: string | null;
}

export interface Persona {
  persona_id: string;
  preset: string;
  segment: string;
  sub_segment: string;
  age: number;
  region: string;
  income_band: string;
  occupation: string;
  life_stage: string;
  decision_context: DecisionContext;
  // traits (0..1)
  price_sensitivity: number;
  skepticism: number;
  novelty_seeking: number;
  brand_trust: number;
  social_influence: number;
  risk_tolerance: number;
  privacy_sensitivity: number;
  // buying-decision variables
  category_familiarity: Familiarity;
  research_style: string;
  buying_trigger: string;
  dealbreakers: string[];
  monthly_budget_usd: number;
}

export interface Qualitative {
  first_objection: string;
  top_positive_trigger: string;
  top_negative_trigger: string;
  dealbreaker: string;
  proof_needed: string;
  emotional_reaction: string;
  would_tell: string;
  quote: string;
}

export interface ResearchRecommendation {
  should_validate_with_humans: boolean;
  validation_question: string;
  best_next_test: string;
}

export interface PersonaReaction {
  persona_id: string;
  segment: string;
  sub_segment: string;
  life_stage: string;

  // decision (flat)
  buy_likelihood: number;
  market_fit_score: number;
  status: ReactionStatus;
  max_price: number;
  currency: string;
  recommended_pricing_model: string;

  criteria_scores: Record<string, number>; // all 17 core ids
  age_specific_scores: Record<string, number>;

  qualitative: Qualitative;
  research_recommendation: ResearchRecommendation;
  reasoning_summary: string;
  market_fit_breakdown: MarketFitBreakdown;

  // flat convenience shims (mirror the Python @property accessors)
  first_objection: string;
  quote: string;
  positive_trigger: string;
}

// ---- verdict / top actions (derived report additions, Workstream 2) --------
// Derived from existing report fields at build time (see ./verdict); never
// re-inferred and never changes an engine number.

export type VerdictLevel = "strong" | "conditional" | "weak";

export interface Verdict {
  level: VerdictLevel;
  headline: string;
  rationale: string;
  caveated: boolean;
}

export interface TopActionEvidence {
  stat: string;
  quote?: string;
}

export interface TopAction {
  rank: number;
  imperative: string;
  why: string;
  evidence?: TopActionEvidence;
  anchorId: string;
}

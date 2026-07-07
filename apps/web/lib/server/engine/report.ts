/**
 * Final report types — TypeScript analogue of apps/api/app/schemas/report.py
 * and apps/api/app/schemas/quality.py. Shapes match apps/web/lib/types.ts so
 * the existing React report components render unchanged.
 */

import type { Verdict, TopAction } from "./types";

export const DISCLAIMER =
  "PersonaStorm output is a synthetic signal produced by a calibrated persona " +
  "model. It is a hypothesis generator for pre-research — objections and price " +
  "bands to validate with real humans — not a replacement for real user research.";

export type Level = "low" | "medium" | "high";
export type Strength = "weak" | "moderate" | "strong";

export interface QualityMetrics {
  persona_adherence: number;
  product_grounding: number;
  generic_response_rate: number;
  duplicate_objection_rate: number;
  objection_entropy: Level;
  objection_entropy_score: number;
  segment_variance: Strength;
  segment_variance_score: number;
  age_cohort_variance: Strength;
  criteria_consistency: number;
  collapse_risk: Level;
  collapse_risk_score: number;
  benchmark_confidence: Level;
  benchmark_category: string | null;
  notes: string[];
}

export interface AdoptionSummary {
  green: number;
  yellow: number;
  red: number;
  average_buy_likelihood: number;
  average_market_fit_score: number;
}

export interface SegmentReport {
  segment: string;
  personas: number;
  green: number;
  yellow: number;
  red: number;
  adoption_rate: number;
  avg_buy_likelihood: number;
  avg_max_price: number;
  top_objection: string;
  insight: string;
}

export interface ObjectionCluster {
  label: string;
  count: number;
  share: number;
  example_quote: string;
  top_segments: string[];
}

export interface PricePoint {
  price: number;
  share_willing: number;
}

export interface Recommendation {
  title: string;
  detail: string;
  priority: "now" | "next" | "later";
}

export interface KillQuoteContext {
  persona_id: string;
  segment: string;
  buy_likelihood: number;
  skepticism: number;
}

export interface Overall {
  market_fit_score: number;
  confidence: Level;
  top_blockers: string[];
  top_strengths: string[];
}

export interface CriterionBreakdown {
  criterion_id: string;
  label: string;
  average_score: number;
  higher_is_better: boolean;
  weight: number;
  segment_scores: { segment: string; score: number }[];
  interpretation: string;
}

export interface CriterionCard {
  criterion_id: string;
  label: string;
  average_score: number;
  weight: number;
  interpretation: string;
}

export interface AgeCohortReport {
  life_stage: string;
  personas: number;
  adoption_rate: number;
  avg_buy_likelihood: number;
  avg_market_fit_score: number;
  top_barrier: string;
  insight: string;
}

export interface NextValidation {
  question: string;
  test_type: string;
  rationale: string;
}

export interface StormReport {
  storm_id: string;
  title: string;
  summary: string;
  product_category: string;
  adoption: AdoptionSummary;
  overall: Overall | null;
  segments: SegmentReport[];
  criteria_breakdown: CriterionBreakdown[];
  weakest_criteria: CriterionCard[];
  strongest_criteria: CriterionCard[];
  age_cohorts: AgeCohortReport[];
  top_objections: ObjectionCluster[];
  price_sensitivity: PricePoint[];
  kill_quote: string;
  kill_quote_context: KillQuoteContext | null;
  quality: QualityMetrics;
  recommendations: Recommendation[];
  next_human_validation: NextValidation[];
  persona_count: number;
  // Derived at build time by attachVerdictAndActions (see ./verdict). Optional
  // so in-progress builds and legacy runs remain valid StormReports.
  verdict?: Verdict;
  top_actions?: TopAction[];
  stimulus_type: string;
  target_market: string;
  avg_max_price: number;
  generated_at: string;
  disclaimer: string;
}

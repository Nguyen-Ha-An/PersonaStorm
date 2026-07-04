/**
 * TypeScript mirror of the backend Pydantic schemas (apps/api/app/schemas)
 * and the JSON Schemas in packages/schemas. Change all three together.
 */

export type StimulusType = "product_concept" | "landing_page" | "ad" | "pricing_table";

export type TargetMarket =
  | "sea_genz"
  | "us_smb"
  | "parents"
  | "enterprise"
  | "budget"
  | "early_adopters"
  | "custom";

export type ReactionStatus = "green" | "yellow" | "red";
export type CellStatus = ReactionStatus | "pending";
export type Level = "low" | "medium" | "high";
export type Strength = "weak" | "moderate" | "strong";

export interface StormCreateRequest {
  title: string;
  stimulus_type: StimulusType;
  stimulus: string;
  target_market: TargetMarket;
  custom_segment_description?: string;
  persona_count: number;
  seed?: number;
}

export interface StormCreateResponse {
  storm_id: string;
  status: string;
}

export interface StormMeta {
  storm_id: string;
  title: string;
  status: string;
  stimulus_type: StimulusType;
  target_market: TargetMarket;
  persona_count: number;
  completed: number;
  report_ready: boolean;
  error: string | null;
  created_at: string;
}

// ---- SSE event payloads ----------------------------------------------------

export interface ReactionEvent {
  persona_id: string;
  index: number;
  segment: string;
  buy_likelihood: number;
  max_price: number;
  status: ReactionStatus;
  first_objection: string;
  quote: string;
}

export interface ProgressEvent {
  status: string;
  completed: number;
  total: number;
  green: number;
  yellow: number;
  red: number;
  avg_max_price: number;
  top_objection: string;
  collapse_risk: Level;
  elapsed_ms: number;
}

// ---- report ------------------------------------------------------------------

export interface QualityMetrics {
  persona_adherence: number;
  product_grounding: number;
  generic_response_rate: number;
  duplicate_objection_rate: number;
  objection_entropy: Level;
  objection_entropy_score: number;
  segment_variance: Strength;
  segment_variance_score: number;
  collapse_risk: Level;
  collapse_risk_score: number;
  benchmark_confidence: Level;
  benchmark_category: string | null;
  notes: string[];
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

export interface StormReport {
  storm_id: string;
  title: string;
  summary: string;
  adoption: { green: number; yellow: number; red: number };
  segments: SegmentReport[];
  top_objections: ObjectionCluster[];
  price_sensitivity: PricePoint[];
  kill_quote: string;
  kill_quote_context: KillQuoteContext | null;
  quality: QualityMetrics;
  recommendations: Recommendation[];
  persona_count: number;
  stimulus_type: string;
  target_market: string;
  avg_max_price: number;
  generated_at: string;
  disclaimer: string;
}

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
  product_category?: string;
  persona_count: number;
  seed?: number;
}

export interface StormCreateResponse {
  storm_id: string;
  status: string;
  price_credits: number;
  wallet_balance_after: number | null;
}

// ---- auth / wallet / billing -----------------------------------------------

export type UserRole = "user" | "admin";

export interface Wallet {
  balance_credits: number;
  lifetime_spent_credits: number;
}

export interface Me {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string | null;
  wallet: Wallet;
}

export interface WalletTransaction {
  id: string;
  type: "credit_grant" | "storm_charge" | "refund" | "admin_adjustment";
  amount_credits: number;
  balance_after: number;
  description: string | null;
  storm_id: string | null;
  created_at: string;
}

export interface Pricing {
  name: string;
  base_run_credits: number;
  credits_per_100_personas: number;
  analyst_report_credits: number;
}

export interface InferenceSettings {
  inference_provider: "mock" | "nvidia";
  analyst_provider: "mock" | "nvidia";
  nvidia_model: string;
  analyst_model: string;
  nvidia_max_tokens: number;
  analyst_max_tokens: number;
  nvidia_base_url: string;
  nvidia_api_key_configured: boolean;
}

export interface DashboardPricing {
  base_run_credits: number;
  credits_per_100_personas: number;
  analyst_report_credits: number;
  /** Convenience: credits for a 1,000-persona run with the analyst report. */
  thousand_persona_run: number;
}

/** The consolidated GET /api/dashboard payload — all real, from one auth call. */
export interface DashboardData {
  user: {
    id: string;
    email: string;
    full_name: string | null;
    role: UserRole;
  };
  wallet: Wallet;
  pricing: DashboardPricing;
  stats: {
    storms_run: number;
    credits_spent: number;
  };
  recent_storms: StormHistoryItem[];
}

export interface QuoteRequest {
  persona_count: number;
  include_analyst_report: boolean;
}

export interface Quote {
  persona_count: number;
  base_run_credits: number;
  credits_per_100_personas: number;
  analyst_report_credits: number;
  total_credits: number;
  wallet_balance: number;
  balance_after: number;
  has_enough_credits: boolean;
}

export interface StormHistoryItem {
  id: string;
  title: string;
  status: string;
  stimulus_type: string;
  target_market: string;
  persona_count: number;
  price_credits: number;
  created_at: string | null;
  completed_at: string | null;
}

// ---- admin -----------------------------------------------------------------

export interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  created_at: string | null;
  balance_credits: number;
  lifetime_spent_credits: number;
  total_storms: number;
  total_spent_credits: number;
}

export interface AdminUserDetail extends AdminUser {
  recent_transactions: WalletTransaction[];
  recent_storms: StormHistoryItem[];
}

export interface AdminStormRun {
  id: string;
  user_id: string;
  user_email: string | null;
  title: string;
  status: string;
  stimulus_type: string;
  target_market: string;
  persona_count: number;
  price_credits: number;
  created_at: string | null;
  completed_at: string | null;
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
  price_credits: number;
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
  avg_market_fit: number;
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
  age_cohort_variance: Strength;
  criteria_consistency: number;
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
  adoption: {
    green: number;
    yellow: number;
    red: number;
    average_buy_likelihood: number;
    average_market_fit_score: number;
  };
  overall: Overall;
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
  verdict?: Verdict;
  top_actions?: TopAction[];
  stimulus_type: string;
  target_market: string;
  avg_max_price: number;
  generated_at: string;
  disclaimer: string;
}

/**
 * Client-facing mirror of the engine's derivation types
 * (lib/server/engine/types.ts). Kept identical so the isomorphic
 * deriveVerdict / selectTopActions fallback in report/page.tsx yields the
 * exact same shapes the server persisted.
 */
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

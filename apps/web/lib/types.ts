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

export interface OrchestrationSettingsView {
  orchestration_enabled: boolean;
  orchestrator_provider: "nvidia";
  orchestrator_model: string;
  worker_provider: "fireworks";
  worker_model: string;
  max_physical_workers: number;
  virtual_agents_per_worker: number;
  worker_max_tokens: number;
  orchestrator_max_tokens: number;
  worker_temperature: number;
  orchestrator_temperature: number;
  enable_worker_web_research: boolean;
  worker_web_research_max_queries: number;
  max_physical_workers_cap: number;
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
  // Nemotron/Fireworks orchestration — keys exposed only as booleans.
  fireworks_base_url: string;
  fireworks_api_key_configured: boolean;
  orchestration: OrchestrationSettingsView;
}

// ── Nemotron-orchestrated Fireworks worker swarm (client-facing shapes) ─────

export type OrchestrationStatus =
  | "queued"
  | "planning"
  | "running_workers"
  | "synthesizing"
  | "completed"
  | "failed";

export interface OrchestrationVirtualAgent {
  virtual_agent_id: string;
  persona_or_role: string;
  angle: string;
}

export interface OrchestrationShard {
  shard_id: string;
  role_name: string;
  system_prompt: string;
  task_prompt: string;
  virtual_agents: OrchestrationVirtualAgent[];
  expected_output_schema: string;
}

export interface OrchestrationPlan {
  objective: string;
  worker_count: number;
  virtual_agent_count: number;
  worker_shards: OrchestrationShard[];
  synthesis_instructions: string;
}

export interface OrchestrationVirtualAgentResult {
  virtual_agent_id: string;
  perspective: string;
  reaction_summary: string;
  objections: string[];
  purchase_or_adoption_drivers: string[];
  confusion_points: string[];
  raw_criteria_scores?: Record<string, number>;
}

export interface OrchestrationShardOutput {
  shard_id: string;
  role_name: string;
  virtual_agent_results: OrchestrationVirtualAgentResult[];
  shard_summary: string;
  confidence: "low" | "medium" | "high";
  failure_risks: string[];
}

export interface OrchestrationServerNumerics {
  physical_worker_count: number;
  virtual_agent_count: number;
  successful_workers: number;
  failed_workers: number;
  market_fit_score: number;
  status: "green" | "yellow" | "red";
  green: number;
  yellow: number;
  red: number;
  avg_confidence: number;
}

export interface OrchestratedStormReport {
  executive_summary: string;
  strongest_signals: string[];
  weakest_signals: string[];
  segment_insights: { segment: string; insight: string; evidence_from_workers: string[] }[];
  objections_to_fix: string[];
  messaging_recommendations: string[];
  product_recommendations: string[];
  pricing_or_offer_notes: string[];
  final_recommendation: string;
  confidence: "low" | "medium" | "high";
}

export interface OrchestrationRecord {
  status: OrchestrationStatus;
  plan: OrchestrationPlan | null;
  worker_shard_outputs: OrchestrationShardOutput[];
  final: OrchestratedStormReport | null;
  server_numerics: OrchestrationServerNumerics | null;
  physical_worker_count: number;
  virtual_agent_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
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

export type EvidenceStatus = "sourced" | "derived" | "unverified";

export interface FiredAssumption {
  id: string;
  evidence_status: EvidenceStatus;
  personas_affected: number;
}

export type CounterfactualField =
  | "region"
  | "income_band"
  | "occupation"
  | "life_stage"
  | "decision_context.budget_control";

export interface CounterfactualPairResult {
  audit_id: string;
  persona_id: string;
  field: CounterfactualField;
  baseline_value: string | null;
  counterfactual_value: string | null;
  baseline_buy_likelihood: number;
  counterfactual_buy_likelihood: number;
  delta_buy_likelihood: number;
  baseline_market_fit_score: number;
  counterfactual_market_fit_score: number;
  delta_market_fit_score: number;
  flagged: boolean;
  applicable: boolean;
}

export interface CounterfactualAudit {
  status: "not_run" | "pass" | "warn" | "fail";
  pairs_tested: number;
  pairs_not_applicable: number;
  fields_tested: CounterfactualField[];
  fields_not_applicable: CounterfactualField[];
  max_abs_buy_likelihood_delta: number;
  max_abs_market_fit_delta: number;
  flagged_pairs: CounterfactualPairResult[];
  summary: string;
  notes: string[];
}

export interface CalibrationEvidence {
  priors_coverage: number;
  priors_source: "data_files" | "embedded_unverified";
  assumptions_fired: FiredAssumption[];
  counterfactual_audit: CounterfactualAudit;
  confidence_downgrades: string[];
  semantic_source: "nvidia" | "fireworks" | "fallback_formulas";
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
  // Additive Phase A calibration block (spec §10); optional so legacy
  // persisted runs remain valid StormReports.
  calibration_evidence?: CalibrationEvidence;
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

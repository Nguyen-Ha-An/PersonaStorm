/**
 * Types for the Nemotron-orchestrated Fireworks worker swarm.
 *
 * Vocabulary (see the design doc — used verbatim in code):
 *   - Physical worker: one real Fireworks API call / task slot (<= 10 per storm).
 *   - Virtual agent:    a role/persona simulated inside a physical worker's prompt.
 *   - Worker shard:     one physical worker assigned a batch of virtual agents.
 *   - Orchestrator:     Nemotron — plans, delegates, reviews, synthesizes.
 */

export type OrchestrationStatus =
  | "queued"
  | "planning"
  | "running_workers"
  | "synthesizing"
  | "completed"
  | "failed";

export type ConfidenceLevel = "low" | "medium" | "high";

// ── Step 1: Nemotron plan ──────────────────────────────────────────────────

export interface VirtualAgentSpec {
  virtual_agent_id: string;
  persona_or_role: string;
  angle: string;
}

export interface WorkerShard {
  shard_id: string;
  role_name: string;
  system_prompt: string;
  task_prompt: string;
  virtual_agents: VirtualAgentSpec[];
  expected_output_schema: string;
}

export interface OrchestrationPlan {
  objective: string;
  /** Real workers to deploy — ALWAYS <= MAX_PHYSICAL_SWARM_WORKERS after validation. */
  worker_count: number;
  virtual_agent_count: number;
  worker_shards: WorkerShard[];
  synthesis_instructions: string;
}

// ── Step 2: Fireworks worker output ────────────────────────────────────────

export interface VirtualAgentResult {
  virtual_agent_id: string;
  perspective: string;
  reaction_summary: string;
  objections: string[];
  purchase_or_adoption_drivers: string[];
  confusion_points: string[];
  /** RAW criterion-level judgments only — never authoritative aggregate numbers. */
  raw_criteria_scores?: Record<string, number>;
}

export interface WorkerShardOutput {
  shard_id: string;
  role_name: string;
  virtual_agent_results: VirtualAgentResult[];
  shard_summary: string;
  confidence: ConfidenceLevel;
  failure_risks: string[];
}

// ── Step 4: Nemotron final synthesis (TEXT ONLY — no authoritative numbers) ──

export interface SegmentInsight {
  segment: string;
  insight: string;
  evidence_from_workers: string[];
}

export interface OrchestratedStormReport {
  executive_summary: string;
  strongest_signals: string[];
  weakest_signals: string[];
  segment_insights: SegmentInsight[];
  objections_to_fix: string[];
  messaging_recommendations: string[];
  product_recommendations: string[];
  pricing_or_offer_notes: string[];
  final_recommendation: string;
  confidence: ConfidenceLevel;
}

// ── Server-computed numeric truth (authoritative; never model-supplied) ─────

export interface ServerNumerics {
  physical_worker_count: number;
  virtual_agent_count: number;
  successful_workers: number;
  failed_workers: number;
  /** Recomputed server-side from raw worker judgments — the LLM cannot set these. */
  market_fit_score: number;
  status: "green" | "yellow" | "red";
  green: number;
  yellow: number;
  red: number;
  avg_confidence: number;
}

// ── Persisted record (one per storm, stored as orchestration_json) ──────────

export interface OrchestrationRecord {
  status: OrchestrationStatus;
  plan: OrchestrationPlan | null;
  worker_shard_outputs: WorkerShardOutput[];
  final: OrchestratedStormReport | null;
  server_numerics: ServerNumerics | null;
  physical_worker_count: number;
  virtual_agent_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ── Injectable provider interfaces (so tests count calls without network) ───

export interface PlannerInput {
  objective: string;
  stimulus: string;
  stimulusType: string;
  targetPersonaCount: number;
  /** The hard ceiling handed to Nemotron — it must plan within this. */
  maxPhysicalWorkers: number;
  workerModelLabel: string;
}

export interface PlannerClient {
  readonly name: string;
  plan(input: PlannerInput): Promise<OrchestrationPlan>;
}

export interface WorkerClient {
  readonly name: string;
  /** Exactly one real API call per invocation. */
  runShard(shard: WorkerShard, stimulus: string, stimulusType: string): Promise<WorkerShardOutput>;
}

export interface SynthesizerInput {
  stimulus: string;
  plan: OrchestrationPlan;
  workerOutputs: WorkerShardOutput[];
  serverNumerics: ServerNumerics;
}

export interface SynthesizerClient {
  readonly name: string;
  synthesize(input: SynthesizerInput): Promise<OrchestratedStormReport>;
}

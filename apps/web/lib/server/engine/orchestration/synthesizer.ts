/**
 * Step 4 — Nemotron synthesis + the numeric-honesty firewall.
 *
 * The orchestrator turns raw worker findings into a decision-ready narrative.
 * Its output type (OrchestratedStormReport) is deliberately TEXT-ONLY: string
 * arrays plus a `confidence` enum. `sanitizeSynthesis` strips any numeric keys
 * a model tries to smuggle in, and `computeServerNumerics` produces the
 * authoritative aggregate numbers server-side from the raw worker judgments.
 * Nemotron and DeepSeek can never overwrite server-computed numeric truth.
 */

import { round } from "../text";
import { chatCompletion, extractJsonObject } from "../providers/chatClient";
import type {
  ConfidenceLevel,
  OrchestratedStormReport,
  OrchestrationPlan,
  SegmentInsight,
  ServerNumerics,
  SynthesizerClient,
  SynthesizerInput,
  WorkerShardOutput,
} from "./types";

const CONFIDENCE = new Set<ConfidenceLevel>(["low", "medium", "high"]);
const CONFIDENCE_WEIGHT: Record<ConfidenceLevel, number> = { low: 0.3, medium: 0.5, high: 0.75 };

function str(v: unknown, max: number): string {
  return (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);
}

function strArray(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, maxItems).map((x) => str(x, maxLen)).filter(Boolean);
}

function confidenceOf(v: unknown, fallback: ConfidenceLevel = "medium"): ConfidenceLevel {
  return CONFIDENCE.has(v as ConfidenceLevel) ? (v as ConfidenceLevel) : fallback;
}

function meanScore(scores: Record<string, number> | undefined): number | null {
  if (!scores) return null;
  const vals = Object.values(scores).filter((n) => Number.isFinite(n));
  if (!vals.length) return null;
  return vals.reduce((s, n) => s + n, 0) / vals.length;
}

/** Server-computed statuses use the same buy-likelihood bands as the classic engine. */
function statusFromScore(score: number): "green" | "yellow" | "red" {
  if (score >= 0.66) return "green";
  if (score >= 0.4) return "yellow";
  return "red";
}

/**
 * AUTHORITATIVE server-side numerics. Recomputed from raw worker judgments only
 * — never taken from any model's aggregate output. This is the single source of
 * numeric truth attached to the final report.
 */
export function computeServerNumerics(
  plan: OrchestrationPlan,
  workerOutputs: WorkerShardOutput[],
  failedWorkers: number,
): ServerNumerics {
  let green = 0;
  let yellow = 0;
  let red = 0;
  const perAgentScores: number[] = [];
  const confidenceScores: number[] = [];

  for (const shard of workerOutputs) {
    const shardConfWeight = CONFIDENCE_WEIGHT[confidenceOf(shard.confidence)];
    confidenceScores.push(shardConfWeight);
    for (const agent of shard.virtual_agent_results) {
      const s = meanScore(agent.raw_criteria_scores) ?? shardConfWeight;
      perAgentScores.push(s);
      const st = statusFromScore(s);
      if (st === "green") green += 1;
      else if (st === "yellow") yellow += 1;
      else red += 1;
    }
  }

  const marketFit = perAgentScores.length
    ? round(perAgentScores.reduce((s, n) => s + n, 0) / perAgentScores.length, 3)
    : 0;
  const avgConfidence = confidenceScores.length
    ? round(confidenceScores.reduce((s, n) => s + n, 0) / confidenceScores.length, 3)
    : 0;

  return {
    physical_worker_count: plan.worker_count,
    virtual_agent_count: plan.virtual_agent_count,
    successful_workers: workerOutputs.length,
    failed_workers: failedWorkers,
    market_fit_score: marketFit,
    status: statusFromScore(marketFit),
    green,
    yellow,
    red,
    avg_confidence: avgConfidence,
  };
}

/**
 * Strip a raw synthesis object down to the TEXT-ONLY report shape. Any numeric
 * key (market_fit_score, counts, status, etc.) a model tried to include is
 * silently dropped here — it has no path into the persisted record. Server
 * numerics are attached separately by the caller.
 */
export function sanitizeSynthesis(raw: unknown): OrchestratedStormReport {
  const o = (raw ?? {}) as Record<string, unknown>;
  const segmentInsights: SegmentInsight[] = Array.isArray(o.segment_insights)
    ? o.segment_insights.slice(0, 12).map((s: unknown) => {
        const seg = (s ?? {}) as Record<string, unknown>;
        return {
          segment: str(seg.segment, 120),
          insight: str(seg.insight, 600),
          evidence_from_workers: strArray(seg.evidence_from_workers, 8, 300),
        };
      })
    : [];

  return {
    executive_summary: str(o.executive_summary, 2000),
    strongest_signals: strArray(o.strongest_signals, 10, 300),
    weakest_signals: strArray(o.weakest_signals, 10, 300),
    segment_insights: segmentInsights,
    objections_to_fix: strArray(o.objections_to_fix, 12, 300),
    messaging_recommendations: strArray(o.messaging_recommendations, 12, 300),
    product_recommendations: strArray(o.product_recommendations, 12, 300),
    pricing_or_offer_notes: strArray(o.pricing_or_offer_notes, 12, 300),
    final_recommendation: str(o.final_recommendation, 800),
    confidence: confidenceOf(o.confidence),
  };
}

const SYNTH_SYSTEM =
  "You are Nemotron, the ORCHESTRATOR, writing the FINAL report from worker findings. " +
  "You MUST NOT invent or alter any number — market fit, counts, and status are computed " +
  "server-side and provided to you as immutable context. Output ONLY qualitative prose and " +
  "string lists. Reply with a single JSON object of shape: " +
  '{"executive_summary":string,"strongest_signals":[string],"weakest_signals":[string],' +
  '"segment_insights":[{"segment":string,"insight":string,"evidence_from_workers":[string]}],' +
  '"objections_to_fix":[string],"messaging_recommendations":[string],"product_recommendations":[string],' +
  '"pricing_or_offer_notes":[string],"final_recommendation":string,"confidence":"low|medium|high"}.';

export interface NemotronSynthesizerOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeoutMs?: number;
}

export class NemotronSynthesizer implements SynthesizerClient {
  readonly name = "nvidia";
  constructor(private opts: NemotronSynthesizerOptions) {}

  async synthesize(input: SynthesizerInput): Promise<OrchestratedStormReport> {
    // Worker outputs are summarized to keep the prompt bounded; raw scores are
    // NOT forwarded as authority — the server numerics already encode the truth.
    const workerDigest = input.workerOutputs.map((w) => ({
      role: w.role_name,
      confidence: w.confidence,
      summary: w.shard_summary,
      objections: w.virtual_agent_results.flatMap((a) => a.objections).slice(0, 6),
      drivers: w.virtual_agent_results.flatMap((a) => a.purchase_or_adoption_drivers).slice(0, 6),
    }));
    const user =
      `STIMULUS:\n${input.stimulus}\n\n` +
      `OBJECTIVE: ${input.plan.objective}\n` +
      `SYNTHESIS INSTRUCTIONS: ${input.plan.synthesis_instructions}\n\n` +
      `SERVER-COMPUTED NUMBERS (IMMUTABLE — do not restate or change):\n` +
      `${JSON.stringify(input.serverNumerics)}\n\n` +
      `WORKER FINDINGS:\n${JSON.stringify(workerDigest)}`;

    const content = await chatCompletion({
      baseUrl: this.opts.baseUrl,
      apiKey: this.opts.apiKey,
      model: this.opts.model,
      messages: [
        { role: "system", content: SYNTH_SYSTEM },
        { role: "user", content: user },
      ],
      maxTokens: this.opts.maxTokens,
      temperature: this.opts.temperature,
      jsonObject: true,
      timeoutMs: this.opts.timeoutMs ?? 120_000,
    });

    // Sanitize: even if the model returned numbers, they are stripped here.
    return sanitizeSynthesis(extractJsonObject(content));
  }
}

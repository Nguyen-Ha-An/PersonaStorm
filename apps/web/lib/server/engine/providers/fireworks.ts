/**
 * FireworksWorkerClient — the cheap, narrow physical worker of the swarm.
 *
 * One `runShard()` call === exactly one real Fireworks DeepSeek-V4-Flash API
 * call. A shard may simulate several *virtual* agents inside its prompt, but
 * that never multiplies the physical API fanout — the swarm's hard cap
 * (MAX_PHYSICAL_SWARM_WORKERS) is enforced by the caller, and this client only
 * ever issues a single request per shard.
 *
 * The model provides reaction text, qualitative observations, and RAW
 * criterion-level judgments. It NEVER produces authoritative aggregate numbers
 * — those are recomputed server-side by the orchestrator.
 */

import { ProviderNotConfiguredError } from "../../errors";
import { chatCompletion, extractJsonObject } from "./chatClient";
import type {
  ConfidenceLevel,
  VirtualAgentResult,
  WorkerClient,
  WorkerShard,
  WorkerShardOutput,
} from "../orchestration/types";

export interface FireworksOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeoutMs?: number;
}

const CONFIDENCE = new Set<ConfidenceLevel>(["low", "medium", "high"]);

function str(v: unknown, max: number): string {
  return (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);
}

function strArray(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, maxItems).map((x) => str(x, maxLen)).filter(Boolean);
}

function confidenceOf(v: unknown): ConfidenceLevel {
  return CONFIDENCE.has(v as ConfidenceLevel) ? (v as ConfidenceLevel) : "medium";
}

export class FireworksWorkerClient implements WorkerClient {
  readonly name = "fireworks";
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private timeoutMs: number;

  constructor(opts: FireworksOptions) {
    if (!opts.baseUrl) {
      throw new ProviderNotConfiguredError(
        "worker_provider=fireworks but FIREWORKS_BASE_URL is not set. Point it at " +
          "https://api.fireworks.ai/inference/v1.",
      );
    }
    if (opts.baseUrl.includes("api.fireworks.ai") && !opts.apiKey) {
      throw new ProviderNotConfiguredError(
        "worker_provider=fireworks targets the hosted Fireworks endpoint but " +
          "FIREWORKS_API_KEY is not set.",
      );
    }
    if (!opts.model) {
      throw new ProviderNotConfiguredError(
        "worker_provider=fireworks but no worker model is configured " +
          "(set FIREWORKS_DEEPSEEK_MODEL or the worker_model setting).",
      );
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl;
    this.model = opts.model;
    this.maxTokens = opts.maxTokens;
    this.temperature = opts.temperature;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  async runShard(shard: WorkerShard, stimulus: string, stimulusType: string): Promise<WorkerShardOutput> {
    const virtualAgentList = shard.virtual_agents
      .map((a, i) => `${i + 1}. [${a.virtual_agent_id}] ${a.persona_or_role} — angle: ${a.angle}`)
      .join("\n");

    const system =
      `${shard.system_prompt}\n\n` +
      `You are ONE worker shard ("${shard.role_name}") simulating ${shard.virtual_agents.length} ` +
      `virtual agents. Respond for EACH virtual agent. Provide reaction text, objections, ` +
      `adoption drivers, and confusion points. You may include RAW per-criterion scores in [0,1] ` +
      `but you MUST NOT invent aggregate scores, counts, or a final verdict — those are computed ` +
      `elsewhere. Reply with a single JSON object matching this schema:\n${shard.expected_output_schema}`;

    const user =
      `STIMULUS (${stimulusType}):\n${stimulus}\n\n` +
      `TASK:\n${shard.task_prompt}\n\n` +
      `VIRTUAL AGENTS:\n${virtualAgentList}`;

    const content = await chatCompletion({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      jsonObject: true,
      timeoutMs: this.timeoutMs,
    });

    return parseWorkerOutput(content, shard);
  }
}

/** Defensive parse of a worker JSON reply into a typed WorkerShardOutput. */
export function parseWorkerOutput(content: string, shard: WorkerShard): WorkerShardOutput {
  const data = extractJsonObject(content);
  const rawResults = Array.isArray(data.virtual_agent_results) ? data.virtual_agent_results : [];

  const virtual_agent_results: VirtualAgentResult[] = rawResults.map((r: unknown, i: number) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const rawScores = (o.raw_criteria_scores ?? {}) as Record<string, unknown>;
    const scores: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawScores)) {
      const n = Number(v);
      if (Number.isFinite(n)) scores[String(k).slice(0, 60)] = Math.max(0, Math.min(1, n));
    }
    return {
      virtual_agent_id: str(o.virtual_agent_id, 80) || shard.virtual_agents[i]?.virtual_agent_id || `va_${i}`,
      perspective: str(o.perspective, 200),
      reaction_summary: str(o.reaction_summary, 800),
      objections: strArray(o.objections, 8, 280),
      purchase_or_adoption_drivers: strArray(o.purchase_or_adoption_drivers, 8, 280),
      confusion_points: strArray(o.confusion_points, 8, 280),
      raw_criteria_scores: Object.keys(scores).length ? scores : undefined,
    };
  });

  return {
    shard_id: shard.shard_id,
    role_name: shard.role_name,
    virtual_agent_results,
    shard_summary: str(data.shard_summary, 1200),
    confidence: confidenceOf(data.confidence),
    failure_risks: strArray(data.failure_risks, 8, 280),
  };
}

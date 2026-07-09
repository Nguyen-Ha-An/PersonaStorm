/**
 * Step 1 — Nemotron planning.
 *
 * The orchestrator (NVIDIA Nemotron) receives the stimulus, objective, target
 * breadth, the hard worker cap, and the numeric-honesty rules, and returns an
 * OrchestrationPlan. Whatever the model returns is then run through
 * `validateAndClampPlan`, which is server-authoritative: it guarantees
 * `worker_count <= MAX_PHYSICAL_SWARM_WORKERS` by MERGING extra shards into <=10
 * groups (never silently dropping roles), and recomputes the virtual-agent
 * count from the actual shards.
 */

import { chatCompletion, extractJsonObject } from "../providers/chatClient";
import { clampPhysicalWorkers, MAX_PHYSICAL_SWARM_WORKERS } from "./caps";
import type {
  OrchestrationPlan,
  PlannerClient,
  PlannerInput,
  VirtualAgentSpec,
  WorkerShard,
} from "./types";

function str(v: unknown, max: number): string {
  return (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);
}

function coerceVirtualAgents(v: unknown, shardIndex: number): VirtualAgentSpec[] {
  if (!Array.isArray(v)) return [];
  return v.map((a, i) => {
    const o = (a ?? {}) as Record<string, unknown>;
    return {
      virtual_agent_id: str(o.virtual_agent_id, 80) || `s${shardIndex}_va${i}`,
      persona_or_role: str(o.persona_or_role, 200) || `role ${i + 1}`,
      angle: str(o.angle, 280),
    };
  });
}

function coerceShard(v: unknown, index: number): WorkerShard {
  const o = (v ?? {}) as Record<string, unknown>;
  const virtual_agents = coerceVirtualAgents(o.virtual_agents, index);
  return {
    shard_id: str(o.shard_id, 80) || `shard_${index}`,
    role_name: str(o.role_name, 120) || `Worker ${index + 1}`,
    system_prompt: str(o.system_prompt, 4000),
    task_prompt: str(o.task_prompt, 4000),
    virtual_agents: virtual_agents.length ? virtual_agents : [{ virtual_agent_id: `s${index}_va0`, persona_or_role: `Worker ${index + 1}`, angle: "" }],
    expected_output_schema: str(o.expected_output_schema, 2000) || DEFAULT_OUTPUT_SCHEMA,
  };
}

const DEFAULT_OUTPUT_SCHEMA =
  '{"virtual_agent_results":[{"virtual_agent_id":"string","perspective":"string",' +
  '"reaction_summary":"string","objections":["string"],"purchase_or_adoption_drivers":["string"],' +
  '"confusion_points":["string"],"raw_criteria_scores":{"criterion":0.0}}],' +
  '"shard_summary":"string","confidence":"low|medium|high","failure_risks":["string"]}';

/**
 * Merge `shards` down to at most `cap` shards by bin-packing the smaller shards
 * together, so no role is dropped — extra roles become extra virtual agents
 * inside a surviving shard. Balanced by virtual-agent count.
 */
export function mergeShardsToCap(shards: WorkerShard[], cap: number): WorkerShard[] {
  const limit = clampPhysicalWorkers(cap);
  if (shards.length <= limit) return shards;

  // Largest-first greedy bin-packing into `limit` groups.
  const groups: WorkerShard[][] = Array.from({ length: limit }, () => []);
  const load = new Array<number>(limit).fill(0);
  const sorted = [...shards].sort((a, b) => b.virtual_agents.length - a.virtual_agents.length);
  for (const shard of sorted) {
    let target = 0;
    for (let i = 1; i < limit; i++) if (load[i] < load[target]) target = i;
    groups[target].push(shard);
    load[target] += Math.max(1, shard.virtual_agents.length);
  }

  return groups
    .filter((g) => g.length > 0)
    .map((group, idx) => {
      if (group.length === 1) return { ...group[0], shard_id: `shard_${idx}` };
      const roleName = group.map((s) => s.role_name).join(" + ").slice(0, 160);
      const virtual_agents = group.flatMap((s) => s.virtual_agents);
      return {
        shard_id: `shard_${idx}`,
        role_name: roleName,
        system_prompt: group.map((s) => s.system_prompt).filter(Boolean).join("\n\n---\n\n").slice(0, 6000),
        task_prompt: group
          .map((s) => `[${s.role_name}] ${s.task_prompt}`)
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 6000),
        virtual_agents,
        expected_output_schema: group[0].expected_output_schema || DEFAULT_OUTPUT_SCHEMA,
      };
    });
}

/**
 * Server-authoritative validation + clamp of a (possibly untrusted / oversized)
 * plan. Guarantees `worker_count === worker_shards.length <= 10` and recomputes
 * the virtual-agent count from the surviving shards.
 */
export function validateAndClampPlan(raw: unknown, maxPhysicalWorkers: number): OrchestrationPlan {
  const o = (raw ?? {}) as Record<string, unknown>;
  const cap = clampPhysicalWorkers(Math.min(maxPhysicalWorkers, MAX_PHYSICAL_SWARM_WORKERS));

  const rawShards = Array.isArray(o.worker_shards) ? o.worker_shards : [];
  let shards = rawShards.map((s, i) => coerceShard(s, i));
  if (shards.length === 0) {
    // A plan with no shards is unusable; synthesize a single generic shard.
    shards = [coerceShard({ role_name: "General reviewer", shard_id: "shard_0" }, 0)];
  }
  shards = mergeShardsToCap(shards, cap);
  // Re-id sequentially so ids are stable and unique after merging.
  shards = shards.map((s, i) => ({ ...s, shard_id: `shard_${i}` }));

  const virtual_agent_count = shards.reduce((sum, s) => sum + s.virtual_agents.length, 0);

  return {
    objective: str(o.objective, 500) || "Evaluate the stimulus with a multi-perspective worker swarm.",
    worker_count: shards.length,
    virtual_agent_count,
    worker_shards: shards,
    synthesis_instructions:
      str(o.synthesis_instructions, 2000) ||
      "Synthesize worker findings into a decision-ready report. Do not invent or alter any numbers.",
  };
}

const PLANNER_SYSTEM =
  "You are Nemotron, the ORCHESTRATOR of a market-evaluation worker swarm. Plan a set of " +
  `at most {MAX} physical worker shards. Each physical worker is ONE cheap API call that ` +
  "simulates several virtual agents internally, so compress many logical personas into few " +
  "shards rather than asking for more workers. You MUST NOT exceed the worker cap. You MUST NOT " +
  "produce aggregate scores, counts, or a final verdict — those are computed server-side. " +
  "Reply with a single JSON object of shape: " +
  '{"objective":string,"worker_count":number,"virtual_agent_count":number,"worker_shards":' +
  '[{"shard_id":string,"role_name":string,"system_prompt":string,"task_prompt":string,' +
  '"virtual_agents":[{"virtual_agent_id":string,"persona_or_role":string,"angle":string}],' +
  '"expected_output_schema":string}],"synthesis_instructions":string}.';

export interface NemotronPlannerOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeoutMs?: number;
}

export class NemotronPlanner implements PlannerClient {
  readonly name = "nvidia";
  constructor(private opts: NemotronPlannerOptions) {}

  async plan(input: PlannerInput): Promise<OrchestrationPlan> {
    const cap = clampPhysicalWorkers(input.maxPhysicalWorkers);
    const system = PLANNER_SYSTEM.replace("{MAX}", String(cap));
    const user =
      `OBJECTIVE: ${input.objective}\n` +
      `STIMULUS TYPE: ${input.stimulusType}\n` +
      `STIMULUS:\n${input.stimulus}\n\n` +
      `TARGET PERSONA / RESEARCH BREADTH: ${input.targetPersonaCount}\n` +
      `MAX PHYSICAL WORKERS: ${cap} (HARD CAP — never exceed)\n` +
      `WORKER MODEL: ${input.workerModelLabel} (cheap, fast, narrow)\n` +
      `Distribute the ${input.targetPersonaCount} target perspectives across <= ${cap} shards as ` +
      `virtual agents. Frontend needs: objective, per-shard roles, and synthesis instructions.`;

    const content = await chatCompletion({
      baseUrl: this.opts.baseUrl,
      apiKey: this.opts.apiKey,
      model: this.opts.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      maxTokens: this.opts.maxTokens,
      temperature: this.opts.temperature,
      jsonObject: true,
      timeoutMs: this.opts.timeoutMs ?? 120_000,
    });

    // Return the RAW parsed plan; the orchestrator clamps it authoritatively.
    return validateAndClampPlan(extractJsonObject(content), cap);
  }
}

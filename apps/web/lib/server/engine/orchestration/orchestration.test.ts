// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
  MAX_PHYSICAL_SWARM_WORKERS,
  clampPhysicalWorkers,
  distributeVirtualAgents,
  resolveWorkerCaps,
  maxFailedPhysicalWorkers,
} from "./caps";
import { validateAndClampPlan, mergeShardsToCap } from "./planner";
import { runWorkers, checkWorkerFailureBudget } from "./workerRunner";
import { computeServerNumerics, sanitizeSynthesis } from "./synthesizer";
import { runOrchestration } from "./orchestrator";
import type {
  OrchestrationPlan,
  OrchestratedStormReport,
  PlannerClient,
  SynthesizerClient,
  WorkerClient,
  WorkerShard,
  WorkerShardOutput,
} from "./types";
import { getConfig } from "../../env";
import { toInferenceSettingsView, inferenceSettingsFromRow } from "../../inferenceSettings";
import { buildGateway } from "../../gateway";
import { getStormOrchestration } from "../../stormStore";
import { maybeRunOrchestration } from "../../orchestrationRunner";

// ── test helpers ────────────────────────────────────────────────────────────

function makeShards(n: number, virtualPerShard = 1): WorkerShard[] {
  return Array.from({ length: n }, (_, i) => ({
    shard_id: `shard_${i}`,
    role_name: `Role ${i}`,
    system_prompt: `sys ${i}`,
    task_prompt: `task ${i}`,
    virtual_agents: Array.from({ length: virtualPerShard }, (_, j) => ({
      virtual_agent_id: `s${i}_va${j}`,
      persona_or_role: `persona ${i}.${j}`,
      angle: `angle ${i}.${j}`,
    })),
    expected_output_schema: "{}",
  }));
}

function makePlan(shards: WorkerShard[]): OrchestrationPlan {
  return {
    objective: "test",
    worker_count: shards.length,
    virtual_agent_count: shards.reduce((s, sh) => s + sh.virtual_agents.length, 0),
    worker_shards: shards,
    synthesis_instructions: "synthesize",
  };
}

/** Worker that counts every physical call and echoes one result per virtual agent. */
class CountingWorker implements WorkerClient {
  readonly name = "counting";
  calls = 0;
  constructor(private score = 0.2) {}
  async runShard(shard: WorkerShard): Promise<WorkerShardOutput> {
    this.calls += 1;
    return {
      shard_id: shard.shard_id,
      role_name: shard.role_name,
      virtual_agent_results: shard.virtual_agents.map((a) => ({
        virtual_agent_id: a.virtual_agent_id,
        perspective: a.angle,
        reaction_summary: "ok",
        objections: [],
        purchase_or_adoption_drivers: [],
        confusion_points: [],
        raw_criteria_scores: { fit: this.score },
      })),
      shard_summary: `summary ${shard.shard_id}`,
      confidence: "medium",
      failure_risks: [],
    };
  }
}

/** Worker that fails the first `failFirst` shards it sees (non-transient). */
class FailingWorker implements WorkerClient {
  readonly name = "failing";
  calls = 0;
  private seen = 0;
  constructor(private failFirst: number) {}
  async runShard(shard: WorkerShard): Promise<WorkerShardOutput> {
    this.calls += 1;
    const idx = this.seen++;
    if (idx < this.failFirst) throw new Error("worker error");
    return {
      shard_id: shard.shard_id,
      role_name: shard.role_name,
      virtual_agent_results: [],
      shard_summary: "ok",
      confidence: "high",
      failure_risks: [],
    };
  }
}

const fakePlanner = (plan: OrchestrationPlan): PlannerClient => ({
  name: "fake",
  async plan() {
    return plan;
  },
});

/** Synthesizer that tries to smuggle numbers into the final report. */
const cheatingSynthesizer: SynthesizerClient = {
  name: "cheat",
  async synthesize() {
    return {
      executive_summary: "summary",
      strongest_signals: ["s1"],
      weakest_signals: [],
      segment_insights: [],
      objections_to_fix: [],
      messaging_recommendations: [],
      product_recommendations: [],
      pricing_or_offer_notes: [],
      final_recommendation: "ship",
      confidence: "high",
      // Illegal numeric injections — must never survive:
      market_fit_score: 0.99,
      green: 9999,
      status: "green",
    } as unknown as OrchestratedStormReport;
  },
};

const noSleep = async () => {};

// ── 1. Hard cap cannot be exceeded ──────────────────────────────────────────

describe("1. MAX_PHYSICAL_SWARM_WORKERS hard cap", () => {
  it("is 10 and clampPhysicalWorkers never exceeds it", () => {
    expect(MAX_PHYSICAL_SWARM_WORKERS).toBe(10);
    expect(clampPhysicalWorkers(999)).toBe(10);
    expect(clampPhysicalWorkers(11)).toBe(10);
    expect(clampPhysicalWorkers(10)).toBe(10);
    expect(clampPhysicalWorkers(0)).toBe(1);
    expect(clampPhysicalWorkers(-5)).toBe(1);
    expect(clampPhysicalWorkers(NaN)).toBe(1);
  });

  it("resolveWorkerCaps caps physical workers at 10 regardless of request", () => {
    const caps = resolveWorkerCaps({
      requestedMaxPhysicalWorkers: 500,
      requestedVirtualAgents: 500,
      virtualAgentsPerWorker: 50,
    });
    expect(caps.effectiveMaxPhysicalWorkers).toBe(10);
    expect(caps.virtualAgentsPerShard).toHaveLength(10);
  });
});

// ── 2. 30 requested agents -> 10 workers, virtual agents distributed ────────

describe("2. requested 30 agents compress into 10 physical workers", () => {
  it("distributes 30 virtual agents across exactly 10 shards", () => {
    const caps = resolveWorkerCaps({
      requestedMaxPhysicalWorkers: 30,
      requestedVirtualAgents: 30,
      virtualAgentsPerWorker: 1,
    });
    expect(caps.effectiveMaxPhysicalWorkers).toBe(10);
    expect(caps.virtualAgentsPerShard).toHaveLength(10);
    expect(caps.totalVirtualAgents).toBe(30);
    expect(caps.virtualAgentsPerShard.every((n) => n >= 1)).toBe(true);
    expect(caps.virtualAgentsPerShard.reduce((s, n) => s + n, 0)).toBe(30);
  });

  it("distributeVirtualAgents is even (earlier shards take the remainder)", () => {
    expect(distributeVirtualAgents(30, 10)).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    expect(distributeVirtualAgents(53, 10)).toEqual([6, 6, 6, 5, 5, 5, 5, 5, 5, 5]);
    expect(distributeVirtualAgents(3, 10)).toHaveLength(10); // never fewer agents than shards
  });
});

// ── 3. Plan with >10 shards clamped/merged to 10 (no role dropped) ──────────

describe("3. oversized plan is merged to <= 10 shards", () => {
  it("merges 15 shards into 10 without dropping any role", () => {
    const raw = makePlan(makeShards(15, 1));
    const clamped = validateAndClampPlan(raw, 10);
    expect(clamped.worker_count).toBe(10);
    expect(clamped.worker_shards).toHaveLength(10);
    // Every original persona survives as a virtual agent somewhere.
    expect(clamped.virtual_agent_count).toBe(15);
    const personas = clamped.worker_shards.flatMap((s) => s.virtual_agents.map((a) => a.persona_or_role));
    for (let i = 0; i < 15; i++) expect(personas).toContain(`persona ${i}.0`);
  });

  it("mergeShardsToCap leaves <= cap shards alone", () => {
    const shards = makeShards(6, 1);
    expect(mergeShardsToCap(shards, 10)).toHaveLength(6);
  });

  it("validateAndClampPlan never exceeds the hard cap even if asked for more", () => {
    const raw = makePlan(makeShards(40, 1));
    const clamped = validateAndClampPlan(raw, 999);
    expect(clamped.worker_shards.length).toBeLessThanOrEqual(MAX_PHYSICAL_SWARM_WORKERS);
    expect(clamped.virtual_agent_count).toBe(40);
  });
});

// ── 4 & 5. Fireworks key never returned; only the boolean is exposed ────────

describe("4/5. admin view exposes fireworks_api_key_configured, never the key", () => {
  const env = getConfig();
  it("never serializes the fireworks key, only a boolean", () => {
    const settings = inferenceSettingsFromRow(null, env);
    const view = toInferenceSettingsView(settings, {
      ...env,
      fireworksApiKey: "fw-SUPER-SECRET",
      fireworksBaseUrl: "https://api.fireworks.ai/inference/v1",
    });
    expect(view.fireworks_api_key_configured).toBe(true);
    expect(JSON.stringify(view)).not.toContain("fw-SUPER-SECRET");
    // No property literally named for the raw key.
    expect(view).not.toHaveProperty("fireworks_api_key");
  });

  it("reports not-configured when the fireworks key is empty", () => {
    const view = toInferenceSettingsView(inferenceSettingsFromRow(null, env), {
      ...env,
      fireworksApiKey: "",
    });
    expect(view.fireworks_api_key_configured).toBe(false);
  });
});

// ── 6 & 7. Worker execution calls Fireworks <= 10; virtual agents don't add ──

describe("6/7. physical call count is bounded and independent of virtual agents", () => {
  it("calls the worker at most 10 times for a 10-shard plan", async () => {
    const worker = new CountingWorker();
    const shards = makeShards(10, 1);
    const res = await runWorkers(shards, worker, "stim", "product_concept", { sleep: noSleep });
    expect(worker.calls).toBe(10);
    expect(worker.calls).toBeLessThanOrEqual(MAX_PHYSICAL_SWARM_WORKERS);
    expect(res.physicalWorkerCount).toBe(10);
  });

  it("does NOT call the worker more when each shard carries many virtual agents", async () => {
    const worker = new CountingWorker();
    const shards = makeShards(10, 5); // 50 virtual agents total
    await runWorkers(shards, worker, "stim", "product_concept", { sleep: noSleep });
    expect(worker.calls).toBe(10); // still 10 physical calls, not 50
  });

  it("through the full pipeline, 50 requested agents => 10 physical calls", async () => {
    const worker = new CountingWorker();
    const plan = validateAndClampPlan(makePlan(makeShards(10, 5)), 10);
    const record = await runOrchestration(
      {
        objective: "o",
        stimulus: "s",
        stimulusType: "product_concept",
        targetPersonaCount: 50,
        requestedMaxPhysicalWorkers: 50,
        requestedVirtualAgents: 50,
        virtualAgentsPerWorker: 5,
        workerModelLabel: "deepseek",
      },
      { planner: fakePlanner(plan), worker, synthesizer: cheatingSynthesizer },
      { workerRun: { sleep: noSleep }, now: () => "2026-07-10T00:00:00.000Z" },
    );
    expect(worker.calls).toBe(10);
    expect(record.status).toBe("completed");
    expect(record.physical_worker_count).toBeLessThanOrEqual(10);
  });
});

// ── 8. Failed workers tolerated only within the failure rule ────────────────

describe("8. worker failure budget", () => {
  it("tolerates floor(workers*0.2), >=1 only when workers >= 5", () => {
    expect(maxFailedPhysicalWorkers(3)).toBe(0);
    expect(maxFailedPhysicalWorkers(4)).toBe(0);
    expect(maxFailedPhysicalWorkers(5)).toBe(1);
    expect(maxFailedPhysicalWorkers(10)).toBe(2);
  });

  it("checkWorkerFailureBudget passes within budget, fails beyond", () => {
    expect(checkWorkerFailureBudget(10, 2)).toBeNull();
    expect(checkWorkerFailureBudget(10, 3)).not.toBeNull();
    expect(checkWorkerFailureBudget(5, 1)).toBeNull();
    expect(checkWorkerFailureBudget(3, 1)).not.toBeNull();
  });

  it("orchestration completes with 2/10 failures but fails with 3/10", async () => {
    const plan = makePlan(makeShards(10, 1));
    const base = {
      objective: "o", stimulus: "s", stimulusType: "product_concept",
      targetPersonaCount: 10, requestedMaxPhysicalWorkers: 10,
      requestedVirtualAgents: 10, virtualAgentsPerWorker: 1, workerModelLabel: "d",
    };
    const opts = { workerRun: { sleep: noSleep, maxRetries: 0 }, now: () => "2026-07-10T00:00:00.000Z" };

    const ok = await runOrchestration(base, { planner: fakePlanner(plan), worker: new FailingWorker(2), synthesizer: cheatingSynthesizer }, opts);
    expect(ok.status).toBe("completed");

    const bad = await runOrchestration(base, { planner: fakePlanner(plan), worker: new FailingWorker(3), synthesizer: cheatingSynthesizer }, opts);
    expect(bad.status).toBe("failed");
    expect(bad.error_message).toMatch(/too many workers failed/i);
  });
});

// ── 9. Nemotron synthesis cannot override server-computed numeric fields ────

describe("9. numeric honesty firewall", () => {
  it("sanitizeSynthesis strips any injected numeric keys", () => {
    const raw = {
      executive_summary: "x",
      strongest_signals: ["a"],
      final_recommendation: "go",
      confidence: "high",
      market_fit_score: 0.99,
      green: 100,
      status: "green",
      counts: { total: 500 },
    };
    const clean = sanitizeSynthesis(raw);
    expect(clean).not.toHaveProperty("market_fit_score");
    expect(clean).not.toHaveProperty("green");
    expect(clean).not.toHaveProperty("status");
    expect(clean).not.toHaveProperty("counts");
    expect(clean.executive_summary).toBe("x");
  });

  it("server numerics are computed independently and win over model numbers", async () => {
    const worker = new CountingWorker(0.2); // every agent scores 0.2
    const plan = makePlan(makeShards(4, 2));
    const record = await runOrchestration(
      {
        objective: "o", stimulus: "s", stimulusType: "product_concept",
        targetPersonaCount: 8, requestedMaxPhysicalWorkers: 4,
        requestedVirtualAgents: 8, virtualAgentsPerWorker: 2, workerModelLabel: "d",
      },
      { planner: fakePlanner(plan), worker, synthesizer: cheatingSynthesizer },
      { workerRun: { sleep: noSleep }, now: () => "2026-07-10T00:00:00.000Z" },
    );
    // Model tried to inject 0.99 / green:9999 — neither appears anywhere.
    expect(record.final).not.toHaveProperty("market_fit_score");
    expect(record.server_numerics?.market_fit_score).toBeCloseTo(0.2, 5);
    expect(record.server_numerics?.market_fit_score).not.toBe(0.99);
    expect(record.server_numerics?.status).toBe("red"); // 0.2 => red, not model's "green"
  });

  it("computeServerNumerics counts green/yellow/red from raw scores server-side", () => {
    const outputs: WorkerShardOutput[] = [
      {
        shard_id: "s0", role_name: "r", shard_summary: "", confidence: "high", failure_risks: [],
        virtual_agent_results: [
          { virtual_agent_id: "a", perspective: "", reaction_summary: "", objections: [], purchase_or_adoption_drivers: [], confusion_points: [], raw_criteria_scores: { x: 0.9 } },
          { virtual_agent_id: "b", perspective: "", reaction_summary: "", objections: [], purchase_or_adoption_drivers: [], confusion_points: [], raw_criteria_scores: { x: 0.5 } },
          { virtual_agent_id: "c", perspective: "", reaction_summary: "", objections: [], purchase_or_adoption_drivers: [], confusion_points: [], raw_criteria_scores: { x: 0.1 } },
        ],
      },
    ];
    const plan = makePlan(makeShards(1, 3));
    const n = computeServerNumerics(plan, outputs, 0);
    expect(n.green).toBe(1);
    expect(n.yellow).toBe(1);
    expect(n.red).toBe(1);
  });
});

// ── 10. Reload loads persisted worker outputs + final output ────────────────

describe("10. persisted orchestration survives a page reload", () => {
  it("getStormOrchestration returns the persisted record for the owner", async () => {
    const gateway = buildGateway();
    const userId = "user-abc";
    const stormId = "storm_reload_test";
    await gateway.recordStorm({ id: stormId, user_id: userId, status: "running" });

    const worker = new CountingWorker();
    const plan = makePlan(makeShards(3, 2));
    const record = await runOrchestration(
      {
        objective: "o", stimulus: "s", stimulusType: "product_concept",
        targetPersonaCount: 6, requestedMaxPhysicalWorkers: 3,
        requestedVirtualAgents: 6, virtualAgentsPerWorker: 2, workerModelLabel: "d",
      },
      { planner: fakePlanner(plan), worker, synthesizer: cheatingSynthesizer },
      { workerRun: { sleep: noSleep }, now: () => "2026-07-10T00:00:00.000Z" },
    );
    await gateway.updateStorm(stormId, { status: "complete", orchestration_json: record });

    // "Reload" = a fresh read from storage by the owner.
    const user = { id: userId, isAdmin: false } as any;
    const loaded = await getStormOrchestration(gateway, stormId, user);
    expect(loaded).not.toBeNull();
    expect(loaded!.status).toBe("completed");
    expect(loaded!.worker_shard_outputs).toHaveLength(3);
    expect(loaded!.final?.executive_summary).toBe("summary");
    expect(loaded!.server_numerics).not.toBeNull();
  });

  it("non-owners cannot read the record (404)", async () => {
    const gateway = buildGateway();
    await gateway.recordStorm({ id: "storm_private", user_id: "owner-1", status: "complete", orchestration_json: { status: "completed" } });
    const intruder = { id: "someone-else", isAdmin: false } as any;
    await expect(getStormOrchestration(gateway, "storm_private", intruder)).rejects.toThrow();
  });
});

// ── 11. Existing behavior stays green when orchestration is disabled ─────────

describe("11. orchestration is a no-op when disabled", () => {
  it("maybeRunOrchestration returns null with default (disabled) settings", async () => {
    const gateway = buildGateway();
    const result = await maybeRunOrchestration(gateway, {
      objective: "o",
      stimulus: "s",
      stimulusType: "product_concept",
      targetPersonaCount: 100,
    });
    expect(result).toBeNull();
  });

  it("default resolved settings have orchestration disabled", () => {
    const env = getConfig();
    const settings = inferenceSettingsFromRow(null, env);
    expect(settings.orchestration.orchestrationEnabled).toBe(false);
    expect(settings.orchestration.maxPhysicalWorkers).toBeLessThanOrEqual(MAX_PHYSICAL_SWARM_WORKERS);
  });
});

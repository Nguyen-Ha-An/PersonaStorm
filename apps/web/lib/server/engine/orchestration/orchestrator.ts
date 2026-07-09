/**
 * End-to-end orchestration pipeline: plan (Nemotron) -> run workers (Fireworks)
 * -> synthesize (Nemotron), with server-authoritative caps and numeric truth.
 *
 * The pipeline never throws for provider/worker failures — it always returns an
 * OrchestrationRecord (possibly with status "failed" and an error_message) so
 * the caller can persist it and the frontend can reload it. Status transitions
 * are surfaced through the optional `onStatus` callback.
 */

import { resolveWorkerCaps } from "./caps";
import { validateAndClampPlan } from "./planner";
import { checkWorkerFailureBudget, runWorkers, type WorkerRunOptions } from "./workerRunner";
import { computeServerNumerics, sanitizeSynthesis } from "./synthesizer";
import type {
  OrchestrationRecord,
  OrchestrationStatus,
  PlannerClient,
  SynthesizerClient,
  WorkerClient,
} from "./types";

export interface OrchestrationInput {
  objective: string;
  stimulus: string;
  stimulusType: string;
  targetPersonaCount: number;
  requestedMaxPhysicalWorkers: number;
  requestedVirtualAgents: number;
  virtualAgentsPerWorker: number;
  workerModelLabel: string;
}

export interface OrchestrationDeps {
  planner: PlannerClient;
  worker: WorkerClient;
  synthesizer: SynthesizerClient;
}

export interface OrchestrationOptions {
  onStatus?: (status: OrchestrationStatus, record: OrchestrationRecord) => void | Promise<void>;
  workerRun?: WorkerRunOptions;
  /** Injectable clock (ISO string); defaults to wall-clock. */
  now?: () => string;
}

function isoNow(): string {
  return new Date().toISOString();
}

export async function runOrchestration(
  input: OrchestrationInput,
  deps: OrchestrationDeps,
  opts: OrchestrationOptions = {},
): Promise<OrchestrationRecord> {
  const now = opts.now ?? isoNow;
  const createdAt = now();

  const caps = resolveWorkerCaps({
    requestedMaxPhysicalWorkers: input.requestedMaxPhysicalWorkers,
    requestedVirtualAgents: input.requestedVirtualAgents,
    virtualAgentsPerWorker: input.virtualAgentsPerWorker,
  });

  const record: OrchestrationRecord = {
    status: "queued",
    plan: null,
    worker_shard_outputs: [],
    final: null,
    server_numerics: null,
    physical_worker_count: 0,
    virtual_agent_count: 0,
    error_message: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  async function transition(status: OrchestrationStatus): Promise<void> {
    record.status = status;
    record.updated_at = now();
    if (opts.onStatus) await opts.onStatus(status, record);
  }

  try {
    // ── Step 1: plan ────────────────────────────────────────────────────────
    await transition("planning");
    const rawPlan = await deps.planner.plan({
      objective: input.objective,
      stimulus: input.stimulus,
      stimulusType: input.stimulusType,
      targetPersonaCount: input.targetPersonaCount,
      maxPhysicalWorkers: caps.effectiveMaxPhysicalWorkers,
      workerModelLabel: input.workerModelLabel,
    });
    // Server-authoritative re-clamp — never trust the client to have obeyed the
    // cap. validateAndClampPlan is idempotent and merges any excess shards.
    const plan = validateAndClampPlan(rawPlan, caps.effectiveMaxPhysicalWorkers);
    record.plan = plan;
    record.physical_worker_count = plan.worker_count;
    record.virtual_agent_count = plan.virtual_agent_count;

    // ── Step 2: run workers ──────────────────────────────────────────────────
    await transition("running_workers");
    const run = await runWorkers(plan.worker_shards, deps.worker, input.stimulus, input.stimulusType, opts.workerRun);
    record.worker_shard_outputs = run.outputs;

    const failReason = checkWorkerFailureBudget(run.physicalWorkerCount, run.failedShards.length);
    if (failReason) {
      record.error_message = failReason;
      await transition("failed");
      return record;
    }

    // ── Step 3/4: server numerics + synthesis ───────────────────────────────
    await transition("synthesizing");
    const serverNumerics = computeServerNumerics(plan, run.outputs, run.failedShards.length);
    record.server_numerics = serverNumerics;

    const final = await deps.synthesizer.synthesize({
      stimulus: input.stimulus,
      plan,
      workerOutputs: run.outputs,
      serverNumerics,
    });
    // Server-authoritative numeric firewall: even if a synthesizer client
    // returned aggregate numbers, they are stripped here. The persisted `final`
    // is text-only; server_numerics is the sole numeric truth.
    record.final = sanitizeSynthesis(final);

    await transition("completed");
    return record;
  } catch (err) {
    record.error_message = orchestrationFailureReason(err);
    record.updated_at = now();
    await transition("failed").catch(() => {
      record.status = "failed";
    });
    return record;
  }
}

/** User-safe, credential-free failure reason (verbatim text goes to logs only). */
export function orchestrationFailureReason(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/NVIDIA|FIREWORKS|not (set|configured)/i.test(msg)) {
    return "The orchestration provider is not configured on the server.";
  }
  if (/timeout|timed out|aborted|ECONNRESET|fetch failed/i.test(msg)) {
    return "Orchestration timed out or lost the connection to a provider.";
  }
  if (/non-JSON|JSON/i.test(msg)) {
    return "A provider returned an unparseable response during orchestration.";
  }
  return "Internal error during orchestration.";
}

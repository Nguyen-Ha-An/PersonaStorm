/**
 * Step 2 — Fireworks worker execution.
 *
 * Runs the plan's shards through the injected WorkerClient. There is exactly
 * one physical worker slot per shard (already capped at <= 10 by the planner),
 * so the number of distinct workers can never exceed MAX_PHYSICAL_SWARM_WORKERS
 * however many virtual agents each shard carries.
 *
 * Resilience: transient 429/5xx failures for a single shard are retried with
 * capped exponential backoff. Non-transient failures fail that shard
 * immediately. After all shards settle, the failure rule decides whether the
 * storm can proceed on the successful shards or must fail.
 */

import { isTransientChatError } from "../providers/chatClient";
import { maxFailedPhysicalWorkers } from "./caps";
import type { WorkerClient, WorkerShard, WorkerShardOutput } from "./types";

export interface WorkerRunOptions {
  concurrency?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  /** Injectable sleep (tests pass a no-op); defaults to real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

export interface WorkerRunResult {
  outputs: WorkerShardOutput[];
  failedShards: { shard_id: string; role_name: string; reason: string }[];
  /** Distinct physical worker slots attempted — equals the shard count. */
  physicalWorkerCount: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Run one shard with capped-backoff retries on transient failures only. */
async function runShardWithRetry(
  client: WorkerClient,
  shard: WorkerShard,
  stimulus: string,
  stimulusType: string,
  maxRetries: number,
  baseBackoffMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<WorkerShardOutput> {
  let attempt = 0;
  for (;;) {
    try {
      return await client.runShard(shard, stimulus, stimulusType);
    } catch (err) {
      if (attempt >= maxRetries || !isTransientChatError(err)) throw err;
      // Capped exponential backoff: base, 2x, 4x, ... capped at ~8s.
      const delay = Math.min(baseBackoffMs * 2 ** attempt, 8000);
      await sleep(delay);
      attempt += 1;
    }
  }
}

export async function runWorkers(
  shards: WorkerShard[],
  client: WorkerClient,
  stimulus: string,
  stimulusType: string,
  opts: WorkerRunOptions = {},
): Promise<WorkerRunResult> {
  const sleep = opts.sleep ?? defaultSleep;
  const maxRetries = opts.maxRetries ?? 2;
  const baseBackoffMs = opts.baseBackoffMs ?? 500;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? shards.length, shards.length || 1));

  const outputs: WorkerShardOutput[] = [];
  const failedShards: WorkerRunResult["failedShards"] = [];

  let next = 0;
  async function pump(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= shards.length) return;
      const shard = shards[i];
      try {
        const out = await runShardWithRetry(
          client, shard, stimulus, stimulusType, maxRetries, baseBackoffMs, sleep,
        );
        outputs.push(out);
      } catch (err) {
        // Only a user-safe, credential-free reason is retained.
        failedShards.push({
          shard_id: shard.shard_id,
          role_name: shard.role_name,
          reason: transientLabel(err),
        });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => pump()));

  return { outputs, failedShards, physicalWorkerCount: shards.length };
}

function transientLabel(err: unknown): string {
  return isTransientChatError(err) ? "transient provider error" : "worker error";
}

/**
 * Decide whether the storm may proceed on the successful shards given the
 * failure count. Uses the failure rule: floor(workers*0.2), with >=1 allowed
 * only when workers >= 5. Returns null if OK, or a user-safe reason to fail.
 */
export function checkWorkerFailureBudget(
  physicalWorkerCount: number,
  failedCount: number,
): string | null {
  const tolerated = maxFailedPhysicalWorkers(physicalWorkerCount);
  if (failedCount <= tolerated) return null;
  return `Too many workers failed (${failedCount} of ${physicalWorkerCount}; ${tolerated} tolerated).`;
}

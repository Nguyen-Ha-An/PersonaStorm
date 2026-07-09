/**
 * Hard safety caps for the Nemotron-orchestrated Fireworks worker swarm.
 *
 * THE central invariant of this feature lives here: no matter what an admin
 * setting, a user request body, or a model plan asks for, PersonaStorm never
 * makes more than MAX_PHYSICAL_SWARM_WORKERS *real* Fireworks API calls per
 * storm. Extra demand is absorbed as *virtual* agents packed into shards, not
 * as more physical workers.
 *
 * This module is intentionally pure (no env, no secrets, no I/O) so it can be
 * imported and exhaustively unit-tested from any environment.
 */

/**
 * The non-negotiable ceiling on physical (real API-call) workers per storm.
 * Nothing — no DB row, request body, prompt, or model output — may raise the
 * effective count above this. Do not read this from config; it is a constant.
 */
export const MAX_PHYSICAL_SWARM_WORKERS = 10;

/** Smallest sensible worker count (a storm with zero workers is meaningless). */
export const MIN_PHYSICAL_SWARM_WORKERS = 1;

export interface WorkerCapsRequest {
  /** What the admin setting / request asked for (may exceed the cap). */
  requestedMaxPhysicalWorkers: number;
  /** How many logical/virtual personas or perspectives the plan wants. */
  requestedVirtualAgents: number;
  /** Preferred virtual agents packed per shard (>= 1 after clamping). */
  virtualAgentsPerWorker: number;
}

export interface WorkerCaps {
  /** Real Fireworks calls that will run. ALWAYS in [1, MAX_PHYSICAL_SWARM_WORKERS]. */
  effectiveMaxPhysicalWorkers: number;
  /** Virtual agents packed into each shard, in shard order (length === workers). */
  virtualAgentsPerShard: number[];
  /** Total virtual agents simulated across all shards. */
  totalVirtualAgents: number;
}

function toPosInt(v: number, fallback: number): number {
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/**
 * Resolve the effective physical-worker count. This is the ONLY place allowed
 * to decide how many real workers run, and it can never exceed the hard cap.
 */
export function clampPhysicalWorkers(requested: number): number {
  const req = toPosInt(requested, MIN_PHYSICAL_SWARM_WORKERS);
  return Math.max(MIN_PHYSICAL_SWARM_WORKERS, Math.min(req, MAX_PHYSICAL_SWARM_WORKERS));
}

/**
 * Distribute `total` virtual agents across `workers` shards as evenly as
 * possible (earlier shards take the remainder). Every shard gets at least 1.
 * `workers` is assumed already clamped by clampPhysicalWorkers.
 */
export function distributeVirtualAgents(total: number, workers: number): number[] {
  const w = Math.max(1, Math.floor(workers));
  // Never fewer virtual agents than shards — each shard must simulate >= 1.
  const t = Math.max(w, toPosInt(total, w));
  const base = Math.floor(t / w);
  const remainder = t % w;
  return Array.from({ length: w }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Full cap resolution. Given what was requested, produce the physical worker
 * count (hard-capped) and the per-shard virtual-agent distribution. A request
 * for 50 logical agents with a requested max of 20 workers yields 10 workers
 * each simulating ~5 virtual agents — never 20 or 50 real calls.
 */
export function resolveWorkerCaps(req: WorkerCapsRequest): WorkerCaps {
  const effectiveMaxPhysicalWorkers = clampPhysicalWorkers(req.requestedMaxPhysicalWorkers);

  const perWorker = Math.max(1, toPosInt(req.virtualAgentsPerWorker, 1));
  // The virtual-agent demand is the larger of: what was explicitly requested,
  // or workers * preferred-per-worker. Either way it is packed into <= 10 shards.
  const demand = Math.max(
    toPosInt(req.requestedVirtualAgents, effectiveMaxPhysicalWorkers),
    effectiveMaxPhysicalWorkers * perWorker,
    effectiveMaxPhysicalWorkers,
  );

  const virtualAgentsPerShard = distributeVirtualAgents(demand, effectiveMaxPhysicalWorkers);
  const totalVirtualAgents = virtualAgentsPerShard.reduce((s, n) => s + n, 0);
  return { effectiveMaxPhysicalWorkers, virtualAgentsPerShard, totalVirtualAgents };
}

/**
 * How many physical worker failures a storm tolerates:
 *   floor(workers * 0.2), but at least 1 is allowed only when workers >= 5.
 * So: 3 -> 0, 5 -> 1, 10 -> 2. Never exceeds the 20% bound.
 */
export function maxFailedPhysicalWorkers(effectiveMaxPhysicalWorkers: number): number {
  const workers = clampPhysicalWorkers(effectiveMaxPhysicalWorkers);
  const twentyPct = Math.floor(workers * 0.2);
  if (workers >= 5) return Math.max(1, twentyPct);
  return twentyPct; // < 5 workers => floor(workers*0.2) which is 0 for 1..4
}

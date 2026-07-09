/**
 * Nemotron-orchestrated Fireworks worker swarm — public surface.
 *
 * Nemotron (NVIDIA) is the orchestrator (plan, delegate, review, synthesize);
 * Fireworks DeepSeek-V4-Flash runs the physical workers. The number of REAL
 * worker calls is hard-capped at MAX_PHYSICAL_SWARM_WORKERS; extra demand is
 * absorbed as virtual agents inside shards. Numeric truth is always
 * recomputed server-side (see computeServerNumerics / sanitizeSynthesis).
 */

export {
  MAX_PHYSICAL_SWARM_WORKERS,
  MIN_PHYSICAL_SWARM_WORKERS,
  clampPhysicalWorkers,
  distributeVirtualAgents,
  resolveWorkerCaps,
  maxFailedPhysicalWorkers,
} from "./caps";
export type { WorkerCaps, WorkerCapsRequest } from "./caps";

export { validateAndClampPlan, mergeShardsToCap, NemotronPlanner } from "./planner";
export { runWorkers, checkWorkerFailureBudget } from "./workerRunner";
export type { WorkerRunOptions, WorkerRunResult } from "./workerRunner";
export {
  computeServerNumerics,
  sanitizeSynthesis,
  NemotronSynthesizer,
} from "./synthesizer";
export { FireworksWorkerClient } from "../providers/fireworks";
export {
  runOrchestration,
  orchestrationFailureReason,
} from "./orchestrator";
export type {
  OrchestrationInput,
  OrchestrationDeps,
  OrchestrationOptions,
} from "./orchestrator";
export {
  NullWebResearchAdapter,
  runControlledResearch,
} from "./research";
export type { WebResearchAdapter, WebResearchResult } from "./research";
export type * from "./types";

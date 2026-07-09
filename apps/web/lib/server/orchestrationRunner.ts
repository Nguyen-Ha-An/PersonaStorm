import "./only";

/**
 * Bridges the runtime settings + env config to the orchestration pipeline and
 * builds the concrete Nemotron/Fireworks clients from server-only credentials.
 *
 * Orchestration is OPT-IN: `maybeRunOrchestration` returns null (a no-op) unless
 * `orchestration_enabled` is set, so the classic storm path is untouched by
 * default. It NEVER throws — a provider/config failure yields a persisted
 * "failed" OrchestrationRecord so the frontend can show an error state.
 */

import { getConfig, type ServerConfig } from "./env";
import type { Gateway } from "./gateway";
import { getInferenceSettings } from "./inferenceSettings";
import { NemotronPlanner } from "./engine/orchestration/planner";
import { NemotronSynthesizer } from "./engine/orchestration/synthesizer";
import { FireworksWorkerClient } from "./engine/providers/fireworks";
import { runOrchestration, orchestrationFailureReason } from "./engine/orchestration/orchestrator";
import type { OrchestrationRecord } from "./engine/orchestration/types";

export interface OrchestrationRunInput {
  objective: string;
  stimulus: string;
  stimulusType: string;
  targetPersonaCount: number;
}

/**
 * Run the orchestration layer when enabled, else return null. Best-effort: any
 * failure is captured as a failed record, never propagated to the storm.
 */
export async function maybeRunOrchestration(
  gateway: Gateway,
  input: OrchestrationRunInput,
  cfg: ServerConfig = getConfig(),
): Promise<OrchestrationRecord | null> {
  const settings = await getInferenceSettings(gateway, cfg);
  const o = settings.orchestration;
  if (!o.orchestrationEnabled) return null;

  const nowIso = () => new Date().toISOString();
  try {
    // Keys + base URLs come ONLY from env; the settings row supplies models/knobs.
    const planner = new NemotronPlanner({
      apiKey: cfg.nvidiaApiKey,
      baseUrl: cfg.nvidiaBaseUrl,
      model: o.orchestratorModel,
      maxTokens: o.orchestratorMaxTokens,
      temperature: o.orchestratorTemperature,
    });
    const worker = new FireworksWorkerClient({
      apiKey: cfg.fireworksApiKey,
      baseUrl: cfg.fireworksBaseUrl,
      model: o.workerModel,
      maxTokens: o.workerMaxTokens,
      temperature: o.workerTemperature,
    });
    const synthesizer = new NemotronSynthesizer({
      apiKey: cfg.nvidiaApiKey,
      baseUrl: cfg.nvidiaBaseUrl,
      model: o.orchestratorModel,
      maxTokens: o.orchestratorMaxTokens,
      temperature: o.orchestratorTemperature,
    });

    return await runOrchestration(
      {
        objective: input.objective,
        stimulus: input.stimulus,
        stimulusType: input.stimulusType,
        targetPersonaCount: input.targetPersonaCount,
        requestedMaxPhysicalWorkers: o.maxPhysicalWorkers,
        requestedVirtualAgents: input.targetPersonaCount,
        virtualAgentsPerWorker: o.virtualAgentsPerWorker,
        workerModelLabel: o.workerModel,
      },
      { planner, worker, synthesizer },
    );
  } catch (err) {
    // Client construction (misconfigured provider) failed before the pipeline.
    console.warn("[personastorm orchestration] disabled/failed to start:", (err as Error).message);
    const ts = nowIso();
    return {
      status: "failed",
      plan: null,
      worker_shard_outputs: [],
      final: null,
      server_numerics: null,
      physical_worker_count: 0,
      virtual_agent_count: 0,
      error_message: orchestrationFailureReason(err),
      created_at: ts,
      updated_at: ts,
    };
  }
}

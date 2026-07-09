import "./only";

import { getConfig, type AnalystProvider, type InferenceProvider, type ServerConfig } from "./env";

export interface InferenceSettings {
  inferenceProvider: InferenceProvider;
  analystProvider: AnalystProvider;
  nvidiaModel: string;
  analystModel: string;
  nvidiaMaxTokens: number;
  analystMaxTokens: number;
  id: string | null;
}

/** Coerce an untrusted value to a valid provider, else the given fallback. */
function coerceProvider(v: unknown, fallback: "mock" | "nvidia"): "mock" | "nvidia" {
  return v === "mock" || v === "nvidia" ? v : fallback;
}

function posInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Build typed settings from a DB row, defaulting each field to the env config.
 * `row === null` (no active row) yields exactly the env-driven config.
 */
export function inferenceSettingsFromRow(
  row: Record<string, any> | null,
  env: ServerConfig,
): InferenceSettings {
  const r = row ?? {};
  const nvidiaModel =
    typeof r.nvidia_model === "string" && r.nvidia_model.trim() ? r.nvidia_model.trim() : env.nvidiaModel;
  const analystModel =
    typeof r.analyst_model === "string" && r.analyst_model.trim()
      ? r.analyst_model.trim()
      : env.analystModel || nvidiaModel;
  return {
    inferenceProvider: coerceProvider(r.inference_provider, env.inferenceProvider),
    analystProvider: coerceProvider(r.analyst_provider, env.analystProvider),
    nvidiaModel,
    analystModel,
    nvidiaMaxTokens: posInt(r.nvidia_max_tokens, env.nvidiaMaxTokens),
    analystMaxTokens: posInt(r.analyst_max_tokens, env.analystMaxTokens),
    id: r.id ?? null,
  };
}

export async function getInferenceSettings(
  gateway: { getActiveInferenceSettings(): Promise<Record<string, any> | null> },
  env: ServerConfig = getConfig(),
): Promise<InferenceSettings> {
  const row = await gateway.getActiveInferenceSettings();
  return inferenceSettingsFromRow(row, env);
}

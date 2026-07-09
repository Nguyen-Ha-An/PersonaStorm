import "./only";

import { getConfig, type AnalystProvider, type InferenceProvider, type ServerConfig } from "./env";
import type { Gateway } from "./gateway";

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
  row: Record<string, unknown> | null,
  env: ServerConfig,
): InferenceSettings {
  const r = row ?? {};
  const rawNvidiaModel = typeof r.nvidia_model === "string" ? r.nvidia_model.trim() : "";
  const rawAnalystModel = typeof r.analyst_model === "string" ? r.analyst_model.trim() : "";
  const nvidiaModel = rawNvidiaModel || env.nvidiaModel;
  const analystModel = rawAnalystModel || env.analystModel || nvidiaModel;
  return {
    inferenceProvider: coerceProvider(r.inference_provider, env.inferenceProvider),
    analystProvider: coerceProvider(r.analyst_provider, env.analystProvider),
    nvidiaModel,
    analystModel,
    nvidiaMaxTokens: posInt(r.nvidia_max_tokens, env.nvidiaMaxTokens),
    analystMaxTokens: posInt(r.analyst_max_tokens, env.analystMaxTokens),
    id: typeof r.id === "string" ? r.id : null,
  };
}

export async function getInferenceSettings(
  gateway: Gateway,
  env: ServerConfig = getConfig(),
): Promise<InferenceSettings> {
  const row = await gateway.getActiveInferenceSettings();
  return inferenceSettingsFromRow(row, env);
}

/**
 * Effective server config = DB settings layered over env, per-storm. The API
 * key and base URL are ALWAYS taken from env — never from the DB row — so a
 * settings row can never repoint the endpoint or smuggle a key.
 */
export async function resolveEffectiveConfig(
  gateway: Gateway,
  env: ServerConfig = getConfig(),
): Promise<ServerConfig> {
  const s = await getInferenceSettings(gateway, env);
  return {
    ...env,
    inferenceProvider: s.inferenceProvider,
    analystProvider: s.analystProvider,
    nvidiaModel: s.nvidiaModel,
    analystModel: s.analystModel,
    nvidiaMaxTokens: s.nvidiaMaxTokens,
    analystMaxTokens: s.analystMaxTokens,
    // nvidiaApiKey + nvidiaBaseUrl deliberately left as `...env`.
  };
}

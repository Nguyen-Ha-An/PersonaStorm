import "./only";

import { getConfig, type AnalystProvider, type InferenceProvider, type ServerConfig } from "./env";
import type { Gateway } from "./gateway";
import { HttpError } from "./errors";

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

const MIN_TOKENS = 1;
const MAX_TOKENS = 200_000;

export interface InferenceSettingsInput {
  inference_provider: "mock" | "nvidia";
  analyst_provider: "mock" | "nvidia";
  nvidia_model: string;
  analyst_model: string;
  nvidia_max_tokens: number;
  analyst_max_tokens: number;
}

function providerField(v: unknown, label: string): "mock" | "nvidia" {
  if (v === "mock" || v === "nvidia") return v;
  throw new HttpError(400, `${label} must be 'mock' or 'nvidia'.`);
}

function tokensField(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < MIN_TOKENS || n > MAX_TOKENS) {
    throw new HttpError(400, `${label} must be an integer in [${MIN_TOKENS}, ${MAX_TOKENS}].`);
  }
  return n;
}

export function validateInferenceSettingsBody(body: unknown): InferenceSettingsInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const nvidia_model =
    typeof b.nvidia_model === "string" && b.nvidia_model.trim() ? b.nvidia_model.trim().slice(0, 200) : "";
  if (!nvidia_model) throw new HttpError(400, "nvidia_model must be a non-empty string.");
  const analyst_model = typeof b.analyst_model === "string" ? b.analyst_model.trim().slice(0, 200) : "";
  return {
    inference_provider: providerField(b.inference_provider, "inference_provider"),
    analyst_provider: providerField(b.analyst_provider, "analyst_provider"),
    nvidia_model,
    analyst_model,
    nvidia_max_tokens: tokensField(b.nvidia_max_tokens, "nvidia_max_tokens"),
    analyst_max_tokens: tokensField(b.analyst_max_tokens, "analyst_max_tokens"),
  };
}

export interface InferenceSettingsView extends InferenceSettingsInput {
  nvidia_base_url: string;
  nvidia_api_key_configured: boolean;
}

/** Client-facing view. NEVER includes the API key — only a boolean + base URL. */
export function toInferenceSettingsView(s: InferenceSettings, env: ServerConfig): InferenceSettingsView {
  return {
    inference_provider: s.inferenceProvider,
    analyst_provider: s.analystProvider,
    nvidia_model: s.nvidiaModel,
    analyst_model: s.analystModel,
    nvidia_max_tokens: s.nvidiaMaxTokens,
    analyst_max_tokens: s.analystMaxTokens,
    nvidia_base_url: env.nvidiaBaseUrl,
    nvidia_api_key_configured: Boolean(env.nvidiaApiKey),
  };
}

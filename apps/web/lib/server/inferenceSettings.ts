import "./only";

import {
  getConfig,
  type AnalystProvider,
  type InferenceProvider,
  type OrchestratorProvider,
  type ServerConfig,
} from "./env";
import type { Gateway } from "./gateway";
import { HttpError } from "./errors";
import { clampPhysicalWorkers, MAX_PHYSICAL_SWARM_WORKERS } from "./engine/orchestration/caps";

/** Runtime-tunable orchestration knobs (subset stored in the DB row). */
export interface OrchestrationSettings {
  orchestrationEnabled: boolean;
  orchestratorProvider: OrchestratorProvider;
  orchestratorModel: string;
  workerProvider: "fireworks";
  workerModel: string;
  /** ALWAYS in [1, MAX_PHYSICAL_SWARM_WORKERS] after resolution. */
  maxPhysicalWorkers: number;
  virtualAgentsPerWorker: number;
  workerMaxTokens: number;
  orchestratorMaxTokens: number;
  workerTemperature: number;
  orchestratorTemperature: number;
  enableWorkerWebResearch: boolean;
  workerWebResearchMaxQueries: number;
}

export interface InferenceSettings {
  inferenceProvider: InferenceProvider;
  analystProvider: AnalystProvider;
  nvidiaModel: string;
  fireworksModel: string;
  analystModel: string;
  nvidiaMaxTokens: number;
  analystMaxTokens: number;
  orchestration: OrchestrationSettings;
  id: string | null;
}

/** Coerce an untrusted value to a valid provider, else the given fallback. */
function coerceProvider(
  v: unknown,
  fallback: "mock" | "nvidia" | "fireworks",
): "mock" | "nvidia" | "fireworks" {
  return v === "mock" || v === "nvidia" || v === "fireworks" ? v : fallback;
}

function posInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function boolField(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function tempField(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 2 ? n : fallback;
}

/**
 * A Fireworks model id always lives under an accounts/ namespace
 * (accounts/<owner>/models/<model>); NVIDIA catalog ids never do. Used to keep
 * a stored orchestrator model from being sent to the wrong provider after an
 * ORCHESTRATOR_PROVIDER switch.
 */
function modelMatchesProvider(model: string, provider: OrchestratorProvider): boolean {
  return provider === "fireworks" ? model.startsWith("accounts/") : !model.startsWith("accounts/");
}

/**
 * Resolve orchestration settings from a DB row, defaulting to env. The physical
 * worker count is ALWAYS clamped to [1, MAX_PHYSICAL_SWARM_WORKERS] and the
 * virtual-agents-per-worker floored at 1 — no stored value can exceed the cap.
 */
export function orchestrationSettingsFromRow(
  r: Record<string, unknown>,
  env: ServerConfig,
): OrchestrationSettings {
  const rawWorkerModel = typeof r.worker_model === "string" ? r.worker_model.trim() : "";
  const rawOrchModel = typeof r.orchestrator_model === "string" ? r.orchestrator_model.trim() : "";
  const orchestratorProvider =
    r.orchestrator_provider === "nvidia" || r.orchestrator_provider === "fireworks"
      ? r.orchestrator_provider
      : env.orchestratorProvider;
  const orchestratorDefault =
    orchestratorProvider === "fireworks" ? env.fireworksOrchestratorModel : env.orchestratorModel;
  return {
    orchestrationEnabled: boolField(r.orchestration_enabled, false),
    orchestratorProvider,
    // A stored model from before a provider switch is ignored, not misrouted.
    orchestratorModel:
      rawOrchModel && modelMatchesProvider(rawOrchModel, orchestratorProvider)
        ? rawOrchModel
        : orchestratorDefault,
    workerProvider: "fireworks",
    workerModel: rawWorkerModel || env.fireworksDeepseekModel,
    // Hard cap enforced here, regardless of what the DB stored.
    maxPhysicalWorkers: clampPhysicalWorkers(posInt(r.max_physical_workers, MAX_PHYSICAL_SWARM_WORKERS)),
    virtualAgentsPerWorker: Math.max(1, posInt(r.virtual_agents_per_worker, 5)),
    workerMaxTokens: posInt(r.worker_max_tokens, 1024),
    orchestratorMaxTokens: posInt(r.orchestrator_max_tokens, 4096),
    workerTemperature: tempField(r.worker_temperature, 0.6),
    orchestratorTemperature: tempField(r.orchestrator_temperature, 0.4),
    enableWorkerWebResearch: boolField(r.enable_worker_web_research, false),
    workerWebResearchMaxQueries: Math.max(0, posInt(r.worker_web_research_max_queries, 3)),
  };
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
  const rawFireworksModel = typeof r.fireworks_model === "string" ? r.fireworks_model.trim() : "";
  const rawAnalystModel = typeof r.analyst_model === "string" ? r.analyst_model.trim() : "";
  const nvidiaModel = rawNvidiaModel || env.nvidiaModel;
  const fireworksModel = rawFireworksModel || env.fireworksModel;
  const analystProvider = coerceProvider(r.analyst_provider, env.analystProvider);
  const analystModel =
    rawAnalystModel ||
    env.analystModel ||
    (analystProvider === "fireworks" ? fireworksModel : nvidiaModel);
  return {
    inferenceProvider: coerceProvider(r.inference_provider, env.inferenceProvider),
    analystProvider,
    nvidiaModel,
    fireworksModel,
    analystModel,
    nvidiaMaxTokens: posInt(r.nvidia_max_tokens, env.nvidiaMaxTokens),
    analystMaxTokens: posInt(r.analyst_max_tokens, env.analystMaxTokens),
    orchestration: orchestrationSettingsFromRow(r, env),
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
    fireworksModel: s.fireworksModel,
    analystModel: s.analystModel,
    nvidiaMaxTokens: s.nvidiaMaxTokens,
    analystMaxTokens: s.analystMaxTokens,
    // nvidiaApiKey/nvidiaBaseUrl + fireworksApiKey/fireworksBaseUrl
    // deliberately left as `...env`.
  };
}

const MIN_TOKENS = 1;
const MAX_TOKENS = 200_000;

export interface OrchestrationSettingsInput {
  orchestration_enabled: boolean;
  /** '' = inherit the env default (ORCHESTRATOR_PROVIDER). */
  orchestrator_provider: "" | "nvidia" | "fireworks";
  orchestrator_model: string;
  worker_model: string;
  max_physical_workers: number;
  virtual_agents_per_worker: number;
  worker_max_tokens: number;
  orchestrator_max_tokens: number;
  worker_temperature: number;
  orchestrator_temperature: number;
  enable_worker_web_research: boolean;
  worker_web_research_max_queries: number;
}

export interface InferenceSettingsInput {
  inference_provider: "mock" | "nvidia" | "fireworks";
  analyst_provider: "mock" | "nvidia" | "fireworks";
  nvidia_model: string;
  fireworks_model: string;
  analyst_model: string;
  nvidia_max_tokens: number;
  analyst_max_tokens: number;
  orchestration: OrchestrationSettingsInput;
}

function providerField(v: unknown, label: string): "mock" | "nvidia" | "fireworks" {
  if (v === "mock" || v === "nvidia" || v === "fireworks") return v;
  throw new HttpError(400, `${label} must be 'mock', 'nvidia' or 'fireworks'.`);
}

function tokensField(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < MIN_TOKENS || n > MAX_TOKENS) {
    throw new HttpError(400, `${label} must be an integer in [${MIN_TOKENS}, ${MAX_TOKENS}].`);
  }
  return n;
}

function optTokens(v: unknown, label: string, fallback: number): number {
  if (v == null) return fallback;
  return tokensField(v, label);
}

function optBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function optTemp(v: unknown, label: string, fallback: number): number {
  if (v == null) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 2) throw new HttpError(400, `${label} must be a number in [0, 2].`);
  return n;
}

function optCount(v: unknown, label: string, min: number, max: number, fallback: number): number {
  if (v == null) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${label} must be an integer in [${min}, ${max}].`);
  }
  return n;
}

/**
 * Validate the orchestration sub-object. `max_physical_workers` is CLAMPED to
 * the hard cap here on write — an admin can never persist a value that would
 * exceed MAX_PHYSICAL_SWARM_WORKERS (the resolver clamps again on read, so this
 * is belt-and-suspenders).
 */
export function validateOrchestrationBody(body: unknown): OrchestrationSettingsInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const orchestrator_model = typeof b.orchestrator_model === "string" ? b.orchestrator_model.trim().slice(0, 200) : "";
  const worker_model = typeof b.worker_model === "string" ? b.worker_model.trim().slice(0, 200) : "";
  const rawOrchProvider = b.orchestrator_provider;
  if (rawOrchProvider != null && rawOrchProvider !== "" && rawOrchProvider !== "nvidia" && rawOrchProvider !== "fireworks") {
    throw new HttpError(400, "orchestrator_provider must be '', 'nvidia' or 'fireworks'.");
  }
  return {
    orchestration_enabled: optBool(b.orchestration_enabled, false),
    orchestrator_provider: (rawOrchProvider ?? "") as "" | "nvidia" | "fireworks",
    orchestrator_model,
    worker_model,
    max_physical_workers: clampPhysicalWorkers(
      optCount(b.max_physical_workers, "max_physical_workers", 1, 10_000, MAX_PHYSICAL_SWARM_WORKERS),
    ),
    virtual_agents_per_worker: optCount(b.virtual_agents_per_worker, "virtual_agents_per_worker", 1, 200, 5),
    worker_max_tokens: optTokens(b.worker_max_tokens, "worker_max_tokens", 1024),
    orchestrator_max_tokens: optTokens(b.orchestrator_max_tokens, "orchestrator_max_tokens", 4096),
    worker_temperature: optTemp(b.worker_temperature, "worker_temperature", 0.6),
    orchestrator_temperature: optTemp(b.orchestrator_temperature, "orchestrator_temperature", 0.4),
    enable_worker_web_research: optBool(b.enable_worker_web_research, false),
    worker_web_research_max_queries: optCount(b.worker_web_research_max_queries, "worker_web_research_max_queries", 0, 20, 3),
  };
}

export function validateInferenceSettingsBody(body: unknown): InferenceSettingsInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const nvidia_model =
    typeof b.nvidia_model === "string" && b.nvidia_model.trim() ? b.nvidia_model.trim().slice(0, 200) : "";
  if (!nvidia_model) throw new HttpError(400, "nvidia_model must be a non-empty string.");
  // Empty is allowed — it means "inherit FIREWORKS_MODEL from env".
  const fireworks_model = typeof b.fireworks_model === "string" ? b.fireworks_model.trim().slice(0, 200) : "";
  const analyst_model = typeof b.analyst_model === "string" ? b.analyst_model.trim().slice(0, 200) : "";
  return {
    inference_provider: providerField(b.inference_provider, "inference_provider"),
    analyst_provider: providerField(b.analyst_provider, "analyst_provider"),
    nvidia_model,
    fireworks_model,
    analyst_model,
    nvidia_max_tokens: tokensField(b.nvidia_max_tokens, "nvidia_max_tokens"),
    analyst_max_tokens: tokensField(b.analyst_max_tokens, "analyst_max_tokens"),
    orchestration: validateOrchestrationBody(b.orchestration),
  };
}

export interface OrchestrationSettingsView extends Omit<OrchestrationSettingsInput, "orchestrator_provider"> {
  /** Resolved provider (row override or env default) — never ''. */
  orchestrator_provider: OrchestratorProvider;
  worker_provider: "fireworks";
  /** Compile-time reminder of the hard ceiling, surfaced read-only to the UI. */
  max_physical_workers_cap: number;
}

export interface InferenceSettingsView extends InferenceSettingsInput {
  nvidia_base_url: string;
  nvidia_api_key_configured: boolean;
  fireworks_base_url: string;
  fireworks_api_key_configured: boolean;
  orchestration: OrchestrationSettingsView;
}

function toOrchestrationView(o: OrchestrationSettings): OrchestrationSettingsView {
  return {
    orchestration_enabled: o.orchestrationEnabled,
    orchestrator_provider: o.orchestratorProvider,
    orchestrator_model: o.orchestratorModel,
    worker_provider: o.workerProvider,
    worker_model: o.workerModel,
    max_physical_workers: o.maxPhysicalWorkers,
    virtual_agents_per_worker: o.virtualAgentsPerWorker,
    worker_max_tokens: o.workerMaxTokens,
    orchestrator_max_tokens: o.orchestratorMaxTokens,
    worker_temperature: o.workerTemperature,
    orchestrator_temperature: o.orchestratorTemperature,
    enable_worker_web_research: o.enableWorkerWebResearch,
    worker_web_research_max_queries: o.workerWebResearchMaxQueries,
    max_physical_workers_cap: MAX_PHYSICAL_SWARM_WORKERS,
  };
}

/**
 * Client-facing view. NEVER includes any API key — only booleans + base URLs.
 * Both the NVIDIA (orchestrator) and Fireworks (worker) credentials are exposed
 * strictly as `*_api_key_configured` flags.
 */
export function toInferenceSettingsView(s: InferenceSettings, env: ServerConfig): InferenceSettingsView {
  return {
    inference_provider: s.inferenceProvider,
    analyst_provider: s.analystProvider,
    nvidia_model: s.nvidiaModel,
    fireworks_model: s.fireworksModel,
    analyst_model: s.analystModel,
    nvidia_max_tokens: s.nvidiaMaxTokens,
    analyst_max_tokens: s.analystMaxTokens,
    orchestration: toOrchestrationView(s.orchestration),
    nvidia_base_url: env.nvidiaBaseUrl,
    nvidia_api_key_configured: Boolean(env.nvidiaApiKey),
    fireworks_base_url: env.fireworksBaseUrl,
    fireworks_api_key_configured: Boolean(env.fireworksApiKey),
  };
}

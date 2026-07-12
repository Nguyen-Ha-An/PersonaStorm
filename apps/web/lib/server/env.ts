import "./only";

/**
 * Central server-side configuration for the Vercel full-stack API.
 *
 * Everything here is read from `process.env` at request time on the server —
 * NONE of these are `NEXT_PUBLIC_*`, so the service role key / JWT secret /
 * NVIDIA key never reach the browser bundle.
 *
 * Fallback rule (Phase 10): if `SUPABASE_URL` is missing but the public
 * `NEXT_PUBLIC_SUPABASE_URL` exists, reuse it server-side — the project URL is
 * not a secret, only the service role key is.
 *
 * The Supabase URL is validated + normalized to a bare origin through the
 * shared (secret-free) validator so a pathed value (/rest/v1, /auth/v1,
 * /storage/v1) set directly in the Vercel dashboard — bypassing the CI check
 * in deploy.yml — is caught and corrected at runtime instead of silently
 * producing malformed GoTrue/PostgREST URLs.
 */

// Isomorphic + secret-free — safe to import into a server-only module.
import { validateSupabaseUrl } from "../supabase/config";
import { DEMO_SIGNUP_CREDITS } from "./demo";

function trimmed(v: string | undefined): string {
  return (v ?? "").trim();
}

export type InferenceProvider = "mock" | "nvidia" | "fireworks";
export type AnalystProvider = "mock" | "nvidia" | "fireworks";
export type SemanticProvider = "mock" | "nvidia" | "fireworks";
export type OrchestratorProvider = "nvidia" | "fireworks";

/** Default Nemotron orchestrator model when the orchestrator runs on NVIDIA. */
export const DEFAULT_ORCHESTRATOR_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
/** Default Fireworks DeepSeek worker model if FIREWORKS_DEEPSEEK_MODEL is unset. */
export const DEFAULT_WORKER_MODEL = "accounts/fireworks/models/deepseek-v4-flash";

export interface ServerConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  supabaseJwtSecret: string;
  starterCredits: number;
  apiEnv: "dev" | "prod";
  inferenceProvider: InferenceProvider;
  analystProvider: AnalystProvider;
  nvidiaApiKey: string;
  nvidiaBaseUrl: string;
  nvidiaModel: string;
  analystModel: string;
  nvidiaMaxTokens: number;
  analystMaxTokens: number;
  semanticProvider: SemanticProvider;
  semanticModel: string;
  semanticMaxTokens: number;
  /** Raw env-only values ("" when unset), kept so resolveEffectiveConfig can
   * re-derive the semantic provider/model from the EFFECTIVE analyst provider
   * after the DB settings row is layered on. */
  semanticProviderRaw: "" | "mock" | "nvidia" | "fireworks";
  semanticModelRaw: string;
  personaSeed: number;
  // Live-replay pacing for the SSE stream (data is precomputed at create time).
  streamBatchSize: number;
  streamBatchIntervalMs: number;
  // ── Fireworks (server-only secrets) — the real prototype's inference API ──
  // Used by the classic engine paths when a provider knob is set to
  // "fireworks", and by the orchestrated worker swarm.
  fireworksApiKey: string;
  fireworksBaseUrl: string;
  fireworksModel: string;
  fireworksMaxTokens: number;
  fireworksDeepseekModel: string;
  /** Max fraction of swarm personas allowed to fail-after-retry before the
   * storm fails honestly (mirrors apps/api's SWARM_MAX_DROP_FRACTION). */
  swarmMaxDropFraction: number;
  // ── Orchestrated worker swarm ──
  orchestratorProvider: OrchestratorProvider;
  orchestratorModel: string;
  fireworksOrchestratorModel: string;
}

function intEnv(name: string, fallback: number): number {
  const raw = trimmed(process.env[name]);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

let warnedBadUrl = false;
let warnedBadFireworksModel = false;

export function getConfig(): ServerConfig {
  const rawSupabaseUrl =
    trimmed(process.env.SUPABASE_URL) || trimmed(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const urlCheck = validateSupabaseUrl(rawSupabaseUrl);
  if (rawSupabaseUrl && !urlCheck.ok && !warnedBadUrl) {
    // Warn once per process; never print the value itself.
    console.error(`[personastorm] ${urlCheck.error}`);
    warnedBadUrl = true;
  }
  // Normalized bare origin (path stripped) — resilient against a pathed value.
  const supabaseUrl = urlCheck.url || rawSupabaseUrl;
  const supabaseAnonKey =
    trimmed(process.env.SUPABASE_ANON_KEY) || trimmed(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const liveProvider = (v: string): "nvidia" | "fireworks" | "" =>
    v === "nvidia" || v === "fireworks" ? v : "";
  const inferenceProvider: InferenceProvider =
    liveProvider(trimmed(process.env.INFERENCE_PROVIDER).toLowerCase()) || "mock";
  const analystProvider: AnalystProvider =
    liveProvider(trimmed(process.env.ANALYST_PROVIDER).toLowerCase()) || "mock";
  // Semantic assessor defaults to whatever the analyst uses (mock stays mock).
  const semanticRaw = trimmed(process.env.SEMANTIC_PROVIDER).toLowerCase();
  const semanticProviderRaw: "" | "mock" | "nvidia" | "fireworks" =
    semanticRaw === "mock" ? "mock" : liveProvider(semanticRaw);
  const semanticProvider: SemanticProvider = semanticProviderRaw || analystProvider;

  // Fireworks model resolution: FIREWORKS_MODEL for the classic engine paths,
  // falling back to the (worker-swarm) FIREWORKS_DEEPSEEK_MODEL default so a
  // single-model setup needs only one env var. Fireworks ids always live
  // under accounts/… — anything else (e.g. an NVIDIA id pasted into the
  // wrong var) is rejected here so it can never be POSTed to Fireworks.
  const accountsModel = (name: string, v: string): string => {
    if (v && !v.startsWith("accounts/") && !warnedBadFireworksModel) {
      console.error(`[personastorm] ${name} is not a Fireworks model id (expected accounts/…); using the default instead.`);
      warnedBadFireworksModel = true;
    }
    return v.startsWith("accounts/") ? v : "";
  };
  const fireworksDeepseekModel =
    accountsModel("FIREWORKS_DEEPSEEK_MODEL", trimmed(process.env.FIREWORKS_DEEPSEEK_MODEL)) ||
    DEFAULT_WORKER_MODEL;
  const fireworksModel =
    accountsModel("FIREWORKS_MODEL", trimmed(process.env.FIREWORKS_MODEL)) || fireworksDeepseekModel;

  return {
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey: trimmed(process.env.SUPABASE_SERVICE_ROLE_KEY),
    supabaseJwtSecret: trimmed(process.env.SUPABASE_JWT_SECRET),
    starterCredits: intEnv("STARTER_CREDITS", DEMO_SIGNUP_CREDITS),
    apiEnv: trimmed(process.env.API_ENV).toLowerCase() === "prod" ? "prod" : "dev",
    inferenceProvider,
    analystProvider,
    nvidiaApiKey: trimmed(process.env.NVIDIA_API_KEY),
    nvidiaBaseUrl: trimmed(process.env.NVIDIA_BASE_URL) || "https://integrate.api.nvidia.com/v1",
    nvidiaModel: trimmed(process.env.NVIDIA_MODEL) || "z-ai/glm-5.2",
    analystModel: trimmed(process.env.ANALYST_MODEL),
    nvidiaMaxTokens: intEnv("NVIDIA_MAX_TOKENS", 2048),
    analystMaxTokens: intEnv("ANALYST_MAX_TOKENS", 4096),
    semanticProvider,
    // Model fallback ends at the provider actually making the call, so a bare
    // SEMANTIC_PROVIDER=fireworks never sends an NVIDIA model id to Fireworks.
    semanticModel:
      trimmed(process.env.SEMANTIC_MODEL) ||
      trimmed(process.env.ANALYST_MODEL) ||
      (semanticProvider === "fireworks"
        ? fireworksModel
        : trimmed(process.env.NVIDIA_MODEL) || "z-ai/glm-5.2"),
    semanticProviderRaw,
    semanticModelRaw: trimmed(process.env.SEMANTIC_MODEL),
    semanticMaxTokens: intEnv("SEMANTIC_MAX_TOKENS", 2048),
    personaSeed: intEnv("PERSONA_SEED", 1337),
    streamBatchSize: intEnv("STREAM_BATCH_SIZE", 25),
    streamBatchIntervalMs: intEnv("STREAM_BATCH_INTERVAL_MS", 45),
    // Fireworks — keys/base URLs ALWAYS from env, never a DB row.
    fireworksApiKey: trimmed(process.env.FIREWORKS_API_KEY),
    fireworksBaseUrl: trimmed(process.env.FIREWORKS_BASE_URL) || "https://api.fireworks.ai/inference/v1",
    fireworksModel,
    // 4096: schema-constrained reactions at temperature 0.8 can exceed 2048
    // tokens; a length-cut reply is unparseable and drops the persona.
    fireworksMaxTokens: intEnv("FIREWORKS_MAX_TOKENS", 4096),
    fireworksDeepseekModel,
    swarmMaxDropFraction: (() => {
      const raw = Number(trimmed(process.env.SWARM_MAX_DROP_FRACTION));
      return Number.isFinite(raw) && raw >= 0 && raw <= 0.5 ? raw : 0.1;
    })(),
    // Orchestrator "brain" defaults to Fireworks so the whole swarm runs on a
    // single FIREWORKS_API_KEY; set ORCHESTRATOR_PROVIDER=nvidia for Nemotron.
    orchestratorProvider:
      trimmed(process.env.ORCHESTRATOR_PROVIDER).toLowerCase() === "nvidia" ? "nvidia" : "fireworks",
    orchestratorModel: trimmed(process.env.NVIDIA_ORCHESTRATOR_MODEL) || DEFAULT_ORCHESTRATOR_MODEL,
    fireworksOrchestratorModel:
      accountsModel("FIREWORKS_ORCHESTRATOR_MODEL", trimmed(process.env.FIREWORKS_ORCHESTRATOR_MODEL)) ||
      fireworksModel,
  };
}

/** True when we have enough to talk to a real Supabase project (service role). */
export function supabaseConfigured(cfg: ServerConfig = getConfig()): boolean {
  return Boolean(cfg.supabaseUrl && cfg.supabaseServiceRoleKey);
}

export const isProduction = process.env.NODE_ENV === "production";

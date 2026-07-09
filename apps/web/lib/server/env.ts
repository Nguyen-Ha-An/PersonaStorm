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

export type InferenceProvider = "mock" | "nvidia";
export type AnalystProvider = "mock" | "nvidia";

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
  personaSeed: number;
  // Live-replay pacing for the SSE stream (data is precomputed at create time).
  streamBatchSize: number;
  streamBatchIntervalMs: number;
}

function intEnv(name: string, fallback: number): number {
  const raw = trimmed(process.env[name]);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

let warnedBadUrl = false;

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

  const inference = trimmed(process.env.INFERENCE_PROVIDER).toLowerCase();
  const analyst = trimmed(process.env.ANALYST_PROVIDER).toLowerCase();

  return {
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey: trimmed(process.env.SUPABASE_SERVICE_ROLE_KEY),
    supabaseJwtSecret: trimmed(process.env.SUPABASE_JWT_SECRET),
    starterCredits: intEnv("STARTER_CREDITS", DEMO_SIGNUP_CREDITS),
    apiEnv: trimmed(process.env.API_ENV).toLowerCase() === "prod" ? "prod" : "dev",
    inferenceProvider: inference === "nvidia" ? "nvidia" : "mock",
    analystProvider: analyst === "nvidia" ? "nvidia" : "mock",
    nvidiaApiKey: trimmed(process.env.NVIDIA_API_KEY),
    nvidiaBaseUrl: trimmed(process.env.NVIDIA_BASE_URL) || "https://integrate.api.nvidia.com/v1",
    nvidiaModel: trimmed(process.env.NVIDIA_MODEL) || "z-ai/glm-5.2",
    analystModel: trimmed(process.env.ANALYST_MODEL),
    nvidiaMaxTokens: intEnv("NVIDIA_MAX_TOKENS", 2048),
    analystMaxTokens: intEnv("ANALYST_MAX_TOKENS", 4096),
    personaSeed: intEnv("PERSONA_SEED", 1337),
    streamBatchSize: intEnv("STREAM_BATCH_SIZE", 25),
    streamBatchIntervalMs: intEnv("STREAM_BATCH_INTERVAL_MS", 45),
  };
}

/** True when we have enough to talk to a real Supabase project (service role). */
export function supabaseConfigured(cfg: ServerConfig = getConfig()): boolean {
  return Boolean(cfg.supabaseUrl && cfg.supabaseServiceRoleKey);
}

export const isProduction = process.env.NODE_ENV === "production";

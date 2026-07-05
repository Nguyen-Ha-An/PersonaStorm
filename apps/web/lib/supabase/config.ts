/**
 * Supabase URL validation & normalization — the single source of truth.
 *
 * ISOMORPHIC and SECRET-FREE: this module reads only the PUBLIC
 * NEXT_PUBLIC_SUPABASE_* env vars, so it is safe to import from both Client
 * Components (lib/supabase/client.ts) and server modules (lib/server/env.ts).
 * It must NEVER touch the service role key or JWT secret (those live under the
 * server-only guard in lib/server/*).
 *
 * `NEXT_PUBLIC_SUPABASE_URL` must be ONLY the project origin —
 *   https://<project-ref>.supabase.co
 * with no path segment. A value carrying `/rest/v1`, `/auth/v1`, or
 * `/storage/v1` (a common copy-paste mistake from the dashboard) silently
 * breaks GoTrue token validation and PostgREST calls, so we validate it and
 * normalize back to the bare origin.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

export const SUPABASE_URL_PATH_ERROR =
  "NEXT_PUBLIC_SUPABASE_URL must be the Supabase project base URL only. " +
  "Do not include /rest/v1, /auth/v1, or /storage/v1.";

export interface SupabaseUrlCheck {
  ok: boolean;
  /** The normalized bare origin (protocol//host), or "" when unparseable. */
  url: string;
  error?: string;
}

/**
 * Validate a raw Supabase URL. Reports whether it is a clean bare origin and,
 * either way, returns the normalized origin so callers can be resilient.
 */
export function validateSupabaseUrl(raw: string | undefined | null): SupabaseUrlCheck {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, url: "", error: "NEXT_PUBLIC_SUPABASE_URL is not set." };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, url: "", error: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL." };
  }

  const isLocal = LOCAL_HOSTS.has(parsed.hostname);
  const origin = `${parsed.protocol}//${parsed.host}`;

  if (parsed.protocol !== "https:" && !isLocal) {
    return { ok: false, url: origin, error: "NEXT_PUBLIC_SUPABASE_URL must use https." };
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  if (path !== "") {
    return { ok: false, url: origin, error: SUPABASE_URL_PATH_ERROR };
  }

  return { ok: true, url: origin };
}

/**
 * Always return a usable bare origin (protocol//host) for a Supabase URL,
 * stripping any accidental `/rest/v1` etc. path. Returns "" when the value is
 * missing or unparseable. Prefer this at runtime (resilient) and log the
 * `validateSupabaseUrl().error` alongside it so the misconfiguration is visible.
 */
export function normalizeSupabaseUrl(raw: string | undefined | null): string {
  return validateSupabaseUrl(raw).url;
}

/** Throw on an invalid Supabase URL — use where a hard failure is preferable. */
export function assertValidSupabaseUrl(raw: string | undefined | null): string {
  const check = validateSupabaseUrl(raw);
  if (!check.ok) throw new Error(check.error ?? "Invalid NEXT_PUBLIC_SUPABASE_URL.");
  return check.url;
}

/** Public (browser-safe) Supabase project origin, normalized. "" when unset. */
export function getPublicSupabaseUrl(): string {
  return normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/** Public (browser-safe) Supabase anon key. "" when unset. */
export function getPublicSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
}

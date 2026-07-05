"use client";

/**
 * Supabase browser-config validation.
 *
 * A common misconfiguration is setting NEXT_PUBLIC_SUPABASE_URL to a Supabase
 * *REST* endpoint (…/rest/v1) or another sub-path instead of the project base
 * URL. Supabase JS `createClient()` expects the base origin only
 * (https://project-ref.supabase.co); a path makes it build requests like
 * `POST …/rest/v1/auth/v1/signup` → 404 "Invalid path specified in request URL".
 *
 * This module normalizes/validates the URL at load time so the mistake is
 * caught with a clear message instead of a confusing runtime 404. Only PUBLIC
 * values (NEXT_PUBLIC_*) are touched here — no secrets, and nothing is logged.
 */

const INVALID_SUBPATHS = ["/rest/v1", "/auth/v1", "/storage/v1"];

/**
 * Return the Supabase project base origin, or null when unset. Throws a clear
 * Error when the value includes a REST/auth/storage sub-path or any other path.
 */
export function normalizeSupabaseProjectUrl(raw?: string): string | null {
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (INVALID_SUBPATHS.some((path) => url.pathname.startsWith(path))) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be the Supabase project base URL, for example " +
        "https://project-ref.supabase.co. Do not include /rest/v1, /auth/v1, or /storage/v1.",
    );
  }

  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must not include a path. Use only https://project-ref.supabase.co.",
    );
  }

  return url.origin;
}

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

let normalizedUrl: string | null = null;
let urlError: string | null = null;
try {
  normalizedUrl = normalizeSupabaseProjectUrl(rawUrl);
} catch (err) {
  // A present-but-invalid URL (e.g. …/rest/v1). Capture the message for the UI;
  // never rethrow at import time (the build must still succeed).
  urlError = (err as Error).message;
}

/** The validated project base origin (no path), or null if unset/invalid. */
export const SUPABASE_URL: string | null = normalizedUrl;
export const SUPABASE_ANON_KEY: string | null = anonKey ?? null;

/** True only when the URL is present AND valid AND the anon key is present. */
export const SUPABASE_CONFIGURED: boolean = Boolean(normalizedUrl && anonKey);

/**
 * Set when NEXT_PUBLIC_SUPABASE_URL is present but malformed (e.g. it points at
 * the REST endpoint). Distinct from "not configured at all" so the UI can show
 * a fix-it message instead of a generic "set your env vars" note.
 */
export const SUPABASE_URL_ERROR: string | null = urlError;
export const SUPABASE_MISCONFIGURED: boolean = Boolean(urlError);

/** The generic "auth not configured" message (both values absent). */
export const SUPABASE_CONFIG_ERROR =
  "Authentication is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
  "NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment (Vercel → Settings → " +
  "Environment Variables) to enable login.";

/** The user-facing message for a misconfigured (path-included) project URL. */
export const SUPABASE_URL_MISCONFIG_MESSAGE =
  "Supabase URL is misconfigured. NEXT_PUBLIC_SUPABASE_URL must be the base " +
  "project URL, not /rest/v1. Correct: https://project-ref.supabase.co — " +
  "Wrong: https://project-ref.supabase.co/rest/v1";

/**
 * Map a raw Supabase/GoTrue error into a clearer message when it is the
 * symptom of a path-included project URL. Supabase returns
 * "Invalid path specified in request URL" (HTTP 404) in that case. Any other
 * error is returned unchanged.
 */
export function friendlySupabaseError(message: string | undefined | null): string {
  const msg = (message ?? "").trim();
  if (/invalid path specified in request url/i.test(msg)) {
    return SUPABASE_URL_MISCONFIG_MESSAGE;
  }
  return msg || "Something went wrong. Please try again.";
}

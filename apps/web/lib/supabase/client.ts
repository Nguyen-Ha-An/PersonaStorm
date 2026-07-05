"use client";

/**
 * Browser Supabase client (anon key only — NEVER the service role key, which
 * would let any visitor bypass RLS). The client persists the session in
 * localStorage and auto-refreshes the access token.
 *
 * Env is read at build time and inlined into the bundle:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * When either is missing we return a null client and expose SUPABASE_CONFIGURED
 * so the UI can show a clear "auth is not configured" message instead of
 * crashing — the production build still succeeds.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getPublicSupabaseAnonKey,
  validateSupabaseUrl,
} from "./config";

// Validate + normalize the project URL through the single source of truth. A
// value that carries a path (/rest/v1, /auth/v1, /storage/v1) is stripped to
// the bare origin AND surfaced loudly so the misconfiguration is fixed — a
// pathed URL silently breaks GoTrue and PostgREST.
const urlCheck = validateSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
if (!urlCheck.ok && urlCheck.url) {
  // Present but malformed (e.g. includes /rest/v1): warn, keep the bare origin.
  console.error(`[personastorm] ${urlCheck.error}`);
}
const url = urlCheck.url || undefined;
const anonKey = getPublicSupabaseAnonKey() || undefined;

export const SUPABASE_CONFIGURED = Boolean(url && anonKey);

export const SUPABASE_CONFIG_ERROR =
  "Authentication is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
  "NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment (Vercel → Settings → " +
  "Environment Variables) to enable login.";

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!SUPABASE_CONFIGURED) return null;
  if (!cached) {
    cached = createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return cached;
}

/** The current access token (JWT) or null. Used to authorize API + SSE calls. */
export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

"use client";

/**
 * Browser Supabase client (anon key only — NEVER the service role key, which
 * would let any visitor bypass RLS). The client persists the session in
 * localStorage and auto-refreshes the access token.
 *
 * Env is read at build time and inlined into the bundle:
 *   NEXT_PUBLIC_SUPABASE_URL   (validated/normalized in ./config)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * The URL is normalized/validated in ./config so a path-included value (e.g.
 * …/rest/v1) is caught with a clear message. When the URL is missing or
 * invalid, or the anon key is missing, we return a null client and expose
 * SUPABASE_CONFIGURED / SUPABASE_MISCONFIGURED so the UI can show the right
 * message instead of crashing — the production build still succeeds.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_CONFIGURED,
  SUPABASE_CONFIG_ERROR,
  SUPABASE_MISCONFIGURED,
  SUPABASE_URL,
  SUPABASE_URL_ERROR,
  SUPABASE_URL_MISCONFIG_MESSAGE,
  friendlySupabaseError,
} from "./config";

// Re-export the public config surface so existing importers keep working.
export {
  SUPABASE_CONFIGURED,
  SUPABASE_CONFIG_ERROR,
  SUPABASE_MISCONFIGURED,
  SUPABASE_URL_ERROR,
  SUPABASE_URL_MISCONFIG_MESSAGE,
  friendlySupabaseError,
};

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!SUPABASE_CONFIGURED || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!cached) {
    cached = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

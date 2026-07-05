/**
 * PersonaStorm configuration — the single import point for all URL / domain /
 * environment behavior that is shared between the browser and the server.
 *
 * ISOMORPHIC and SECRET-FREE. This barrel re-exports only public, browser-safe
 * helpers:
 *   - site URL + Supabase Auth redirect builders  (./site-url)
 *   - Supabase project URL validation/normalization (./supabase/config)
 *
 * SERVER-ONLY configuration (service role key, JWT secret, inference provider
 * keys) lives behind the server-only guard in lib/server/env.ts and is
 * deliberately NOT re-exported here so it can never be pulled into a client
 * bundle through this module.
 *
 * Prefer importing from "@/lib/config" so there is one obvious place to find
 * how the app resolves its site URL and validates Supabase configuration.
 */

export {
  PRODUCTION_SITE_URL,
  VERCEL_FALLBACK_URL,
  isProductionRuntime,
  getSiteUrl,
  getAuthCallbackUrl,
  getAuthConfirmUrl,
  getResetPasswordUrl,
  assertNoLocalhostInProduction,
} from "./site-url";

export {
  SUPABASE_URL_PATH_ERROR,
  validateSupabaseUrl,
  normalizeSupabaseUrl,
  assertValidSupabaseUrl,
  getPublicSupabaseUrl,
  getPublicSupabaseAnonKey,
  type SupabaseUrlCheck,
} from "./supabase/config";

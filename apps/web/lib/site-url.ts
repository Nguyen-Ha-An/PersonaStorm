/**
 * Canonical site URL resolution for Supabase Auth redirects — single source of
 * truth. ISOMORPHIC and SECRET-FREE (reads only PUBLIC env), so both Client
 * Components and server code import it. Re-exported from lib/config.ts.
 *
 * Supabase Auth uses whatever URL we pass as `emailRedirectTo` / `redirectTo`
 * to build confirmation, magic-link, and password-reset links. When we pass
 * nothing, Supabase falls back to the project's **Site URL** — which is how a
 * misconfigured project sent users to `http://localhost:3000`. Every auth call
 * in this app therefore passes an explicit redirect built from `getSiteUrl()`.
 *
 * Resolution order (first match wins):
 *   1. NEXT_PUBLIC_SITE_URL   — set this to the production domain on Vercel.
 *   2. NEXT_PUBLIC_VERCEL_URL — per-deploy Vercel host (e.g. previews), no scheme.
 *   3. PRODUCTION_SITE_URL    — when NODE_ENV==='production' (NEVER localhost).
 *   4. window.location.origin — runtime origin in the browser (local dev).
 *   5. http://localhost:3000  — last-resort LOCAL DEV fallback ONLY.
 *
 * The key invariant: in production the resolver can never return localhost, and
 * `assertNoLocalhostInProduction` fails loud if an explicit misconfiguration
 * (e.g. NEXT_PUBLIC_SITE_URL=http://localhost:3000) tries to.
 */

/** Canonical production domain. Auth redirects resolve here in production. */
export const PRODUCTION_SITE_URL = "https://personastorm.nguyenhaan.id.vn";

/** Vercel fallback domain (documented in Supabase redirect allow-list). */
export const VERCEL_FALLBACK_URL = "https://persona-storm.vercel.app";

const LOCAL_FALLBACK = "http://localhost:3000";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

/** True when the app is running as a production build. */
export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Strip a single trailing slash so we can safely append `/auth/...`. */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    return stripTrailingSlash(explicit);
  }

  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL?.trim();
  if (vercelUrl) {
    const normalized = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    return stripTrailingSlash(normalized);
  }

  // Production must NEVER silently fall back to localhost. Use the canonical
  // domain when no explicit/preview URL is configured.
  if (isProductionRuntime()) {
    return PRODUCTION_SITE_URL;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return stripTrailingSlash(window.location.origin);
  }

  // Local dev only (non-production, no window — e.g. an SSR dev render).
  return LOCAL_FALLBACK;
}

/**
 * Guard: refuse a localhost auth redirect in production. Throws a clear,
 * token-free error the UI maps to the `auth_redirect_localhost` message.
 */
export function assertNoLocalhostInProduction(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid auth redirect URL: ${url}`);
  }
  if (isProductionRuntime() && LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      "Auth redirect URL resolved to localhost in production. " +
        `Set NEXT_PUBLIC_SITE_URL=${PRODUCTION_SITE_URL}.`,
    );
  }
}

/** Where auth links land: exchanges a PKCE code / implicit hash, then routes on. */
export function getAuthCallbackUrl(): string {
  const url = `${getSiteUrl()}/auth/callback`;
  assertNoLocalhostInProduction(url);
  return url;
}

/** Custom email-confirmation route (token_hash flow — see docs/deployment.md). */
export function getAuthConfirmUrl(): string {
  const url = `${getSiteUrl()}/auth/confirm`;
  assertNoLocalhostInProduction(url);
  return url;
}

/** Where a password-recovery link lands so the user can set a new password. */
export function getResetPasswordUrl(): string {
  const url = `${getSiteUrl()}/auth/reset-password`;
  assertNoLocalhostInProduction(url);
  return url;
}

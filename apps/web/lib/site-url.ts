/**
 * Canonical site URL resolution for Supabase Auth redirects.
 *
 * Supabase Auth uses whatever URL we pass as `emailRedirectTo` / `redirectTo`
 * to build confirmation, magic-link, and password-reset links. When we pass
 * nothing, Supabase falls back to the project's **Site URL** — which is why a
 * misconfigured project sends users back to `http://localhost:3000`. Every auth
 * call in this app therefore passes an explicit redirect built from `getSiteUrl()`.
 *
 * Resolution order (first match wins):
 *   1. NEXT_PUBLIC_SITE_URL   — set this to the production domain on Vercel.
 *   2. NEXT_PUBLIC_VERCEL_URL — per-deploy Vercel host (e.g. previews), no scheme.
 *   3. window.location.origin — runtime origin in the browser (preview/local).
 *   4. http://localhost:3000  — last-resort local dev fallback ONLY.
 *
 * The localhost fallback must never win in production: set NEXT_PUBLIC_SITE_URL
 * to https://personastorm.nguyenhaan.id.vn there (see .github/workflows/deploy.yml).
 */

const LOCAL_FALLBACK = "http://localhost:3000";

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
    return stripTrailingSlash(`https://${vercelUrl}`);
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return stripTrailingSlash(window.location.origin);
  }

  return LOCAL_FALLBACK;
}

/** Where auth links land: exchanges a PKCE code / implicit hash, then routes on. */
export function getAuthCallbackUrl(): string {
  return `${getSiteUrl()}/auth/callback`;
}

/** Custom email-confirmation route (token_hash flow — see docs/deployment.md). */
export function getAuthConfirmUrl(): string {
  return `${getSiteUrl()}/auth/confirm`;
}

/** Where a password-recovery link lands so the user can set a new password. */
export function getResetPasswordUrl(): string {
  return `${getSiteUrl()}/auth/reset-password`;
}

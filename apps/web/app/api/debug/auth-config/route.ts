import { NextRequest } from "next/server";
import { getPublicSupabaseUrl, validateSupabaseUrl } from "@/lib/supabase/config";
import {
  PRODUCTION_SITE_URL,
  getAuthCallbackUrl,
  getSiteUrl,
  isProductionRuntime,
} from "@/lib/site-url";

/**
 * GET /api/debug/auth-config — proves what the DEPLOYED app resolves its auth
 * redirect URLs to, so we can tell a code/env problem apart from a Supabase
 * dashboard / email-template problem WITHOUT ever touching a token.
 *
 * Returns ONLY safe metadata: origins, booleans, and a short commit SHA. It
 * never returns tokens, the anon key, the service role key, the JWT secret, an
 * email address, or a full env dump.
 *
 * Auth: open in non-production. In production it is gated behind a
 * debug-secret header — and if AUTH_DEBUG_SECRET is not configured, the route
 * reports as 404 (disabled) so even this safe metadata is never public by
 * default. Set AUTH_DEBUG_SECRET in Vercel, then:
 *     curl -H "x-debug-secret: <secret>" https://<domain>/api/debug/auth-config
 *
 * NOTE on accuracy: the actual `emailRedirectTo` is built in the BROWSER from
 * the build-time-inlined NEXT_PUBLIC_SITE_URL. This route reads the same
 * NEXT_PUBLIC_* vars (Next inlines them here too), so a mismatch would only
 * appear if the deployed bundle were built against a different env than it now
 * runs with — which `commit_sha` is here to help you detect.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function shortSha(sha: string | undefined | null): string | null {
  const v = (sha ?? "").trim();
  return v ? v.slice(0, 7) : null;
}

export function GET(req: NextRequest): Response {
  const isProd = isProductionRuntime();

  // --- security gate -------------------------------------------------------
  if (isProd) {
    const configured = process.env.AUTH_DEBUG_SECRET?.trim();
    if (!configured) {
      // Not enabled — do not even reveal that the route exists.
      return json({ detail: "Not found." }, 404);
    }
    const provided = req.headers.get("x-debug-secret")?.trim();
    if (!provided || provided !== configured) {
      return json({ detail: "Forbidden." }, 403);
    }
  }

  // --- resolve auth URLs the SAME way the app does -------------------------
  // getSiteUrl() never returns localhost in production (it returns the
  // canonical domain), and getAuthCallbackUrl() throws via
  // assertNoLocalhostInProduction if production somehow resolved to localhost —
  // catching that throw is itself the uses_localhost signal.
  let siteUrl: string | null = null;
  let callbackUrl: string | null = null;
  let usesLocalhost = false;
  let resolveError: string | null = null;

  try {
    siteUrl = getSiteUrl();
  } catch (e) {
    resolveError = e instanceof Error ? e.message : "site url resolve failed";
  }
  if (siteUrl) {
    try {
      usesLocalhost = LOCAL_HOSTS.has(new URL(siteUrl).hostname);
    } catch {
      /* leave usesLocalhost false; siteOrigin will be null below */
    }
  }
  try {
    callbackUrl = getAuthCallbackUrl();
  } catch (e) {
    // Thrown by assertNoLocalhostInProduction — production resolved to localhost.
    usesLocalhost = true;
    resolveError = e instanceof Error ? e.message : "callback url resolve failed";
    callbackUrl = siteUrl ? `${siteUrl}/auth/callback` : null;
  }

  // --- Supabase URL shape --------------------------------------------------
  const rawSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseCheck = validateSupabaseUrl(rawSupabase);
  const supabaseOrigin = getPublicSupabaseUrl() || originOf(rawSupabase ?? null);
  let supabaseHasPath = false;
  if (rawSupabase) {
    try {
      const p = new URL(rawSupabase).pathname.replace(/\/+$/, "");
      supabaseHasPath = p !== "";
    } catch {
      /* unparseable -> treat as no path, error already surfaced by the check */
    }
  }

  const siteOrigin = originOf(siteUrl);
  const callbackOrigin = originOf(callbackUrl);

  // safe_for_auth_email_redirect: production must resolve to a non-localhost
  // https origin. We do NOT assert it equals the canonical domain (a custom
  // NEXT_PUBLIC_SITE_URL is legitimate), only that it isn't localhost.
  const safeForAuthEmailRedirect =
    !usesLocalhost &&
    !!siteOrigin &&
    (!isProd || (siteOrigin.startsWith("https://") && !LOCAL_HOSTS.has(new URL(siteOrigin).hostname)));

  const body: Record<string, unknown> = {
    node_env: process.env.NODE_ENV ?? "unknown",
    vercel_env: process.env.VERCEL_ENV ?? null,
    commit_sha: shortSha(process.env.NEXT_PUBLIC_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA),
    deployed_at: process.env.NEXT_PUBLIC_DEPLOYED_AT?.trim() || null,
    has_next_public_site_url: Boolean(process.env.NEXT_PUBLIC_SITE_URL?.trim()),
    site_url_origin: siteOrigin,
    canonical_production_origin: PRODUCTION_SITE_URL,
    auth_callback_origin: callbackOrigin,
    auth_callback_path: "/auth/callback",
    uses_localhost: usesLocalhost,
    has_next_public_supabase_url: Boolean(rawSupabase?.trim()),
    supabase_url_origin: supabaseOrigin || null,
    supabase_url_has_path: supabaseHasPath,
    supabase_url_ok: supabaseCheck.ok,
    safe_for_auth_email_redirect: safeForAuthEmailRedirect,
  };
  if (resolveError) body.resolve_error = resolveError;

  // Localhost is a HARD FAILURE only in production (in dev it is expected and
  // correct). safe_for_auth_email_redirect already reflects this distinction.
  if (isProd && usesLocalhost) {
    return json({ detail: "Production auth redirect is resolving to localhost.", ...body }, 500);
  }

  return json(body, 200);
}

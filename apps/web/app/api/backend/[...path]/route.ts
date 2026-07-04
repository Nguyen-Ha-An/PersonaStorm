import { NextRequest } from "next/server";

/**
 * Same-origin backend proxy (BFF pattern).
 *
 * The browser NEVER talks to the FastAPI backend directly — every call goes
 * to `/api/backend/<path>` on this Next.js app, and this route handler
 * forwards it server-side to `${BACKEND_API_BASE}/api/<path>` (every FastAPI
 * router is mounted under `/api`, see apps/api/app/main.py).
 *
 * Why this exists: `BACKEND_API_BASE` is read here, in code that only ever
 * runs on the server. It is deliberately NOT a `NEXT_PUBLIC_*` variable, so
 * the browser bundle never contains (or needs to know) the backend's real
 * address, and the FastAPI backend doesn't need to be deployed yet for
 * login/signup/dashboard to load — only the storm/billing/admin calls that
 * actually need it will fail, with a clear JSON error instead of a raw
 * "Failed to fetch — is the API running on port 8000?".
 *
 * Streaming: the live storm page uses SSE (`/api/backend/storm/{id}/stream`).
 * `backendResp.body` is forwarded as the Response body unread, so bytes reach
 * the browser as the backend emits them — nothing here buffers the stream.
 * See docs/deployment.md for the Vercel serverless function duration caveat
 * this implies for very long-running streams.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Serverless function budget for this route (Vercel). Only takes effect up to
// whatever your plan actually allows — see docs/deployment.md.
export const maxDuration = 300;

const DEV_DEFAULT_BACKEND = "http://localhost:8000";

const BACKEND_NOT_CONFIGURED = {
  detail:
    "PersonaStorm backend is not configured. Set BACKEND_API_BASE in Vercel or deploy the FastAPI backend.",
};

const BACKEND_UNREACHABLE = {
  detail:
    "Could not reach the PersonaStorm backend. If deployed, verify it is running and that " +
    "BACKEND_API_BASE is correct. For local development, run FastAPI on http://localhost:8000.",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Resolves the backend origin. Never throws; a missing/blank value means "not configured". */
function resolveBackendBase(): string | null {
  const configured = process.env.BACKEND_API_BASE?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  // Local-dev convenience only. Never falls back to localhost in production —
  // that address means "the visitor's machine" and would never work deployed.
  return process.env.NODE_ENV === "production" ? null : DEV_DEFAULT_BACKEND;
}

// Hop-by-hop / transport headers that must never cross the proxy boundary:
// forwarding them verbatim would corrupt the re-streamed response (stale
// Content-Length, stale Connection semantics) or leak Vercel-internal request
// metadata to the backend. Cookies are stripped because auth here is a Bearer
// token, never a cookie — there is nothing to forward.
const STRIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "accept-encoding",
  "cookie",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-vercel-id",
  "x-vercel-ip-city",
  "x-vercel-ip-country",
  "x-vercel-ip-country-region",
  "x-vercel-ip-latitude",
  "x-vercel-ip-longitude",
  "x-vercel-ip-timezone",
  "x-vercel-deployment-url",
]);

const STRIP_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "connection",
  "transfer-encoding",
  "set-cookie", // the backend never sets auth cookies; don't let anything leak to the browser
]);

async function proxy(req: NextRequest, method: string, pathSegments: string[] | undefined): Promise<Response> {
  const backendBase = resolveBackendBase();
  if (!backendBase) return json(BACKEND_NOT_CONFIGURED, 503);

  const suffix = (pathSegments ?? []).map(encodeURIComponent).join("/");
  const targetUrl = `${backendBase}/api/${suffix}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const hasBody = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";

  let backendResp: Response;
  try {
    backendResp = await fetch(targetUrl, {
      method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual", // never silently follow a redirect with the Authorization header attached
      cache: "no-store", // never let Next's fetch cache serve a stale/mutating response
    });
  } catch (err) {
    // Log only the method + path (no query string, no headers) — the stream
    // route's query string carries a short-lived access token and must never
    // reach logs.
    console.error(
      `[api/backend proxy] ${method} ${req.nextUrl.pathname} -> backend unreachable: ${(err as Error).message}`,
    );
    return json(BACKEND_UNREACHABLE, 502);
  }

  const respHeaders = new Headers();
  backendResp.headers.forEach((value, key) => {
    if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) respHeaders.set(key, value);
  });
  if (!respHeaders.has("content-type")) respHeaders.set("content-type", "application/json");

  // backendResp.body is forwarded unread — this streams (SSE included)
  // instead of buffering the full response before replying.
  return new Response(backendResp.body, { status: backendResp.status, headers: respHeaders });
}

type RouteContext = { params: { path?: string[] } };

export async function GET(req: NextRequest, ctx: RouteContext) {
  return proxy(req, "GET", ctx.params.path);
}
export async function POST(req: NextRequest, ctx: RouteContext) {
  return proxy(req, "POST", ctx.params.path);
}
export async function PUT(req: NextRequest, ctx: RouteContext) {
  return proxy(req, "PUT", ctx.params.path);
}
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return proxy(req, "PATCH", ctx.params.path);
}
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return proxy(req, "DELETE", ctx.params.path);
}
export async function OPTIONS(req: NextRequest, ctx: RouteContext) {
  return proxy(req, "OPTIONS", ctx.params.path);
}

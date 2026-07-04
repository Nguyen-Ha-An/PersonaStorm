import type { StormCreateRequest, StormCreateResponse, StormMeta, StormReport } from "./types";

/**
 * API origin resolution — the single source of truth for where the browser
 * talks to the FastAPI backend.
 *
 * Why this is careful: in production the user's browser cannot reach
 * `http://localhost:8000` — that address means "the visitor's own machine".
 * Silently falling back to localhost is what produced the infamous
 * "Failed to fetch — is the API running on port 8000?" error on the deployed
 * site. So we only fall back to localhost during local development; in a
 * production build with no configured origin we return "" and surface a clear,
 * actionable configuration error before any fetch is attempted.
 *
 * Local dev:   NEXT_PUBLIC_API_BASE unset  -> http://localhost:8000
 * Production:  NEXT_PUBLIC_API_BASE unset  -> "" (blocked + clear error)
 * Anywhere:    NEXT_PUBLIC_API_BASE set    -> that value (trailing slash trimmed)
 */

const isProd = process.env.NODE_ENV === "production";
const LOCAL_DEFAULT = "http://localhost:8000";

export const API_BASE: string = (() => {
  const configured = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  // No explicit origin: only assume localhost in local dev, never in prod.
  return isProd ? "" : LOCAL_DEFAULT;
})();

/** True when the app is missing its production backend origin. */
export const API_CONFIGURED = API_BASE.length > 0;

/** Human-readable target used in diagnostics and error UI (never a secret). */
export const API_TARGET_LABEL = API_CONFIGURED ? API_BASE : "not configured";

export const CONFIG_ERROR =
  "Production API URL is not configured. Set NEXT_PUBLIC_API_BASE in Vercel to your deployed FastAPI backend URL.";

/** A typed error so callers can distinguish config vs. network vs. HTTP faults. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "network" | "http",
    readonly target: string = API_TARGET_LABEL,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Guard used by every request path — fail loud and clear, never hit localhost in prod. */
function requireApiBase(): string {
  if (!API_CONFIGURED) {
    throw new ApiError(CONFIG_ERROR, "config");
  }
  return API_BASE;
}

/** Wrap fetch so a dropped/unreachable backend becomes an actionable message. */
async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    // fetch() only throws on network-level failures (DNS, CORS, refused, offline).
    const where = isProd ? "the deployed backend" : "your local backend";
    throw new ApiError(
      `Could not reach the PersonaStorm API at ${API_TARGET_LABEL}. ` +
        `Verify ${where} is running and reachable, and that CORS allows this origin.`,
      "network",
    );
  }
}

async function handle<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let detail = `${resp.status} ${resp.statusText}`;
    try {
      const body = await resp.json();
      if (body?.detail) {
        detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      }
    } catch {
      /* keep default detail */
    }
    throw new ApiError(detail, "http");
  }
  return resp.json() as Promise<T>;
}

export async function createStorm(req: StormCreateRequest): Promise<StormCreateResponse> {
  const base = requireApiBase();
  const resp = await safeFetch(`${base}/api/storm/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return handle<StormCreateResponse>(resp);
}

export async function getStormMeta(stormId: string): Promise<StormMeta> {
  const base = requireApiBase();
  return handle<StormMeta>(await safeFetch(`${base}/api/storm/${stormId}`));
}

/** Returns the report, or null while the storm is still running (HTTP 202). */
export async function getReport(stormId: string): Promise<StormReport | null> {
  const base = requireApiBase();
  const resp = await safeFetch(`${base}/api/storm/${stormId}/report`);
  if (resp.status === 202) return null;
  return handle<StormReport>(resp);
}

/**
 * Build the SSE stream URL. Throws the same clear config error as the fetch
 * paths when the production origin is missing, so the live page can render a
 * real message instead of an EventSource that reconnects forever to localhost.
 */
export function streamUrl(stormId: string): string {
  return `${requireApiBase()}/api/storm/${stormId}/stream`;
}

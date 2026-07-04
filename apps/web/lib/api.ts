import { getAccessToken } from "./supabase/client";
import type {
  AdminStormRun,
  AdminUser,
  AdminUserDetail,
  Me,
  Pricing,
  Quote,
  QuoteRequest,
  StormCreateRequest,
  StormCreateResponse,
  StormHistoryItem,
  StormMeta,
  StormReport,
  UserRole,
  Wallet,
  WalletTransaction,
} from "./types";

/**
 * The browser never talks to the FastAPI backend directly — every request
 * goes to this same-origin proxy (`apps/web/app/api/backend/[...path]/route.ts`),
 * which forwards it server-side to `BACKEND_API_BASE`. That variable is a
 * server-only secret (never `NEXT_PUBLIC_*`), so:
 *   - the browser never needs to know the backend's real address
 *   - there is no CORS to configure for this frontend (same-origin call)
 *   - a missing/unreachable backend degrades to a clear 503/502, not a raw
 *     "Failed to fetch" — and login/signup/dashboard (Supabase-only) keep
 *     working even if the backend was never deployed.
 */
const PROXY_BASE = "/api/backend";

export type ApiErrorKind = "auth" | "payment" | "forbidden" | "backend_unavailable" | "network" | "http";

/** A typed error so callers can distinguish auth vs. billing vs. backend-config faults. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: ApiErrorKind,
    readonly status: number = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Wrap fetch so a dropped connection to our own server becomes an actionable message. */
async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    // This is a same-origin request; a network-level failure here means the
    // browser itself is offline or this app's server is unreachable — not
    // (necessarily) the FastAPI backend, which the proxy route reports on
    // separately via its own 502/503 JSON body.
    throw new ApiError("Could not reach PersonaStorm. Check your connection and try again.", "network");
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
    const kind: ApiErrorKind =
      resp.status === 401
        ? "auth"
        : resp.status === 402
          ? "payment"
          : resp.status === 403
            ? "forbidden"
            : resp.status === 503 || resp.status === 502
              ? "backend_unavailable"
              : "http";
    const message = kind === "auth" ? "Your session has expired. Please log in again." : detail;
    throw new ApiError(message, kind, resp.status);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

/** GET helper with auth. */
async function apiGet<T>(path: string): Promise<T> {
  return handle<T>(await safeFetch(`${PROXY_BASE}${path}`, { headers: await authHeaders() }));
}

/** JSON body mutation helper with auth. */
async function apiSend<T>(method: string, path: string, body?: unknown): Promise<T> {
  return handle<T>(
    await safeFetch(`${PROXY_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

/**
 * Lightweight backend reachability probe (proxies to FastAPI's public
 * GET /api/health). Used for a status chip, not for gating any user action —
 * every real call already handles its own 503/502 clearly.
 */
export type BackendHealth = "ok" | "unavailable" | "unreachable";

export async function checkBackendHealth(): Promise<BackendHealth> {
  try {
    const resp = await fetch(`${PROXY_BASE}/health`, { cache: "no-store" });
    if (resp.status === 503) return "unavailable";
    if (!resp.ok) return "unreachable";
    return "ok";
  } catch {
    return "unreachable";
  }
}

// ── account / wallet ────────────────────────────────────────────────────────
export const getMe = () => apiGet<Me>("/me");
export const getWallet = () => apiGet<Wallet>("/wallet");
export const getTransactions = () => apiGet<WalletTransaction[]>("/wallet/transactions");

// ── pricing / billing ───────────────────────────────────────────────────────
export const getPricing = () => apiGet<Pricing>("/pricing");
export const getQuote = (req: QuoteRequest) => apiSend<Quote>("POST", "/billing/quote", req);

// ── storms ──────────────────────────────────────────────────────────────────
export const createStorm = (req: StormCreateRequest) =>
  apiSend<StormCreateResponse>("POST", "/storm/create", req);
export const getStormMeta = (stormId: string) => apiGet<StormMeta>(`/storm/${stormId}`);
export const getStormHistory = () => apiGet<StormHistoryItem[]>("/storm/history");

/** Returns the report, or null while the storm is still running (HTTP 202). */
export async function getReport(stormId: string): Promise<StormReport | null> {
  const resp = await safeFetch(`${PROXY_BASE}/storm/${stormId}/report`, {
    headers: await authHeaders(),
  });
  if (resp.status === 202) return null;
  return handle<StormReport>(resp);
}

/**
 * Build the SSE stream URL — same-origin, proxied through our own Next.js
 * route so the browser never needs the backend's real address. EventSource
 * cannot set an Authorization header, so the access token travels as a query
 * parameter; the proxy forwards it verbatim, and the FastAPI backend only
 * ever honors that query parameter on this one `/stream` path (see
 * apps/api/app/auth.py) — it is rejected everywhere else, so a token that
 * leaks via a URL in this one spot can't be replayed against other endpoints.
 */
export function streamUrl(stormId: string, token: string | null): string {
  const q = token ? `?access_token=${encodeURIComponent(token)}` : "";
  return `${PROXY_BASE}/storm/${stormId}/stream${q}`;
}

// ── admin ───────────────────────────────────────────────────────────────────
export const adminListUsers = (search?: string) =>
  apiGet<AdminUser[]>(`/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`);
export const adminGetUser = (userId: string) => apiGet<AdminUserDetail>(`/admin/users/${userId}`);
export const adminAdjustWallet = (userId: string, amount_credits: number, reason: string) =>
  apiSend<{ user_id: string; amount_credits: number; new_balance: number }>(
    "POST",
    `/admin/users/${userId}/wallet-adjust`,
    { amount_credits, reason },
  );
export const adminSetRole = (userId: string, role: UserRole) =>
  apiSend<AdminUser>("POST", `/admin/users/${userId}/role`, { role });
export const adminListStormRuns = () => apiGet<AdminStormRun[]>("/admin/storm-runs");
export const adminGetPricing = () => apiGet<Pricing>("/admin/pricing");
export const adminUpdatePricing = (p: {
  name: string;
  base_run_credits: number;
  credits_per_100_personas: number;
  analyst_report_credits: number;
}) => apiSend<Pricing>("POST", "/admin/pricing", p);

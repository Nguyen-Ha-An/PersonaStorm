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
 * PersonaStorm is a Vercel full-stack app: the browser calls SAME-ORIGIN
 * Next.js Route Handlers under `apps/web/app/api/*` — there is no external
 * backend and no `BACKEND_API_BASE` / `NEXT_PUBLIC_API_BASE`. The route
 * handlers run on the server, verify the Supabase access token, own every
 * wallet mutation, and run the storm engine. Because every call is same-origin,
 * there is no CORS to configure and production never falls back to localhost.
 */
const API_BASE = "/api";

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
    // Same-origin request: a network-level failure here means the browser is
    // offline or this app's own Vercel deployment is unreachable.
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
  return handle<T>(await safeFetch(`${API_BASE}${path}`, { headers: await authHeaders() }));
}

/** JSON body mutation helper with auth. */
async function apiSend<T>(method: string, path: string, body?: unknown): Promise<T> {
  return handle<T>(
    await safeFetch(`${API_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

/**
 * Lightweight same-origin API reachability probe (GET /api/health). Used for a
 * status chip only — every real call already handles its own errors clearly.
 */
export type BackendHealth = "ok" | "unavailable" | "unreachable";

export async function checkBackendHealth(): Promise<BackendHealth> {
  try {
    const resp = await fetch(`${API_BASE}/health`, { cache: "no-store" });
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
  const resp = await safeFetch(`${API_BASE}/storm/${stormId}/report`, {
    headers: await authHeaders(),
  });
  if (resp.status === 202) return null;
  return handle<StormReport>(resp);
}

/**
 * Build the SSE stream URL — same-origin (`/api/storm/{id}/stream`).
 * EventSource cannot set an Authorization header, so the access token travels
 * as a query parameter; the server route only honors `?access_token=` on this
 * one `/stream` path (it is rejected everywhere else), so a token that leaks
 * via a URL here can't be replayed against other endpoints.
 */
export function streamUrl(stormId: string, token: string | null): string {
  const q = token ? `?access_token=${encodeURIComponent(token)}` : "";
  return `${API_BASE}/storm/${stormId}/stream${q}`;
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

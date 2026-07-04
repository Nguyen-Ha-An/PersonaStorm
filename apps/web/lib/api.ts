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
 * API origin resolution — the single source of truth for where the browser
 * talks to the FastAPI backend.
 *
 * In production the visitor's browser cannot reach `http://localhost:8000`
 * (that means "the visitor's own machine"). So we only fall back to localhost
 * in local development; in a production build with no configured origin we
 * return "" and surface a clear, actionable configuration error before any
 * fetch is attempted.
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
  return isProd ? "" : LOCAL_DEFAULT;
})();

export const API_CONFIGURED = API_BASE.length > 0;
export const API_TARGET_LABEL = API_CONFIGURED ? API_BASE : "not configured";

export const CONFIG_ERROR =
  "Production API URL is not configured. Set NEXT_PUBLIC_API_BASE in Vercel to your deployed FastAPI backend URL.";

export type ApiErrorKind = "config" | "network" | "auth" | "payment" | "forbidden" | "http";

/** A typed error so callers can distinguish config vs. network vs. HTTP faults. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: ApiErrorKind,
    readonly status: number = 0,
    readonly target: string = API_TARGET_LABEL,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function requireApiBase(): string {
  if (!API_CONFIGURED) throw new ApiError(CONFIG_ERROR, "config");
  return API_BASE;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    const where = isProd ? "the deployed backend" : "your local backend";
    throw new ApiError(
      `Could not reach the PersonaStorm API at ${API_TARGET_LABEL}. ` +
        `Verify ${where} is running and reachable, and that CORS_ORIGINS allows this origin.`,
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
    const kind: ApiErrorKind =
      resp.status === 401
        ? "auth"
        : resp.status === 402
          ? "payment"
          : resp.status === 403
            ? "forbidden"
            : "http";
    throw new ApiError(detail, kind, resp.status);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

/** GET helper with auth. */
async function apiGet<T>(path: string): Promise<T> {
  const base = requireApiBase();
  return handle<T>(await safeFetch(`${base}${path}`, { headers: await authHeaders() }));
}

/** JSON body mutation helper with auth. */
async function apiSend<T>(method: string, path: string, body?: unknown): Promise<T> {
  const base = requireApiBase();
  return handle<T>(
    await safeFetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

// ── account / wallet ────────────────────────────────────────────────────────
export const getMe = () => apiGet<Me>("/api/me");
export const getWallet = () => apiGet<Wallet>("/api/wallet");
export const getTransactions = () => apiGet<WalletTransaction[]>("/api/wallet/transactions");

// ── pricing / billing ───────────────────────────────────────────────────────
export const getPricing = () => apiGet<Pricing>("/api/pricing");
export const getQuote = (req: QuoteRequest) => apiSend<Quote>("POST", "/api/billing/quote", req);

// ── storms ──────────────────────────────────────────────────────────────────
export const createStorm = (req: StormCreateRequest) =>
  apiSend<StormCreateResponse>("POST", "/api/storm/create", req);
export const getStormMeta = (stormId: string) => apiGet<StormMeta>(`/api/storm/${stormId}`);
export const getStormHistory = () => apiGet<StormHistoryItem[]>("/api/storm/history");

/** Returns the report, or null while the storm is still running (HTTP 202). */
export async function getReport(stormId: string): Promise<StormReport | null> {
  const base = requireApiBase();
  const resp = await safeFetch(`${base}/api/storm/${stormId}/report`, {
    headers: await authHeaders(),
  });
  if (resp.status === 202) return null;
  return handle<StormReport>(resp);
}

/**
 * Build the SSE stream URL. EventSource cannot set an Authorization header, so
 * the access token is passed as a query parameter (the backend accepts it there
 * for the stream endpoint only). Throws the same clear config error as the
 * fetch paths when the production origin is missing.
 */
export function streamUrl(stormId: string, token: string | null): string {
  const base = requireApiBase();
  const q = token ? `?access_token=${encodeURIComponent(token)}` : "";
  return `${base}/api/storm/${stormId}/stream${q}`;
}

// ── admin ───────────────────────────────────────────────────────────────────
export const adminListUsers = (search?: string) =>
  apiGet<AdminUser[]>(`/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`);
export const adminGetUser = (userId: string) =>
  apiGet<AdminUserDetail>(`/api/admin/users/${userId}`);
export const adminAdjustWallet = (userId: string, amount_credits: number, reason: string) =>
  apiSend<{ user_id: string; amount_credits: number; new_balance: number }>(
    "POST",
    `/api/admin/users/${userId}/wallet-adjust`,
    { amount_credits, reason },
  );
export const adminSetRole = (userId: string, role: UserRole) =>
  apiSend<AdminUser>("POST", `/api/admin/users/${userId}/role`, { role });
export const adminListStormRuns = () => apiGet<AdminStormRun[]>("/api/admin/storm-runs");
export const adminGetPricing = () => apiGet<Pricing>("/api/admin/pricing");
export const adminUpdatePricing = (p: {
  name: string;
  base_run_credits: number;
  credits_per_100_personas: number;
  analyst_report_credits: number;
}) => apiSend<Pricing>("POST", "/api/admin/pricing", p);

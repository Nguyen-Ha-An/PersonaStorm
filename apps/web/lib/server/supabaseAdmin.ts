import "./only";

/**
 * Supabase service-role primitives — server-only. The service role key bypasses
 * RLS, so this module must NEVER be imported by a Client Component (guarded by
 * ./only). It talks to PostgREST + RPC and validates Supabase access tokens.
 *
 * Token validation (mirrors apps/api/app/auth.py):
 *   1. Primary — verify the HS256 signature with SUPABASE_JWT_SECRET, offline,
 *      using Node's built-in crypto (no extra dependency).
 *   2. Remote — if no JWT secret but Supabase is configured, validate against
 *      GoTrue (GET /auth/v1/user). Never trusts an unverified token in prod.
 *   3. Dev — only when neither prod nor Supabase-configured, decode without
 *      verifying (in-memory gateway path) so local dev works offline.
 */

import crypto from "node:crypto";

import { getConfig, supabaseConfigured, type ServerConfig } from "./env";
import { HttpError, SupabaseError } from "./errors";

export interface TokenClaims {
  sub: string;
  email: string;
  full_name: string | null;
}

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function decodePayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new HttpError(401, "Malformed session token.");
  try {
    return JSON.parse(base64UrlDecode(parts[1]).toString("utf8"));
  } catch {
    throw new HttpError(401, "Malformed session token.");
  }
}

function verifyHs256(token: string, secret: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new HttpError(401, "Malformed session token.");
  const [headerB64, payloadB64, signatureB64] = parts;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const actual = base64UrlDecode(signatureB64);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new HttpError(401, "Invalid or expired session token.");
  }
  const payload = decodePayload(token);
  // exp check.
  const exp = payload.exp;
  if (typeof exp === "number" && exp * 1000 < Date.now()) {
    throw new HttpError(401, "Your session has expired. Please log in again.");
  }
  // aud check (Supabase issues aud "authenticated").
  const aud = payload.aud;
  const audOk = aud === "authenticated" || (Array.isArray(aud) && aud.includes("authenticated"));
  if (!audOk) throw new HttpError(401, "Invalid or expired session token.");
  return payload;
}

function claimsFromPayload(payload: Record<string, unknown>): TokenClaims {
  const sub = payload.sub;
  if (typeof sub !== "string" || !sub) throw new HttpError(401, "Session token has no subject.");
  const email = typeof payload.email === "string" ? payload.email : "";
  const meta = (payload.user_metadata as Record<string, unknown> | undefined) ?? {};
  const fullName = typeof meta.full_name === "string" ? meta.full_name : null;
  return { sub, email, full_name: fullName };
}

/**
 * Validate a Supabase access token and return its identity claims. Throws a 401
 * HttpError on any failure. Never trusts a user_id supplied by the client.
 */
export async function verifyAccessToken(token: string, cfg: ServerConfig = getConfig()): Promise<TokenClaims> {
  if (cfg.supabaseJwtSecret) {
    return claimsFromPayload(verifyHs256(token, cfg.supabaseJwtSecret));
  }

  // No JWT secret. Accepting an unverified token is only safe when we are NOT
  // in prod AND NOT talking to a real Supabase — otherwise anyone could forge
  // `sub`. Fail safe on a misconfigured deploy.
  if (cfg.apiEnv === "prod" || supabaseConfigured(cfg)) {
    if (supabaseConfigured(cfg)) {
      // Remote-validate against GoTrue instead of blindly trusting the token.
      return verifyViaGoTrue(token, cfg);
    }
    throw new HttpError(401, "Auth is not configured on the server (missing SUPABASE_JWT_SECRET).");
  }

  // Dev fallback (in-memory gateway, non-prod): decode without verifying.
  return claimsFromPayload(decodePayload(token));
}

async function verifyViaGoTrue(token: string, cfg: ServerConfig): Promise<TokenClaims> {
  const apikey = cfg.supabaseAnonKey || cfg.supabaseServiceRoleKey;
  let resp: Response;
  try {
    resp = await fetch(`${cfg.supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
      headers: { apikey, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (err) {
    throw new SupabaseError(`GoTrue user lookup transport error: ${(err as Error).message}`);
  }
  if (resp.status === 401 || resp.status === 403) {
    throw new HttpError(401, "Invalid or expired session token.");
  }
  if (!resp.ok) {
    throw new SupabaseError(`GoTrue user lookup -> ${resp.status}`);
  }
  const user = (await resp.json()) as Record<string, unknown>;
  return claimsFromPayload({ sub: user.id, email: user.email, user_metadata: user.user_metadata });
}

// ---------------------------------------------------------------------------
// PostgREST + RPC client (service role)
// ---------------------------------------------------------------------------

export class SupabaseAdmin {
  private rest: string;
  private key: string;
  private base: string;

  constructor(cfg: ServerConfig) {
    this.base = cfg.supabaseUrl.replace(/\/+$/, "");
    this.rest = `${this.base}/rest/v1`;
    this.key = cfg.supabaseServiceRoleKey;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  async get(path: string, params: Record<string, string>): Promise<any[]> {
    const url = new URL(`${this.rest}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let resp: Response;
    try {
      resp = await fetch(url.toString(), { headers: this.headers(), cache: "no-store" });
    } catch (err) {
      throw new SupabaseError(`GET ${path} transport error: ${(err as Error).message}`);
    }
    if (resp.status >= 300) throw new SupabaseError(`GET ${path} -> ${resp.status}: ${await resp.text()}`);
    return (await resp.json()) as any[];
  }

  async getWithHeaders(path: string, params: Record<string, string>, extra: Record<string, string>): Promise<Response> {
    const url = new URL(`${this.rest}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    try {
      return await fetch(url.toString(), { headers: this.headers(extra), cache: "no-store" });
    } catch (err) {
      throw new SupabaseError(`GET ${path} transport error: ${(err as Error).message}`);
    }
  }

  async mutate(
    method: "POST" | "PATCH" | "DELETE",
    path: string,
    opts: { params?: Record<string, string>; json?: unknown; prefer?: string } = {},
  ): Promise<any[]> {
    const url = new URL(`${this.rest}/${path}`);
    for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);
    const prefer = opts.prefer ?? "return=representation";
    let resp: Response;
    try {
      resp = await fetch(url.toString(), {
        method,
        headers: this.headers({ Prefer: prefer }),
        body: opts.json === undefined ? undefined : JSON.stringify(opts.json),
        cache: "no-store",
      });
    } catch (err) {
      throw new SupabaseError(`${method} ${path} transport error: ${(err as Error).message}`);
    }
    if (resp.status >= 300) throw new SupabaseError(`${method} ${path} -> ${resp.status}: ${await resp.text()}`);
    if (resp.status === 204) return [];
    const text = await resp.text();
    if (!text) return [];
    return JSON.parse(text) as any[];
  }

  /** Raw RPC call — returns the fetch Response so callers can inspect status/body. */
  async rpc(fnName: string, args: Record<string, unknown>): Promise<Response> {
    try {
      return await fetch(`${this.rest}/rpc/${fnName}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(args),
        cache: "no-store",
      });
    } catch (err) {
      throw new SupabaseError(`rpc ${fnName} transport error: ${(err as Error).message}`);
    }
  }
}

let cached: SupabaseAdmin | null = null;

export function getSupabaseAdmin(cfg: ServerConfig = getConfig()): SupabaseAdmin | null {
  if (!supabaseConfigured(cfg)) return null;
  if (!cached) cached = new SupabaseAdmin(cfg);
  return cached;
}

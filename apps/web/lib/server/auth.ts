import "./only";

/**
 * Auth helpers for Route Handlers — port of apps/api/app/auth.py.
 *
 * We trust ONLY the Supabase-issued access token, never a user_id from the
 * client. The token arrives as `Authorization: Bearer <jwt>` or, for the SSE
 * stream route only (EventSource can't set headers), as `?access_token=<jwt>`.
 *
 *   getCurrentUser(request) -> CurrentUser (throws 401 if missing/invalid)
 *   requireUser(request)    -> alias of getCurrentUser (explicit intent)
 *   requireAdmin(request)   -> CurrentUser, throws 403 if not an admin
 */

import { getConfig } from "./env";
import { HttpError } from "./errors";
import { buildGateway, type Gateway } from "./gateway";
import { verifyAccessToken } from "./supabaseAdmin";

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  isAdmin: boolean;
}

function extractToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  // SSE / EventSource can't set headers — accept ?access_token= ONLY on /stream.
  const url = new URL(request.url);
  if (url.pathname.endsWith("/stream")) {
    const token = url.searchParams.get("access_token");
    return token ? token.trim() : null;
  }
  return null;
}

export async function getCurrentUser(request: Request, gateway?: Gateway): Promise<CurrentUser> {
  const cfg = getConfig();
  const token = extractToken(request);
  if (!token) throw new HttpError(401, "Missing authentication token.");

  const claims = await verifyAccessToken(token, cfg);
  const gw = gateway ?? buildGateway(cfg);

  // Ensure the profile/wallet exist and read the authoritative role.
  let profile: Record<string, any>;
  try {
    profile = await gw.ensureAndGetProfile(claims.sub, claims.email, claims.full_name);
  } catch (err) {
    console.error("[personastorm auth] ensureAndGetProfile failed:", (err as Error).message);
    profile = { id: claims.sub, email: claims.email, full_name: claims.full_name, role: "user" };
  }

  const role = (profile.role as string) ?? "user";
  return {
    id: claims.sub,
    email: (profile.email as string) || claims.email,
    full_name: (profile.full_name as string | null) ?? claims.full_name,
    role,
    isAdmin: role === "admin",
  };
}

export const requireUser = getCurrentUser;

export async function requireAdmin(request: Request, gateway?: Gateway): Promise<CurrentUser> {
  const user = await getCurrentUser(request, gateway);
  if (!user.isAdmin) throw new HttpError(403, "Admin access required.");
  return user;
}

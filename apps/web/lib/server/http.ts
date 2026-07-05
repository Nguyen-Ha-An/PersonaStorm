import "./only";

import { HttpError, InsufficientCreditsError, SupabaseError } from "./errors";

/**
 * Shared Route-Handler helpers.
 *
 * All error bodies use `{ "detail": "..." }` so the frontend client
 * (apps/web/lib/api.ts `handle()`) surfaces a clean, same-origin message —
 * never a raw "Failed to fetch — is the API running on port 8000?".
 */

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function detailResponse(detail: string, status: number): Response {
  return jsonResponse({ detail }, status);
}

/**
 * Wrap a handler so any thrown domain error becomes a well-formed JSON
 * response. Unknown errors become a generic 500 whose message points the
 * deployer at Vercel function logs + env vars (never leaks internals).
 */
export async function runRoute(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return detailResponse(err.message, err.status);
    }
    if (err instanceof InsufficientCreditsError) {
      return detailResponse(err.message, 402);
    }
    if (err instanceof SupabaseError) {
      // Log the real cause server-side only; the client gets a safe message.
      console.error("[personastorm api] Supabase error:", err.message);
      return detailResponse("PersonaStorm data backend is unavailable. Try again shortly.", 502);
    }
    console.error("[personastorm api] Unhandled error:", err);
    return detailResponse(
      "PersonaStorm server API failed. Check Vercel function logs and required environment variables.",
      500,
    );
  }
}

/** Parse a JSON body, raising a 400 HttpError on malformed input. */
export async function readJson<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

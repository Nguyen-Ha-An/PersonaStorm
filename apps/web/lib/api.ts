import type { StormCreateRequest, StormCreateResponse, StormMeta, StormReport } from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

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
    throw new Error(detail);
  }
  return resp.json() as Promise<T>;
}

export async function createStorm(req: StormCreateRequest): Promise<StormCreateResponse> {
  const resp = await fetch(`${API_BASE}/api/storm/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return handle<StormCreateResponse>(resp);
}

export async function getStormMeta(stormId: string): Promise<StormMeta> {
  return handle<StormMeta>(await fetch(`${API_BASE}/api/storm/${stormId}`));
}

/** Returns the report, or null while the storm is still running (HTTP 202). */
export async function getReport(stormId: string): Promise<StormReport | null> {
  const resp = await fetch(`${API_BASE}/api/storm/${stormId}/report`);
  if (resp.status === 202) return null;
  return handle<StormReport>(resp);
}

export function streamUrl(stormId: string): string {
  return `${API_BASE}/api/storm/${stormId}/stream`;
}

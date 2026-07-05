import { jsonResponse } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public liveness probe for the same-origin PersonaStorm server API.
export async function GET() {
  return jsonResponse({ status: "ok", service: "personastorm-vercel-api" });
}

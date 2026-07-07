import { getOptionalUser } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { jsonResponse, runRoute } from "@/lib/server/http";
import { getStormMeta, getStormReport } from "@/lib/server/stormStore";
import { DEMO_STORM_ID } from "@/lib/server/demo";
import { ensureDemoStorm } from "@/lib/server/demoSeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return runRoute(async () => {
    const gateway = buildGateway();
    // The public demo run seeds itself on first request (idempotent, no signup).
    if (params.id === DEMO_STORM_ID) await ensureDemoStorm(gateway);
    const user = await getOptionalUser(request, gateway);
    const report = await getStormReport(gateway, params.id, user);
    if (report === null) {
      // Still running (should be rare — create completes synchronously). 202.
      const meta = await getStormMeta(gateway, params.id, user);
      return jsonResponse(meta, 202);
    }
    return jsonResponse(report);
  });
}

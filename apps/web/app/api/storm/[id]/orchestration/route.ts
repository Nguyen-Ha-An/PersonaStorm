import { getOptionalUser } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { jsonResponse, runRoute } from "@/lib/server/http";
import { getStormOrchestration } from "@/lib/server/stormStore";
import { DEMO_STORM_ID } from "@/lib/server/demo";
import { ensureDemoStorm } from "@/lib/server/demoSeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-gated read of a run's persisted orchestration record (plan + worker
 * shard outputs + final synthesis + server numerics). Returns 204 when the run
 * had no orchestration layer, so a reload of a classic storm is a clean no-op.
 * Never leaks a non-owner's run (ownedStormRow -> 404).
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return runRoute(async () => {
    const gateway = buildGateway();
    if (params.id === DEMO_STORM_ID) await ensureDemoStorm(gateway);
    const user = await getOptionalUser(request, gateway);
    const record = await getStormOrchestration(gateway, params.id, user);
    if (record === null) return new Response(null, { status: 204 });
    return jsonResponse(record);
  });
}

import { getOptionalUser } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { jsonResponse, runRoute } from "@/lib/server/http";
import { getStormMeta } from "@/lib/server/stormStore";
import { DEMO_STORM_ID } from "@/lib/server/demo";
import { ensureDemoStorm } from "@/lib/server/demoSeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return runRoute(async () => {
    const gateway = buildGateway();
    if (params.id === DEMO_STORM_ID) await ensureDemoStorm(gateway);
    const user = await getOptionalUser(request, gateway);
    return jsonResponse(await getStormMeta(gateway, params.id, user));
  });
}

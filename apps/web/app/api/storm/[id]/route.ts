import { getCurrentUser } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { jsonResponse, runRoute } from "@/lib/server/http";
import { getStormMeta } from "@/lib/server/stormStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return runRoute(async () => {
    const gateway = buildGateway();
    const user = await getCurrentUser(request, gateway);
    return jsonResponse(await getStormMeta(gateway, params.id, user));
  });
}

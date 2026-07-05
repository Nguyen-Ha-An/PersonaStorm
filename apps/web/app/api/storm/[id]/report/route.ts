import { getCurrentUser } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { jsonResponse, runRoute } from "@/lib/server/http";
import { getStormMeta, getStormReport } from "@/lib/server/stormStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return runRoute(async () => {
    const gateway = buildGateway();
    const user = await getCurrentUser(request, gateway);
    const report = await getStormReport(gateway, params.id, user);
    if (report === null) {
      // Still running (should be rare — create completes synchronously). 202.
      const meta = await getStormMeta(gateway, params.id, user);
      return jsonResponse(meta, 202);
    }
    return jsonResponse(report);
  });
}

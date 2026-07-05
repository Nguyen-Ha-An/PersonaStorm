import { getCurrentUser } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { jsonResponse, runRoute } from "@/lib/server/http";
import { listUserHistory } from "@/lib/server/stormStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();
    const user = await getCurrentUser(request, gateway);
    return jsonResponse(await listUserHistory(gateway, user.id));
  });
}

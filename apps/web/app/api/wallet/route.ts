import { getCurrentUser } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { jsonResponse, runRoute } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();
    const user = await getCurrentUser(request, gateway);
    const w = await gateway.getWallet(user.id);
    return jsonResponse({
      balance_credits: w.balance_credits ?? 0,
      lifetime_spent_credits: w.lifetime_spent_credits ?? 0,
    });
  });
}

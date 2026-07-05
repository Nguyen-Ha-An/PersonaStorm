import { getCurrentUser } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { jsonResponse, runRoute } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();
    const user = await getCurrentUser(request, gateway);
    const profile = (await gateway.getProfile(user.id)) ?? {};
    const wallet = await gateway.getWallet(user.id);
    return jsonResponse({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      created_at: profile.created_at ?? null,
      wallet: {
        balance_credits: wallet.balance_credits ?? 0,
        lifetime_spent_credits: wallet.lifetime_spent_credits ?? 0,
      },
    });
  });
}

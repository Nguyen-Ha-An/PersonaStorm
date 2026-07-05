import { requireAdmin } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { jsonResponse, runRoute } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();
    await requireAdmin(request, gateway);
    const search = new URL(request.url).searchParams.get("search");
    const rows = await gateway.adminListUsers(search);
    return jsonResponse(rows.map(adminUserOut));
  });
}

function adminUserOut(r: Record<string, any>) {
  return {
    id: r.id,
    email: r.email ?? null,
    full_name: r.full_name ?? null,
    role: r.role ?? "user",
    created_at: r.created_at ?? null,
    balance_credits: r.balance_credits ?? 0,
    lifetime_spent_credits: r.lifetime_spent_credits ?? 0,
    total_storms: r.total_storms ?? 0,
    total_spent_credits: r.total_spent_credits ?? 0,
  };
}

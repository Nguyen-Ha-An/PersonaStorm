import { getCurrentUser } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { jsonResponse, runRoute } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();
    const user = await getCurrentUser(request, gateway);
    const rows = await gateway.listTransactions(user.id, 100);
    return jsonResponse(
      rows.map((r) => ({
        id: String(r.id),
        type: r.type ?? "",
        amount_credits: r.amount_credits ?? 0,
        balance_after: r.balance_after ?? 0,
        description: r.description ?? null,
        storm_id: r.storm_id ?? null,
        created_at: String(r.created_at),
      })),
    );
  });
}

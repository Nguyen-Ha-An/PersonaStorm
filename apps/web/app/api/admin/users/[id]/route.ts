import { requireAdmin } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { HttpError } from "@/lib/server/errors";
import { jsonResponse, runRoute } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return runRoute(async () => {
    const gateway = buildGateway();
    await requireAdmin(request, gateway);
    const detail = await gateway.adminGetUser(params.id);
    if (detail === null) throw new HttpError(404, "user not found");
    return jsonResponse({
      id: detail.id,
      email: detail.email ?? null,
      full_name: detail.full_name ?? null,
      role: detail.role ?? "user",
      created_at: detail.created_at ?? null,
      balance_credits: detail.balance_credits ?? 0,
      lifetime_spent_credits: detail.lifetime_spent_credits ?? 0,
      total_storms: detail.total_storms ?? 0,
      total_spent_credits: detail.total_spent_credits ?? 0,
      recent_transactions: (detail.recent_transactions ?? []).map((r: Record<string, any>) => ({
        id: String(r.id),
        type: r.type ?? "",
        amount_credits: r.amount_credits ?? 0,
        balance_after: r.balance_after ?? 0,
        description: r.description ?? null,
        storm_id: r.storm_id ?? null,
        created_at: String(r.created_at),
      })),
      recent_storms: (detail.recent_storms ?? []).map((r: Record<string, any>) => ({
        id: r.id,
        title: r.title ?? "",
        status: r.status ?? "running",
        stimulus_type: r.stimulus_type ?? "",
        target_market: r.target_market ?? "",
        persona_count: r.persona_count ?? 0,
        price_credits: r.price_credits ?? 0,
        created_at: r.created_at ?? null,
        completed_at: r.completed_at ?? null,
      })),
    });
  });
}

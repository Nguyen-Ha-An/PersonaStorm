import { requireAdmin } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { jsonResponse, runRoute } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();
    await requireAdmin(request, gateway);
    const limitParam = Number(new URL(request.url).searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(limitParam) ? Math.min(limitParam, 500) : 100;
    const rows = await gateway.adminListStorms(limit);
    return jsonResponse(
      rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        user_email: r.user_email ?? null,
        title: r.title ?? "",
        status: r.status ?? "running",
        stimulus_type: r.stimulus_type ?? "",
        target_market: r.target_market ?? "",
        persona_count: r.persona_count ?? 0,
        price_credits: r.price_credits ?? 0,
        created_at: r.created_at ?? null,
        completed_at: r.completed_at ?? null,
      })),
    );
  });
}

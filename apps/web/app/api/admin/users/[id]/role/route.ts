import { requireAdmin } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { HttpError } from "@/lib/server/errors";
import { jsonResponse, readJson, runRoute } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RoleBody {
  role?: unknown;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return runRoute(async () => {
    const gateway = buildGateway();
    await requireAdmin(request, gateway);
    const body = await readJson<RoleBody>(request);

    const role = String(body.role ?? "");
    if (role !== "user" && role !== "admin") throw new HttpError(400, "role must be 'user' or 'admin'.");

    const target = await gateway.getProfile(params.id);
    if (target === null) throw new HttpError(404, "user not found");

    // Guard: never remove the last admin (would lock everyone out of admin).
    if (target.role === "admin" && role !== "admin") {
      const adminCount = await gateway.countAdmins();
      if (adminCount <= 1) throw new HttpError(400, "Cannot demote the last remaining admin.");
    }

    await gateway.setRole(params.id, role);
    const detail = await gateway.adminGetUser(params.id);
    const src = detail ?? { id: params.id, role, email: target.email };
    return jsonResponse({
      id: src.id,
      email: src.email ?? null,
      full_name: src.full_name ?? null,
      role: src.role ?? role,
      created_at: src.created_at ?? null,
      balance_credits: src.balance_credits ?? 0,
      lifetime_spent_credits: src.lifetime_spent_credits ?? 0,
      total_storms: src.total_storms ?? 0,
      total_spent_credits: src.total_spent_credits ?? 0,
    });
  });
}

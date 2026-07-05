import { requireAdmin } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { HttpError, InsufficientCreditsError, SupabaseError } from "@/lib/server/errors";
import { jsonResponse, readJson, runRoute } from "@/lib/server/http";
import { adminAdjust } from "@/lib/server/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AdjustBody {
  amount_credits?: unknown;
  reason?: unknown;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return runRoute(async () => {
    const gateway = buildGateway();
    const admin = await requireAdmin(request, gateway);
    const body = await readJson<AdjustBody>(request);

    const amount = Number(body.amount_credits);
    if (!Number.isInteger(amount) || amount === 0) {
      throw new HttpError(400, "amount_credits cannot be zero");
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 1 || reason.length > 500) throw new HttpError(400, "A reason is required (1–500 chars).");

    const target = await gateway.getProfile(params.id);
    if (target === null) throw new HttpError(404, "user not found");

    try {
      const newBalance = await adminAdjust(gateway, params.id, amount, reason, admin.id);
      return jsonResponse({ user_id: params.id, amount_credits: amount, new_balance: newBalance });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        throw new HttpError(400, "Adjustment would drive the balance below zero.");
      }
      if (err instanceof SupabaseError) throw new HttpError(502, "Billing backend unavailable.");
      throw err;
    }
  });
}

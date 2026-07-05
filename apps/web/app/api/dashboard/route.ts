import { ensureUserProfileAndWallet, requireUser } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { jsonResponse, runRoute } from "@/lib/server/http";
import { getPricingRule } from "@/lib/server/pricing";
import { listUserHistory } from "@/lib/server/stormStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard — the single authoritative payload for the dashboard.
 *
 * Consolidates identity + wallet + active pricing + stats + recent storms so
 * the client renders REAL data from one authenticated call. Auth failure is a
 * clean 401 (never HTTP 200 with fake zeros); a data-backend failure is a 500
 * with a safe message (SQL details stay server-side via runRoute).
 */
export async function GET(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();

    // 401 here if the token is missing/invalid/expired — no fake fallback.
    const user = await requireUser(request, gateway);

    // Repair missing profile/wallet rows (+ one-time starter credits) so a valid
    // user is never stranded with "no data".
    await ensureUserProfileAndWallet(gateway, user);

    const [wallet, rule, recent, stormsRun] = await Promise.all([
      gateway.getWallet(user.id),
      getPricingRule(gateway),
      listUserHistory(gateway, user.id),
      gateway.countUserStorms(user.id),
    ]);

    const thousandPersonaRun =
      rule.base_run_credits + 10 * rule.credits_per_100_personas + rule.analyst_report_credits;

    return jsonResponse({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
      wallet: {
        balance_credits: wallet.balance_credits ?? 0,
        lifetime_spent_credits: wallet.lifetime_spent_credits ?? 0,
      },
      pricing: {
        base_run_credits: rule.base_run_credits,
        credits_per_100_personas: rule.credits_per_100_personas,
        analyst_report_credits: rule.analyst_report_credits,
        thousand_persona_run: thousandPersonaRun,
      },
      stats: {
        storms_run: stormsRun,
        credits_spent: wallet.lifetime_spent_credits ?? 0,
      },
      recent_storms: recent.slice(0, 10),
    });
  });
}

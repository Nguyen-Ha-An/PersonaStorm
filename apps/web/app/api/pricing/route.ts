import { getCurrentUser } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { jsonResponse, runRoute } from "@/lib/server/http";
import { getPricingRule } from "@/lib/server/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();
    await getCurrentUser(request, gateway); // require auth
    const rule = await getPricingRule(gateway);
    return jsonResponse({
      name: rule.name,
      base_run_credits: rule.base_run_credits,
      credits_per_100_personas: rule.credits_per_100_personas,
      analyst_report_credits: rule.analyst_report_credits,
    });
  });
}

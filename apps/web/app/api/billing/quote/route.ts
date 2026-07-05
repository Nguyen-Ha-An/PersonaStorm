import { getCurrentUser } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { HttpError } from "@/lib/server/errors";
import { jsonResponse, readJson, runRoute } from "@/lib/server/http";
import { getPricingRule, quotePrice } from "@/lib/server/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QuoteBody {
  persona_count?: unknown;
  include_analyst_report?: unknown;
}

export async function POST(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();
    const user = await getCurrentUser(request, gateway);
    const body = await readJson<QuoteBody>(request);

    const personaCount = Number(body.persona_count);
    if (!Number.isInteger(personaCount) || personaCount < 1 || personaCount > 5000) {
      throw new HttpError(400, "persona_count must be an integer between 1 and 5000.");
    }
    const includeAnalyst = body.include_analyst_report !== false;

    const rule = await getPricingRule(gateway);
    const q = quotePrice(rule, personaCount, includeAnalyst);
    const wallet = await gateway.getWallet(user.id);
    const balance = wallet.balance_credits ?? 0;

    return jsonResponse({
      persona_count: q.persona_count,
      base_run_credits: q.base_run_credits,
      credits_per_100_personas: q.credits_per_100_personas,
      analyst_report_credits: q.analyst_report_credits,
      total_credits: q.total_credits,
      wallet_balance: balance,
      balance_after: balance - q.total_credits,
      has_enough_credits: balance >= q.total_credits,
    });
  });
}

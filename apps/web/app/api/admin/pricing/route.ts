import { requireAdmin } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { HttpError } from "@/lib/server/errors";
import { jsonResponse, readJson, runRoute } from "@/lib/server/http";
import { getPricingRule } from "@/lib/server/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();
    await requireAdmin(request, gateway);
    const rule = await getPricingRule(gateway);
    return jsonResponse({
      name: rule.name,
      base_run_credits: rule.base_run_credits,
      credits_per_100_personas: rule.credits_per_100_personas,
      analyst_report_credits: rule.analyst_report_credits,
    });
  });
}

interface PricingBody {
  name?: unknown;
  base_run_credits?: unknown;
  credits_per_100_personas?: unknown;
  analyst_report_credits?: unknown;
}

function intField(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100000) throw new HttpError(400, `${label} must be an integer in [0, 100000].`);
  return n;
}

export async function POST(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();
    await requireAdmin(request, gateway);
    const body = await readJson<PricingBody>(request);

    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : "Default";
    const base = intField(body.base_run_credits, "base_run_credits");
    const per100 = intField(body.credits_per_100_personas, "credits_per_100_personas");
    const analyst = intField(body.analyst_report_credits, "analyst_report_credits");

    const row = await gateway.updateActivePricing({
      base_run_credits: base,
      credits_per_100_personas: per100,
      analyst_report_credits: analyst,
      name,
    });
    return jsonResponse({
      name: row.name ?? name,
      base_run_credits: row.base_run_credits ?? base,
      credits_per_100_personas: row.credits_per_100_personas ?? per100,
      analyst_report_credits: row.analyst_report_credits ?? analyst,
    });
  });
}

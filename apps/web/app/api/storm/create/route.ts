import { getCurrentUser } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { HttpError } from "@/lib/server/errors";
import { jsonResponse, readJson, runRoute } from "@/lib/server/http";
import { createAndRunStorm, type CreateStormPayload } from "@/lib/server/stormStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The storm engine runs synchronously at create time; give it headroom.
export const maxDuration = 60;

const STIMULUS_TYPES = new Set(["product_concept", "landing_page", "ad", "pricing_table"]);
const TARGET_MARKETS = new Set(["sea_genz", "us_smb", "parents", "enterprise", "budget", "early_adopters", "custom"]);
const CATEGORIES = new Set([
  "ai_tool", "b2b_saas", "consumer_app", "ecommerce_product", "education_product",
  "marketplace", "social_product", "hardware_product", "luxury_product", "generic",
]);

function validate(body: Record<string, unknown>): CreateStormPayload {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 1 || title.length > 200) throw new HttpError(400, "title must be 1–200 characters.");

  const stimulusType = String(body.stimulus_type ?? "");
  if (!STIMULUS_TYPES.has(stimulusType)) throw new HttpError(400, "Invalid stimulus_type.");

  const stimulus = typeof body.stimulus === "string" ? body.stimulus.trim() : "";
  if (stimulus.length < 20 || stimulus.length > 20000) throw new HttpError(400, "stimulus must be 20–20000 characters.");

  const targetMarket = String(body.target_market ?? "");
  if (!TARGET_MARKETS.has(targetMarket)) throw new HttpError(400, "Invalid target_market.");

  const customDesc = typeof body.custom_segment_description === "string" ? body.custom_segment_description.trim() : "";
  if (targetMarket === "custom" && customDesc.length < 12) {
    throw new HttpError(400, "custom target market requires custom_segment_description (>= 12 chars).");
  }

  let productCategory: string | null = null;
  if (body.product_category != null && body.product_category !== "") {
    const pc = String(body.product_category);
    if (!CATEGORIES.has(pc)) throw new HttpError(400, "Invalid product_category.");
    productCategory = pc;
  }

  const personaCount = Number(body.persona_count ?? 1000);
  if (!Number.isInteger(personaCount) || personaCount < 50 || personaCount > 1200) {
    throw new HttpError(400, "persona_count must be an integer between 50 and 1200.");
  }

  let seed: number | null = null;
  if (body.seed != null) {
    const s = Number(body.seed);
    if (!Number.isInteger(s)) throw new HttpError(400, "seed must be an integer.");
    seed = s;
  }

  return {
    title,
    stimulus_type: stimulusType,
    stimulus,
    target_market: targetMarket,
    custom_segment_description: targetMarket === "custom" ? customDesc : null,
    product_category: productCategory,
    persona_count: personaCount,
    seed,
  };
}

export async function POST(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();
    const user = await getCurrentUser(request, gateway);
    const body = await readJson<Record<string, unknown>>(request);
    const payload = validate(body);
    const result = await createAndRunStorm(gateway, user, payload);
    return jsonResponse(result);
  });
}

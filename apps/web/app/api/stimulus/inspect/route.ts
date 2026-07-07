import { jsonResponse, runRoute } from "@/lib/server/http";
import { parseStimulus } from "@/lib/server/engine/stimulusParser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Enough words that personas have something concrete to react to.
const MIN_WORDS = 40;

/**
 * Analyze a DRAFT stimulus and return the signals the engine detects, so a user
 * can strengthen it before spending a run. Pure text analysis (the server-only
 * stimulusParser) — no cost, no wallet, no storm; safe to leave unauthenticated.
 */
export async function POST(request: Request) {
  return runRoute(async () => {
    const body = (await request.json().catch(() => ({}))) as {
      stimulus?: unknown;
      title?: unknown;
      stimulus_type?: unknown;
    };
    const stimulus = typeof body.stimulus === "string" ? body.stimulus : "";
    const title = typeof body.title === "string" ? body.title : "";
    const stimulusType = typeof body.stimulus_type === "string" ? body.stimulus_type : "product_concept";

    const f = parseStimulus(stimulus, title, stimulusType);
    const wordCount = f.tokens.length;

    const checks = [
      {
        key: "length",
        label: "Enough detail",
        ok: wordCount >= MIN_WORDS,
        hint: `Only ${wordCount} words — add a few sentences on what it does, who it's for, and why now.`,
      },
      {
        key: "pricing",
        label: "A price to react to",
        ok: f.hasPricing,
        hint: "No price found — personas can't weigh value against cost without one.",
      },
      {
        key: "proof",
        label: "Proof or traction",
        ok: f.hasProof,
        hint: "No proof signals — add a stat, testimonial, or customer count to counter skepticism.",
      },
      {
        key: "clarity",
        label: "Clear, not jargon-heavy",
        ok: f.clarityScore >= 0.45 && f.jargonScore < 0.6,
        hint: "Reads dense — shorter sentences and fewer buzzwords sharpen the reactions.",
      },
      {
        key: "category",
        label: "Recognizable category",
        ok: f.category !== "other",
        hint: "Category unclear — the criteria preset falls back to generic. Name the domain plainly.",
      },
    ];

    return jsonResponse({ wordCount, category: f.category, priceCount: f.prices.length, checks });
  });
}

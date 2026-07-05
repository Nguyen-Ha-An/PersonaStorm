/**
 * Category classifier + high-risk flag — port of
 * apps/api/app/services/criteria/classifier.py.
 */

import type { StimulusFeatures } from "../stimulusParser";
import { CATEGORY_IDS } from "./presets";

const PRIOR_WEIGHT = 3.0;

const AI_TOOL_WORDS = new Set(["ai", "gpt", "llm", "copilot", "agent", "model", "genai", "ml"]);

const KEYWORDS: Record<string, Set<string>> = {
  luxury_product: new Set(["luxury", "premium", "exclusive", "handcrafted", "bespoke", "couture", "limited-edition", "limited", "artisan", "heritage"]),
  marketplace: new Set(["marketplace", "sellers", "buyers", "vendors", "listings", "two-sided", "commission", "gig"]),
  social_product: new Set(["social", "feed", "followers", "community", "posts", "viral", "share", "friends", "dm"]),
  hardware_product: new Set(["hardware", "device", "sensor", "wearable", "chip", "battery", "firmware", "shipping", "gadget"]),
  ai_tool: AI_TOOL_WORDS,
};

const HIGH_RISK_WORDS = new Set([
  "bank", "payment", "pay", "invest", "loan", "credit", "insurance",
  "medical", "health", "patient", "diagnosis", "therapy", "clinical",
  "prescription", "child", "kids", "minor", "safety", "records",
]);

const PARSER_CATEGORY_MAP: Record<string, string> = {
  saas_b2b: "b2b_saas",
  consumer_app: "consumer_app",
  ecommerce: "ecommerce_product",
  edtech: "education_product",
  health_fitness: "consumer_app",
  fintech: "b2b_saas",
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordHit(word: string, tokset: Set<string>, lower: string): boolean {
  if (tokset.has(word)) return true;
  return new RegExp(`\\b${escapeRe(word)}\\b`).test(lower);
}

function anyKeywordHit(words: Set<string>, tokset: Set<string>, lower: string): boolean {
  for (const w of words) if (keywordHit(w, tokset, lower)) return true;
  return false;
}

function countKeywordHits(words: Set<string>, tokset: Set<string>, lower: string): number {
  let n = 0;
  for (const w of words) if (keywordHit(w, tokset, lower)) n += 1;
  return n;
}

function priorCategory(features: StimulusFeatures): string | null {
  const cat = features.category;
  if (cat === "devtool") return features.mentionsAi ? "ai_tool" : "b2b_saas";
  return PARSER_CATEGORY_MAP[cat] ?? null;
}

export function classifyCategory(features: StimulusFeatures): [string, number] {
  const lower = features.raw.toLowerCase();
  const tokset = new Set(features.tokens);
  const scores: Record<string, number> = {};
  for (const cat of CATEGORY_IDS) if (cat !== "generic") scores[cat] = 0.0;

  const prior = priorCategory(features);
  if (prior !== null && prior in scores) scores[prior] += PRIOR_WEIGHT;

  if (features.mentionsAi) scores.ai_tool += 1.5;
  const aiHits = countKeywordHits(AI_TOOL_WORDS, tokset, lower);
  scores.ai_tool += 0.5 * aiHits;

  for (const [cat, words] of Object.entries(KEYWORDS)) {
    if (cat === "ai_tool") continue;
    scores[cat] += countKeywordHits(words, tokset, lower);
  }

  const total = Object.values(scores).reduce((s, v) => s + v, 0);
  if (total <= 0) return ["generic", 0.1];

  let bestCat = "generic";
  let bestScore = -Infinity;
  for (const [cat, sc] of Object.entries(scores)) {
    if (sc > bestScore) {
      bestScore = sc;
      bestCat = cat;
    }
  }
  if (bestScore <= 0) return ["generic", 0.1];

  const confidence = Math.min(1.0, bestScore / total);
  return [bestCat, confidence];
}

export function isHighRisk(features: StimulusFeatures): boolean {
  const lower = features.raw.toLowerCase();
  const tokset = new Set(features.tokens);
  return anyKeywordHit(HIGH_RISK_WORDS, tokset, lower);
}

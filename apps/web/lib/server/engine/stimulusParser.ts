/**
 * Input Parser — port of apps/api/app/services/stimulus_parser.py.
 * Turns raw pasted text into StimulusFeatures (prices, proof/risk signals,
 * salient tokens, category guess) consumed by the reaction engine + quality.
 */

import { salientTokens, tokenize } from "./text";

// Global regex; we iterate matches manually.
const PRICE_RE =
  /(?:(?:\$|usd\s?|€|£)\s?(\d{1,6}(?:[.,]\d{1,2})?))|(?:(\d{1,6}(?:[.,]\d{1,2})?)\s?(?:usd|\$|\/mo|\/month|per month|per user|\/user|\/seat|per seat))/gi;

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  saas_b2b: ["saas", "crm", "workflow", "dashboard", "integration", "api", "analytics", "automation", "team", "workspace", "sso", "seat"],
  consumer_app: ["app", "mobile", "download", "social", "photo", "video", "streak", "friends", "feed", "ios", "android"],
  ecommerce: ["shipping", "checkout", "cart", "store", "order", "delivery", "marketplace", "returns", "discount"],
  fintech: ["payment", "wallet", "bank", "invest", "loan", "credit", "crypto", "invoice", "payout", "remittance"],
  edtech: ["course", "learn", "tutor", "exam", "study", "students", "lesson", "certification", "ielts", "toeic"],
  health_fitness: ["fitness", "workout", "health", "sleep", "calories", "meditation", "therapy", "wellness"],
  devtool: ["developer", "sdk", "cli", "deploy", "code", "repo", "docker", "kubernetes", "observability", "gpu", "inference"],
};

const AI_WORDS = new Set(["ai", "gpt", "llm", "ml", "model", "copilot", "agent", "genai", "machine", "neural", "automated", "automation"]);
const PROOF_WORDS = new Set(["testimonial", "case", "study", "customers", "reviews", "rated", "trusted", "results", "guarantee", "refund", "money-back", "benchmark", "proven", "roi", "%"]);
const TRIAL_WORDS = new Set(["trial", "free", "freemium", "demo", "sandbox"]);
const SUBSCRIPTION_WORDS = new Set(["subscription", "monthly", "yearly", "annual", "/mo", "recurring", "plan", "tier", "billed"]);
const PRIVACY_WORDS = new Set(["privacy", "data", "gdpr", "encrypted", "encryption", "tracking", "personal", "anonymous"]);
const SECURITY_WORDS = new Set(["soc2", "soc-2", "iso27001", "sso", "saml", "compliance", "audit", "security", "hipaa"]);
const LOCKIN_WORDS = new Set(["contract", "commitment", "lock-in", "annual", "cancel", "minimum"]);

export interface StimulusFeatures {
  raw: string;
  title: string;
  stimulusType: string;
  tokens: string[];
  anchors: string[];
  prices: number[];
  minPrice: number | null;
  maxPrice: number | null;
  hasPricing: boolean;
  hasFreeTrial: boolean;
  hasProof: boolean;
  hasGuarantee: boolean;
  mentionsAi: boolean;
  mentionsSubscription: boolean;
  mentionsPrivacy: boolean;
  mentionsSecurity: boolean;
  mentionsLockin: boolean;
  jargonScore: number;
  clarityScore: number;
  category: string;
}

export function anchorSet(f: StimulusFeatures): Set<string> {
  return new Set(f.anchors);
}

function intersects(a: Set<string>, b: ReadonlySet<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

export function parseStimulus(raw: string, title: string, stimulusType: string): StimulusFeatures {
  const text = raw.trim();
  const toks = tokenize(text);
  const tokset = new Set(toks);

  const anchors = salientTokens(text);
  for (const t of tokenize(title)) {
    if (t.length > 2 && !anchors.includes(t)) anchors.push(t);
  }

  const prices: number[] = [];
  let m: RegExpExecArray | null;
  PRICE_RE.lastIndex = 0;
  while ((m = PRICE_RE.exec(text)) !== null) {
    const val = m[1] || m[2];
    if (val) {
      const price = parseFloat(val.replace(/,/g, ""));
      if (Number.isFinite(price) && price > 0 && price < 1_000_000) prices.push(price);
    }
  }
  const hasPricing = prices.length > 0;
  const minPrice = hasPricing ? Math.min(...prices) : null;
  const maxPrice = hasPricing ? Math.max(...prices) : null;

  const lower = text.toLowerCase();
  const hasFreeTrial = intersects(tokset, TRIAL_WORDS);
  const hasProof =
    intersects(tokset, PROOF_WORDS) ||
    /\d{2,}\s?[%+]/.test(text) ||
    new RegExp(
      "\\b\\d[\\d,.]*k?\\s+(?:users|customers|teams|families|stores|companies|businesses|agencies|schools|developers|sellers|clients|members)\\b",
      "i",
    ).test(text);
  const hasGuarantee = lower.includes("guarantee") || lower.includes("money-back") || lower.includes("refund");
  const mentionsAi = intersects(tokset, AI_WORDS);
  const mentionsSubscription = intersects(tokset, SUBSCRIPTION_WORDS) || lower.includes("/mo");
  const mentionsPrivacy = intersects(tokset, PRIVACY_WORDS);
  const mentionsSecurity = intersects(tokset, SECURITY_WORDS);
  const mentionsLockin = intersects(tokset, LOCKIN_WORDS);

  let jargonScore = 0.0;
  if (toks.length > 0) {
    const buzz = toks.filter((t) => AI_WORDS.has(t) || t.length >= 12).length;
    jargonScore = Math.min(1.0, (buzz / Math.max(20, toks.length)) * 6);
  }
  let clarityScore = 0.5;
  const sentences = text.split(/[.!?\n]+/).filter((s) => s.trim());
  if (sentences.length > 0) {
    const avgLen = sentences.reduce((s, sent) => s + tokenize(sent).length, 0) / sentences.length;
    clarityScore = Math.max(0.0, Math.min(1.0, 1.25 - Math.abs(avgLen - 15) / 25));
  }

  let bestCat = "other";
  let bestHits = 0;
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = words.filter((w) => tokset.has(w)).length;
    if (hits > bestHits) {
      bestCat = cat;
      bestHits = hits;
    }
  }
  const category = bestHits >= 2 ? bestCat : "other";

  return {
    raw: text,
    title,
    stimulusType,
    tokens: toks,
    anchors,
    prices,
    minPrice,
    maxPrice,
    hasPricing,
    hasFreeTrial,
    hasProof,
    hasGuarantee,
    mentionsAi,
    mentionsSubscription,
    mentionsPrivacy,
    mentionsSecurity,
    mentionsLockin,
    jargonScore,
    clarityScore,
    category,
  };
}

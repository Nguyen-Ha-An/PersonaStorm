/**
 * Objection clustering — port of
 * apps/api/app/services/aggregation/objections.py.
 * normalize -> exact-key grouping -> theme-first + greedy token-Jaccard merge.
 */

import { jaccard, mostCommon, normalizeObjection, round } from "../text";
import type { PersonaReaction } from "../types";
import type { ObjectionCluster } from "../report";

const SOFT_PREFIXES = ["only thing i'd check:", "minor worry —", "minor worry -", "before paying i'd still ask:"];

const THEMES: [string, Set<string>][] = [
  ["security & compliance", new Set(["soc2", "sso", "compliance", "procurement", "security", "pen-test", "audit", "documentation"])],
  ["data privacy", new Set(["data", "privacy", "info", "personal", "handling", "feeding", "private", "stance"])],
  ["free trial & try-before-buy", new Set(["trial", "trying", "test", "paying-first"])],
  ["subscription & lock-in", new Set(["subscription", "subscriptions", "monthly", "billing", "cancel", "recurring", "trap", "lock-in"])],
  ["proof & evidence", new Set(["proof", "evidence", "case", "studies", "study", "numbers", "results", "claims", "adjectives", "prove", "proves", "reference", "manually"])],
  ["AI hype skepticism", new Set(["ai", "ai-powered", "hype", "capability", "bolted", "framing"])],
  ["pricing & affordability", new Set(["price", "pricing", "cost", "costs", "expensive", "afford", "fees", "budget", "tag", "hidden"])],
  ["setup time & complexity", new Set(["setup", "onboarding", "learn", "migration", "hours", "system", "buried"])],
  ["integration fit", new Set(["plugs", "stack", "integrate", "integration", "tools", "disconnected"])],
  ["trust & credibility", new Set(["trust", "corporate", "salesy", "oversells", "heard"])],
  ["audience fit", new Set(["solves", "problem", "pitch", "obvious"])],
];

function clean(text: string): string {
  const low = text.toLowerCase().trim();
  for (const p of SOFT_PREFIXES) {
    if (low.startsWith(p)) return low.slice(p.length).trim();
  }
  return low;
}

function themeOf(tokens: Set<string>): string | null {
  let best: string | null = null;
  let bestHits = 0;
  for (const [name, vocab] of THEMES) {
    let hits = 0;
    for (const t of tokens) if (vocab.has(t)) hits += 1;
    if (hits > bestHits) {
      best = name;
      bestHits = hits;
    }
  }
  return best;
}

export function clusterObjections(reactions: PersonaReaction[], topK = 8, mergeThreshold = 0.5): ObjectionCluster[] {
  const total = reactions.length || 1;

  // 1) exact grouping on normalized keys (preserve first-seen order).
  const groups = new Map<string, PersonaReaction[]>();
  for (const r of reactions) {
    if (!r.first_objection.trim()) continue;
    const key = normalizeObjection(clean(r.first_objection));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  // 2) theme-first merge; Jaccard fallback for un-themed keys.
  const themed = new Map<string, PersonaReaction[]>();
  const merged: { tokens: Set<string>; members: PersonaReaction[] }[] = [];
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  for (const [key, members] of sortedGroups) {
    const tokens = new Set(key.split(" ").filter(Boolean));
    const theme = themeOf(tokens);
    if (theme !== null) {
      if (!themed.has(theme)) themed.set(theme, []);
      themed.get(theme)!.push(...members);
      continue;
    }
    let placed = false;
    for (const bucket of merged) {
      if (jaccard(tokens, bucket.tokens) >= mergeThreshold) {
        bucket.members.push(...members);
        for (const t of tokens) bucket.tokens.add(t);
        placed = true;
        break;
      }
    }
    if (!placed) merged.push({ tokens, members });
  }
  for (const members of themed.values()) merged.push({ tokens: new Set(), members });

  // 3) build clusters.
  const clusters: ObjectionCluster[] = [];
  const topBuckets = merged.slice().sort((a, b) => b.members.length - a.members.length).slice(0, topK);
  for (const bucket of topBuckets) {
    const phrasings = new Map<string, number>();
    for (const m of bucket.members) {
      const c = clean(m.first_objection);
      phrasings.set(c, (phrasings.get(c) ?? 0) + 1);
    }
    const label = mostCommon(phrasings, 1)[0][0];
    const detractors = bucket.members.filter((m) => m.status === "red" || m.status === "yellow");
    const example = (detractors[0] ?? bucket.members[0]).quote;
    const segCounts = new Map<string, number>();
    for (const m of bucket.members) if (m.segment) segCounts.set(m.segment, (segCounts.get(m.segment) ?? 0) + 1);
    clusters.push({
      label,
      count: bucket.members.length,
      share: round(bucket.members.length / total, 4),
      example_quote: example,
      top_segments: mostCommon(segCounts, 2).map(([s]) => s),
    });
  }
  return clusters;
}

/**
 * Text / statistics utilities — TypeScript port of apps/api/app/utils/text.py.
 * No heavy NLP deps; runs anywhere (including a Vercel serverless function).
 */

const WORD_RE = /[a-zA-Z][a-zA-Z0-9'-]+/g;

export const STOPWORDS: ReadonlySet<string> = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "for", "to",
  "of", "in", "on", "at", "by", "with", "from", "as", "is", "are", "was",
  "were", "be", "been", "being", "it", "its", "this", "that", "these",
  "those", "you", "your", "yours", "we", "our", "ours", "they", "their",
  "i", "me", "my", "he", "she", "his", "her", "them", "us", "will", "would",
  "can", "could", "should", "shall", "may", "might", "must", "do", "does",
  "did", "done", "have", "has", "had", "not", "no", "yes", "so", "than",
  "too", "very", "just", "about", "into", "over", "under", "after",
  "before", "between", "out", "up", "down", "off", "all", "any", "each",
  "more", "most", "some", "such", "only", "own", "same", "other", "get",
  "got", "make", "makes", "made", "like", "also", "per", "via", "how",
  "what", "when", "where", "which", "who", "why", "new", "one", "two",
  "use", "using", "used", "now", "here", "there", "every",
]);

export const GENERIC_MARKETING: ReadonlySet<string> = new Set([
  "product", "solution", "platform", "tool", "app", "service", "innovative",
  "amazing", "great", "best", "better", "powerful", "seamless", "easy",
  "simple", "fast", "smart", "modern", "next-generation", "revolutionary",
  "world-class", "cutting-edge", "game-changing", "useful", "interesting",
]);

export function tokenize(text: string): string[] {
  const out: string[] = [];
  const matches = text.match(WORD_RE);
  if (matches) {
    for (const w of matches) {
      const lower = w.toLowerCase();
      out.push(lower);
      // Hyphenated compounds ("ai-powered") also emit their word parts so
      // set-membership checks match on components ("ai") without dropping the
      // compound — multi-word keywords like "money-back"/"soc-2"/"lock-in"
      // still match on the whole token. Parts must be letter-initial and 2+
      // chars, mirroring WORD_RE (so "soc-2" -> "soc", never a bare "2").
      if (lower.includes("-")) {
        for (const part of lower.split("-")) {
          if (part.length >= 2 && /^[a-z]/.test(part)) out.push(part);
        }
      }
    }
  }
  return out;
}

/** Most frequent non-stopword, non-generic tokens — the grounding "anchors". */
export function salientTokens(text: string, topN = 24): string[] {
  const counts = new Map<string, number>();
  for (const t of tokenize(text)) {
    if (t.length > 3 && !STOPWORDS.has(t) && !GENERIC_MARKETING.has(t)) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return mostCommon(counts, topN).map(([t]) => t);
}

/** Canonical key for near-duplicate objection detection. */
export function normalizeObjection(text: string): string {
  const toks = tokenize(text).filter((t) => !STOPWORDS.has(t));
  toks.sort();
  return toks.join(" ");
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return inter / Math.max(1, union);
}

/** Shannon entropy of a distribution, normalized to [0,1] by log(k). */
export function shannonEntropyNorm(counts: number[]): number {
  const total = counts.reduce((s, c) => s + c, 0);
  const k = counts.filter((c) => c > 0).length;
  if (total === 0 || k <= 1) return 0.0;
  let h = 0.0;
  for (const c of counts) {
    if (c > 0) {
      const p = c / total;
      h -= p * Math.log(p);
    }
  }
  return h / Math.log(k);
}

/** Spearman rank correlation (no scipy). Returns 0.0 for degenerate input. */
export function rankCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return 0.0;

  const ranks = (vals: number[]): number[] => {
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => vals[a] - vals[b]);
    const r = new Array<number>(n).fill(0);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && vals[order[j + 1]] === vals[order[i]]) j += 1;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[order[k]] = avg;
      i = j + 1;
    }
    return r;
  };

  const rx = ranks(xs);
  const ry = ranks(ys);
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  dx = Math.sqrt(dx);
  dy = Math.sqrt(dy);
  if (dx === 0 || dy === 0) return 0.0;
  return num / (dx * dy);
}

export function stddev(vals: number[]): number {
  const n = vals.length;
  if (n < 2) return 0.0;
  const m = vals.reduce((s, v) => s + v, 0) / n;
  const variance = vals.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

export function clamp(v: number, lo = 0.0, hi = 1.0): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Order-stable equivalent of Python's Counter.most_common: sort by count
 * descending, ties broken by first-insertion order (Map preserves it).
 */
export function mostCommon<K>(counts: Map<K, number>, n?: number): [K, number][] {
  const entries = Array.from(counts.entries());
  const order = new Map<K, number>();
  entries.forEach(([k], i) => order.set(k, i));
  entries.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0);
  });
  return n === undefined ? entries : entries.slice(0, n);
}

export function round(v: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

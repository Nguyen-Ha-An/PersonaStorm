/**
 * Benchmark metrics (spec §8). Pure functions so the gate is deterministic and
 * unit-testable independently of the data. The gate itself (Task 9) runs the
 * full blend path against committed fixtures and applies thresholds.
 */
export interface BenchmarkOutcome {
  id: string;
  product_category: string;
  outcome: { label: "hit" | "moderate" | "flop"; known_failure_modes?: string[] };
}

export function outcomeRank(label: "hit" | "moderate" | "flop"): number {
  return label === "hit" ? 2 : label === "moderate" ? 1 : 0;
}

function rankdata(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const ranks = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1; // average rank for ties, 1-based
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

export function spearman(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return 0;
  const ra = rankdata(a);
  const rb = rankdata(b);
  const n = a.length;
  const mean = (n + 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - mean) * (rb[i] - mean);
    da += (ra[i] - mean) ** 2;
    db += (rb[i] - mean) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

export function failureModeHitRate(results: { known: string[]; topBlockers: string[] }[]): number {
  const withModes = results.filter((r) => r.known.length > 0);
  if (withModes.length === 0) return 1;
  const hits = withModes.filter((r) => r.known.some((m) => r.topBlockers.includes(m))).length;
  return hits / withModes.length;
}

export function withinCategoryInversions(rows: { category: string; score: number; rank: number }[]): number {
  let inversions = 0;
  const byCat = new Map<string, { score: number; rank: number }[]>();
  for (const r of rows) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category)!.push(r);
  }
  for (const group of byCat.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = 0; j < group.length; j++) {
        if (group[i].rank > group[j].rank && group[i].score < group[j].score) inversions++;
      }
    }
  }
  return inversions;
}

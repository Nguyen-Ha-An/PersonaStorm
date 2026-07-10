/**
 * Trait correlation structure for persona sampling (spec §5).
 * Unverified correlations are shrunk ×0.5 (less claimed structure where there
 * is less evidence). Cholesky failure = configuration error → throw at load.
 */
import type { TraitCorrelation } from "./priorsLoader";

export const TRAIT_ORDER = [
  "price_sensitivity", "skepticism", "novelty_seeking", "brand_trust",
  "social_influence", "risk_tolerance", "privacy_sensitivity",
] as const;

const UNVERIFIED_SHRINK = 0.5;

/**
 * Global default. All entries unverified (hence shrunk ×0.5 at build time)
 * until curated with psychometric sources in the priors files.
 */
export const DEFAULT_CORRELATIONS: TraitCorrelation[] = [
  ["novelty_seeking", "risk_tolerance", 0.4, "unverified"],
  ["skepticism", "brand_trust", -0.4, "unverified"],
  ["price_sensitivity", "risk_tolerance", -0.3, "unverified"],
  ["privacy_sensitivity", "skepticism", 0.25, "unverified"],
  ["social_influence", "novelty_seeking", 0.2, "unverified"],
];

export function buildCholesky(pairs: TraitCorrelation[], presetKey: string): number[][] {
  const n = TRAIT_ORDER.length;
  const idx = new Map<string, number>(TRAIT_ORDER.map((t, i) => [t, i]));
  const m: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  for (const [a, b, r, status] of pairs) {
    const i = idx.get(a);
    const j = idx.get(b);
    if (i === undefined) throw new Error(`correlation for preset '${presetKey}': unknown trait '${a}'`);
    if (j === undefined) throw new Error(`correlation for preset '${presetKey}': unknown trait '${b}'`);
    const rr = status === "unverified" ? r * UNVERIFIED_SHRINK : r;
    m[i][j] = rr;
    m[j][i] = rr;
  }
  return cholesky(m, presetKey);
}

function cholesky(m: number[][], presetKey: string): number[][] {
  const n = m.length;
  const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = m[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 1e-10) {
          throw new Error(`correlation matrix for preset '${presetKey}' is not positive definite`);
        }
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/** y = L·z (lower-triangular multiply). */
export function applyCholesky(L: number[][], z: number[]): number[] {
  const n = L.length;
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k <= i; k++) s += L[i][k] * z[k];
    y[i] = s;
  }
  return y;
}

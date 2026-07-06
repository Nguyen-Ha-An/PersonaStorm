/** Small shared formatters for dates and credit amounts. */

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Signed credit amount, e.g. +100 or −20. */
export function formatSignedCredits(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toLocaleString()}`;
}

/** 1_000_000_000 → "1.0B", 43_275_665 → "43.3M", 43_275 → "43.3K",
 *  9_999 → "9,999" (full), 512 → "512". Negatives keep sign.
 *  Rule: |n| < 10_000 → grouped full digits; else 1-decimal K/M/B. */
export function formatNumberCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs < 10_000) return n.toLocaleString();
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [div, suffix] of units) {
    if (abs >= div) return `${(n / div).toFixed(1)}${suffix}`;
  }
  return n.toLocaleString();
}

/** Credits for display. |n| < 10_000 → grouped full (e.g. "4,213");
 *  otherwise compact ("128.5K"). No currency symbol, no "credits" unit
 *  (callers/CreditPill add the unit). Used everywhere a credit integer
 *  is shown OUTSIDE a precise ledger. */
export function formatCredits(n: number): string {
  return Math.abs(n) < 10_000 ? n.toLocaleString() : formatNumberCompact(n);
}

/** Percent with disambiguation:
 *  - if |n| <= 1  → treat n as a 0..1 fraction  (0.72 → "72%")
 *  - if |n| > 1   → treat n as already a percent (72   → "72%")
 *  `decimals` default 0. Always appends "%". */
export function formatPercent(n: number, decimals = 0): string {
  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  return `${pct.toFixed(decimals)}%`;
}

/** Score readout for a 0..1 model score → integer 0..100 string,
 *  no unit (caller appends "%" or "/100" as needed). 0.72 → "72".
 *  If passed a value > 1 (already 0..100), rounds and returns as-is. */
export function formatScore(n: number): string {
  return String(Math.round(n <= 1 ? n * 100 : n));
}

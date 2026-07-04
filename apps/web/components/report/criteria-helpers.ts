import type { CriterionBreakdown } from "@/lib/types";

/**
 * Shared criteria math for the market-evaluation dashboard.
 *
 * The 17 criteria mix ASSETS (higher_is_better=true — more is better for
 * adoption) and BARRIERS (higher_is_better=false, e.g. proof_requirement — a
 * HIGH raw score is friction). `effective()` folds that polarity in so a single
 * 0..1 number always means "good for adoption", which lets every visual color
 * on one consistent scale.
 */

/** Look up a criterion by id in a breakdown list. */
export function byId(
  criteria: CriterionBreakdown[] | undefined,
  id: string,
): CriterionBreakdown | undefined {
  return criteria?.find((c) => c.criterion_id === id);
}

/** Barrier-aware 0..1 score where higher always = better for adoption. */
export function effectiveScore(c: {
  average_score: number;
  higher_is_better: boolean;
}): number {
  return c.higher_is_better ? c.average_score : 1 - c.average_score;
}

export type ScoreTone = "green" | "yellow" | "red";

/** Band an effective 0..1 score into a signal tone. */
export function toneFor(effective: number): ScoreTone {
  if (effective >= 0.66) return "green";
  if (effective >= 0.4) return "yellow";
  return "red";
}

export const TONE_HEX: Record<ScoreTone, string> = {
  green: "#34d399",
  yellow: "#fbbf24",
  red: "#fb7185",
};

export const TONE_RGB: Record<ScoreTone, string> = {
  green: "52, 211, 153",
  yellow: "251, 191, 36",
  red: "251, 113, 133",
};

export const TONE_TEXT: Record<ScoreTone, string> = {
  green: "text-signal-green",
  yellow: "text-signal-yellow",
  red: "text-signal-red",
};

/** Format a 0..1 score as a percent string. */
export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

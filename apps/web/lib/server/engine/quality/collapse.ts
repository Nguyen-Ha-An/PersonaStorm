/**
 * Collapse Detector — live, in-flight mode-collapse monitor. Port of
 * apps/api/app/services/quality/collapse.py. Used to compute the per-progress
 * collapse_risk level the stream emits.
 */

import { clamp, normalizeObjection, shannonEntropyNorm } from "../text";
import type { PersonaReaction } from "../types";

export class RunningCollapseMonitor {
  private objections: string[] = [];
  private quotes: string[] = [];
  private likelihoodBins: number[] = [];

  constructor(private window = 200) {}

  update(reaction: PersonaReaction): void {
    push(this.objections, normalizeObjection(reaction.first_objection), this.window);
    push(this.quotes, normalizeObjection(reaction.quote), this.window);
    push(this.likelihoodBins, Math.min(9, Math.floor(reaction.buy_likelihood * 10)), this.window);
  }

  get score(): number {
    const n = this.objections.length;
    if (n < 20) return 0.0;
    const dup = 1.0 - new Set(this.quotes).size / n;
    const objCounts = new Map<string, number>();
    for (const o of this.objections) objCounts.set(o, (objCounts.get(o) ?? 0) + 1);
    const entropy = shannonEntropyNorm(Array.from(objCounts.values()));
    const binCounts = new Map<number, number>();
    for (const b of this.likelihoodBins) binCounts.set(b, (binCounts.get(b) ?? 0) + 1);
    const maxBin = Math.max(...Array.from(binCounts.values()));
    const concentration = clamp((maxBin / n - 0.15) / 0.85);
    return clamp(0.35 * dup + 0.35 * (1.0 - entropy) + 0.3 * concentration);
  }

  get level(): "low" | "medium" | "high" {
    const s = this.score;
    return s < 0.33 ? "low" : s < 0.6 ? "medium" : "high";
  }
}

function push<T>(arr: T[], v: T, window: number): void {
  arr.push(v);
  if (arr.length > window) arr.shift();
}

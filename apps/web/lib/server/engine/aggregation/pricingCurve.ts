/**
 * Price sensitivity curve — port of
 * apps/api/app/services/aggregation/pricing.py.
 */

import { round } from "../text";
import type { StimulusFeatures } from "../stimulusParser";
import type { PersonaReaction } from "../types";
import type { PricePoint } from "../report";

const ANCHOR_MULTIPLIERS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];

function nice(v: number): number {
  if (v < 1) return round(v, 2);
  if (v < 20) return Math.round(v * 2) / 2;
  if (v < 100) return Math.round(v);
  return Math.round(v / 5) * 5;
}

export function buildPriceCurve(reactions: PersonaReaction[], features: StimulusFeatures): PricePoint[] {
  if (reactions.length === 0) return [];
  const wtps = reactions.map((r) => r.max_price).sort((a, b) => a - b);
  const n = wtps.length;

  let grid: number[];
  if (features.hasPricing && features.minPrice) {
    grid = Array.from(new Set(ANCHOR_MULTIPLIERS.map((m) => nice((features.minPrice as number) * m)))).sort((a, b) => a - b);
  } else {
    const positive = wtps.filter((w) => w > 0);
    const source = positive.length > 0 ? positive : [1.0];
    const qs = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92, 0.99];
    grid = Array.from(new Set(qs.map((q) => nice(source[Math.min(source.length - 1, Math.floor(q * source.length))])))).sort((a, b) => a - b);
  }

  const curve: PricePoint[] = [];
  for (const price of grid) {
    if (price <= 0) continue;
    const willing = wtps.filter((w) => w >= price).length;
    curve.push({ price, share_willing: round(willing / n, 4) });
  }
  return curve;
}

export function averageWtp(reactions: PersonaReaction[]): number {
  if (reactions.length === 0) return 0.0;
  return round(reactions.reduce((s, r) => s + r.max_price, 0) / reactions.length, 2);
}

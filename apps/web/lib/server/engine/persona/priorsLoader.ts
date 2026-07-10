/**
 * Priors loader — turns data/persona_priors/*.json into PresetSpec + honesty
 * metadata (spec §4). Unverified traits get std widened ×1.5 (cap 0.20).
 * Missing data dir → embedded code presets, loudly labeled. Invalid file →
 * throw (fail fast, never silent).
 */
import fs from "node:fs";
import path from "node:path";
import { resolvePreset, type PresetSpec, type Trait } from "./presets";

export type EvidenceStatus = "sourced" | "derived" | "unverified";
export type TraitCorrelation = [string, string, number, EvidenceStatus];

export interface PriorsMeta {
  source: "data_files" | "embedded_unverified";
  coverage: number;
  sourced_traits: number;
  total_traits: number;
  notes: string[];
}

export interface LoadedPreset {
  preset: PresetSpec;
  meta: PriorsMeta;
  correlations: TraitCorrelation[];
}

const UNVERIFIED_STD_FACTOR = 1.5;
const STD_CAP = 0.2;
const STATUSES: EvidenceStatus[] = ["sourced", "derived", "unverified"];

export function defaultPriorsDir(): string {
  return process.env.PERSONA_PRIORS_DIR ?? path.join(process.cwd(), "..", "..", "data", "persona_priors");
}

export function loadPresetWithMeta(
  key: string,
  customDescription?: string | null,
  dir: string = defaultPriorsDir(),
): LoadedPreset {
  if (key === "custom") {
    return embeddedFallback(key, customDescription, "custom presets are built from the segment description, not data files");
  }
  const file = path.join(dir, `${key}.json`);
  if (!fs.existsSync(file)) {
    return embeddedFallback(key, customDescription, `priors file not found (${file}) — using embedded presets marked unverified`);
  }

  const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>; // throws on bad JSON — intended
  const subSegments = raw.sub_segments;
  if (!Array.isArray(subSegments) || subSegments.length === 0) {
    throw new Error(`priors ${key}: sub_segments must be a non-empty array`);
  }
  const embedded = resolvePreset(key, customDescription);

  let sourced = 0;
  let total = 0;
  const subs = subSegments.map((s: Record<string, unknown>, i: number) => {
    const traitsIn = s.traits as Record<string, { mean: number; std: number; evidence?: { status?: string; mapping_rule?: string } }>;
    if (!traitsIn || typeof traitsIn !== "object") throw new Error(`priors ${key}: sub_segments[${i}].traits missing`);
    const traits: Record<string, Trait> = {};
    for (const [name, t] of Object.entries(traitsIn)) {
      if (typeof t.mean !== "number" || t.mean < 0 || t.mean > 1) {
        throw new Error(`priors ${key}: trait '${name}' mean out of [0,1]`);
      }
      if (typeof t.std !== "number" || t.std <= 0 || t.std > 0.5) {
        throw new Error(`priors ${key}: trait '${name}' std out of (0,0.5]`);
      }
      const status = (t.evidence?.status ?? "unverified") as EvidenceStatus;
      if (!STATUSES.includes(status)) throw new Error(`priors ${key}: trait '${name}' invalid evidence status '${status}'`);
      if (status === "sourced") {
        if (!t.evidence?.mapping_rule) throw new Error(`priors ${key}: trait '${name}' is sourced but has no mapping_rule`);
        if (!(raw.trait_definitions as Record<string, string> | undefined)?.[name]) {
          throw new Error(`priors ${key}: trait '${name}' is sourced but has no operational definition in trait_definitions`);
        }
        sourced += 1;
      }
      total += 1;
      const std = status === "unverified" ? Math.min(t.std * UNVERIFIED_STD_FACTOR, STD_CAP) : t.std;
      traits[name] = [t.mean, std];
    }
    return {
      name: String(s.name),
      weight: Number(s.weight),
      age_range: s.age_range as [number, number],
      regions: s.regions as string[],
      income_bands: s.income_bands as PresetSpec["sub_segments"][number]["income_bands"],
      occupations: s.occupations as string[],
      traits,
      familiarity: s.familiarity as string[],
      research_styles: s.research_styles as string[],
      buying_triggers: s.buying_triggers as string[],
      dealbreaker_pool: s.dealbreaker_pool as string[],
    };
  });

  const correlations = validateCorrelationPairs(key, (raw.trait_correlations as unknown[] | undefined) ?? []);

  return {
    preset: { key: embedded.key, id_prefix: embedded.id_prefix, label: embedded.label, sub_segments: subs },
    meta: {
      source: "data_files",
      coverage: total > 0 ? sourced / total : 0,
      sourced_traits: sourced,
      total_traits: total,
      notes: [],
    },
    correlations,
  };
}

function validateCorrelationPairs(key: string, pairs: unknown[]): TraitCorrelation[] {
  return pairs.map((p, i) => {
    const arr = p as [string, string, number, string?];
    if (!Array.isArray(arr) || arr.length < 3) throw new Error(`priors ${key}: trait_correlations[${i}] malformed`);
    const r = Number(arr[2]);
    if (Number.isNaN(r) || Math.abs(r) > 0.95) throw new Error(`priors ${key}: trait_correlations[${i}] |r| must be <= 0.95`);
    const status = (arr[3] ?? "unverified") as EvidenceStatus;
    if (!STATUSES.includes(status)) throw new Error(`priors ${key}: trait_correlations[${i}] bad status`);
    return [arr[0], arr[1], r, status];
  });
}

function embeddedFallback(key: string, customDescription: string | null | undefined, why: string): LoadedPreset {
  const preset = resolvePreset(key, customDescription);
  let total = 0;
  for (const s of preset.sub_segments) total += Object.keys(s.traits).length;
  return {
    preset,
    meta: { source: "embedded_unverified", coverage: 0, sourced_traits: 0, total_traits: total, notes: [why] },
    correlations: [],
  };
}

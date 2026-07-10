/**
 * Priors loader — turns data/persona_priors/*.json into PresetSpec + honesty
 * metadata (spec §4). Unverified traits get std widened ×1.5 (cap 0.20).
 * Missing data dir → embedded code presets, loudly labeled. Invalid file →
 * throw (fail fast, never silent).
 */
import fs from "node:fs";
import path from "node:path";
import { resolvePreset, type PresetSpec, type SubSegmentSpec, type Trait } from "./presets";

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
    validateSubSegmentFields(key, s, i);
    const traitsIn = s.traits as Record<string, { mean: number; std: number; evidence?: { status?: string; mapping_rule?: string } }>;
    if (!traitsIn || typeof traitsIn !== "object") throw new Error(`priors ${key}: sub_segments[${i}].traits missing`);
    const traits: Record<string, Trait> = {};
    for (const [name, t] of Object.entries(traitsIn)) {
      if (typeof t.mean !== "number" || !Number.isFinite(t.mean) || t.mean < 0 || t.mean > 1) {
        throw new Error(`priors ${key}: trait '${name}' mean out of [0,1]`);
      }
      if (typeof t.std !== "number" || !Number.isFinite(t.std) || t.std <= 0 || t.std > 0.5) {
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

function isNonEmptyStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.length > 0);
}

function isValidIncomeBands(v: unknown): v is PresetSpec["sub_segments"][number]["income_bands"] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every(
      (b) =>
        Array.isArray(b) &&
        b.length === 2 &&
        typeof b[0] === "string" &&
        b[0].length > 0 &&
        Array.isArray(b[1]) &&
        b[1].length === 2 &&
        typeof b[1][0] === "number" &&
        Number.isFinite(b[1][0]) &&
        typeof b[1][1] === "number" &&
        Number.isFinite(b[1][1]),
    )
  );
}

function validateSubSegmentFields(key: string, s: Record<string, unknown>, i: number): void {
  if (typeof s.weight !== "number" || !Number.isFinite(s.weight) || s.weight <= 0) {
    throw new Error(`priors ${key}: sub_segments[${i}] weight must be a finite number > 0`);
  }
  if (typeof s.name !== "string" || s.name.length === 0) {
    throw new Error(`priors ${key}: sub_segments[${i}] name must be a non-empty string`);
  }
  const ageRange = s.age_range;
  if (
    !Array.isArray(ageRange) ||
    ageRange.length !== 2 ||
    !ageRange.every((n) => typeof n === "number" && Number.isFinite(n))
  ) {
    throw new Error(`priors ${key}: sub_segments[${i}] age_range must be an array of 2 numbers`);
  }
  const stringArrayFields = [
    "regions",
    "occupations",
    "familiarity",
    "research_styles",
    "buying_triggers",
    "dealbreaker_pool",
  ] as const;
  for (const field of stringArrayFields) {
    if (!isNonEmptyStringArray(s[field])) {
      throw new Error(`priors ${key}: sub_segments[${i}] ${field} must be a non-empty array of strings`);
    }
  }
  if (!isValidIncomeBands(s.income_bands)) {
    throw new Error(
      `priors ${key}: sub_segments[${i}] income_bands must be a non-empty array of [string, [number, number]]`,
    );
  }
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

// Embedded PRESETS are module-level shared state (see presets.ts) — never mutate
// the trait records resolvePreset() returns. Build fresh sub-segment/trait
// objects here so the ×1.5 honesty widening applied below can't leak back into
// the shared preset table and corrupt subsequent loads.
function widenSubSegmentTraits(s: SubSegmentSpec): SubSegmentSpec {
  const traits: Record<string, Trait> = {};
  for (const [name, [mean, std]] of Object.entries(s.traits)) {
    traits[name] = [mean, Math.min(std * UNVERIFIED_STD_FACTOR, STD_CAP)];
  }
  return { ...s, traits };
}

function embeddedFallback(key: string, customDescription: string | null | undefined, why: string): LoadedPreset {
  const resolved = resolvePreset(key, customDescription);
  const preset: PresetSpec = { ...resolved, sub_segments: resolved.sub_segments.map(widenSubSegmentTraits) };
  let total = 0;
  for (const s of preset.sub_segments) total += Object.keys(s.traits).length;
  return {
    preset,
    meta: { source: "embedded_unverified", coverage: 0, sourced_traits: 0, total_traits: total, notes: [why] },
    correlations: [],
  };
}

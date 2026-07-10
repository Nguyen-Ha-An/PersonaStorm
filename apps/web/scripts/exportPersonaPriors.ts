/**
 * One-off exporter: turns the hardcoded presets into data/persona_priors/*.json
 * with every trait marked evidence.status="unverified". Curation (adding
 * sources) then happens in the data files, never in code.
 */
import fs from "node:fs";
import path from "node:path";
import { PRESETS, BASE_TRAITS, type PresetSpec } from "../lib/server/engine/persona/presets";

const OUT_DIR = path.join(__dirname, "..", "..", "..", "data", "persona_priors");

// Shared operational definitions — what each 0..1 value MEANS. Required
// context for anyone curating sources into these files.
const TRAIT_DEFINITIONS: Record<string, string> = {
  price_sensitivity:
    "0.9 ≈ abandons purchase at +10% price delta; 0.5 ≈ tolerates +30%; 0.1 ≈ price-indifferent within budget",
  skepticism:
    "0.9 ≈ demands independent evidence before believing any claim; 0.5 ≈ accepts credible-sounding claims; 0.1 ≈ takes marketing at face value",
  novelty_seeking:
    "0.9 ≈ tries new products in the category within a week of hearing about them; 0.5 ≈ waits for reviews; 0.1 ≈ adopts only when forced",
  brand_trust:
    "0.9 ≈ defaults to trusting established brands; 0.5 ≈ neutral; 0.1 ≈ distrusts brand claims by default",
  social_influence:
    "0.9 ≈ buying decisions driven mostly by peers/community; 0.5 ≈ considers recommendations; 0.1 ≈ decides alone",
  risk_tolerance:
    "0.9 ≈ comfortable being an early customer of an unproven vendor; 0.5 ≈ prefers references; 0.1 ≈ needs de-risked, established options",
  privacy_sensitivity:
    "0.9 ≈ walks away from unclear data handling; 0.5 ≈ prefers but doesn't require clarity; 0.1 ≈ indifferent to data practices",
};

function traitBlock(traits: Record<string, [number, number]>) {
  const out: Record<string, unknown> = {};
  for (const [name, [mean, std]] of Object.entries(traits)) {
    out[name] = { mean, std, evidence: { status: "unverified" } };
  }
  return out;
}

function exportPreset(key: string, preset: PresetSpec) {
  const doc = {
    preset: key,
    version: 1,
    trait_definitions: TRAIT_DEFINITIONS,
    // trait_correlations omitted → loader uses the global default matrix.
    sub_segments: preset.sub_segments.map((s) => ({
      name: s.name,
      weight: s.weight,
      age_range: s.age_range,
      regions: s.regions,
      income_bands: s.income_bands,
      occupations: s.occupations,
      familiarity: s.familiarity,
      research_styles: s.research_styles,
      buying_triggers: s.buying_triggers,
      dealbreaker_pool: s.dealbreaker_pool,
      traits: traitBlock(s.traits),
    })),
  };
  fs.writeFileSync(path.join(OUT_DIR, `${key}.json`), JSON.stringify(doc, null, 2) + "\n");
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [key, preset] of Object.entries(PRESETS)) exportPreset(key, preset);
fs.writeFileSync(
  path.join(OUT_DIR, "_base.json"),
  JSON.stringify(
    { preset: "_base", version: 1, trait_definitions: TRAIT_DEFINITIONS, base_traits: traitBlock(BASE_TRAITS) },
    null,
    2,
  ) + "\n",
);
console.log(`Wrote ${Object.keys(PRESETS).length + 1} priors files to ${OUT_DIR}`);

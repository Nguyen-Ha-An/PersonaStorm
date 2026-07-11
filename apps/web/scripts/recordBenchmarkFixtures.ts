/**
 * Regenerates data/benchmark_outcomes/fixtures/<id>.json — the recorded semantic
 * matrix for each benchmark entry, so the backtest runs the full blend path
 * offline & deterministically. Regenerating is a REVIEWED act (commit the diff).
 * With SEMANTIC_PROVIDER=mock (default) this records the deterministic mock
 * matrices; point it at a real assessor to snapshot true semantic outputs.
 */
import fs from "node:fs";
import path from "node:path";
import { getConfig } from "../lib/server/env";
import { getSemanticAssessor } from "../lib/server/engine/semantic/assessor";
import { PersonaGenerator } from "../lib/server/engine/persona/generator";
import { classifyCategory } from "../lib/server/engine/criteria/classifier";
import { parseStimulus } from "../lib/server/engine/stimulusParser";

const DIR = path.join(__dirname, "..", "..", "..", "data", "benchmark_outcomes");
const FIX = path.join(DIR, "fixtures");

async function main() {
  fs.mkdirSync(FIX, { recursive: true });
  const cfg = getConfig();
  const assessor = getSemanticAssessor(cfg);
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json");
  for (const f of files) {
    const entry = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf-8"));
    const market = entry.target_market || "custom";
    const { personas } = new PersonaGenerator(cfg.personaSeed).generate(market, 60, entry.custom_segment_description);
    const features = parseStimulus(entry.stimulus, "", entry.stimulus_type);
    const category = entry.product_category || classifyCategory(features)[0];
    const segNames = Array.from(new Set(personas.map((p) => p.segment)));
    const briefs = segNames.map((name) => {
      const s = personas.find((p) => p.segment === name)!;
      return { name, occupations: [s.occupation], income_bands: [s.income_band], sub_segment_hint: s.sub_segment };
    });
    const matrix = await assessor.assess(entry.stimulus, category, briefs);
    fs.writeFileSync(path.join(FIX, `${entry.id}.json`), JSON.stringify(matrix, null, 2) + "\n");
  }
  console.log(`Recorded ${files.length} benchmark fixtures to ${FIX}`);
}
main();

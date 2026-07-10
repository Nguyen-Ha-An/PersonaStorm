import { describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPresetWithMeta } from "./priorsLoader";

function tmpDirWith(file: string, content: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "priors-"));
  fs.writeFileSync(path.join(dir, file), JSON.stringify(content));
  return dir;
}

const VALID = {
  preset: "sea_genz",
  version: 1,
  trait_definitions: { price_sensitivity: "def" },
  sub_segments: [
    {
      name: "s1", weight: 1, age_range: [18, 25], regions: ["r"],
      income_bands: [["b", [5, 25]]], occupations: ["o"], familiarity: ["low"],
      research_styles: ["rs"], buying_triggers: ["bt"], dealbreaker_pool: ["unclear pricing"],
      traits: {
        price_sensitivity: { mean: 0.8, std: 0.1, evidence: { status: "sourced", sources: [{ title: "t", url: "u" }], mapping_rule: "m" } },
        skepticism: { mean: 0.6, std: 0.1, evidence: { status: "unverified" } },
        novelty_seeking: { mean: 0.5, std: 0.1, evidence: { status: "unverified" } },
        brand_trust: { mean: 0.5, std: 0.1, evidence: { status: "unverified" } },
        social_influence: { mean: 0.5, std: 0.1, evidence: { status: "unverified" } },
        risk_tolerance: { mean: 0.5, std: 0.1, evidence: { status: "unverified" } },
        privacy_sensitivity: { mean: 0.5, std: 0.18, evidence: { status: "unverified" } },
      },
    },
  ],
};

describe("priorsLoader", () => {
  test("loads a valid file, widens unverified std, computes coverage", () => {
    const dir = tmpDirWith("sea_genz.json", VALID);
    const { preset, meta } = loadPresetWithMeta("sea_genz", null, dir);
    expect(meta.source).toBe("data_files");
    // sourced std untouched:
    expect(preset.sub_segments[0].traits.price_sensitivity).toEqual([0.8, 0.1]);
    // unverified std widened ×1.5:
    expect(preset.sub_segments[0].traits.skepticism[1]).toBeCloseTo(0.15, 5);
    // widening capped at 0.20:
    expect(preset.sub_segments[0].traits.privacy_sensitivity[1]).toBeCloseTo(0.2, 5);
    expect(meta.sourced_traits).toBe(1);
    expect(meta.total_traits).toBe(7);
    expect(meta.coverage).toBeCloseTo(1 / 7, 5);
  });

  test("sourced without mapping_rule is rejected", () => {
    const bad = JSON.parse(JSON.stringify(VALID));
    delete bad.sub_segments[0].traits.price_sensitivity.evidence.mapping_rule;
    const dir = tmpDirWith("sea_genz.json", bad);
    expect(() => loadPresetWithMeta("sea_genz", null, dir)).toThrow(/mapping_rule/);
  });

  test("invalid JSON file fails fast", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "priors-"));
    fs.writeFileSync(path.join(dir, "sea_genz.json"), "{ not json");
    expect(() => loadPresetWithMeta("sea_genz", null, dir)).toThrow();
  });

  test("missing directory falls back to embedded presets with label", () => {
    const { preset, meta } = loadPresetWithMeta("sea_genz", null, path.join(os.tmpdir(), "does-not-exist-xyz"));
    expect(meta.source).toBe("embedded_unverified");
    expect(meta.coverage).toBe(0);
    expect(preset.sub_segments.length).toBeGreaterThan(0);
    expect(meta.notes.join(" ")).toMatch(/embedded/i);
  });

  test("custom preset always reports embedded_unverified", () => {
    const { meta } = loadPresetWithMeta("custom", "vietnamese developers", path.join(os.tmpdir(), "does-not-exist-xyz"));
    expect(meta.source).toBe("embedded_unverified");
  });

  test("mean out of range is rejected", () => {
    const bad = JSON.parse(JSON.stringify(VALID));
    bad.sub_segments[0].traits.skepticism.mean = 1.4;
    const dir = tmpDirWith("sea_genz.json", bad);
    expect(() => loadPresetWithMeta("sea_genz", null, dir)).toThrow(/mean/);
  });
});

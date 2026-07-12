import { describe, expect, test } from "vitest";
import { tokenize } from "./text";
import { parseStimulus } from "./stimulusParser";

// Regression for the shared WORD_RE bug: it allowed `-` inside a token, so
// "AI-powered" collapsed into the single token "ai-powered" and never matched
// AI_WORDS' "ai" entry — leaving mentionsAi silently false for that phrasing.
// The tokenizer now also emits the hyphen-split parts while keeping the full
// compound, so component matching ("ai") and compound/multi-word keyword
// matching ("money-back", "soc-2", "lock-in") both work.

describe("tokenize — hyphenated compounds", () => {
  test("splits a hyphenated word into its parts", () => {
    const toks = tokenize("AI-powered");
    expect(toks).toContain("ai");
    expect(toks).toContain("powered");
  });

  test("keeps the full compound alongside its parts", () => {
    const toks = tokenize("money-back soc-2 lock-in");
    expect(toks).toContain("money-back");
    expect(toks).toContain("soc-2");
    expect(toks).toContain("lock-in");
  });

  test("drops parts that are not letter-initial", () => {
    const toks = tokenize("soc-2");
    expect(toks).toContain("soc");
    expect(toks).not.toContain("2");
  });
});

describe("parseStimulus — mentionsAi with hyphenated phrasing", () => {
  test("AI-powered flips mentionsAi true", () => {
    const f = parseStimulus("An AI-powered assistant for teams.", "X", "product_concept");
    expect(f.mentionsAi).toBe(true);
  });

  test("AI-driven flips mentionsAi true", () => {
    const f = parseStimulus("An AI-driven analytics dashboard.", "X", "product_concept");
    expect(f.mentionsAi).toBe(true);
  });

  test("substring 'ai' inside words does not flip mentionsAi", () => {
    const f = parseStimulus("Maintain your domain names with our dashboard.", "X", "product_concept");
    expect(f.mentionsAi).toBe(false);
  });

  test("hyphenated compound keywords still flag their signals", () => {
    const f = parseStimulus(
      "Enterprise plan with SOC-2 certification and no lock-in. 30-day money-back offer.",
      "X",
      "product_concept",
    );
    expect(f.mentionsSecurity).toBe(true); // via "soc-2"
    expect(f.mentionsLockin).toBe(true); // via "lock-in"
    expect(f.hasProof).toBe(true); // via "money-back"
  });
});

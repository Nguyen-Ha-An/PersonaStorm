// @vitest-environment node
import { describe, expect, test, beforeEach, vi } from "vitest";

vi.mock("../providers/chatClient", () => ({
  chatCompletion: vi.fn(),
  extractJsonObject: (c: string) => {
    const s = c.indexOf("{"), e = c.lastIndexOf("}");
    if (s < 0 || e < s) throw new Error("no json");
    return JSON.parse(c.slice(s, e + 1));
  },
  isTransientChatError: () => false,
  ChatHttpError: class extends Error {},
}));

import { chatCompletion } from "../providers/chatClient";
import { LlmSemanticAssessor } from "./assessor";

const SEGS = [
  { name: "Ops manager", occupations: ["ops"], income_bands: ["dept budget"], sub_segment_hint: "SMB ops" },
];
const valid = JSON.stringify({
  segments: { "Ops manager": { solution_fit: { score: 0.8, rationale: "x" } } },
  real_alternatives_considered: ["Foo"],
});

describe("LlmSemanticAssessor never-throw + source tagging", () => {
  const mk = () => new LlmSemanticAssessor("k", "https://integrate.api.nvidia.com/v1", "m", 2048, "nvidia");
  beforeEach(() => vi.mocked(chatCompletion).mockReset());

  test("successful parse tags source nvidia and keeps scores", async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce(valid);
    const m = await mk().assess("stim", "b2b_saas", SEGS);
    expect(m.source).toBe("nvidia");
    expect(m.segments["Ops manager"].scores.solution_fit).toBe(0.8);
  });

  test("network/HTTP failure degrades to fallback_formulas without throwing", async () => {
    vi.mocked(chatCompletion).mockRejectedValueOnce(new Error("boom"));
    const m = await mk().assess("stim", "b2b_saas", SEGS);
    expect(m.source).toBe("fallback_formulas");
    expect(m.segments["Ops manager"]).toBeDefined();
  });

  test("unparseable then still-unparseable after repair degrades to fallback", async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce("not json").mockResolvedValueOnce("still not json");
    const m = await mk().assess("stim", "b2b_saas", SEGS);
    expect(m.source).toBe("fallback_formulas");
  });

  test("unparseable then valid on repair succeeds and tags nvidia", async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce("junk").mockResolvedValueOnce(valid);
    const m = await mk().assess("stim", "b2b_saas", SEGS);
    expect(m.source).toBe("nvidia");
  });

  test("valid JSON with no usable segments (sanitize null) degrades to fallback", async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce(JSON.stringify({ nope: 1 }));
    const m = await mk().assess("stim", "b2b_saas", SEGS);
    expect(m.source).toBe("fallback_formulas");
  });

  test("a fireworks-backed assessor tags source fireworks on success", async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce(valid);
    const fw = new LlmSemanticAssessor("fw-key", "https://api.fireworks.ai/inference/v1", "accounts/fireworks/models/deepseek-v4-flash", 2048, "fireworks");
    const m = await fw.assess("stim", "b2b_saas", SEGS);
    expect(m.source).toBe("fireworks");
    expect(m.segments["Ops manager"].scores.solution_fit).toBe(0.8);
  });
});

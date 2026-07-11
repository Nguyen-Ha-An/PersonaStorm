/**
 * Semantic assessor (spec §7). ONE LLM call per storm. The mock assessor is a
 * deterministic, seeded, trait-free stand-in that fully populates the matrix so
 * the blend engages offline. The LLM assessor calls the shared chatClient at
 * temperature 0, sanitizes, and — on any failure after one repair — returns an
 * empty-but-valid matrix tagged fallback_formulas (blend degrades to formulas).
 */
import { RNG } from "../rng";
import { round } from "../text";
import { chatCompletion, extractJsonObject } from "../providers/chatClient";
import { buildSemanticSystemPrompt, buildSemanticUserPrompt, SEMANTIC_JSON_SCHEMA, type SegmentBrief } from "./prompt";
import { GROUNDED_CRITERIA, sanitizeSemantic, type SemanticMatrix, type SemanticSource } from "./types";
import type { ServerConfig } from "../../env";

export interface SemanticAssessor {
  readonly name: string;
  assess(stimulus: string, category: string, segments: SegmentBrief[]): Promise<SemanticMatrix>;
}

function emptyMatrix(segments: SegmentBrief[], source: SemanticSource): SemanticMatrix {
  const segs: SemanticMatrix["segments"] = {};
  for (const s of segments) segs[s.name] = { scores: {}, rationales: {} };
  return { segments: segs, real_alternatives_considered: [], source };
}

/** Deterministic offline assessor — a hash of (stimulus, category, segment, criterion). */
export class MockSemanticAssessor implements SemanticAssessor {
  readonly name = "mock";
  constructor(private seed: number = 1337) {}

  async assess(stimulus: string, category: string, segments: SegmentBrief[]): Promise<SemanticMatrix> {
    const m = emptyMatrix(segments, "fallback_formulas");
    for (const s of segments) {
      for (const c of GROUNDED_CRITERIA) {
        const rng = new RNG(`sem:${this.seed}:${category}:${s.name}:${c}:${stimulus}`);
        m.segments[s.name].scores[c] = round(0.3 + 0.4 * rng.random(), 4);
        m.segments[s.name].rationales[c] = "deterministic offline assessment";
      }
    }
    return m;
  }
}

export class LlmSemanticAssessor implements SemanticAssessor {
  readonly name = "llm";
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string,
    private maxTokens: number,
    private source: SemanticSource,
  ) {}

  async assess(stimulus: string, category: string, segments: SegmentBrief[]): Promise<SemanticMatrix> {
    const names = segments.map((s) => s.name);
    const messages = [
      { role: "system" as const, content: buildSemanticSystemPrompt() },
      { role: "user" as const, content: buildSemanticUserPrompt(stimulus, category, segments) },
    ];
    try {
      const content = await this.call(messages);
      let parsed: Record<string, unknown>;
      try {
        parsed = extractJsonObject(content);
      } catch {
        // one repair attempt: ask for JSON only
        const repair = await this.call([
          ...messages,
          { role: "assistant" as const, content },
          { role: "user" as const, content: "That was not valid JSON. Output ONLY the JSON object matching the schema." },
        ]);
        parsed = extractJsonObject(repair);
      }
      const clean = sanitizeSemantic(parsed, names);
      if (!clean) return emptyMatrix(segments, "fallback_formulas");
      return { ...clean, source: this.source };
    } catch (err) {
      console.warn("[personastorm semantic] assess failed, degrading to formulas:", (err as Error).message);
      return emptyMatrix(segments, "fallback_formulas");
    }
  }

  private call(messages: { role: "system" | "user" | "assistant"; content: string }[]): Promise<string> {
    // All throws (transient or terminal) are handled identically by the outer
    // try/catch in assess(), which degrades to a fallback_formulas matrix.
    return chatCompletion({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      model: this.model,
      messages,
      maxTokens: this.maxTokens,
      temperature: 0,
      jsonObject: true,
      timeoutMs: 60_000,
    });
  }
}

// SEMANTIC_JSON_SCHEMA is exported for callers wiring guided-JSON providers.
export { SEMANTIC_JSON_SCHEMA };

export function getSemanticAssessor(cfg: ServerConfig): SemanticAssessor {
  if (cfg.semanticProvider === "nvidia") {
    if (cfg.nvidiaBaseUrl.includes("integrate.api.nvidia.com") && !cfg.nvidiaApiKey) {
      console.warn("[personastorm semantic] SEMANTIC_PROVIDER=nvidia but NVIDIA_API_KEY missing; using mock assessor.");
      return new MockSemanticAssessor(cfg.personaSeed);
    }
    return new LlmSemanticAssessor(cfg.nvidiaApiKey, cfg.nvidiaBaseUrl, cfg.semanticModel, cfg.semanticMaxTokens, "nvidia");
  }
  return new MockSemanticAssessor(cfg.personaSeed);
}

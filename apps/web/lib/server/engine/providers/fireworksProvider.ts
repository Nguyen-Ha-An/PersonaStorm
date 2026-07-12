/**
 * FireworksProvider — Fireworks AI (OpenAI-compatible) persona reactions for
 * the classic swarm path (INFERENCE_PROVIDER=fireworks). This is the real
 * prototype's inference API; the NvidiaProvider remains as a reference/testing
 * path. Port kept behaviorally identical to apps/api/app/services/inference/
 * fireworks_provider.py.
 *
 * Structured output uses Fireworks' JSON-mode schema dialect
 * (response_format {type:"json_object", schema: REACTION_JSON_SCHEMA}) to
 * hard-constrain the reply, mirroring what nvext.guided_json does on NIM.
 *
 * market_fit_score and status are NEVER trusted from the model — always
 * recomputed server-side via computeMarketFit / statusFor (parseLlmReaction).
 */

import { ProviderNotConfiguredError } from "../../errors";
import type { StimulusFeatures } from "../stimulusParser";
import type { Persona, PersonaReaction } from "../types";
import { chatCompletion } from "./chatClient";
import { parseLlmReaction } from "./nvidiaProvider";
import { REACTION_JSON_SCHEMA, buildSystemPrompt, buildUserPrompt } from "./prompts";
import { reactBatchDefault, type PersonaInferenceProvider } from "./types";

export interface FireworksProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export class FireworksProvider implements PersonaInferenceProvider {
  readonly name = "fireworks";
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private maxTokens: number;
  private timeoutMs: number;

  constructor(opts: FireworksProviderOptions) {
    if (!opts.baseUrl) {
      throw new ProviderNotConfiguredError(
        "INFERENCE_PROVIDER=fireworks but FIREWORKS_BASE_URL is not set. Point it at " +
          "https://api.fireworks.ai/inference/v1, or use INFERENCE_PROVIDER=mock.",
      );
    }
    if (opts.baseUrl.includes("api.fireworks.ai") && !opts.apiKey) {
      throw new ProviderNotConfiguredError(
        "INFERENCE_PROVIDER=fireworks targets the hosted Fireworks endpoint but " +
          "FIREWORKS_API_KEY is not set. Create a key at fireworks.ai, set " +
          "FIREWORKS_API_KEY, or switch to mock.",
      );
    }
    if (!opts.model) {
      throw new ProviderNotConfiguredError(
        "INFERENCE_PROVIDER=fireworks but no model is configured (set FIREWORKS_MODEL).",
      );
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.model = opts.model;
    this.maxTokens = opts.maxTokens ?? 2048;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  async react(
    persona: Persona,
    stimulus: string,
    stimulusType: string,
    features: StimulusFeatures | null,
    category: string | null,
  ): Promise<PersonaReaction> {
    const content = await chatCompletion({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      model: this.model,
      messages: [
        { role: "system", content: buildSystemPrompt(persona) },
        { role: "user", content: buildUserPrompt(stimulus, stimulusType, features) },
      ],
      maxTokens: this.maxTokens,
      temperature: 0.8,
      jsonSchema: REACTION_JSON_SCHEMA as Record<string, unknown>,
      timeoutMs: this.timeoutMs,
    });
    return parseLlmReaction(content, persona, features, category);
  }

  reactBatch(
    personas: Persona[],
    stimulus: string,
    stimulusType: string,
    features: StimulusFeatures | null,
    concurrency: number,
    category: string | null,
  ): Promise<PersonaReaction[]> {
    return reactBatchDefault(this, personas, stimulus, stimulusType, features, concurrency, category);
  }
}

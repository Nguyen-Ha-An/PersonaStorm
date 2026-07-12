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
import { ChatHttpError, chatCompletion, isTransientChatError } from "./chatClient";
import { parseLlmReaction } from "./nvidiaProvider";
import { REACTION_JSON_SCHEMA, buildSystemPrompt, buildUserPrompt } from "./prompts";
import type { PersonaInferenceProvider } from "./types";

export interface FireworksProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Attempts per persona on transient (5xx/network) failures. */
  maxRetries?: number;
  /** Attempts per persona on 429 rate limits (paced by Retry-After). */
  maxRateLimitRetries?: number;
  /** Backoff base in ms (delay = base * 2^attempt); tests pass a tiny value. */
  retryBaseMs?: number;
  /**
   * Max fraction of personas allowed to fail after retries before the storm
   * fails honestly rather than shipping a thin report — mirrors the Python
   * engine's SWARM_MAX_DROP_FRACTION.
   */
  maxDropFraction?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class FireworksProvider implements PersonaInferenceProvider {
  readonly name = "fireworks";
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private maxTokens: number;
  private timeoutMs: number;
  private maxRetries: number;
  private maxRateLimitRetries: number;
  private retryBaseMs: number;
  private maxDropFraction: number;

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
    // 45s per attempt keeps the worst single-persona chain (3 attempts +
    // backoff ≈ 138s) inside the storm route's 300s serverless budget —
    // a slow persona must fail in-process (clean refund), never by the
    // platform killing the whole function.
    this.timeoutMs = opts.timeoutMs ?? 45_000;
    this.maxRetries = Math.max(1, opts.maxRetries ?? 3);
    this.maxRateLimitRetries = Math.max(1, opts.maxRateLimitRetries ?? 5);
    // Deliberately no jitter: engine paths avoid unseeded randomness (repo
    // invariant), and the swarm's concurrency is a bounded 8 workers.
    this.retryBaseMs = opts.retryBaseMs ?? 1_000;
    this.maxDropFraction = Math.min(0.5, Math.max(0, opts.maxDropFraction ?? 0.1));
  }

  async react(
    persona: Persona,
    stimulus: string,
    stimulusType: string,
    features: StimulusFeatures | null,
    category: string | null,
  ): Promise<PersonaReaction> {
    // Retry transient failures with exponential backoff. Rate limits (429)
    // get more attempts and honor the provider's Retry-After pacing, since a
    // 1,000-call swarm WILL brush the account's requests-per-minute cap.
    // Non-transient errors (schema, auth, 404 model) surface immediately.
    let lastErr: unknown;
    for (let attempt = 0; ; attempt++) {
      try {
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
      } catch (err) {
        lastErr = err;
        if (!isTransientChatError(err)) throw err;
        const isRateLimit = err instanceof ChatHttpError && err.status === 429;
        const budget = isRateLimit ? this.maxRateLimitRetries : this.maxRetries;
        if (attempt + 1 >= budget) throw lastErr;
        const backoff = this.retryBaseMs * 2 ** attempt;
        const wait = isRateLimit && err instanceof ChatHttpError && err.retryAfterMs
          ? Math.max(err.retryAfterMs, backoff)
          : backoff;
        await sleep(Math.min(wait, 15_000));
      }
    }
  }

  /**
   * Drop-tolerant fan-out (mirrors the Python engine's
   * SWARM_MAX_DROP_FRACTION): a bounded fraction of personas may fail after
   * retries without killing the storm — the report is computed from the
   * survivors and labeled (runStorm appends a quality note). Beyond the cap
   * the storm fails honestly rather than shipping a thin report.
   */
  async reactBatch(
    personas: Persona[],
    stimulus: string,
    stimulusType: string,
    features: StimulusFeatures | null,
    concurrency: number,
    category: string | null,
  ): Promise<PersonaReaction[]> {
    const results = new Array<PersonaReaction | null>(personas.length).fill(null);
    let failures = 0;
    let lastFailure: unknown;
    let next = 0;
    const limit = Math.max(1, concurrency);
    const worker = async (): Promise<void> => {
      while (true) {
        const i = next++;
        if (i >= personas.length) return;
        try {
          results[i] = await this.react(personas[i], stimulus, stimulusType, features, category);
        } catch (err) {
          failures++;
          lastFailure = err;
          console.warn(
            `[personastorm fireworks] persona ${personas[i].persona_id} failed after retries:`,
            (err as Error).message,
          );
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, personas.length) }, () => worker()));

    const allowed = Math.floor(this.maxDropFraction * personas.length);
    if (failures > allowed) {
      const lastMsg = lastFailure instanceof Error ? lastFailure.message : String(lastFailure ?? "unknown");
      // The last upstream error is embedded so failure classification
      // (publicFailureReason) still names the real cause, e.g. "-> 429".
      throw new Error(
        `Swarm drop cap exceeded: ${failures}/${personas.length} personas failed after retries ` +
          `(allowed ${allowed}). Last error: ${lastMsg}`,
      );
    }
    return results.filter((r): r is PersonaReaction => r !== null);
  }
}

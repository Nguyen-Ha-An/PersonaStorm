// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./chatClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chatClient")>();
  return { ...actual, chatCompletion: vi.fn() };
});

import { ProviderNotConfiguredError } from "../../errors";
import { PersonaGenerator } from "../persona/generator";
import { ChatHttpError, chatCompletion } from "./chatClient";
import { FireworksProvider } from "./fireworksProvider";
import { getProvider } from "./index";
import { REACTION_JSON_SCHEMA } from "./prompts";
import { getConfig } from "../../env";

const HOSTED = "https://api.fireworks.ai/inference/v1";
const MODEL = "accounts/fireworks/models/deepseek-v4-flash";

const mk = (over: Partial<ConstructorParameters<typeof FireworksProvider>[0]> = {}) =>
  new FireworksProvider({ apiKey: "fw-key", baseUrl: HOSTED, model: MODEL, ...over });

const VALID_REPLY = JSON.stringify({
  criteria_scores: { price_value: 0.7, need_intensity: 0.6 },
  buy_likelihood: 0.72,
  max_price: 12,
  recommended_pricing_model: "subscription",
  // Numbers the model must never be trusted for — deliberately absurd:
  market_fit_score: 7,
  status: "green",
  qualitative: { first_objection: "price", quote: "sounds useful" },
  research_recommendation: { best_next_test: "survey" },
  reasoning_summary: "fits my workflow",
});

describe("FireworksProvider construction guards", () => {
  test("hosted endpoint without FIREWORKS_API_KEY refuses to construct", () => {
    expect(() => mk({ apiKey: "" })).toThrow(ProviderNotConfiguredError);
  });
  test("missing model refuses to construct", () => {
    expect(() => mk({ model: "" })).toThrow(ProviderNotConfiguredError);
  });
  test("missing base URL refuses to construct", () => {
    expect(() => mk({ baseUrl: "" })).toThrow(ProviderNotConfiguredError);
  });
  test("self-hosted (non-fireworks.ai) endpoint constructs without a key", () => {
    expect(mk({ apiKey: "", baseUrl: "http://localhost:8001/v1" }).name).toBe("fireworks");
  });
});

describe("FireworksProvider.react", () => {
  beforeEach(() => vi.mocked(chatCompletion).mockReset());

  test("sends the reaction schema via Fireworks JSON mode and parses the reply", async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce(VALID_REPLY);
    const { personas } = new PersonaGenerator(7).generate("early_adopters", 1);
    const r = await mk().react(personas[0], "An AI assistant. $12/month.", "product_concept", null, null);

    const opts = vi.mocked(chatCompletion).mock.calls[0][0];
    expect(opts.baseUrl).toBe(HOSTED);
    expect(opts.model).toBe(MODEL);
    expect(opts.temperature).toBe(0.8);
    expect(opts.jsonSchema).toBe(REACTION_JSON_SCHEMA);

    expect(r.persona_id).toBe(personas[0].persona_id);
    expect(r.buy_likelihood).toBe(0.72);
    // market_fit_score/status recomputed server-side, never the model's values.
    expect(r.market_fit_score).toBeGreaterThanOrEqual(0);
    expect(r.market_fit_score).toBeLessThanOrEqual(1);
    expect(r.recommended_pricing_model).toBe("subscription");
  });

  test("non-JSON content raises (counts as a failed persona, never fabricated)", async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce("sorry, I cannot");
    const { personas } = new PersonaGenerator(7).generate("early_adopters", 1);
    await expect(
      mk().react(personas[0], "stim", "product_concept", null, null),
    ).rejects.toThrow(/non-JSON/);
  });

  test("retries a transient 429 and succeeds — one rate limit never kills a storm", async () => {
    vi.mocked(chatCompletion)
      .mockRejectedValueOnce(new ChatHttpError(429, "rate limited"))
      .mockRejectedValueOnce(new ChatHttpError(503, "overloaded"))
      .mockResolvedValueOnce(VALID_REPLY);
    const { personas } = new PersonaGenerator(7).generate("early_adopters", 1);
    const r = await mk({ retryBaseMs: 1 }).react(personas[0], "stim", "product_concept", null, null);
    expect(r.buy_likelihood).toBe(0.72);
    expect(vi.mocked(chatCompletion)).toHaveBeenCalledTimes(3);
  });

  test("exhausted retries surface the transient error", async () => {
    vi.mocked(chatCompletion)
      .mockRejectedValueOnce(new ChatHttpError(429, "rate limited"))
      .mockRejectedValueOnce(new ChatHttpError(429, "rate limited"))
      .mockRejectedValueOnce(new ChatHttpError(429, "rate limited"));
    const { personas } = new PersonaGenerator(7).generate("early_adopters", 1);
    const err = await mk({ retryBaseMs: 1, maxRetries: 3, maxRateLimitRetries: 3 })
      .react(personas[0], "stim", "product_concept", null, null)
      .then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(ChatHttpError);
    expect(String(err)).toMatch(/429/);
    expect(vi.mocked(chatCompletion)).toHaveBeenCalledTimes(3);
  });

  test("non-transient errors (bad key) are NOT retried", async () => {
    vi.mocked(chatCompletion).mockRejectedValueOnce(new ChatHttpError(401, "unauthorized"));
    const { personas } = new PersonaGenerator(7).generate("early_adopters", 1);
    await expect(
      mk({ retryBaseMs: 1 }).react(personas[0], "stim", "product_concept", null, null),
    ).rejects.toThrow(/401/);
    expect(vi.mocked(chatCompletion)).toHaveBeenCalledTimes(1);
  });

  test("429s get extra paced attempts (Retry-After honored) beyond the 5xx budget", async () => {
    vi.mocked(chatCompletion)
      .mockRejectedValueOnce(new ChatHttpError(429, "rate limited", 1))
      .mockRejectedValueOnce(new ChatHttpError(429, "rate limited", 1))
      .mockRejectedValueOnce(new ChatHttpError(429, "rate limited", 1))
      .mockRejectedValueOnce(new ChatHttpError(429, "rate limited", 1))
      .mockResolvedValueOnce(VALID_REPLY);
    const { personas } = new PersonaGenerator(7).generate("early_adopters", 1);
    const r = await mk({ retryBaseMs: 1 }).react(personas[0], "stim", "product_concept", null, null);
    expect(r.buy_likelihood).toBe(0.72);
    expect(vi.mocked(chatCompletion)).toHaveBeenCalledTimes(5); // 5th attempt succeeds
  });
});

describe("FireworksProvider.reactBatch drop tolerance (SWARM_MAX_DROP_FRACTION parity)", () => {
  beforeEach(() => vi.mocked(chatCompletion).mockReset());

  test("a bounded fraction of failed personas is dropped, not fatal", async () => {
    const { personas } = new PersonaGenerator(7).generate("early_adopters", 10);
    // First persona fails non-transiently; the other nine succeed.
    vi.mocked(chatCompletion).mockImplementation(async () => {
      const call = vi.mocked(chatCompletion).mock.calls.length;
      if (call === 1) throw new ChatHttpError(400, "bad request");
      return VALID_REPLY;
    });
    const reactions = await mk({ retryBaseMs: 1, maxDropFraction: 0.1 }).reactBatch(
      personas, "stim", "product_concept", null, 1, null,
    );
    expect(reactions).toHaveLength(9); // 1/10 dropped ≤ 10% cap
  });

  test("exceeding the drop cap fails the storm with the real cause embedded", async () => {
    const { personas } = new PersonaGenerator(7).generate("early_adopters", 10);
    // Fail 3 of 10 (> the 10% cap). Kept to a handful of rejections because
    // vitest's unhandled-rejection detector false-positives on a mock that
    // emits many concurrent rejections, even though every one is caught
    // (the per-persona warn logs show the catches firing).
    vi.mocked(chatCompletion).mockImplementation(async () => {
      const call = vi.mocked(chatCompletion).mock.calls.length;
      if (call <= 3) throw new ChatHttpError(401, "unauthorized");
      return VALID_REPLY;
    });
    const err = await mk({ retryBaseMs: 1, maxDropFraction: 0.1 })
      .reactBatch(personas, "stim", "product_concept", null, 1, null)
      .then(() => null, (e: unknown) => e);
    expect(String(err)).toMatch(/drop cap exceeded/);
    expect(String(err)).toMatch(/401/);
  });
});

describe("getProvider factory", () => {
  test("INFERENCE_PROVIDER=fireworks builds the FireworksProvider", () => {
    const cfg = {
      ...getConfig(),
      inferenceProvider: "fireworks" as const,
      fireworksApiKey: "fw-key",
      fireworksBaseUrl: HOSTED,
      fireworksModel: MODEL,
    };
    expect(getProvider(cfg).name).toBe("fireworks");
  });
  test("mock stays the default", () => {
    const cfg = { ...getConfig(), inferenceProvider: "mock" as const };
    expect(getProvider(cfg).name).toBe("mock");
  });
});

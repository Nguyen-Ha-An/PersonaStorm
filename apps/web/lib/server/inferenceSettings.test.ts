// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getConfig } from "./env";
import {
  inferenceSettingsFromRow,
  resolveEffectiveConfig,
  validateInferenceSettingsBody,
  toInferenceSettingsView,
  inferenceSettingsFromRow as fromRow,
} from "./inferenceSettings";

const env = getConfig();

describe("inferenceSettingsFromRow", () => {
  it("returns env/code defaults when the row is null", () => {
    const s = inferenceSettingsFromRow(null, env);
    expect(s.inferenceProvider).toBe(env.inferenceProvider);
    expect(s.analystProvider).toBe(env.analystProvider);
    expect(s.nvidiaModel).toBe(env.nvidiaModel);
    expect(s.analystModel).toBe(env.analystModel || env.nvidiaModel);
    expect(s.nvidiaMaxTokens).toBe(env.nvidiaMaxTokens);
    expect(s.analystMaxTokens).toBe(env.analystMaxTokens);
    expect(s.id).toBeNull();
  });

  it("takes editable fields from the row when present", () => {
    const s = inferenceSettingsFromRow(
      { id: "row1", inference_provider: "nvidia", analyst_provider: "nvidia", nvidia_model: "some/model", nvidia_max_tokens: 8192, analyst_max_tokens: 8192 },
      env,
    );
    expect(s.inferenceProvider).toBe("nvidia");
    expect(s.analystProvider).toBe("nvidia");
    expect(s.nvidiaModel).toBe("some/model");
    expect(s.nvidiaMaxTokens).toBe(8192);
    expect(s.analystMaxTokens).toBe(8192);
    expect(s.id).toBe("row1");
  });

  it("coerces an invalid provider back to the env default", () => {
    const s = inferenceSettingsFromRow({ inference_provider: "bogus" }, env);
    expect(s.inferenceProvider).toBe(env.inferenceProvider);
  });

  it("falls back analyst_model to nvidia_model when unset", () => {
    const s = inferenceSettingsFromRow({ nvidia_model: "m/x", analyst_model: "" }, env);
    expect(s.analystModel).toBe("m/x");
  });

  it("accepts fireworks providers and the fireworks_model override", () => {
    const s = inferenceSettingsFromRow(
      { inference_provider: "fireworks", analyst_provider: "fireworks", fireworks_model: "accounts/acme/models/m1" },
      env,
    );
    expect(s.inferenceProvider).toBe("fireworks");
    expect(s.analystProvider).toBe("fireworks");
    expect(s.fireworksModel).toBe("accounts/acme/models/m1");
  });

  it("falls back analyst_model to the fireworks model when the analyst runs on fireworks", () => {
    const s = inferenceSettingsFromRow(
      { analyst_provider: "fireworks", fireworks_model: "accounts/acme/models/m1", analyst_model: "" },
      { ...env, analystModel: "" },
    );
    expect(s.analystModel).toBe("accounts/acme/models/m1");
  });
});

describe("orchestrator provider resolution", () => {
  it("defaults to the env orchestrator provider with a matching model", () => {
    const s = inferenceSettingsFromRow({}, { ...env, orchestratorProvider: "fireworks", fireworksOrchestratorModel: "accounts/f/models/x" });
    expect(s.orchestration.orchestratorProvider).toBe("fireworks");
    expect(s.orchestration.orchestratorModel).toBe("accounts/f/models/x");
  });

  it("row can pin the orchestrator to nvidia", () => {
    const s = inferenceSettingsFromRow(
      { orchestrator_provider: "nvidia", orchestrator_model: "nvidia/nemotron-3-ultra-550b-a55b" },
      { ...env, orchestratorProvider: "fireworks" },
    );
    expect(s.orchestration.orchestratorProvider).toBe("nvidia");
    expect(s.orchestration.orchestratorModel).toBe("nvidia/nemotron-3-ultra-550b-a55b");
  });

  it("a stored model from the wrong provider namespace is ignored, not misrouted", () => {
    // Row still holds a Nemotron id but the provider now resolves to fireworks:
    const s = inferenceSettingsFromRow(
      { orchestrator_model: "nvidia/nemotron-3-ultra-550b-a55b" },
      { ...env, orchestratorProvider: "fireworks", fireworksOrchestratorModel: "accounts/f/models/x" },
    );
    expect(s.orchestration.orchestratorModel).toBe("accounts/f/models/x");
  });
});

describe("resolveEffectiveConfig", () => {
  it("with no row equals the env config for the editable fields", async () => {
    const gw = { async getActiveInferenceSettings() { return null; } } as any;
    const eff = await resolveEffectiveConfig(gw, env);
    expect(eff.inferenceProvider).toBe(env.inferenceProvider);
    expect(eff.nvidiaModel).toBe(env.nvidiaModel);
  });

  it("overrides editable fields from the row but keeps key + base_url from env", async () => {
    const gw = {
      async getActiveInferenceSettings() {
        return {
          inference_provider: "nvidia", analyst_provider: "nvidia", nvidia_model: "x/y",
          analyst_model: "a/b", nvidia_max_tokens: 8192, analyst_max_tokens: 8192,
          // a malicious row trying to smuggle secrets must be ignored:
          nvidia_api_key: "nvapi-HACK", nvidia_base_url: "https://evil.example",
        };
      },
    } as any;
    const eff = await resolveEffectiveConfig(gw, env);
    expect(eff.inferenceProvider).toBe("nvidia");
    expect(eff.nvidiaModel).toBe("x/y");
    expect(eff.analystModel).toBe("a/b");
    expect(eff.nvidiaApiKey).toBe(env.nvidiaApiKey);       // NOT the row's key
    expect(eff.nvidiaBaseUrl).toBe(env.nvidiaBaseUrl);     // NOT the row's url
  });
});

describe("validateInferenceSettingsBody", () => {
  const ok = {
    inference_provider: "nvidia", analyst_provider: "mock", nvidia_model: "x/y",
    analyst_model: "", nvidia_max_tokens: 8192, analyst_max_tokens: 8192,
  };
  it("accepts a valid body", () => {
    expect(validateInferenceSettingsBody(ok).nvidia_model).toBe("x/y");
  });
  it("accepts fireworks providers and an optional fireworks_model", () => {
    const v = validateInferenceSettingsBody({
      ...ok,
      inference_provider: "fireworks",
      analyst_provider: "fireworks",
      fireworks_model: " accounts/acme/models/m1 ",
    });
    expect(v.inference_provider).toBe("fireworks");
    expect(v.analyst_provider).toBe("fireworks");
    expect(v.fireworks_model).toBe("accounts/acme/models/m1");
    // Empty fireworks_model means "inherit from env" and must stay valid:
    expect(validateInferenceSettingsBody(ok).fireworks_model).toBe("");
  });
  it("rejects a bad provider", () => {
    expect(() => validateInferenceSettingsBody({ ...ok, inference_provider: "bogus" })).toThrow();
  });
  it("rejects a bad orchestrator_provider", () => {
    expect(() =>
      validateInferenceSettingsBody({ ...ok, orchestration: { orchestrator_provider: "openai" } }),
    ).toThrow();
  });
  it("rejects an empty model", () => {
    expect(() => validateInferenceSettingsBody({ ...ok, nvidia_model: "  " })).toThrow();
  });
  it("rejects non-integer / out-of-range tokens", () => {
    expect(() => validateInferenceSettingsBody({ ...ok, nvidia_max_tokens: 0 })).toThrow();
    expect(() => validateInferenceSettingsBody({ ...ok, analyst_max_tokens: 9_999_999 })).toThrow();
    expect(() => validateInferenceSettingsBody({ ...ok, nvidia_max_tokens: 100.5 })).toThrow();
  });
});

describe("toInferenceSettingsView", () => {
  it("exposes the key-configured boolean but NEVER the key", () => {
    const settings = fromRow(null, env);
    const view = toInferenceSettingsView(settings, { ...env, nvidiaApiKey: "nvapi-SECRET", nvidiaBaseUrl: "https://x/v1" });
    expect(view.nvidia_api_key_configured).toBe(true);
    expect(view.nvidia_base_url).toBe("https://x/v1");
    expect(JSON.stringify(view)).not.toContain("nvapi-SECRET");
  });
  it("reports not-configured when the env key is empty", () => {
    const view = toInferenceSettingsView(fromRow(null, env), { ...env, nvidiaApiKey: "" });
    expect(view.nvidia_api_key_configured).toBe(false);
  });
});

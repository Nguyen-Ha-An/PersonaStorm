// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getConfig } from "./env";
import { inferenceSettingsFromRow } from "./inferenceSettings";

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
});

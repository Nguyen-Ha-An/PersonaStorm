// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildGateway } from "./gateway";
import { getConfig } from "./env";

// With no Supabase env vars, buildGateway() returns the in-memory gateway.
const PATCH = {
  inference_provider: "nvidia",
  analyst_provider: "nvidia",
  nvidia_model: "some/model",
  analyst_model: "some/analyst",
  nvidia_max_tokens: 8192,
  analyst_max_tokens: 8192,
};

describe("gateway inference settings (in-memory)", () => {
  it("returns null before anything is saved", async () => {
    const gw = buildGateway(getConfig());
    expect(await gw.getActiveInferenceSettings()).toBeNull();
  });

  it("persists and round-trips an update", async () => {
    const gw = buildGateway(getConfig());
    const saved = await gw.updateActiveInferenceSettings(PATCH);
    expect(saved.inference_provider).toBe("nvidia");
    expect(saved.nvidia_model).toBe("some/model");
    const read = await gw.getActiveInferenceSettings();
    expect(read?.nvidia_model).toBe("some/model");
    expect(read?.analyst_max_tokens).toBe(8192);
    expect(read?.id).toBeTruthy();
  });
});

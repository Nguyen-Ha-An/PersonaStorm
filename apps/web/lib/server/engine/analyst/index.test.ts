// @vitest-environment node
import { describe, expect, test } from "vitest";
import { getConfig } from "../../env";
import { getAnalyst } from "./index";

const env = getConfig();

describe("getAnalyst provider selection", () => {
  test("mock by default", () => {
    expect(getAnalyst({ ...env, analystProvider: "mock" }).name).toBe("mock");
  });

  test("fireworks with a key yields the fireworks analyst", () => {
    const cfg = {
      ...env,
      analystProvider: "fireworks" as const,
      fireworksApiKey: "fw-key",
      fireworksBaseUrl: "https://api.fireworks.ai/inference/v1",
    };
    expect(getAnalyst(cfg).name).toBe("fireworks");
  });

  test("fireworks on the hosted endpoint without a key falls back to mock (never a hard failure)", () => {
    const cfg = {
      ...env,
      analystProvider: "fireworks" as const,
      fireworksApiKey: "",
      fireworksBaseUrl: "https://api.fireworks.ai/inference/v1",
    };
    expect(getAnalyst(cfg).name).toBe("mock");
  });

  test("nvidia path still selectable", () => {
    const cfg = {
      ...env,
      analystProvider: "nvidia" as const,
      nvidiaApiKey: "nvapi-x",
      nvidiaBaseUrl: "https://integrate.api.nvidia.com/v1",
    };
    expect(getAnalyst(cfg).name).toBe("nvidia");
  });
});

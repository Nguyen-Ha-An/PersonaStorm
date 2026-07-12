/**
 * Provider factory — maps INFERENCE_PROVIDER to code. Port of
 * apps/api/app/services/inference/factory.py (mock + fireworks + nvidia; vLLM
 * omitted from the Vercel runtime since it targets a self-hosted GPU endpoint).
 * fireworks is the real prototype's inference API; nvidia is a
 * reference/testing path.
 */

import type { ServerConfig } from "../../env";
import type { AssumptionLedger } from "../criteria/assumptions";
import { FireworksProvider } from "./fireworksProvider";
import { MockPersonaProvider } from "./mockProvider";
import { NvidiaProvider } from "./nvidiaProvider";
import type { PersonaInferenceProvider } from "./types";

export function getProvider(cfg: ServerConfig, ledger?: AssumptionLedger): PersonaInferenceProvider {
  if (cfg.inferenceProvider === "fireworks") {
    return new FireworksProvider({
      apiKey: cfg.fireworksApiKey,
      baseUrl: cfg.fireworksBaseUrl,
      model: cfg.fireworksModel,
      maxTokens: cfg.fireworksMaxTokens,
      maxDropFraction: cfg.swarmMaxDropFraction,
    });
  }
  if (cfg.inferenceProvider === "nvidia") {
    return new NvidiaProvider({
      apiKey: cfg.nvidiaApiKey,
      baseUrl: cfg.nvidiaBaseUrl,
      model: cfg.nvidiaModel,
      maxTokens: cfg.nvidiaMaxTokens,
    });
  }
  return new MockPersonaProvider(cfg.personaSeed, ledger);
}

export type { PersonaInferenceProvider } from "./types";

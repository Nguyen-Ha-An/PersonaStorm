/**
 * Provider factory — maps INFERENCE_PROVIDER to code. Port of
 * apps/api/app/services/inference/factory.py (mock + nvidia; vLLM omitted from
 * the Vercel runtime since it targets a self-hosted GPU endpoint).
 */

import type { ServerConfig } from "../../env";
import type { AssumptionLedger } from "../criteria/assumptions";
import { MockPersonaProvider } from "./mockProvider";
import { NvidiaProvider } from "./nvidiaProvider";
import type { PersonaInferenceProvider } from "./types";

export function getProvider(cfg: ServerConfig, ledger?: AssumptionLedger): PersonaInferenceProvider {
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

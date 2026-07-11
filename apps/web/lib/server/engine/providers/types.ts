import type { Persona, PersonaReaction } from "../types";
import type { StimulusFeatures } from "../stimulusParser";
import type { SemanticMatrix } from "../semantic/types";

/**
 * Inference provider abstraction — THE swap point. Route handlers and the storm
 * engine only ever see this interface; whether reactions come from the local
 * mock or an NVIDIA-hosted model is decided by INFERENCE_PROVIDER.
 */
export interface PersonaInferenceProvider {
  readonly name: string;
  react(
    persona: Persona,
    stimulus: string,
    stimulusType: string,
    features: StimulusFeatures | null,
    category: string | null,
    semantic?: SemanticMatrix | null,
  ): Promise<PersonaReaction>;
  reactBatch(
    personas: Persona[],
    stimulus: string,
    stimulusType: string,
    features: StimulusFeatures | null,
    concurrency: number,
    category: string | null,
    semantic?: SemanticMatrix | null,
  ): Promise<PersonaReaction[]>;
}

/** Bounded-concurrency fan-out over `react()` — shared default batching. */
export async function reactBatchDefault(
  provider: PersonaInferenceProvider,
  personas: Persona[],
  stimulus: string,
  stimulusType: string,
  features: StimulusFeatures | null,
  concurrency: number,
  category: string | null,
  semantic: SemanticMatrix | null = null,
): Promise<PersonaReaction[]> {
  const results = new Array<PersonaReaction>(personas.length);
  let next = 0;
  const limit = Math.max(1, concurrency);
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= personas.length) return;
      results[i] = await provider.react(personas[i], stimulus, stimulusType, features, category, semantic);
    }
  }
  const workers = Array.from({ length: Math.min(limit, personas.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

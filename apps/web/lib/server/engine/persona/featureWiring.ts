/**
 * Declares, per persona field, whether it influences MOCK scoring or is
 * display flavor (spec §9). In the LLM path the full persona JSON enters the
 * prompt, so everything is "prompt" there. The counterfactual audit uses this
 * to report inert-field pairs as not_applicable instead of a fake "pass" —
 * in mock mode 4 of the 5 audited fields are inert (only life_stage scores).
 */
export type MockRole = "scoring" | "flavor";

export const PERSONA_FEATURE_WIRING: Record<string, { mock: MockRole; llm: "prompt" }> = {
  region: { mock: "flavor", llm: "prompt" },
  occupation: { mock: "flavor", llm: "prompt" },
  income_band: { mock: "flavor", llm: "prompt" }, // label only; monthly_budget_usd is the scoring value
  research_style: { mock: "flavor", llm: "prompt" },
  buying_trigger: { mock: "flavor", llm: "prompt" },
  life_stage: { mock: "scoring", llm: "prompt" }, // overlays + lambda bump
  "decision_context.budget_control": { mock: "flavor", llm: "prompt" }, // needs_parent_approval/attention_span score; budget_control does not
};

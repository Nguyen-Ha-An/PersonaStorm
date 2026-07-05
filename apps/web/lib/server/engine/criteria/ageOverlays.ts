/**
 * Age / life-stage overlay criteria — port of
 * apps/api/app/services/criteria/age_overlays.py. On import, overlay criteria
 * are registered into the shared registry so the scorer can look up polarity.
 */

import { register, type Criterion } from "./registry";

export const LIFE_STAGES: readonly string[] = [
  "teen_student",
  "student_young_adult",
  "early_career",
  "parent_family",
  "established_adult",
  "older_adult",
];

// Inclusive (low, high) age bands. older_adult has no upper bound.
const AGE_BANDS: [string, number, number][] = [
  ["teen_student", 13, 17],
  ["student_young_adult", 18, 24],
  ["early_career", 25, 34],
  ["parent_family", 35, 44],
  ["established_adult", 45, 60],
  ["older_adult", 61, Infinity],
];

const LAMBDA_BUMP: Record<string, number> = {
  teen_student: 0.08,
  older_adult: 0.06,
  parent_family: 0.03,
};

const BARRIER_IDS = new Set(["safety_concern", "subscription_fatigue"]);

type OverlayDef = [id: string, label: string, desc: string];

const OVERLAY_DEFS: Record<string, OverlayDef[]> = {
  teen_student: [
    ["parent_approval", "Parent Approval", "How likely parents/guardians are to approve of this."],
    ["peer_influence", "Peer Influence", "How much friends/peers shape this teen's adoption decision."],
    ["trend_alignment", "Trend Alignment", "How aligned the product feels with current trends among teens."],
    ["school_relevance", "School Relevance", "How relevant the product is to school life/schoolwork."],
    ["allowance_affordability", "Allowance Affordability", "How affordable the product is on a teen's allowance/pocket money."],
    ["identity_fit", "Identity Fit", "How well the product fits the teen's sense of identity/self-image."],
    ["attention_fit", "Attention Fit", "How well the product fits a teen's attention span and usage habits."],
    ["safety_concern", "Safety Concern", "How much safety worry the product raises for a teen or their parents (barrier)."],
  ],
  student_young_adult: [
    ["budget_fit", "Budget Fit", "How well the price fits a student/young adult's limited budget."],
    ["trialability", "Trialability", "How easy it is to try before committing."],
    ["creator_influence", "Creator Influence", "How much creators/influencers shape this persona's decision."],
    ["identity_signal", "Identity Signal", "How much using the product signals who this persona is/wants to be."],
    ["self_improvement_value", "Self-Improvement Value", "How much the product supports personal growth/self-improvement."],
    ["future_benefit", "Future Benefit", "How much the product is seen as an investment in future outcomes."],
    ["social_validation", "Social Validation", "How much social approval/validation using the product brings."],
  ],
  early_career: [
    ["career_value", "Career Value", "How much the product helps advance this persona's career."],
    ["productivity_gain", "Productivity Gain", "How much measurable productivity the product provides."],
    ["time_saving", "Time Saving", "How much time the product saves in day-to-day work."],
    ["professional_credibility", "Professional Credibility", "How much the product enhances professional credibility."],
    ["subscription_fatigue", "Subscription Fatigue", "How much fatigue/resistance exists toward yet another subscription (barrier)."],
    ["workflow_fit", "Workflow Fit", "How naturally does it fit current habits/workflow?"],
  ],
  parent_family: [
    ["family_value", "Family Value", "How much value the product brings to the whole family."],
    ["child_safety", "Child Safety", "How safe the product is for the persona's children."],
    ["household_budget_fit", "Household Budget Fit", "How well the product fits a household budget with family expenses."],
    ["convenience", "Convenience", "How much time/effort the product saves for a busy parent."],
    ["reliability", "Reliability", "How dependable/consistent the product is for family use."],
    ["outcome_proof", "Outcome Proof", "How much proven, concrete outcomes the product can demonstrate."],
  ],
  established_adult: [
    ["simplicity", "Simplicity", "How simple and uncomplicated the product is to use."],
    ["brand_credibility", "Brand Credibility", "How credible/established the brand feels."],
    ["support_availability", "Support Availability", "How available and responsive support is when needed."],
    ["risk_reduction", "Risk Reduction", "How much the product reduces perceived risk of a bad decision."],
    ["familiarity", "Familiarity", "How familiar/recognizable the product or its patterns are."],
    ["low_learning_curve", "Low Learning Curve", "How little effort is required to learn to use the product."],
  ],
  older_adult: [
    ["ease_of_use", "Ease of Use", "How easy the product is to operate without assistance."],
    ["safety", "Safety", "How safe the product feels to use."],
    ["human_support", "Human Support", "How available real human help/support is."],
    ["familiarity", "Familiarity", "How familiar/recognizable the product or its patterns are."],
    ["low_setup_friction", "Low Setup Friction", "How little friction there is to get started/set up."],
    ["trust_in_provider", "Trust in Provider", "How much this persona trusts the company/provider behind the product."],
  ],
};

const OVERLAY_IDS_BY_STAGE: Record<string, string[]> = Object.fromEntries(
  Object.entries(OVERLAY_DEFS).map(([stage, defs]) => [stage, defs.map(([cid]) => cid)]),
);

export function lifeStageFor(age: number): string {
  for (const [stage, low, high] of AGE_BANDS) {
    if (age >= low && age <= high) return stage;
  }
  return LIFE_STAGES[0];
}

export function overlayIdsFor(lifeStage: string): string[] {
  return OVERLAY_IDS_BY_STAGE[lifeStage] ?? [];
}

export function lambdaBump(lifeStage: string): number {
  return LAMBDA_BUMP[lifeStage] ?? 0.0;
}

function buildCriteria(): Criterion[] {
  const criteria: Criterion[] = [];
  for (const defs of Object.values(OVERLAY_DEFS)) {
    for (const [cid, label, desc] of defs) {
      criteria.push({
        id: cid,
        label,
        description: desc,
        higherIsBetter: !BARRIER_IDS.has(cid),
        group: "age_overlay",
      });
    }
  }
  return criteria;
}

register(buildCriteria());

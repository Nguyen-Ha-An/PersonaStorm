import "./only";

/**
 * Billing / pricing — port of apps/api/app/services/billing.py.
 * Single source of truth for how a run is priced:
 *   total = base_run_credits
 *         + ceil(persona_count / 100) * credits_per_100_personas
 *         + (analyst_report_credits if include_analyst_report)
 * Reference (default 10 / 5 / 5): 100→20, 250→30, 500→40, 1000→65.
 */

import type { Gateway } from "./gateway";

export interface PricingRule {
  base_run_credits: number;
  credits_per_100_personas: number;
  analyst_report_credits: number;
  name: string;
  id: string | null;
}

export function pricingRuleFromRow(row: Record<string, any> | null): PricingRule {
  if (!row) return { base_run_credits: 10, credits_per_100_personas: 5, analyst_report_credits: 5, name: "Default", id: null };
  return {
    base_run_credits: Number(row.base_run_credits ?? 10),
    credits_per_100_personas: Number(row.credits_per_100_personas ?? 5),
    analyst_report_credits: Number(row.analyst_report_credits ?? 5),
    name: String(row.name ?? "Default"),
    id: row.id ?? null,
  };
}

export interface PriceQuote {
  persona_count: number;
  include_analyst_report: boolean;
  base_run_credits: number;
  credits_per_100_personas: number;
  analyst_report_credits: number;
  total_credits: number;
}

export function quotePrice(rule: PricingRule, personaCount: number, includeAnalystReport = true): PriceQuote {
  if (personaCount <= 0) throw new Error("persona_count must be positive");
  const personaComponent = Math.ceil(personaCount / 100) * rule.credits_per_100_personas;
  const analystComponent = includeAnalystReport ? rule.analyst_report_credits : 0;
  const total = rule.base_run_credits + personaComponent + analystComponent;
  return {
    persona_count: personaCount,
    include_analyst_report: includeAnalystReport,
    base_run_credits: rule.base_run_credits,
    credits_per_100_personas: rule.credits_per_100_personas,
    analyst_report_credits: includeAnalystReport ? rule.analyst_report_credits : 0,
    total_credits: total,
  };
}

export async function getPricingRule(gateway: Gateway): Promise<PricingRule> {
  const row = await gateway.getActivePricing();
  return pricingRuleFromRow(row);
}

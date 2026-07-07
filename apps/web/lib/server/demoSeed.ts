import "./only";

/**
 * Public demo storm — a single pre-baked run (the PersonaPilot AI-SaaS concept)
 * that anonymous visitors watch and read WITHOUT signing up. Seeded once,
 * idempotently, with a FIXED seed in the offline mock provider so the run is
 * deterministic and carries the derived verdict + top actions. The row is
 * flagged is_demo=true, which the store's ownership check bypasses for anyone.
 */

import { DEMO_STORM_ID } from "./demo";
import { getConfig, type ServerConfig } from "./env";
import { buildGateway, type Gateway } from "./gateway";
import { runStorm } from "./stormEngine";

const DEMO_SEED = 424242;

const DEMO_STIMULUS = `PersonaPilot — an AI copilot for small-business operations.

PersonaPilot plugs into the tools an SMB already runs (email, calendar, QuickBooks, Slack) and acts as a always-on operations assistant: it drafts customer replies, chases overdue invoices, reconciles expenses, and turns a plain-English request ("who hasn't paid this month?") into an answer with the receipts.

How it works: connect an account in two clicks, PersonaPilot learns your workflows from the last 90 days, and starts proposing actions you approve with one tap. Nothing is sent without your sign-off.

Pricing:
- Starter — $0 for 14 days, then $29/mo (1 seat, 200 actions/mo)
- Team — $89/mo (5 seats, unlimited actions, shared inbox)
- Business — $249/mo (SSO, audit log, priority support)

Trust & proof: SOC 2 Type II in progress (report expected Q3). Data encrypted in transit and at rest; you can delete your workspace and all learned context at any time. Used by 340+ small teams in early access; average of 6 hours/week saved per operator in our pilot cohort.

Why now: SMBs can't afford a full-time ops hire, and generic chatbots don't touch the systems where the work actually lives. PersonaPilot is the copilot that does.`;

const DEMO_INPUT = {
  stormId: DEMO_STORM_ID,
  title: "PersonaPilot — AI copilot for SMB operations",
  stimulus: DEMO_STIMULUS,
  stimulusType: "product_concept",
  targetMarket: "us_smb",
  customSegmentDescription: null as string | null,
  productCategory: null as string | null,
  personaCount: 1000,
  seed: DEMO_SEED,
};

/**
 * Idempotently ensure the demo storm exists and is complete. Safe to call on
 * every `/demo` request: it runs the engine only when the row is missing or
 * incomplete, and returns false (never throws) if seeding fails so callers can
 * degrade gracefully to "demo unavailable".
 */
export async function ensureDemoStorm(
  gateway: Gateway = buildGateway(),
  cfg: ServerConfig = getConfig(),
): Promise<boolean> {
  try {
    const existing = await gateway.getStorm(DEMO_STORM_ID);
    if (existing && existing.status === "complete" && existing.report_json) return true;

    const result = await runStorm(DEMO_INPUT, cfg);

    if (!existing) {
      await gateway.recordStorm({
        id: DEMO_STORM_ID,
        user_id: null,
        is_demo: true,
        title: DEMO_INPUT.title,
        stimulus_type: DEMO_INPUT.stimulusType,
        target_market: DEMO_INPUT.targetMarket,
        product_category: null,
        persona_count: DEMO_INPUT.personaCount,
        status: "running",
        price_credits: 0,
      });
    }

    await gateway.updateStorm(DEMO_STORM_ID, {
      is_demo: true,
      status: "complete",
      completed_at: new Date().toISOString(),
      report_json: result.report,
      reactions_json: { reactions: result.reactions, progress: result.progress },
    });
    return true;
  } catch (err) {
    console.error("[personastorm demo] seed failed:", (err as Error).message);
    return false;
  }
}

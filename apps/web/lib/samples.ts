/**
 * One-click demo inputs (mirrored in data/sample_inputs/). Real demo texts —
 * each exercises different parser signals (pricing, proof, trial, AI framing).
 */

import type { StimulusType, TargetMarket } from "./types";

export interface SampleInput {
  name: string;
  title: string;
  stimulus_type: StimulusType;
  target_market: TargetMarket;
  stimulus: string;
}

export const SAMPLES: SampleInput[] = [
  {
    name: "Family app concept",
    title: "MealPilot",
    stimulus_type: "product_concept",
    target_market: "parents",
    stimulus:
      "MealPilot is an AI meal planning app for busy families. It builds a weekly dinner plan around your kids' allergies, auto-generates a grocery list, and syncs with Instacart. Pricing: $12/month after a 14-day free trial. Cancel anytime. Used by 4,000 families; average family saves 3 hours a week.",
  },
  {
    name: "SaaS landing page",
    title: "InboxZeroed",
    stimulus_type: "landing_page",
    target_market: "us_smb",
    stimulus:
      "InboxZeroed — Your support inbox, answered before you wake up.\n\nOur AI drafts replies to every customer email using your past answers, your docs, and your tone. You approve, it sends. Nothing goes out without a human click.\n\n• Connects to Gmail and Outlook in 4 minutes\n• Learns from your last 1,000 conversations\n• SOC2 Type II, data never used for training\n\nTrusted by 900 small teams. \"We cut first-response time from 9 hours to 40 minutes\" — Dana K., 8-person ecommerce brand.\n\nStart free — 50 drafts/month. Pro: $39/month per inbox.",
  },
  {
    name: "Consumer ad",
    title: "Loop Earplugs ad",
    stimulus_type: "ad",
    target_market: "sea_genz",
    stimulus:
      "POV: the party is loud but your head isn't. 🎧 Quiet 2 earplugs drop the noise, keep the music. 26 dB filter, reusable, comes in 8 colors. As seen on 40,000 TikToks. $24.95, free shipping over $35.",
  },
  {
    name: "Pricing table",
    title: "DataForge pricing",
    stimulus_type: "pricing_table",
    target_market: "enterprise",
    stimulus:
      "DataForge — pipeline observability for data teams.\n\nStarter: $99/month — 5 pipelines, 7-day retention, email alerts.\nTeam: $499/month — 50 pipelines, 30-day retention, Slack + PagerDuty, RBAC.\nEnterprise: custom — unlimited pipelines, SSO/SAML, SOC2 report, dedicated support, on-prem option.\n\nAnnual billing saves 20%. All plans include unlimited seats.",
  },
];

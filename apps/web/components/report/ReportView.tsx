import { Card, SectionRule } from "@/components/ui";
import { InsightCard } from "@/components/ui/InsightCard";
import { MarketFitHero } from "./MarketFitHero";
import { TrustPanel } from "./TrustPanel";
import { BlockerCards } from "./BlockerCards";
import { StrengthCards } from "./StrengthCards";
import { CriteriaRadar } from "./CriteriaRadar";
import { CriteriaBreakdown } from "./CriteriaBreakdown";
import { TrustProofPanel } from "./TrustProofPanel";
import { DifferentiationPanel } from "./DifferentiationPanel";
import { PricingFitPanel } from "./PricingFitPanel";
import { WorkflowFitPanel } from "./WorkflowFitPanel";
import { PriceCurve } from "./PriceCurve";
import { SegmentHeatmap } from "./SegmentHeatmap";
import { AgeCohortBreakdown } from "./AgeCohortBreakdown";
import { ObjectionsTable } from "./ObjectionsTable";
import { KillQuoteCard } from "./KillQuoteCard";
import { Recommendations } from "./Recommendations";
import { NextValidationPanel } from "./NextValidationPanel";
import { VerdictBanner } from "./VerdictBanner";
import { TopActions } from "./TopActions";
import { AtAGlance } from "./AtAGlance";
import { deriveVerdict, selectTopActions, type DerivableReport } from "@/lib/server/engine/verdict";
import type { StormReport } from "@/lib/types";

/**
 * The complete verdict-first report body — verdict, KPIs, and top-3 actions on
 * top, then the six-tier "Full diagnostics" with scroll anchors. Shared by the
 * authenticated report page and the public demo so both render identically.
 *
 * Prefers the server-persisted verdict/actions; recomputes them client-side for
 * any legacy run generated before the derivation shipped (identical output).
 */
export function ReportView({ report }: { report: StormReport }) {
  const verdict = report.verdict ?? deriveVerdict(report as unknown as DerivableReport);
  const topActions = report.top_actions ?? selectTopActions(report as unknown as DerivableReport);

  return (
    <div className="space-y-8">
      {/* Verdict-first — the answer, the KPIs, and what to fix, before the depth */}
      <div className="space-y-4">
        <VerdictBanner verdict={verdict} />
        <AtAGlance report={report} />
        <TopActions actions={topActions} />
      </div>

      <SectionRule>Full diagnostics</SectionRule>
      <div id="full-diagnostics" className="scroll-mt-24 space-y-8">
        {/* Tier 1 — hero + the narrative read + calibration */}
        <div className="space-y-4">
          <MarketFitHero report={report} />
          <InsightCard title="Executive summary" tone="insight">
            {report.summary}
          </InsightCard>
          <div id="quality" className="scroll-mt-24">
            <TrustPanel report={report} />
          </div>
        </div>

        {/* Tier 2 — what's driving (or blocking) adoption */}
        <div className="space-y-4">
          <SectionRule>What's driving adoption</SectionRule>
          <BlockerCards report={report} />
          <StrengthCards report={report} />
        </div>

        {/* Tier 3 — criteria diagnosis */}
        <div className="space-y-4">
          <SectionRule>Criteria diagnosis</SectionRule>
          <div className="grid gap-6 lg:grid-cols-2">
            <CriteriaRadar report={report} />
            <div id="criteria" className="scroll-mt-24">
              <CriteriaBreakdown report={report} />
            </div>
          </div>
        </div>

        {/* Tier 4 — criterion deep-dives, merged into one denser grid */}
        <div className="space-y-4">
          <SectionRule>Criterion deep-dives</SectionRule>
          <Card>
            <div className="grid gap-5 p-5 sm:grid-cols-2 xl:grid-cols-4">
              <div id="trust" className="scroll-mt-24">
                <TrustProofPanel report={report} />
              </div>
              <div id="differentiation" className="scroll-mt-24">
                <DifferentiationPanel report={report} />
              </div>
              <div id="pricing" className="scroll-mt-24">
                <PricingFitPanel report={report} />
              </div>
              <WorkflowFitPanel report={report} />
            </div>
          </Card>
        </div>

        {/* Tier 5 — evidence */}
        <div className="space-y-4">
          <SectionRule>Evidence</SectionRule>
          <div id="price-curve" className="scroll-mt-24">
            <PriceCurve report={report} />
          </div>
          <div id="segments" className="scroll-mt-24">
            <SegmentHeatmap report={report} />
          </div>
          <AgeCohortBreakdown report={report} />
          <div id="objections" className="scroll-mt-24">
            <ObjectionsTable report={report} />
          </div>
          <KillQuoteCard report={report} />
        </div>

        {/* Tier 6 — next steps (the "next validation" hand-off to fieldwork) */}
        <div className="space-y-4">
          <SectionRule>Next steps</SectionRule>
          <Recommendations report={report} />
          <div id="next-validation" className="scroll-mt-24">
            <NextValidationPanel report={report} />
          </div>
        </div>
      </div>
    </div>
  );
}

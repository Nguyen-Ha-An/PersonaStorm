import { MetricCard } from "@/components/ui";
import type { StormReport } from "@/lib/types";
import { formatPercent } from "@/lib/format";

/**
 * Four scannable KPIs directly under the verdict. Every tile degrades
 * independently: any missing source renders "—" rather than breaking the strip.
 */
export function AtAGlance({ report }: { report: StormReport }) {
  const adoption = report.adoption;
  const total = adoption.green + adoption.yellow + adoption.red;
  const marketFit = report.overall?.market_fit_score;
  const intentShare = total > 0 ? adoption.green / total : null;
  const objection = report.top_objections?.[0];
  const wtp = report.avg_max_price;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard label="Market fit" tone="cyan" value={typeof marketFit === "number" ? formatPercent(marketFit) : "—"} />
      <MetricCard label="Buy intent" tone="green" value={intentShare !== null ? formatPercent(intentShare) : "—"} />
      <MetricCard
        label="Top objection"
        tone="red"
        value={objection ? formatPercent(objection.share) : "—"}
        sub={objection ? objection.label : undefined}
      />
      <MetricCard label="Willing to pay" value={typeof wtp === "number" ? `~$${Math.round(wtp)}` : "—"} />
    </div>
  );
}

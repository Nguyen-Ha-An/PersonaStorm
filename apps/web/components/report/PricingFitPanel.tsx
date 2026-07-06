import type { StormReport } from "@/lib/types";
import { byId } from "./criteria-helpers";
import { CriterionStat } from "./CriterionStat";

/** Whether the price is acceptable and the ROI feels worth it. */
export function PricingFitPanel({ report }: { report: StormReport }) {
  const criteria = report.criteria_breakdown;
  const pricing = byId(criteria, "pricing_acceptance");
  const roi = byId(criteria, "perceived_roi");
  if (!pricing && !roi) return null;

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-storm-800/70 bg-storm-900/40 p-4">
      <div>
        <p className="text-sm font-semibold text-storm-100">Pricing fit</p>
        <p className="text-xs text-storm-400">Avg. WTP ${report.avg_max_price.toFixed(2)}</p>
      </div>
      <CriterionStat criterion={pricing} labelOverride="Pricing acceptance" />
      <CriterionStat criterion={roi} labelOverride="Perceived ROI" />
      <div className="flex items-center justify-between rounded-lg border border-storm-800 bg-storm-850 px-3.5 py-3">
        <p className="text-xs font-semibold text-storm-200">Avg. max price</p>
        <span className="text-base font-semibold text-storm-100">${report.avg_max_price.toFixed(2)}</span>
      </div>
    </div>
  );
}

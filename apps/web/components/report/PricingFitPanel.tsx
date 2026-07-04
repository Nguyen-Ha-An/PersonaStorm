import { Card, CardHeader } from "@/components/ui";
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
    <Card>
      <CardHeader
        title="Pricing fit"
        hint={`avg WTP $${report.avg_max_price.toFixed(2)}`}
      />
      <div className="space-y-2.5 p-4">
        <CriterionStat criterion={pricing} labelOverride="Pricing acceptance" />
        <CriterionStat criterion={roi} labelOverride="Perceived ROI" />
        <div className="flex items-center justify-between rounded-lg border border-storm-800 bg-storm-850 px-3.5 py-3">
          <p className="text-xs font-semibold text-storm-200">Avg max price</p>
          <span className="font-mono text-lg font-bold text-white">
            ${report.avg_max_price.toFixed(2)}
          </span>
        </div>
      </div>
    </Card>
  );
}

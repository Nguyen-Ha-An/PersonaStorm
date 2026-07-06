import type { StormReport } from "@/lib/types";
import { byId } from "./criteria-helpers";
import { CriterionStat } from "./CriterionStat";

/** Does it feel meaningfully different from what buyers already use? */
export function DifferentiationPanel({ report }: { report: StormReport }) {
  const diff = byId(report.criteria_breakdown, "differentiation");
  if (!diff) return null;

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-storm-800/70 bg-storm-900/40 p-4">
      <div>
        <p className="text-sm font-semibold text-storm-100">Differentiation</p>
        <p className="text-xs text-storm-400">Vs. alternatives</p>
      </div>
      <CriterionStat criterion={diff} labelOverride="Feels different" />
    </div>
  );
}

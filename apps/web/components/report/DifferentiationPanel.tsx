import { Card, CardHeader } from "@/components/ui";
import type { StormReport } from "@/lib/types";
import { byId } from "./criteria-helpers";
import { CriterionStat } from "./CriterionStat";

/** Does it feel meaningfully different from what buyers already use? */
export function DifferentiationPanel({ report }: { report: StormReport }) {
  const diff = byId(report.criteria_breakdown, "differentiation");
  if (!diff) return null;

  return (
    <Card>
      <CardHeader title="Differentiation" hint="vs. alternatives" />
      <div className="p-4">
        <CriterionStat criterion={diff} labelOverride="Feels different" />
      </div>
    </Card>
  );
}

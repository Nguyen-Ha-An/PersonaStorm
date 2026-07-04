import { Card, CardHeader } from "@/components/ui";
import type { StormReport } from "@/lib/types";
import { byId } from "./criteria-helpers";
import { CriterionStat } from "./CriterionStat";

/** Whether it slots into existing habits and buyers will actually stick. */
export function WorkflowFitPanel({ report }: { report: StormReport }) {
  const criteria = report.criteria_breakdown;
  const workflow = byId(criteria, "workflow_fit");
  const activation = byId(criteria, "activation_likelihood");
  const switching = byId(criteria, "switching_willingness");
  const repeat = byId(criteria, "repeat_usage_potential");
  if (!workflow && !activation && !switching && !repeat) return null;

  return (
    <Card>
      <CardHeader title="Workflow & retention" hint="habit fit" />
      <div className="grid gap-2.5 p-4 sm:grid-cols-2">
        <CriterionStat criterion={workflow} labelOverride="Workflow fit" />
        <CriterionStat criterion={activation} labelOverride="Activation likelihood" />
        <CriterionStat criterion={switching} labelOverride="Switching willingness" />
        <CriterionStat criterion={repeat} labelOverride="Repeat usage potential" />
      </div>
    </Card>
  );
}

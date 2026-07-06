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
    <div className="flex flex-col gap-2.5 rounded-lg border border-storm-800/70 bg-storm-900/40 p-4">
      <div>
        <p className="text-sm font-semibold text-storm-100">Workflow &amp; retention</p>
        <p className="text-xs text-storm-400">Habit fit</p>
      </div>
      <CriterionStat criterion={workflow} labelOverride="Workflow fit" />
      <CriterionStat criterion={activation} labelOverride="Activation likelihood" />
      <CriterionStat criterion={switching} labelOverride="Switching willingness" />
      <CriterionStat criterion={repeat} labelOverride="Repeat usage potential" />
    </div>
  );
}

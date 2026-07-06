import type { StormReport } from "@/lib/types";
import { byId } from "./criteria-helpers";
import { CriterionStat } from "./CriterionStat";

/** Trust + the proof buyers demand before they'll believe the claims. */
export function TrustProofPanel({ report }: { report: StormReport }) {
  const criteria = report.criteria_breakdown;
  const trust = byId(criteria, "trust");
  const proof = byId(criteria, "proof_requirement");
  if (!trust && !proof) return null;

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-storm-800/70 bg-storm-900/40 p-4">
      <div>
        <p className="text-sm font-semibold text-storm-100">Trust &amp; proof</p>
        <p className="text-xs text-storm-400">Believability</p>
      </div>
      <CriterionStat criterion={trust} labelOverride="Trust in claims" />
      <CriterionStat criterion={proof} labelOverride="Proof requirement" />
    </div>
  );
}

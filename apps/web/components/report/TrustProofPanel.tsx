import { Card, CardHeader } from "@/components/ui";
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
    <Card>
      <CardHeader title="Trust & proof" hint="believability" />
      <div className="space-y-2.5 p-4">
        <CriterionStat criterion={trust} labelOverride="Trust in claims" />
        <CriterionStat criterion={proof} labelOverride="Proof requirement" />
      </div>
    </Card>
  );
}

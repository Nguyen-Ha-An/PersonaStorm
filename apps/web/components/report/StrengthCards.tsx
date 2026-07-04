import { Card, CardHeader } from "@/components/ui";
import type { StormReport } from "@/lib/types";
import { pct } from "./criteria-helpers";

/**
 * The "what to lead with" answer: the strongest criteria (assets to amplify).
 * `strongest_criteria` is barrier-aware, so these always render green-toned.
 */
export function StrengthCards({ report }: { report: StormReport }) {
  const strengths = (report.strongest_criteria ?? []).slice(0, 5);
  if (strengths.length === 0) return null;

  return (
    <Card className="border-signal-green/25">
      <CardHeader title="Strengths to lead with" hint="ranked by weight × strength" />
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {strengths.map((s) => (
          <div
            key={s.criterion_id}
            className="flex flex-col rounded-lg border border-signal-green/30 bg-gradient-to-br from-signal-green/8 to-storm-900 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold leading-snug text-white">{s.label}</p>
              <span className="shrink-0 font-mono text-lg font-bold text-signal-green">
                {pct(s.average_score)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-storm-400">
              <span>weight {pct(s.weight)}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-storm-300">{s.interpretation}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

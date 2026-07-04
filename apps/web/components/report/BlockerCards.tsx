import { Card, CardHeader } from "@/components/ui";
import type { StormReport } from "@/lib/types";
import { pct } from "./criteria-helpers";

/**
 * The "what's blocking adoption" answer: the 3 highest-impact weaknesses.
 * `weakest_criteria` is already barrier-aware (weakest = worst for adoption
 * regardless of polarity), so these always render as red-toned warnings.
 */
export function BlockerCards({ report }: { report: StormReport }) {
  const blockers = (report.weakest_criteria ?? []).slice(0, 3);
  if (blockers.length === 0) return null;

  return (
    <Card className="border-signal-red/30">
      <CardHeader title="Top 3 adoption blockers" hint="ranked by weight × deficit" />
      <div className="grid gap-3 p-5 md:grid-cols-3">
        {blockers.map((b, i) => (
          <div
            key={b.criterion_id}
            className="relative flex flex-col overflow-hidden rounded-lg border border-signal-red/40 bg-gradient-to-br from-signal-red/10 to-storm-900 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal-red">
                blocker #{i + 1}
              </span>
              <span className="font-mono text-xs text-storm-400">
                weight {pct(b.weight)}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold leading-snug text-white">{b.label}</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="font-mono text-2xl font-bold text-signal-red">
                {pct(b.average_score)}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-storm-400">
                raw score
              </span>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-storm-300">{b.interpretation}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

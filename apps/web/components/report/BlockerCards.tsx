import { InsightCard } from "@/components/ui/InsightCard";
import type { StormReport } from "@/lib/types";
import { formatPercent } from "@/lib/format";

/**
 * The "what's blocking adoption" answer: the 3 highest-impact weaknesses.
 * `weakest_criteria` is already barrier-aware (weakest = worst for adoption
 * regardless of polarity), so these always render as danger-toned warnings.
 */
export function BlockerCards({ report }: { report: StormReport }) {
  const blockers = (report.weakest_criteria ?? []).slice(0, 3);
  if (blockers.length === 0) return null;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {blockers.map((b, i) => (
        <InsightCard
          key={b.criterion_id}
          tone="danger"
          icon={<span className="text-xs font-semibold">{i + 1}</span>}
          title={b.label}
          action={<span className="text-xs text-storm-400">weight {formatPercent(b.weight)}</span>}
        >
          <p className="text-2xl font-semibold tracking-tight text-accent-danger">
            {formatPercent(b.average_score)}
          </p>
          <p className="mt-2 leading-relaxed text-storm-300">{b.interpretation}</p>
        </InsightCard>
      ))}
    </div>
  );
}

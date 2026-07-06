import { InsightCard } from "@/components/ui/InsightCard";
import type { StormReport } from "@/lib/types";
import { formatPercent } from "@/lib/format";

/**
 * The "what to lead with" answer: the strongest criteria (assets to amplify).
 * `strongest_criteria` is barrier-aware, so these always render success-toned.
 */
export function StrengthCards({ report }: { report: StormReport }) {
  const strengths = (report.strongest_criteria ?? []).slice(0, 5);
  if (strengths.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {strengths.map((s) => (
        <InsightCard
          key={s.criterion_id}
          tone="success"
          title={s.label}
          action={<span className="text-xs text-storm-400">weight {formatPercent(s.weight)}</span>}
        >
          <p className="text-2xl font-semibold tracking-tight text-accent-success">
            {formatPercent(s.average_score)}
          </p>
          <p className="mt-2 leading-relaxed text-storm-300">{s.interpretation}</p>
        </InsightCard>
      ))}
    </div>
  );
}

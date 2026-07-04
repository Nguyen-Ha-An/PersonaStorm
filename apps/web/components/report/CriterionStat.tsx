import type { CriterionBreakdown } from "@/lib/types";
import { effectiveScore, toneFor, TONE_TEXT, pct } from "./criteria-helpers";

/**
 * Shared readout for a single criterion inside the diagnostic panels: label +
 * raw score (colored by barrier-aware tone) + interpretation. `missing` guards
 * the case where a criterion id isn't in this run's breakdown.
 */
export function CriterionStat({
  criterion,
  labelOverride,
}: {
  criterion: CriterionBreakdown | undefined;
  labelOverride?: string;
}) {
  if (!criterion) {
    return (
      <div className="rounded-lg border border-storm-800 bg-storm-850 p-3.5">
        <p className="text-xs font-semibold text-storm-300">{labelOverride ?? "—"}</p>
        <p className="mt-1 text-[11px] text-storm-500">not measured this run</p>
      </div>
    );
  }
  const tone = toneFor(effectiveScore(criterion));
  return (
    <div className="rounded-lg border border-storm-800 bg-storm-850 p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-storm-200">
          {labelOverride ?? criterion.label}
          {!criterion.higher_is_better && (
            <span className="rounded border border-storm-600 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-storm-400">
              barrier
            </span>
          )}
        </p>
        <span className={`font-mono text-sm font-bold ${TONE_TEXT[tone]}`}>
          {pct(criterion.average_score)}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-storm-400">
        {criterion.interpretation}
      </p>
    </div>
  );
}

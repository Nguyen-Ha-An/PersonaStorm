import { Card, CardHeader } from "@/components/ui";
import type { StormReport } from "@/lib/types";

/**
 * The human-validation queue: the questions this synthetic run can't answer,
 * paired with the real-world test that would. This is the honest hand-off from
 * simulation to fieldwork.
 */
export function NextValidationPanel({ report }: { report: StormReport }) {
  const items = report.next_human_validation ?? [];
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Validate with real humans next" hint="simulation → fieldwork" />
      <ol className="divide-y divide-storm-800">
        {items.map((v, i) => {
          const testLabel = v.test_type.replace(/_/g, " ").replace(/^./, (ch) => ch.toUpperCase());
          return (
            <li key={`${v.question}-${i}`} className="flex gap-4 px-5 py-4">
              <span className="mt-0.5 text-sm text-storm-400">{i + 1}.</span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-storm-100">{v.question}</p>
                  <span className="rounded-full border border-accent-insight/40 bg-accent-insight/10 px-2 py-0.5 text-[11px] font-medium text-accent-insight">
                    {testLabel}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-storm-300">{v.rationale}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

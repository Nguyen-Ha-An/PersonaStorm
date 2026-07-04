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
        {items.map((v, i) => (
          <li key={`${v.question}-${i}`} className="flex gap-4 px-5 py-4">
            <span className="mt-0.5 font-mono text-sm text-storm-400">{i + 1}.</span>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-white">{v.question}</p>
                <span className="rounded-full border border-signal-cyan/40 bg-signal-cyan/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-signal-cyan">
                  {v.test_type.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-storm-300">{v.rationale}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

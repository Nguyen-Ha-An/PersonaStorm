import clsx from "clsx";
import { formatCredits } from "@/lib/format";

/**
 * Plain-language pricing rows — replaces the raw "exchange-ticker" pricing
 * card. Each row pairs a human gloss with a formatted credit amount. Renders
 * bare rows (no Card wrapper) so callers can compose it inside their own
 * `Card`/`SectionHeader` per §6.1.
 */
export function PricingSummary({
  pricing,
  className,
}: {
  pricing: {
    base_run_credits: number;
    credits_per_100_personas: number;
    analyst_report_credits: number;
    thousand_persona_run?: number;
  };
  className?: string;
}) {
  const rows: { label: string; gloss: string; value: number }[] = [
    {
      label: "Base simulation",
      gloss: "Included in every run, regardless of size.",
      value: pricing.base_run_credits,
    },
    {
      label: "Every 100 personas",
      gloss: "Scales with how many synthetic respondents you sample.",
      value: pricing.credits_per_100_personas,
    },
    {
      label: "Analyst report",
      gloss: "A structured write-up of the findings, generated after the run.",
      value: pricing.analyst_report_credits,
    },
  ];

  return (
    <div className={clsx("divide-y divide-storm-800", className)}>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-storm-200">{r.label}</p>
            <p className="mt-0.5 text-xs text-storm-400">{r.gloss}</p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-storm-100">
            {formatCredits(r.value)} credits
          </p>
        </div>
      ))}
      {pricing.thousand_persona_run != null ? (
        <div className="flex items-center justify-between gap-4 px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-storm-200">≈ a 1,000-persona run</p>
            <p className="mt-0.5 text-xs text-storm-400">
              A typical full-depth simulation, including the analyst report.
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-storm-100">
            {formatCredits(pricing.thousand_persona_run)} credits
          </p>
        </div>
      ) : null}
    </div>
  );
}

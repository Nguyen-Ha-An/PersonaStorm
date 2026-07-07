import { Card } from "@/components/ui";
import type { TopAction } from "@/lib/types";

/**
 * Up to three evidence-backed next actions, each scroll-linking into the full
 * diagnostics below via its anchorId. Renders nothing when there are no actions.
 */
export function TopActions({ actions }: { actions: TopAction[] }) {
  if (actions.length === 0) return null;
  return (
    <Card className="overflow-hidden" data-tour="top-actions">
      <div className="border-b border-storm-800 px-5 py-3.5">
        <h3 className="text-sm font-semibold text-storm-100">Do these first</h3>
      </div>
      <ol className="divide-y divide-storm-800">
        {actions.map((action) => (
          <li key={action.rank}>
            <a
              href={action.anchorId}
              className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-storm-850 focus-visible:bg-storm-850 focus-visible:outline-none"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary/15 text-xs font-semibold text-accent-primary">
                {action.rank}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-storm-100">{action.imperative}</span>
                  {action.evidence?.stat ? (
                    <span className="rounded-full border border-storm-700 bg-storm-850 px-2 py-0.5 text-[11px] font-medium text-storm-300">
                      {action.evidence.stat}
                    </span>
                  ) : null}
                </span>
                {action.why ? (
                  <span className="mt-1 block text-sm leading-relaxed text-storm-300">{action.why}</span>
                ) : null}
                {action.evidence?.quote ? (
                  <span className="mt-1.5 block text-xs italic text-storm-400">“{action.evidence.quote}”</span>
                ) : null}
              </span>
              <span aria-hidden className="mt-0.5 text-storm-500 transition-colors group-hover:text-accent-primary">
                →
              </span>
            </a>
          </li>
        ))}
      </ol>
    </Card>
  );
}

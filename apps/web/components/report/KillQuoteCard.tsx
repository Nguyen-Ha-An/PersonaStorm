import type { StormReport } from "@/lib/types";
import { formatPercent } from "@/lib/format";

/** The single most damaging voice in the swarm — rendered like it hurts. */
export function KillQuoteCard({ report }: { report: StormReport }) {
  if (!report.kill_quote) return null;
  const ctx = report.kill_quote_context;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-signal-red/40 bg-gradient-to-br from-signal-red/10 to-storm-900 p-8">
      <span className="pointer-events-none absolute -top-6 left-4 select-none font-serif text-[120px] leading-none text-signal-red/15">
        “
      </span>
      <p className="relative text-[11px] font-medium uppercase tracking-[0.14em] text-signal-red">
        Kill quote — the voice most likely to sink you
      </p>
      <blockquote className="relative mt-4 text-xl font-medium leading-relaxed text-storm-100 sm:text-2xl">
        “{report.kill_quote}”
      </blockquote>
      {ctx && (
        <p className="relative mt-4 text-xs text-storm-300">
          — <span className="font-mono">{ctx.persona_id}</span> · {ctx.segment} · buy likelihood{" "}
          {formatPercent(ctx.buy_likelihood)} · skepticism {formatPercent(ctx.skepticism)}
        </p>
      )}
      <p className="relative mt-3 text-xs text-storm-400">
        Selected deterministically: lowest intent × highest skepticism × specificity. Not cherry-picked.
      </p>
    </div>
  );
}

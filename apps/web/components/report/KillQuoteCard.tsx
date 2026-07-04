import type { StormReport } from "@/lib/types";

/** The single most damaging voice in the swarm — rendered like it hurts. */
export function KillQuoteCard({ report }: { report: StormReport }) {
  const ctx = report.kill_quote_context;
  return (
    <div className="relative overflow-hidden rounded-xl border border-signal-red/40 bg-gradient-to-br from-signal-red/10 to-storm-900 p-8">
      <span className="pointer-events-none absolute -top-6 left-4 select-none font-serif text-[120px] leading-none text-signal-red/15">
        “
      </span>
      <p className="relative font-mono text-[11px] uppercase tracking-[0.25em] text-signal-red">
        kill quote — the voice most likely to sink you
      </p>
      <blockquote className="relative mt-4 text-xl font-medium leading-relaxed text-white sm:text-2xl">
        “{report.kill_quote}”
      </blockquote>
      {ctx && (
        <p className="relative mt-4 font-mono text-xs text-storm-300">
          — {ctx.persona_id} · {ctx.segment} · buy likelihood{" "}
          {(ctx.buy_likelihood * 100).toFixed(0)}% · skepticism {(ctx.skepticism * 100).toFixed(0)}%
        </p>
      )}
      <p className="relative mt-3 text-xs text-storm-400">
        Selected deterministically: lowest intent × highest skepticism × specificity. Not cherry-picked.
      </p>
    </div>
  );
}

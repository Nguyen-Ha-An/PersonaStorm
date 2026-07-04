import { PageShell } from "@/components/ui";

/** Route-transition fallback shown while a page's code/data loads. */
export default function Loading() {
  return (
    <PageShell className="flex min-h-[60vh] items-center justify-center py-24">
      <div className="flex flex-col items-center gap-4">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-pulseglow rounded-full bg-signal-cyan opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-signal-cyan" />
        </span>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-storm-400">loading…</p>
      </div>
    </PageShell>
  );
}

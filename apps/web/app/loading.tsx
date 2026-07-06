import { PageShell } from "@/components/ui";

/** Route-transition fallback shown while a page's code/data loads. A neutral
 *  spin ring, not the brand dot — the brand mark shouldn't double as a
 *  loading spinner. */
export default function Loading() {
  return (
    <div className="bg-tunnel flex min-h-screen items-center justify-center">
      <PageShell className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4" role="status" aria-label="Loading">
          <span
            className="h-6 w-6 animate-spin rounded-full border-2 border-storm-700 border-t-storm-300"
            aria-hidden="true"
          />
          <p className="text-xs text-storm-400">Loading…</p>
        </div>
      </PageShell>
    </div>
  );
}

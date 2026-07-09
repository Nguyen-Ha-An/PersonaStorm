/**
 * Controlled web-research adapter for worker shards.
 *
 * Workers do NOT get uncontrolled browsing. If web research is enabled, a
 * worker may *request* a small number of queries, but the SERVER decides
 * whether to run them and enforces `worker_web_research_max_queries`. The
 * adapter returns sanitized snippets/sources only — it never exposes API keys
 * and never surfaces raw credentials.
 *
 * No search provider is wired yet, so the default is the disabled
 * `NullWebResearchAdapter`. The interface exists so a real provider can be
 * dropped in later without touching the orchestration pipeline. Do NOT block
 * the feature on web research — the default is off.
 */

export interface WebResearchResult {
  title: string;
  snippet: string;
  /** Source URL if the provider supplies one (persisted as metadata). */
  url: string | null;
}

export interface WebResearchAdapter {
  readonly enabled: boolean;
  search(query: string, limit: number): Promise<WebResearchResult[]>;
}

/** Default adapter: disabled, returns nothing. Safe everywhere. */
export class NullWebResearchAdapter implements WebResearchAdapter {
  readonly enabled = false;
  async search(): Promise<WebResearchResult[]> {
    return [];
  }
}

export interface RunResearchOptions {
  adapter: WebResearchAdapter;
  /** Hard ceiling on queries the server will actually run (>= 0). */
  maxQueries: number;
}

/**
 * Run at most `maxQueries` of the requested queries through the adapter. The
 * server clamps the count here — a worker cannot make the server run more
 * searches than configured. Disabled adapters short-circuit to an empty result.
 */
export async function runControlledResearch(
  requestedQueries: string[],
  opts: RunResearchOptions,
): Promise<WebResearchResult[]> {
  if (!opts.adapter.enabled) return [];
  const cap = Math.max(0, Math.floor(opts.maxQueries));
  if (cap === 0) return [];
  const queries = requestedQueries
    .map((q) => (typeof q === "string" ? q.trim() : ""))
    .filter(Boolean)
    .slice(0, cap);
  const out: WebResearchResult[] = [];
  for (const q of queries) {
    try {
      const results = await opts.adapter.search(q, 5);
      out.push(...results);
    } catch {
      // Research is best-effort; a failed query never fails the storm.
    }
  }
  return out;
}

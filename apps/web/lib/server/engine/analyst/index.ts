/**
 * Analyst layer — port of apps/api/app/services/analyst/*.
 *
 * The analyst runs AFTER every number is computed. It only re-narrates TEXT
 * (executive summary), never a number, and `enhanceReport` MUST NEVER throw:
 * any failure returns the original deterministic report unchanged.
 *
 * MockAnalyst (default) is a no-op — the deterministic builder already writes
 * good text. NvidiaAnalyst rewrites the summary via one OpenAI-compatible call.
 */

import type { ServerConfig } from "../../env";
import type { StormReport } from "../report";

export interface AnalystProvider {
  readonly name: string;
  enhanceReport(report: StormReport): Promise<StormReport>;
}

class MockAnalyst implements AnalystProvider {
  readonly name = "mock";
  async enhanceReport(report: StormReport): Promise<StormReport> {
    return report;
  }
}

class NvidiaAnalyst implements AnalystProvider {
  readonly name = "nvidia";
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string,
    private maxTokens: number,
  ) {}

  async enhanceReport(report: StormReport): Promise<StormReport> {
    // Best-effort re-narration of the executive summary. Numbers are passed in
    // as immutable context; the model may only rewrite prose. Any failure keeps
    // the deterministic report unchanged (contract: never throws).
    try {
      const facts = {
        title: report.title,
        product_category: report.product_category,
        market_fit_score: report.overall?.market_fit_score,
        adoption: report.adoption,
        top_blockers: report.overall?.top_blockers,
        top_strengths: report.overall?.top_strengths,
        top_objection: report.top_objections[0]?.label ?? null,
        avg_max_price: report.avg_max_price,
        collapse_risk: report.quality.collapse_risk,
        benchmark_confidence: report.quality.benchmark_confidence,
      };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      let json: { choices?: { message?: { content?: string } }[] };
      try {
        const resp = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(this.apiKey && this.apiKey !== "not-needed" ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              {
                role: "system",
                content:
                  "You are a market-research analyst. Rewrite the executive summary from the given " +
                  "aggregates in 3-4 crisp sentences. You MUST NOT invent or change any number — only " +
                  "narrate the numbers provided. End by reminding the reader these are synthetic " +
                  "pre-research hypotheses. Output only the summary prose, no JSON, no preamble.",
              },
              { role: "user", content: `AGGREGATES:\n${JSON.stringify(facts, null, 2)}` },
            ],
            max_tokens: this.maxTokens,
            temperature: 0.4,
          }),
          signal: controller.signal,
        });
        if (!resp.ok) return report;
        json = await resp.json();
      } finally {
        clearTimeout(timer);
      }
      const text = (json.choices?.[0]?.message?.content ?? "").trim();
      if (!text) return report;
      return { ...report, summary: text.slice(0, 2000) };
    } catch (err) {
      console.warn("[personastorm analyst] enhanceReport failed, keeping deterministic report:", (err as Error).message);
      return report;
    }
  }
}

export function getAnalyst(cfg: ServerConfig): AnalystProvider {
  if (cfg.analystProvider === "nvidia") {
    // Fall back to mock if the hosted endpoint has no key (never a hard failure).
    if (cfg.nvidiaBaseUrl.includes("integrate.api.nvidia.com") && !cfg.nvidiaApiKey) {
      console.warn("[personastorm analyst] ANALYST_PROVIDER=nvidia but NVIDIA_API_KEY missing; using mock analyst.");
      return new MockAnalyst();
    }
    return new NvidiaAnalyst(cfg.nvidiaApiKey, cfg.nvidiaBaseUrl, cfg.analystModel || cfg.nvidiaModel, cfg.analystMaxTokens);
  }
  return new MockAnalyst();
}

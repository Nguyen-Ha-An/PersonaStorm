"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { inspectStimulus, type StimulusInsight } from "@/lib/api";

/**
 * "Not sure it's strong enough?" — analyzes the draft stimulus and shows the
 * signals the engine detects (pricing, proof, clarity, category) so the user
 * can fix weak inputs BEFORE spending a run. Read-only; never blocks the form.
 */
export function StimulusHelper({
  stimulus,
  title,
  stimulusType,
}: {
  stimulus: string;
  title?: string;
  stimulusType?: string;
}) {
  const [insight, setInsight] = useState<StimulusInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = stimulus.trim().length < 20 || loading;

  async function check() {
    setLoading(true);
    setError(null);
    try {
      setInsight(await inspectStimulus({ stimulus, title, stimulus_type: stimulusType }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't analyze the stimulus.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-storm-800 bg-storm-850/50 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-storm-400">
          Not sure it&apos;s strong enough? See what the engine detects before you spend a run.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={check} disabled={disabled}>
          {loading ? "Checking…" : "Check my stimulus"}
        </Button>
      </div>

      {error ? <p className="mt-2 text-xs text-signal-red">{error}</p> : null}

      {insight ? (
        <ul className="mt-3 space-y-1.5">
          {insight.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2 text-xs leading-relaxed">
              <span aria-hidden className={c.ok ? "text-signal-green" : "text-signal-yellow"}>
                {c.ok ? "✓" : "•"}
              </span>
              <span className={c.ok ? "text-storm-400" : "text-storm-200"}>
                <span className="font-medium text-storm-200">{c.label}.</span>
                {c.ok ? "" : ` ${c.hint}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

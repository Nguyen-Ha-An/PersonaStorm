"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

const KEY = "ps_howitworks_dismissed";

/**
 * Persistent, dismissible "how this works" explainer — the trust ethos made
 * visible for a cold visitor. Hidden by default until we confirm it wasn't
 * dismissed (avoids showing it to returning users), and the dismissal persists.
 */
export function HowItWorks() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let d = false;
    try {
      d = localStorage.getItem(KEY) === "1";
    } catch {
      d = false;
    }
    setDismissed(d);
  }, []);

  if (dismissed) return null;

  return (
    <Card className="relative border-accent-primary/20 bg-accent-primary/[0.04] p-4 pr-10">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            /* ignore */
          }
        }}
        className="absolute right-3 top-3 rounded p-1 text-storm-500 transition-colors hover:text-storm-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      </button>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-primary">How this works</p>
      <p className="mt-1.5 text-sm leading-relaxed text-storm-300">
        PersonaStorm generates a swarm of AI personas that react to your stimulus. The scores are computed
        from their reactions — the model never invents the numbers — so treat the result as a directional
        pre-research signal, not a replacement for talking to real humans.
      </p>
    </Card>
  );
}

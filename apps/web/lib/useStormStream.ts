"use client";

/**
 * SSE client for /api/storm/{id}/stream.
 *
 * Performance decision: reaction events arrive in bursts (25/batch). Applying
 * each one via setState would re-render the 1,000-cell grid hundreds of times.
 * Instead events accumulate in refs and a 120 ms flush timer commits them in
 * one state update (~8 fps — smooth to the eye, cheap for React).
 */

import { useEffect, useRef, useState } from "react";
import { streamUrl } from "./api";
import type { CellStatus, Level, ProgressEvent, ReactionEvent } from "./types";

export interface QuoteItem {
  persona_id: string;
  segment: string;
  quote: string;
  status: "green" | "yellow" | "red";
}

export interface StormStreamState {
  cells: CellStatus[];
  total: number;
  progress: ProgressEvent | null;
  quotes: QuoteItem[]; // rolling feed of recent voices
  reactions: Map<number, ReactionEvent>; // index -> full event (tooltips)
  complete: boolean;
  failed: string | null;
  connected: boolean;
  collapseRisk: Level;
}

const FLUSH_MS = 120;
const QUOTE_FEED_SIZE = 7;

export function useStormStream(stormId: string | null): StormStreamState {
  const [cells, setCells] = useState<CellStatus[]>([]);
  const [total, setTotal] = useState(0);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [complete, setComplete] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const pendingReactions = useRef<ReactionEvent[]>([]);
  const pendingProgress = useRef<ProgressEvent | null>(null);
  const reactionsRef = useRef<Map<number, ReactionEvent>>(new Map());

  useEffect(() => {
    if (!stormId) return;
    const es = new EventSource(streamUrl(stormId));

    es.addEventListener("init", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setTotal(data.persona_count);
      setCells(Array(data.persona_count).fill("pending"));
      setConnected(true);
    });

    es.addEventListener("reaction", (e) => {
      pendingReactions.current.push(JSON.parse((e as MessageEvent).data));
    });

    es.addEventListener("progress", (e) => {
      pendingProgress.current = JSON.parse((e as MessageEvent).data);
    });

    es.addEventListener("complete", () => {
      setComplete(true);
      es.close();
    });

    es.addEventListener("error", (e) => {
      // Server-emitted failure event carries data; transport errors don't.
      const data = (e as MessageEvent).data;
      if (data) {
        setFailed(JSON.parse(data).message ?? "storm failed");
        es.close();
      }
    });

    es.onerror = () => setConnected(false);
    es.onopen = () => setConnected(true);

    const flush = setInterval(() => {
      const batch = pendingReactions.current;
      if (batch.length > 0) {
        pendingReactions.current = [];
        setCells((prev) => {
          const next = prev.slice();
          for (const r of batch) {
            if (r.index < next.length) next[r.index] = r.status;
            reactionsRef.current.set(r.index, r);
          }
          return next;
        });
        setQuotes((prev) => {
          const fresh = batch.slice(-3).map((r) => ({
            persona_id: r.persona_id,
            segment: r.segment,
            quote: r.quote,
            status: r.status,
          }));
          return [...fresh.reverse(), ...prev].slice(0, QUOTE_FEED_SIZE);
        });
      }
      if (pendingProgress.current) {
        setProgress(pendingProgress.current);
        pendingProgress.current = null;
      }
    }, FLUSH_MS);

    return () => {
      clearInterval(flush);
      es.close();
    };
  }, [stormId]);

  return {
    cells,
    total,
    progress,
    quotes,
    reactions: reactionsRef.current,
    complete,
    failed,
    connected,
    collapseRisk: progress?.collapse_risk ?? "low",
  };
}

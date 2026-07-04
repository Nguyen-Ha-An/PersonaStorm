"use client";

/**
 * SSE client for /api/storm/{id}/stream.
 *
 * Auth: EventSource can't set an Authorization header, so we fetch the Supabase
 * access token first and pass it as `?access_token=` (the backend accepts it
 * there for the stream endpoint only, and still enforces storm ownership).
 *
 * Performance: reaction events arrive in bursts (25/batch). Applying each via
 * setState would re-render the 1,000-cell grid hundreds of times, so events
 * accumulate in refs and a 120 ms flush timer commits them in one update.
 *
 * Reliability: EventSource retries forever by spec, so a wrong API origin or a
 * missing storm would otherwise spin as "reconnecting…". We detect a config
 * error before connecting, or repeated failures before the first `init`, and
 * surface a clear, actionable `connectionError`.
 */

import { useEffect, useRef, useState } from "react";
import { streamUrl, API_TARGET_LABEL, ApiError } from "./api";
import { getAccessToken } from "./supabase/client";
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
  quotes: QuoteItem[];
  reactions: Map<number, ReactionEvent>;
  complete: boolean;
  failed: string | null;
  connected: boolean;
  connectionError: string | null;
  apiTarget: string;
  collapseRisk: Level;
}

const FLUSH_MS = 120;
const QUOTE_FEED_SIZE = 7;
const MAX_CONNECT_ATTEMPTS = 3;

export function useStormStream(stormId: string | null): StormStreamState {
  const [cells, setCells] = useState<CellStatus[]>([]);
  const [total, setTotal] = useState(0);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [complete, setComplete] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const pendingReactions = useRef<ReactionEvent[]>([]);
  const pendingProgress = useRef<ProgressEvent | null>(null);
  const reactionsRef = useRef<Map<number, ReactionEvent>>(new Map());

  useEffect(() => {
    if (!stormId) return;

    reactionsRef.current = new Map();
    pendingReactions.current = [];
    pendingProgress.current = null;
    setCells([]);
    setTotal(0);
    setProgress(null);
    setQuotes([]);
    setComplete(false);
    setFailed(null);
    setConnected(false);
    setConnectionError(null);

    let everConnected = false;
    let failedAttempts = 0;
    let closed = false;
    let es: EventSource | null = null;

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

    (async () => {
      let token: string | null = null;
      try {
        token = await getAccessToken();
      } catch {
        /* proceed unauthenticated — the backend will 401 and we surface it */
      }
      if (closed) return;

      try {
        es = new EventSource(streamUrl(stormId, token));
      } catch (e) {
        setConnectionError(
          e instanceof ApiError ? e.message : "Unable to open the storm stream.",
        );
        return;
      }

      es.addEventListener("init", (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        everConnected = true;
        failedAttempts = 0;
        setTotal(data.persona_count);
        setCells(Array(data.persona_count).fill("pending"));
        setConnected(true);
        setConnectionError(null);
      });

      es.addEventListener("reaction", (e) => {
        pendingReactions.current.push(JSON.parse((e as MessageEvent).data));
      });

      es.addEventListener("progress", (e) => {
        pendingProgress.current = JSON.parse((e as MessageEvent).data);
      });

      es.addEventListener("complete", () => {
        setComplete(true);
        closed = true;
        es?.close();
      });

      es.addEventListener("error", (e) => {
        const data = (e as MessageEvent).data;
        if (data) {
          setFailed(JSON.parse(data).message ?? "storm failed");
          closed = true;
          es?.close();
        }
      });

      es.onopen = () => {
        everConnected = true;
        failedAttempts = 0;
        setConnected(true);
        setConnectionError(null);
      };

      es.onerror = () => {
        setConnected(false);
        if (closed) return;
        if (everConnected) return;
        failedAttempts += 1;
        const terminal = es?.readyState === EventSource.CLOSED;
        if (terminal || failedAttempts >= MAX_CONNECT_ATTEMPTS) {
          closed = true;
          es?.close();
          setConnectionError(
            `Could not reach the storm stream at ${API_TARGET_LABEL}. ` +
              `The backend may be unreachable, your session may have expired, ` +
              `or this storm ID may not exist (storms are held in memory and are ` +
              `lost if the API restarts).`,
          );
        }
      };
    })();

    return () => {
      closed = true;
      clearInterval(flush);
      es?.close();
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
    connectionError,
    apiTarget: API_TARGET_LABEL,
    collapseRisk: progress?.collapse_risk ?? "low",
  };
}

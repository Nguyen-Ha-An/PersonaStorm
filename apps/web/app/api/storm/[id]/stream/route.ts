import { getOptionalUser } from "@/lib/server/auth";
import { getConfig } from "@/lib/server/env";
import { buildGateway } from "@/lib/server/gateway";
import { HttpError } from "@/lib/server/errors";
import { detailResponse } from "@/lib/server/http";
import { getStreamData } from "@/lib/server/stormStore";
import { DEMO_STORM_ID } from "@/lib/server/demo";
import { ensureDemoStorm } from "@/lib/server/demoSeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Live replay of a completed run streams over a few seconds; give it headroom.
export const maxDuration = 60;

/**
 * SSE replay of a completed storm.
 *
 * Because a run completes synchronously at create time (serverless can't hold
 * in-memory state or background tasks across invocations), the reactions are
 * already stored. This endpoint replays them as staged `init` / `reaction` /
 * `progress` / `complete` events — pacing them so the live persona grid still
 * animates — WITHOUT ever charging the wallet again. Reconnecting simply
 * replays; it can never double-charge (charging only happens in /storm/create).
 *
 * Auth: EventSource can't set headers, so the token is read from
 * `?access_token=` — accepted ONLY on this /stream path (see auth.ts).
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const cfg = getConfig();
  const gateway = buildGateway(cfg);

  // Resolve auth + ownership BEFORE streaming so failures return JSON, not a
  // half-open stream.
  let data;
  try {
    // The public demo run seeds itself on first request (idempotent, no signup).
    if (params.id === DEMO_STORM_ID) await ensureDemoStorm(gateway, cfg);
    const user = await getOptionalUser(request, gateway);
    data = await getStreamData(gateway, params.id, user);
  } catch (err) {
    if (err instanceof HttpError) return detailResponse(err.message, err.status);
    console.error("[personastorm stream] setup failed:", err);
    return detailResponse("Could not open the storm stream.", 500);
  }

  const { meta, reactions, progress } = data;
  const batchSize = Math.max(1, cfg.streamBatchSize);
  const intervalMs = Math.max(0, cfg.streamBatchIntervalMs);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };
      const aborted = () => request.signal?.aborted;

      try {
        controller.enqueue(encoder.encode("retry: 3000\n\n"));
        send("init", {
          storm_id: meta.storm_id,
          title: meta.title,
          persona_count: meta.persona_count,
          target_market: meta.target_market,
          status: meta.status,
        });

        if (meta.status === "failed") {
          send("error", { message: meta.error || "storm failed" });
          controller.close();
          return;
        }

        for (let i = 0; i < reactions.length; i += batchSize) {
          if (aborted()) {
            controller.close();
            return;
          }
          for (const r of reactions.slice(i, i + batchSize)) send("reaction", r);
          if (intervalMs > 0 && i + batchSize < reactions.length) {
            await sleep(intervalMs);
          }
        }

        send("progress", progress);
        send("complete", {
          storm_id: meta.storm_id,
          report_ready: meta.report_ready,
          adoption: { green: progress.green, yellow: progress.yellow, red: progress.red },
        });
        controller.close();
      } catch (err) {
        // The client likely disconnected; nothing actionable to report.
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

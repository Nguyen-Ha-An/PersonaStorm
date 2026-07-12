import { requireAdmin } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { getConfig } from "@/lib/server/env";
import { jsonResponse, runRoute } from "@/lib/server/http";
import { resolveEffectiveConfig } from "@/lib/server/inferenceSettings";
import { chatCompletion } from "@/lib/server/engine/providers/chatClient";
import { REACTION_JSON_SCHEMA } from "@/lib/server/engine/providers/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin-only live-provider self-test. Makes two TINY Fireworks calls against
 * the exact effective per-storm config and reports the provider's real
 * response, so a failing storm can be diagnosed in one click instead of by
 * guessing from a sanitized error:
 *
 *   1. "basic"  — plain JSON-object mode: proves key + model + endpoint.
 *   2. "schema" — the same call constrained by REACTION_JSON_SCHEMA (the
 *      exact structured-output shape the persona swarm uses): if basic passes
 *      but this fails, the provider is rejecting the schema dialect.
 *
 * The API key is never returned; error detail is the ChatHttpError message,
 * which contains only the upstream status and a truncated response body.
 */

interface ProbeResult {
  ok: boolean;
  detail: string;
}

function errDetail(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 400);
}

export async function POST(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();
    await requireAdmin(request, gateway);
    const cfg = await resolveEffectiveConfig(gateway, getConfig());

    if (cfg.inferenceProvider === "mock") {
      return jsonResponse({
        provider: "mock",
        model: null,
        base_url: null,
        api_key_configured: Boolean(cfg.fireworksApiKey),
        basic: { ok: true, detail: "Mock mode — no live provider to test. Set the inference provider to 'fireworks' first." },
        schema: { ok: true, detail: "Skipped in mock mode." },
      });
    }

    const messages = [
      { role: "system" as const, content: "You are a connectivity probe. Reply with minimal JSON." },
      { role: "user" as const, content: 'Reply with exactly {"ok": true}' },
    ];
    const base = {
      baseUrl: cfg.fireworksBaseUrl,
      apiKey: cfg.fireworksApiKey,
      model: cfg.fireworksModel,
      messages,
      maxTokens: 64,
      temperature: 0,
      timeoutMs: 20_000,
    };

    let basic: ProbeResult;
    try {
      const content = await chatCompletion({ ...base, jsonObject: true });
      basic = { ok: true, detail: `Provider responded (${content.trim().slice(0, 80) || "empty content"}).` };
    } catch (err) {
      basic = { ok: false, detail: errDetail(err) };
    }

    // Only meaningful if the basic call worked — otherwise it fails the same way.
    let schema: ProbeResult;
    if (!basic.ok) {
      schema = { ok: false, detail: "Skipped — basic call failed." };
    } else {
      try {
        const content = await chatCompletion({ ...base, maxTokens: 2048, jsonSchema: REACTION_JSON_SCHEMA as Record<string, unknown> });
        schema = { ok: true, detail: `Schema-constrained call accepted (${content.trim().length} chars).` };
      } catch (err) {
        schema = { ok: false, detail: errDetail(err) };
      }
    }

    return jsonResponse({
      provider: cfg.inferenceProvider,
      model: cfg.fireworksModel,
      base_url: cfg.fireworksBaseUrl,
      api_key_configured: Boolean(cfg.fireworksApiKey),
      basic,
      schema,
    });
  });
}

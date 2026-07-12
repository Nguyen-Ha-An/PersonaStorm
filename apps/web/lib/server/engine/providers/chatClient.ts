/**
 * Minimal OpenAI-compatible chat helper shared by the orchestration providers
 * (NVIDIA Nemotron orchestrator + Fireworks DeepSeek workers). Both endpoints
 * speak the `/chat/completions` dialect, so the transport lives in one place.
 *
 * SECURITY: the API key only ever appears in the Authorization header of the
 * outbound request. It is never returned, never logged, and never serialized
 * into an error message (error text is truncated response bodies only).
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  /** Ask for a JSON object response where the provider supports it. */
  jsonObject?: boolean;
  /**
   * Hard-constrain the response to a JSON schema (Fireworks structured-output
   * dialect: response_format {type:"json_object", schema}). Wins over
   * jsonObject when both are set.
   */
  jsonSchema?: Record<string, unknown>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * POST a chat completion and return the assistant message content string.
 * Throws on non-2xx (with a truncated, credential-free body) or timeout.
 */
export async function chatCompletion(opts: ChatCompletionOptions): Promise<string> {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.apiKey && opts.apiKey !== "not-needed") headers.Authorization = `Bearer ${opts.apiKey}`;

  const payload: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
  };
  if (opts.jsonSchema) payload.response_format = { type: "json_object", schema: opts.jsonSchema };
  else if (opts.jsonObject) payload.response_format = { type: "json_object" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let json: { choices?: { message?: { content?: string } }[] };
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      // status carried so callers can classify transient (429/5xx) failures.
      throw new ChatHttpError(resp.status, body.slice(0, 300));
    }
    json = await resp.json();
  } finally {
    clearTimeout(timeout);
  }
  return json.choices?.[0]?.message?.content ?? "";
}

/** HTTP error that preserves the status code for retry classification. */
export class ChatHttpError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`chat/completions -> ${status}: ${body}`);
    this.name = "ChatHttpError";
  }
}

/** True for transient failures worth retrying with backoff (429 + 5xx). */
export function isTransientChatError(err: unknown): boolean {
  if (err instanceof ChatHttpError) return err.status === 429 || err.status >= 500;
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout|timed out|aborted|ECONNRESET|fetch failed|network/i.test(msg);
}

/** Defensively extract the first JSON object from a model reply. */
export function extractJsonObject(content: string): Record<string, unknown> {
  let text = content.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^`+/, "").replace(/`+$/, "");
    if (text.startsWith("json")) text = text.slice(4);
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("model returned non-JSON content");
  }
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

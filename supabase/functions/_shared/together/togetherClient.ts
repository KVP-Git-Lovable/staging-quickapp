// Thin Together.ai Serverless Inference client. Streaming chat completions only.
import { MAX_OUTPUT_TOKENS, MODEL, TOGETHER_URL } from "../config.ts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamDiagnostics {
  /** Raw `data:` frames read from the upstream SSE body. */
  frames: number;
  /** Frames that carried user-facing content. */
  deltas: number;
  /** Total characters of content emitted. */
  chars: number;
  /** Last `finish_reason` reported by the provider. */
  finishReason: string | null;
  /** Whether the provider sent its terminal `[DONE]` sentinel. */
  sawDone: boolean;
  /** How many continuation requests were issued (only on finish_reason=length). */
  continuations: number;
  /** Milliseconds from request open to stream close. */
  durationMs: number;
  /** How the stream ended. */
  outcome: "completed" | "length" | "stalled" | "aborted" | "premature_eof" | "error";
}

export interface StreamResult {
  /** ReadableStream of decoded token strings, in order. */
  tokens: ReadableStream<string>;
  /** Resolves with full concatenated text after the stream ends. */
  fullText: Promise<string>;
  /** Live diagnostics snapshot; mutated as the stream progresses. */
  diag: StreamDiagnostics;
}

export class TogetherError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Abort the upstream request when no content arrives for this long. Without it
 * a stalled provider connection simply hangs until the edge isolate is torn
 * down mid-stream, which surfaces to the user as a silent truncation with no
 * error and no persisted answer.
 */
const INACTIVITY_TIMEOUT_MS = 20_000;

export async function streamChat(params: {
  apiKey: string;
  messages: ChatMessage[];
  model?: string;
  /** Request signal so a client disconnect stops the upstream call. */
  signal?: AbortSignal;
  reqId?: string;
}): Promise<StreamResult> {
  const reqId = params.reqId ?? "-";
  const startedAt = Date.now();
  const log = (msg: string, extra?: unknown) =>
    console.log(`[copilot-diag][${reqId}][together] ${msg}`, extra ?? "");

  const diag: StreamDiagnostics = {
    frames: 0,
    deltas: 0,
    chars: 0,
    finishReason: null,
    sawDone: false,
    continuations: 0,
    durationMs: 0,
    outcome: "error",
  };

  // Internal controller lets the inactivity watchdog abort the upstream fetch
  // independently of the caller's signal.
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort("caller_aborted");
  if (params.signal) {
    if (params.signal.aborted) controller.abort("caller_aborted");
    else params.signal.addEventListener("abort", onCallerAbort, { once: true });
  }

  let watchdog: number | undefined;
  let stalled = false;
  const armWatchdog = () => {
    if (watchdog !== undefined) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      stalled = true;
      log(`no content for ${INACTIVITY_TIMEOUT_MS}ms — aborting upstream`);
      controller.abort("inactivity_timeout");
    }, INACTIVITY_TIMEOUT_MS) as unknown as number;
  };
  const disarmWatchdog = () => {
    if (watchdog !== undefined) clearTimeout(watchdog);
    watchdog = undefined;
    if (params.signal) params.signal.removeEventListener("abort", onCallerAbort);
  };

  const openStream = async (messages: ChatMessage[]) => {
    const openedAt = Date.now();
    const res = await fetch(TOGETHER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: params.model ?? MODEL,
        messages,
        stream: true,
        temperature: 0.4,
        top_p: 1,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
    });

    log(`upstream open status=${res.status} in ${Date.now() - openedAt}ms`, {
      contentType: res.headers.get("content-type"),
      messages: messages.length,
    });

    if (!res.ok || !res.body) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
      const code = res.status === 429 ? "rate_limited"
        : res.status === 401 || res.status === 403 ? "provider_auth"
        : res.status >= 500 ? "provider_upstream"
        : "provider_error";
      throw new TogetherError(res.status, code, `Together API ${res.status}: ${detail || res.statusText}`);
    }
    armWatchdog();
    return res.body.getReader();
  };

  let reader = await openStream(params.messages);

  let resolveFull!: (v: string) => void;
  let rejectFull!: (e: unknown) => void;
  const fullText = new Promise<string>((resolve, reject) => {
    resolveFull = resolve; rejectFull = reject;
  });
  // Nothing else awaits this promise on the error path; a bare rejection would
  // surface as an unhandled rejection and kill the isolate.
  fullText.catch(() => {});

  let decoder = new TextDecoder();
  let buffered = "";
  let full = "";
  let finishReason: string | null = null;
  let sawDone = false;

  const processLine = (
    rawLine: string,
    controllerRef: ReadableStreamDefaultController<string>,
  ) => {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    diag.frames += 1;
    if (payload === "[DONE]") {
      sawDone = true;
      diag.sawDone = true;
      return;
    }
    try {
      const evt = JSON.parse(payload);
      // Surface provider-side error events instead of silently ignoring them.
      if (evt?.error) {
        throw new TogetherError(
          502,
          "provider_error",
          `Together stream error: ${JSON.stringify(evt.error).slice(0, 200)}`,
        );
      }
      const choice = evt?.choices?.[0];
      const content = typeof choice?.delta?.content === "string"
        ? choice.delta.content
        : typeof choice?.text === "string"
          ? choice.text
          : "";
      if (content) {
        full += content;
        diag.deltas += 1;
        diag.chars += content.length;
        armWatchdog();
        controllerRef.enqueue(content);
      }
      if (typeof choice?.finish_reason === "string") {
        finishReason = choice.finish_reason;
        diag.finishReason = finishReason;
      }
    } catch (err) {
      if (err instanceof TogetherError) throw err;
      // Ignore malformed keep-alives without dropping valid content frames.
    }
  };

  const finish = (outcome: StreamDiagnostics["outcome"]) => {
    diag.outcome = outcome;
    diag.durationMs = Date.now() - startedAt;
    disarmWatchdog();
    log(`stream ${outcome}`, { ...diag });
  };

  const tokens = new ReadableStream<string>({
    async pull(controllerRef) {
      // `pull` is not re-invoked when it returns without enqueueing, so a
      // chunk carrying only non-content frames ([DONE], keep-alives, role
      // deltas) would stall the consumer forever. Loop until this call either
      // emits content or terminates the stream.
      const emittedBefore = diag.deltas;
      try {
        while (diag.deltas === emittedBefore) {
        const { value, done } = await reader.read();
        if (done) {

          buffered += decoder.decode();
          if (buffered.trim()) processLine(buffered, controllerRef);
          buffered = "";

          // Only continue a response the provider explicitly truncated for
          // length. A premature EOF is a transport failure — retrying it
          // doubles the time budget and makes an isolate teardown *more*
          // likely, so it is reported instead.
          if (finishReason === "length" && diag.continuations < 1 && full.trim()) {
            diag.continuations += 1;
            log("continuing length-truncated response");
            reader = await openStream([
              ...params.messages,
              { role: "assistant", content: full },
              {
                role: "user",
                content: "Continue exactly where the previous answer stopped. Do not repeat completed text. Finish the answer concisely.",
              },
            ]);
            decoder = new TextDecoder();
            finishReason = null;
            diag.finishReason = null;
            sawDone = false;
            diag.sawDone = false;
            continue;
          }


          if (finishReason === "length") {
            const notice = "\n\n_The answer reached its maximum length. Ask me to continue._";
            full += notice;
            controllerRef.enqueue(notice);
            finish("length");
            controllerRef.close();
            resolveFull(full);
            return;
          }

          if (!sawDone && !finishReason) {
            finish("premature_eof");
            throw new TogetherError(502, "provider_upstream", "Together stream closed before completion");
          }

          finish("completed");
          controllerRef.close();
          resolveFull(full);
          return;
        }
        buffered += decoder.decode(value, { stream: true });
        let sepIndex: number;
        while ((sepIndex = buffered.indexOf("\n")) !== -1) {
          const line = buffered.slice(0, sepIndex);
          buffered = buffered.slice(sepIndex + 1);
          processLine(line, controllerRef);
        }
        }

      } catch (err) {
        const isAbort = (err as Error)?.name === "AbortError" || controller.signal.aborted;
        if (isAbort && stalled) {
          finish("stalled");
          const stallErr = new TogetherError(504, "upstream_stalled", "AI provider stopped sending data");
          controllerRef.error(stallErr);
          rejectFull(stallErr);
          return;
        }
        if (isAbort) {
          finish("aborted");
          // A caller abort is not a failure: close cleanly with what we have
          // so the partial answer can still be persisted.
          controllerRef.close();
          resolveFull(full);
          return;
        }
        if (diag.outcome === "error") finish("error");
        controllerRef.error(err);
        rejectFull(err);
      }
    },
    cancel(reason) {
      disarmWatchdog();
      reader.cancel(reason).catch(() => {});
      resolveFull(full);
    },
  });

  return { tokens, fullText, diag };
}

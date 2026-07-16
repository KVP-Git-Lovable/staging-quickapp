// Thin Together.ai Serverless Inference client. Streaming chat completions only.
import { MAX_OUTPUT_TOKENS, MODEL, TOGETHER_URL } from "../config.ts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamResult {
  /** ReadableStream of decoded token strings, in order. */
  tokens: ReadableStream<string>;
  /** Resolves with full concatenated text after the stream ends. */
  fullText: Promise<string>;
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

export async function streamChat(params: {
  apiKey: string;
  messages: ChatMessage[];
  model?: string;
  signal?: AbortSignal;
}): Promise<StreamResult> {
  const openStream = async (messages: ChatMessage[]) => {
    const res = await fetch(TOGETHER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: params.signal,
      body: JSON.stringify({
        model: params.model ?? MODEL,
        messages,
        stream: true,
        temperature: 0.4,
        top_p: 1,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
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
    return res.body.getReader();
  };

  let reader = await openStream(params.messages);

  let resolveFull!: (v: string) => void;
  let rejectFull!: (e: unknown) => void;
  const fullText = new Promise<string>((resolve, reject) => {
    resolveFull = resolve; rejectFull = reject;
  });

  let decoder = new TextDecoder();
  let buffered = "";
  let full = "";
  let finishReason: string | null = null;
  let sawDone = false;
  let continuationCount = 0;

  const processLine = (
    rawLine: string,
    controller: ReadableStreamDefaultController<string>,
  ) => {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    if (payload === "[DONE]") {
      sawDone = true;
      return;
    }
    try {
      const evt = JSON.parse(payload);
      const choice = evt?.choices?.[0];
      // GPT-OSS returns private reasoning separately. Only final `content`
      // belongs in the user-facing answer and persisted conversation.
      const content = typeof choice?.delta?.content === "string"
        ? choice.delta.content
        : typeof choice?.text === "string"
          ? choice.text
          : "";
      if (content) {
        full += content;
        controller.enqueue(content);
      }
      if (typeof choice?.finish_reason === "string") finishReason = choice.finish_reason;
    } catch {
      // Ignore malformed keep-alives without dropping valid content frames.
    }
  };


  const tokens = new ReadableStream<string>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          buffered += decoder.decode();
          if (buffered.trim()) processLine(buffered, controller);
          buffered = "";

          const incomplete = finishReason === "length" || (!sawDone && !finishReason);
          if (incomplete && continuationCount < 1 && full.trim()) {
            continuationCount += 1;
            console.warn(`[copilot-agent] continuing incomplete Together stream (${finishReason ?? "premature_eof"})`);
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
            sawDone = false;
            return;
          }

          if (!sawDone && !finishReason) {
            throw new TogetherError(502, "provider_upstream", "Together stream closed before completion");
          }
          if (finishReason === "length") {
            const notice = "\n\n_The answer reached its maximum length. Ask me to continue._";
            full += notice;
            controller.enqueue(notice);
          }
          controller.close();
          resolveFull(full);
          return;
        }
        buffered += decoder.decode(value, { stream: true });
        // Parse SSE lines: "data: {json}\n\n"
        let sepIndex: number;
        while ((sepIndex = buffered.indexOf("\n")) !== -1) {
          const line = buffered.slice(0, sepIndex);
          buffered = buffered.slice(sepIndex + 1);
          processLine(line, controller);
        }
      } catch (err) {
        controller.error(err);
        rejectFull(err);
      }
    },
    cancel(reason) {
      reader.cancel(reason).catch(() => {});
      resolveFull(full);
    },
  });

  return { tokens, fullText };
}

// Thin Together.ai Serverless Inference client. Streaming chat completions only.
import { MODEL, TOGETHER_URL } from "../config.ts";

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
  const res = await fetch(TOGETHER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: params.signal,
    body: JSON.stringify({
      model: params.model ?? MODEL,
      messages: params.messages,
      stream: true,
      temperature: 0.4,
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

  let resolveFull!: (v: string) => void;
  let rejectFull!: (e: unknown) => void;
  const fullText = new Promise<string>((resolve, reject) => {
    resolveFull = resolve; rejectFull = reject;
  });

  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buffered = "";
  let full = "";

  const tokens = new ReadableStream<string>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          resolveFull(full);
          return;
        }
        buffered += decoder.decode(value, { stream: true });
        // Parse SSE lines: "data: {json}\n\n"
        let sepIndex: number;
        while ((sepIndex = buffered.indexOf("\n")) !== -1) {
          const line = buffered.slice(0, sepIndex).trim();
          buffered = buffered.slice(sepIndex + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const evt = JSON.parse(payload);
            const d = evt?.choices?.[0]?.delta ?? {};
            const delta: string =
              (typeof d.content === "string" ? d.content : "") ||
              (typeof d.reasoning_content === "string" ? d.reasoning_content : "") ||
              (typeof d.reasoning === "string" ? d.reasoning : "") ||
              (typeof evt?.choices?.[0]?.text === "string" ? evt.choices[0].text : "");
            if (delta) {
              full += delta;
              controller.enqueue(delta);
            }
          } catch {
            // skip malformed keep-alives
          }
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

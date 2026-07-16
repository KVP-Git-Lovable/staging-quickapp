// Client → Edge Function bridge. Streams SSE token events.
import { supabase } from "@/integrations/supabase/client";

export interface SendMessageArgs {
  conversationId: string;
  message: string;
  onDelta: (delta: string) => void;
  signal?: AbortSignal;
}

export class CopilotServiceError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function sendMessage({
  conversationId, message, onDelta, signal,
}: SendMessageArgs): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new CopilotServiceError(401, "unauthorized", "You are signed out. Please log in again.");

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-agent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ conversationId, message }),
    signal,
  });

  if (!res.ok || !res.body) {
    let code = "request_failed";
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      code = body.code ?? code;
      msg = body.error ?? msg;
    } catch { /* ignore */ }
    throw new CopilotServiceError(res.status, code, msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let completed = false;

  const processFrame = (frame: string) => {
    const chunk = frame.trim();
    if (!chunk.startsWith("data:")) return;
    const payload = chunk.slice(5).trim();
    if (payload === "[DONE]") {
      completed = true;
      return;
    }
    try {
      const evt = JSON.parse(payload);
      if (evt.error) throw new CopilotServiceError(500, evt.error, "AI stream failed");
      if (typeof evt.delta === "string") onDelta(evt.delta);
    } catch (err) {
      if (err instanceof CopilotServiceError) throw err;
      // Ignore malformed keep-alives.
    }
  };

  while (!completed) {
    const { value, done } = await reader.read();
    if (done) {
      buffered += decoder.decode();
      break;
    }
    buffered += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffered.indexOf("\n\n")) !== -1) {
      const chunk = buffered.slice(0, idx);
      buffered = buffered.slice(idx + 2);
      processFrame(chunk);
      if (completed) return;
    }
  }

  // Proxies may close without a trailing blank line; keep the final frame.
  if (buffered.trim()) processFrame(buffered);
}

export function friendlyError(err: unknown): string {
  if (err instanceof CopilotServiceError) {
    switch (err.code) {
      case "unauthorized":       return "Your session has expired. Please sign in again.";
      case "invalid_request":    return err.message || "Please rephrase your message.";
      case "rate_limited":       return "Copilot is busy right now. Please retry in a moment.";
      case "provider_upstream":  return "AI service is temporarily unavailable. Please try again.";
      case "conversation_not_found": return "This conversation is no longer available.";
      case "server_misconfigured":   return "Copilot is not configured. Contact your admin.";
      default:                   return err.message || "Something went wrong.";
    }
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

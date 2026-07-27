import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { friendlyError, sendMessage } from "../services/copilotService";
import type { CopilotMessage } from "../types";
import { sanitizeInput } from "../utils/sanitize";

export type ChatStatus = "idle" | "submitting" | "streaming" | "error";

export function useCopilotChat(conversationId: string | null) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => () => {
    abortRef.current?.abort();
    abortRef.current = null;
    sendingRef.current = false;
  }, []);

  // Load persisted messages when thread changes.
  useEffect(() => {
    let cancel = false;
    if (!conversationId) { setMessages([]); setLoading(false); return; }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("copilot_messages")
        .select("id, conversation_id, role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (cancel) return;
      if (error) console.error("[copilot] load messages", error);
      const loaded = (data ?? []) as CopilotMessage[];
      // Hide identical consecutive legacy rows produced by the former
      // prompt-card race while preserving distinct failed questions.
      setMessages(loaded.filter((message, index) => {
        const previous = loaded[index - 1];
        return !(
          message.role === "user" &&
          previous?.role === "user" &&
          message.content.trim() === previous.content.trim()
        );
      }));
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [conversationId]);

  const send = useCallback(async (rawText: string) => {
    if (!conversationId) return;
    const text = sanitizeInput(rawText);
    // Use a ref-only reentry guard so a stale `status` (e.g. after an
    // abrupt SSE close) can never lock the composer.
    if (!text || sendingRef.current) return;
    sendingRef.current = true;

    // Everything from here on runs inside try/finally: if any step throws
    // before the network call even starts (e.g. crypto.randomUUID
    // unavailable in an insecure context, or a setState error), the guard
    // and status must still be released — otherwise every future send()
    // call silently no-ops forever with no visible error, which is the
    // "second message never sends" composer lock.
    let hadError = false;
    let controller: AbortController | null = null;
    let userMsg: CopilotMessage | null = null;
    let assistantMsg: CopilotMessage | null = null;

    try {
      const nowIso = new Date().toISOString();
      userMsg = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "user",
        content: text,
        created_at: nowIso,
      };
      assistantMsg = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "assistant",
        content: "",
        created_at: new Date(Date.now() + 1).toISOString(),
        streaming: true,
      };
      setMessages((prev) => [...prev, userMsg!, assistantMsg!]);
      setStatus("submitting");

      controller = new AbortController();
      abortRef.current = controller;
      let firstDelta = true;

      await sendMessage({
        conversationId,
        message: text,
        signal: controller.signal,
        onDelta: (delta) => {
          if (firstDelta) { firstDelta = false; setStatus("streaming"); }
          setMessages((prev) => prev.map((m) =>
            m.id === assistantMsg!.id ? { ...m, content: m.content + delta } : m
          ));
        },
      });
      setMessages((prev) => prev.map((m) =>
        m.id === assistantMsg!.id
          ? { ...m, streaming: false, content: m.content || "_(no response received)_" }
          : m
      ));
    } catch (err) {
      if (controller?.signal.aborted) {
        // Aborted (unmount/thread switch). Clear streaming flag; status reset in finally.
        if (assistantMsg) {
          const id = assistantMsg.id;
          setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, streaming: false } : m)));
        }
      } else {
        hadError = true;
        const msg = friendlyError(err);
        toast.error(msg);
        if (userMsg && assistantMsg && (err as { code?: string })?.code === "conversation_not_found") {
          const uid = userMsg.id;
          const aid = assistantMsg.id;
          setMessages((prev) => prev.filter((m) => m.id !== uid && m.id !== aid));
        } else if (assistantMsg) {
          const id = assistantMsg.id;
          // Preserve whatever streamed before the interruption — the server
          // has already persisted the same partial text.
          setMessages((prev) => prev.map((m) => {
            if (m.id !== id) return m;
            const partial = m.content.trim();
            return {
              ...m,
              streaming: false,
              content: partial ? `${partial}\n\n_⚠️ ${msg}_` : `⚠️ ${msg}`,
            };
          }));
        }
      }

    } finally {
      abortRef.current = null;
      sendingRef.current = false;
      // Always release the composer. Keep "error" briefly only if we set one;
      // callers can see it via toast — the UI must never stay busy.
      setStatus(hadError ? "error" : "idle");
    }
  }, [conversationId]);


  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }, []);

  return { messages, status, loading, send, stop };
}

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
    if (!text || sendingRef.current || status === "submitting" || status === "streaming") return;
    sendingRef.current = true;

    const nowIso = new Date().toISOString();
    const userMsg: CopilotMessage = {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      role: "user",
      content: text,
      created_at: nowIso,
    };
    const assistantMsg: CopilotMessage = {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      role: "assistant",
      content: "",
      created_at: new Date(Date.now() + 1).toISOString(),
      streaming: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStatus("submitting");

    const controller = new AbortController();
    abortRef.current = controller;
    let firstDelta = true;

    try {
      await sendMessage({
        conversationId,
        message: text,
        signal: controller.signal,
        onDelta: (delta) => {
          if (firstDelta) { firstDelta = false; setStatus("streaming"); }
          setMessages((prev) => prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: m.content + delta } : m
          ));
        },
      });
      setMessages((prev) => prev.map((m) =>
        m.id === assistantMsg.id
          ? { ...m, streaming: false, content: m.content || "_(no response received)_" }
          : m
      ));
      setStatus("idle");
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = friendlyError(err);
      toast.error(msg);
      if ((err as { code?: string })?.code === "conversation_not_found") {
        // The optimistic user/assistant pair was never persisted. Remove it so
        // a stale URL cannot leave repeated phantom errors in the transcript.
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.id !== assistantMsg.id));
      } else {
        setMessages((prev) => prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, streaming: false, content: `⚠️ ${msg}` }
            : m
        ));
      }
      setStatus("error");
    } finally {
      abortRef.current = null;
      sendingRef.current = false;
    }
  }, [conversationId, status]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }, []);

  return { messages, status, loading, send, stop };
}

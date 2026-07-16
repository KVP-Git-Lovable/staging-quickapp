import { useEffect, useRef } from "react";
import { useCopilotChat } from "../../hooks/useCopilotChat";
import { supabase } from "@/integrations/supabase/client";
import { useEffect as useReactEffect, useState } from "react";
import { MessageList } from "./MessageList";
import { ChatComposer, type ChatComposerHandle } from "./ChatComposer";
import { WelcomeHeader } from "./WelcomeHeader";
import { PromptCardGrid } from "../cards/PromptCardGrid";


interface Props {
  conversationId: string;
  onFirstMessage?: () => void;
}

export function ChatWindow({ conversationId, onFirstMessage }: Props) {
  const { messages, status, loading, send } = useCopilotChat(conversationId);
  const composerRef = useRef<ChatComposerHandle>(null);
  const [userName, setUserName] = useState<string | null>(null);

  useReactEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", user.id)
        .maybeSingle();
      setUserName(data?.full_name || data?.username || null);
    })();
  }, []);

  // Keep composer focused across thread switches and status changes.
  useEffect(() => { composerRef.current?.focus(); }, [conversationId, status]);

  const isBusy = status === "submitting" || status === "streaming";
  const isEmpty = !loading && messages.length === 0;

  const handleSend = (text: string) => {
    const wasEmpty = messages.length === 0;
    send(text);
    if (wasEmpty) onFirstMessage?.();
  };

  const pickPrompt = (prompt: string) => {
    if (isBusy) return;
    composerRef.current?.submit(prompt);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {isEmpty ? (
        <div className="flex-1 overflow-y-auto">
          <div className="min-h-full flex flex-col items-center justify-center gap-8 px-4 py-10">
            <WelcomeHeader userName={userName} />
            <PromptCardGrid onSelect={pickPrompt} disabled={isBusy} variant="grid" />
          </div>
        </div>
      ) : (
        <>
          <div className="border-b bg-background/60 px-4 py-2 flex items-center">
            <WelcomeHeader userName={userName} variant="compact" />
          </div>
          <MessageList messages={messages} showTyping={status === "submitting"} />
          <div className="border-t bg-background/60 px-4 py-2">
            <PromptCardGrid onSelect={pickPrompt} disabled={isBusy} variant="chips" />
          </div>
        </>
      )}
      <ChatComposer ref={composerRef} disabled={isBusy} onSend={handleSend} />
    </div>
  );
}

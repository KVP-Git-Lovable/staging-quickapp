import { useEffect, useRef } from "react";
import type { CopilotMessage } from "../../types";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

interface Props {
  messages: CopilotMessage[];
  showTyping: boolean;
}

export function MessageList({ messages, showTyping }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, showTyping]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-4">
        {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
        {showTyping && <TypingIndicator />}
        <div ref={endRef} />
      </div>
    </div>
  );
}

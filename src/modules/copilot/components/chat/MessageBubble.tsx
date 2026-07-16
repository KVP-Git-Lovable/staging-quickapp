import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import type { CopilotMessage } from "../../types";

export function MessageBubble({ message }: { message: CopilotMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-black text-white rounded-br-sm shadow-sm"
            : "text-foreground"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-pre:my-2">
            <ReactMarkdown>{message.content || "…"}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

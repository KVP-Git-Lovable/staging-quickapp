import { forwardRef, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_INPUT_CHARS } from "../../utils/sanitize";

export interface ChatComposerHandle {
  focus: () => void;
  setValue: (v: string) => void;
  submit: (v: string) => void;
}

interface Props {
  disabled?: boolean;
  onSend: (text: string) => void;
  placeholder?: string;
}

export const ChatComposer = forwardRef<ChatComposerHandle, Props>(function ChatComposer(
  { disabled, onSend, placeholder = "Ask Copilot anything…" }, ref,
) {
  const [value, setValue] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => areaRef.current?.focus(),
    setValue: (v) => setValue(v),
    submit: (v) => {
      const text = v.trim();
      if (!text || disabled) return;
      setValue("");
      onSend(text);
    },
  }), [disabled, onSend]);


  const submit = () => {
    if (disabled) return;
    const t = value.trim();
    if (!t) return;
    setValue("");
    onSend(t);
  };


  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t bg-background">
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="max-w-3xl mx-auto p-3 sm:p-4"
      >
        <div className="relative flex items-end gap-2 rounded-2xl border bg-card shadow-sm focus-within:ring-2 focus-within:ring-amber-400/50 px-3 py-2">
          <Textarea
            ref={areaRef}
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, MAX_INPUT_CHARS))}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={disabled}
            className="flex-1 resize-none border-0 shadow-none focus-visible:ring-0 min-h-[36px] max-h-40 p-1 bg-transparent"
          />
          <Button
            type="submit"
            size="icon"
            disabled={disabled || !value.trim()}
            className="copilot-action shrink-0 rounded-full text-warning hover:opacity-90"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>

        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-1.5">
          Copilot may make mistakes. Verify important information.
        </p>
      </form>
    </div>
  );
});

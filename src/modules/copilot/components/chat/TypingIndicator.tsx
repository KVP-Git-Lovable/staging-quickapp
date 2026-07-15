export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-2 text-muted-foreground text-sm">
      <span className="sr-only">Assistant is typing</span>
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" />
    </div>
  );
}

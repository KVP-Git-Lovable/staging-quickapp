import { MessageSquare, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CopilotConversation } from "../../types";

interface Props {
  items: CopilotConversation[];
  activeId?: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function ConversationSidebar({ items, activeId, onSelect, onNew, onDelete }: Props) {
  return (
    <aside className="w-64 shrink-0 border-r bg-muted/30 flex flex-col h-full">
      <div className="px-3 py-3 border-b flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <span className="font-semibold text-sm">Copilot</span>
      </div>

      <div className="p-2">
        <Button onClick={onNew} className="w-full" size="sm">
          <Plus className="w-4 h-4 mr-1.5" /> New chat
        </Button>
      </div>

      <div className="px-2 pb-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            disabled
            placeholder="Search conversations"
            className="pl-7 h-8 text-xs bg-background/60"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 py-4 text-center">
            No conversations yet.
          </p>
        )}
        {items.map((c) => (
          <div
            key={c.id}
            className={cn(
              "group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-accent transition-colors",
              c.id === activeId && "bg-accent",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className="flex-1 min-w-0 text-left flex items-center gap-2 text-sm"
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{c.title || "New chat"}</span>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
              aria-label="Delete conversation"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

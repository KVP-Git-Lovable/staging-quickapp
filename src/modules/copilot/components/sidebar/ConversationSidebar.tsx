import { MessageSquare, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CopilotConversation } from "../../types";
import { CopilotInsights } from "./CopilotInsights";

interface Props {
  items: CopilotConversation[];
  activeId?: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  deletingId?: string | null;
}

export function ConversationSidebar({ items, activeId, onSelect, onNew, onDelete, deletingId }: Props) {
  return (
    <aside className="copilot-chrome flex h-full w-64 shrink-0 flex-col border-r border-primary-foreground/10 text-primary-foreground">
      <div className="flex items-center gap-2 border-b border-primary-foreground/10 px-3 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-foreground/10">
          <Sparkles className="w-4 h-4 text-amber-400" />
        </div>
        <span className="text-sm font-semibold text-primary-foreground">Copilot</span>
      </div>

      <div className="p-2">
        <Button
          onClick={onNew}
          className="copilot-action w-full border border-warning/40 text-warning hover:opacity-90"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-1.5" /> New chat
        </Button>
      </div>

      <div className="px-2 pb-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary-foreground/60" />
          <Input
            disabled
            placeholder="Search conversations"
            className="h-8 border-primary-foreground/20 bg-primary-foreground/5 pl-7 text-xs text-primary-foreground placeholder:text-primary-foreground/50"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {items.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-primary-foreground/70">
            No conversations yet.
          </p>
        )}
        {items.map((c) => (
          <div
            key={c.id}
            className={cn(
              "group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-primary-foreground/10 transition-colors",
              c.id === activeId && "bg-primary-foreground/15",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className="flex-1 min-w-0 text-left flex items-center gap-2 text-sm text-primary-foreground"
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0 text-amber-300" />
              <span className="truncate">{c.title || "New chat"}</span>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
              disabled={Boolean(deletingId)}
              className="shrink-0 text-primary-foreground/60 opacity-0 hover:text-warning group-hover:opacity-100"
              aria-label="Delete conversation"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <CopilotInsights />
    </aside>
  );
}

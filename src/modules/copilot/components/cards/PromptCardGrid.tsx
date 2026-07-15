import { ArrowUpRight } from "lucide-react";
import { PROMPT_CARDS } from "../../prompts/promptCards";

interface Props {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
  variant?: "grid" | "chips";
}

export function PromptCardGrid({ onSelect, disabled, variant = "grid" }: Props) {
  if (variant === "chips") {
    return (
      <div className="flex flex-wrap gap-2 w-full max-w-3xl mx-auto">
        {PROMPT_CARDS.map((card) => (
          <button
            key={card.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(card.prompt)}
            className="text-xs rounded-full border bg-card px-3 py-1.5 text-foreground hover:border-primary/40 hover:bg-accent transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {card.title}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
      {PROMPT_CARDS.map((card) => (
        <button
          key={card.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(card.prompt)}
          className="group text-left rounded-xl border bg-card px-4 py-3.5 shadow-sm hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{card.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{card.subtitle}</p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
        </button>
      ))}
    </div>
  );
}

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
            className="text-xs rounded-full border border-green-800 bg-green-600 px-3 py-1.5 text-white hover:border-amber-400 hover:bg-green-500 transition-colors disabled:opacity-50 disabled:pointer-events-none"
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
          className="group text-left rounded-xl border border-green-800 bg-green-600 px-4 py-3.5 shadow-sm hover:shadow-md hover:border-amber-400 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{card.title}</p>
              <p className="text-xs text-white/80 mt-0.5 line-clamp-2">{card.subtitle}</p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-white/70 group-hover:text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
        </button>
      ))}
    </div>
  );
}

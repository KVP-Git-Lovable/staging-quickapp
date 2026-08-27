import { useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import { PROMPT_CARDS } from "../../prompts/promptCards";

interface Props {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
  variant?: "grid" | "chips";
}

export function PromptCardGrid({ onSelect, disabled, variant = "grid" }: Props) {
  // Mobile-only disclosure for the chips row in the chat window: the full
  // set of suggestion pills crowds a small screen, so it collapses into a
  // single "View suggestions" pill until tapped. Desktop is unchanged.
  const [mobileExpanded, setMobileExpanded] = useState(false);

  if (variant === "chips") {
    const chips = PROMPT_CARDS.map((card) => (
      <button
        key={card.id}
        type="button"
        disabled={disabled}
        onClick={() => onSelect(card.prompt)}
        className="copilot-action rounded-full border border-primary-foreground/15 px-3 py-1.5 text-xs text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
      >
        {card.title}
      </button>
    ));

    return (
      <div className="w-full max-w-3xl mx-auto">
        {/* Desktop / tablet: the original full chips row. */}
        <div className="hidden sm:flex flex-wrap gap-2">{chips}</div>

        {/* Mobile: collapsed into one small pill; tap to expand. */}
        <div className="sm:hidden">
          {mobileExpanded ? (
            <div className="flex flex-wrap gap-2">
              {chips}
              <button
                type="button"
                aria-expanded={true}
                onClick={() => setMobileExpanded(false)}
                className="copilot-action flex items-center gap-1 rounded-full border border-primary-foreground/15 px-3 py-1.5 text-xs text-primary-foreground/80 transition-opacity hover:opacity-90"
              >
                <ChevronUp className="h-3.5 w-3.5" />
                Hide suggestions
              </button>
            </div>
          ) : (
            <button
              type="button"
              aria-expanded={false}
              onClick={() => setMobileExpanded(true)}
              className="copilot-action flex items-center gap-1 rounded-full border border-primary-foreground/15 px-3 py-1.5 text-xs text-primary-foreground transition-opacity hover:opacity-90"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              View suggestions
            </button>
          )}
        </div>
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
          className="copilot-action group rounded-lg border border-primary-foreground/15 px-4 py-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-warning/60 hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-primary-foreground">{card.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-primary-foreground/80">{card.subtitle}</p>
            </div>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-primary-foreground/70 opacity-0 transition-opacity group-hover:text-warning group-hover:opacity-100" />
          </div>
        </button>
      ))}
    </div>
  );
}

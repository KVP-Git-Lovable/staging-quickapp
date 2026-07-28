import { useEffect, useMemo, useRef, useState } from "react";
import { TrendingDown, Clock, PackageX } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useCopilotTicker } from "../../hooks/useCopilotTicker";

const ROTATE_MS = 3000;

interface Slide {
  key: string;
  label: string;
  icon: typeof TrendingDown;
  entries: { name: string; metric: string }[];
}

export function CopilotTicker() {
  const { declining, lowYield, slowMovers, loading } = useCopilotTicker();
  const { format } = useCurrency();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const indexRef = useRef(0);

  const slides = useMemo<Slide[]>(() => {
    const list: Slide[] = [];
    if (declining.length) {
      list.push({
        key: "declining",
        label: "Declining purchases",
        icon: TrendingDown,
        entries: declining.map((r) => ({
          name: r.name,
          metric: `↓ ${Math.round(r.dropPct)}% · ${format(r.recentValue)}`,
        })),
      });
    }
    if (lowYield.length) {
      list.push({
        key: "lowYield",
        label: "High time, low value",
        icon: Clock,
        entries: lowYield.map((r) => ({
          name: r.name,
          metric: `${r.minutes} min · ${format(r.orderValue)}`,
        })),
      });
    }
    if (slowMovers.length) {
      list.push({
        key: "slowMovers",
        label: "Slow-moving products",
        icon: PackageX,
        entries: slowMovers.map((p) => ({
          name: p.name,
          metric: format(p.value),
        })),
      });
    }
    return list;
  }, [declining, lowYield, slowMovers, format]);

  useEffect(() => {
    if (indexRef.current >= slides.length) {
      indexRef.current = 0;
      setIndex(0);
    }
  }, [slides.length]);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const timer = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % slides.length;
      setIndex(indexRef.current);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [paused, slides.length]);

  const active = slides[index] ?? null;
  const Icon = active?.icon;

  return (
    <div
      className="copilot-ticker px-3 py-2 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-live="polite"
    >
      {!active ? (
        <p className="text-xs text-[hsl(var(--copilot-ticker-metric))] truncate">
          {loading ? "Gathering your insights…" : "Not enough data yet for insights."}
        </p>
      ) : (
        <div key={active.key} className="animate-fade-in flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--copilot-ticker-label))]">
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {active.label}
          </span>
          <span className="h-3.5 w-px shrink-0 bg-[hsl(var(--copilot-ticker-border))]" />
          <div className="flex items-center gap-3 whitespace-nowrap text-xs">
            {active.entries.map((entry, i) => (
              <span key={`${entry.name}-${i}`} className="flex items-center gap-1.5">
                <span className="font-semibold text-[hsl(var(--copilot-ticker-name))]">{entry.name}</span>
                <span className="text-[hsl(var(--copilot-ticker-metric))]">{entry.metric}</span>
                {i < active.entries.length - 1 ? (
                  <span className="text-[hsl(var(--copilot-ticker-border))]">•</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

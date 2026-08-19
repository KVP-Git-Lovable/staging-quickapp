import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Loader2, Sparkles, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { VoiceAutoFillResult } from "@/components/TableOrderForm";

/**
 * AI pitch suggestions for the Order Entry page — automatic, per retailer.
 *
 * Consumer of the ai-pitch-suggestions edge function, which follows the same
 * architecture as the AI Workflows agents: deterministic SQL-derived signals
 * (this retailer's reorder-due products, the rep's top-seller gaps, store
 * name/category affinity) with Together.ai narrating the computed facts.
 * "Take Action" auto-fills the suggested lines through the same mechanism
 * Voice Order and Smart Basket use.
 */

export interface PitchSuggestion {
  productId: string;
  name: string;
  qty: number;
  unit: string;
  tag: "reorder" | "top_seller" | "store_match";
  reason: string;
}

interface PitchResult {
  kind: string;
  retailerId: string;
  suggestions: PitchSuggestion[];
  summary?: string;
}

const TAG_STYLE: Record<PitchSuggestion["tag"], { label: string; cls: string }> = {
  reorder: { label: "Reorder due", cls: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300" },
  top_seller: { label: "Top seller", cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300" },
  store_match: { label: "Store match", cls: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300" },
};

const CACHE_TTL_MS = 10 * 60 * 1000;

interface Props {
  retailerId: string;
  onAutoFill: (results: VoiceAutoFillResult[]) => void;
}

export function PitchSuggestionsCard({ retailerId, onAutoFill }: Props) {
  const [result, setResult] = useState<PitchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!retailerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const cacheKey = `pitch_suggestions_${retailerId}`;

    void (async () => {
      // Session cache so navigating back and forth doesn't re-run the AI.
      try {
        const raw = sessionStorage.getItem(cacheKey);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached?.at && Date.now() - cached.at < CACHE_TTL_MS && cached.data?.kind === "pitch") {
            if (!cancelled) {
              setResult(cached.data);
              setLoading(false);
            }
            return;
          }
        }
      } catch { /* ignore cache errors */ }

      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) throw new Error("signed out");
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-pitch-suggestions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ retailerId }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
        if (!cancelled && body?.kind === "pitch") {
          setResult(body);
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data: body }));
          } catch { /* ignore quota */ }
        }
      } catch (e) {
        console.error("[PitchSuggestions] load failed:", e);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [retailerId]);

  const suggestions = result?.suggestions ?? [];

  const handleTakeAction = () => {
    if (!suggestions.length) return;
    onAutoFill(
      suggestions.map((s) => ({
        productId: s.productId,
        productName: s.name,
        quantity: s.qty,
        unit: s.unit || "",
        confidence: "high" as const,
        searchTerm: s.name,
      })),
    );
  };

  // Nothing to show and nothing coming — stay out of the way entirely.
  if (!retailerId || (!loading && !result && failed)) return null;
  if (!loading && suggestions.length === 0) return null;

  return (
    <Card className="overflow-hidden border-violet-200/70 dark:border-violet-900/40">
      <div className="h-0.5 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400" />
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15">
              <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </span>
            <p className="text-sm font-semibold">AI Pitch Suggestions</p>
            {loading && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> analysing this store…
              </span>
            )}
          </div>
          {!loading && suggestions.length > 0 && (
            <Button size="sm" className="gap-1.5" onClick={handleTakeAction}>
              <Zap className="h-3.5 w-3.5" />
              Take Action
            </Button>
          )}
        </div>

        {!loading && result?.summary && (
          <div className="mt-2 rounded-lg bg-violet-50/70 p-2.5 dark:bg-violet-950/30">
            <div className="prose prose-sm max-w-none text-xs leading-relaxed dark:prose-invert [&_p]:my-0.5 [&_ul]:my-0.5">
              <ReactMarkdown>{result.summary}</ReactMarkdown>
            </div>
          </div>
        )}

        {!loading && suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => {
              const tag = TAG_STYLE[s.tag];
              return (
                <span
                  key={s.productId + s.name}
                  title={s.reason}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1 pl-2.5 pr-1.5 text-xs"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground">×{s.qty}{s.unit ? ` ${s.unit}` : ""}</span>
                  <Badge variant="outline" className={`text-[9px] ${tag.cls}`}>{tag.label}</Badge>
                </span>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

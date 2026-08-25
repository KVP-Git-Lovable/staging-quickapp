import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ChevronUp, Loader2, Sparkles, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { readPitchCache, writePitchCache } from "@/utils/pitchSuggestionsCache";
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
  tag: "reorder" | "top_seller" | "store_match" | "beat_favourite" | "regular";
  reason: string;
}

interface PitchResult {
  kind: string;
  retailerId: string;
  isNewRetailer?: boolean;
  suggestions: PitchSuggestion[];
  summary?: string;
}

const TAG_STYLE: Record<PitchSuggestion["tag"], { label: string; cls: string }> = {
  reorder: { label: "Reorder due", cls: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300" },
  top_seller: { label: "Top seller", cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300" },
  store_match: { label: "Store match", cls: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300" },
  beat_favourite: { label: "Beat favourite", cls: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-300" },
  regular: { label: "Regular buy", cls: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300" },
};
// Server may introduce tags this build doesn't know yet — render, don't crash.
const FALLBACK_TAG = { label: "Suggested", cls: "border-border bg-muted text-muted-foreground" };

interface Props {
  retailerId: string;
  onAutoFill: (results: VoiceAutoFillResult[]) => void;
}

export function PitchSuggestionsCard({ retailerId, onAutoFill }: Props) {
  const [result, setResult] = useState<PitchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Details (summary + suggestion chips) are collapsed by default; only the
  // title and Take Action stay visible until the user opens "See more...".
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!retailerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    void (async () => {
      // Shared session cache — usually already warmed by the visits page
      // (prefetchPitchSuggestions), so the card renders instantly here.
      const cached = readPitchCache(retailerId);
      if (cached) {
        if (!cancelled) {
          setResult(cached);
          setLoading(false);
        }
        return;
      }

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
          writePitchCache(retailerId, body);
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
    <Card className="overflow-hidden border-2 border-red-500 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-100 dark:border-red-600 dark:from-amber-950/40 dark:via-yellow-950/30 dark:to-orange-950/30">
      <div className="h-1 bg-gradient-to-r from-red-500 via-amber-400 to-orange-500" />
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-red-500/15 to-amber-500/20">
              <Sparkles className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            </span>
            <p className="text-sm font-semibold">AI Pitch Suggestions</p>
            {!loading && result?.isNewRetailer && (
              <Badge variant="outline" className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                New retailer
              </Badge>
            )}
            {loading && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> analysing this store…
              </span>
            )}
          </div>
          {!loading && suggestions.length > 0 && (
            <Button
              size="sm"
              className="gap-1.5 bg-black text-white hover:bg-black/85 dark:bg-black dark:text-white dark:hover:bg-black/85"
              onClick={handleTakeAction}
            >
              <Zap className="h-3.5 w-3.5" />
              Take Action
            </Button>
          )}
        </div>

        {!loading && suggestions.length > 0 && expanded && (
          <div id="pitch-suggestions-details">
            {result?.summary && (
              <div className="mt-2 rounded-lg bg-white/60 p-2.5 dark:bg-black/20">
                <div className="prose prose-sm max-w-none text-xs leading-relaxed dark:prose-invert [&_p]:my-0.5 [&_ul]:my-0.5">
                  <ReactMarkdown>{result.summary}</ReactMarkdown>
                </div>
              </div>
            )}

            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((s) => {
                const tag = TAG_STYLE[s.tag] ?? FALLBACK_TAG;
                return (
                  <span
                    key={s.productId + s.name}
                    title={s.reason}
                    className="flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-white/70 py-1 pl-2.5 pr-1.5 text-xs dark:border-amber-900/50 dark:bg-black/20"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground">×{s.qty}{s.unit ? ` ${s.unit}` : ""}</span>
                    <Badge variant="outline" className={`text-[9px] ${tag.cls}`}>{tag.label}</Badge>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {!loading && suggestions.length > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="pitch-suggestions-details"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1.5 flex items-center gap-1 text-xs font-medium text-amber-900/80 hover:text-amber-950 dark:text-amber-200/80 dark:hover:text-amber-100"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? "See less" : "See more..."}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

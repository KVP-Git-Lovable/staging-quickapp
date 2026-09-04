// Ambient Order Scribe — passive speech-to-text card for /order-entry.
// Listens (only after an explicit Start) to the salesperson/store-owner
// conversation, shows the live transcript, and turns it into order rows
// ONLY when the user presses Accept. See useAmbientOrderScribe for the
// privacy contract (nothing persisted, transcript sent only on Accept).
import { useState } from "react";
import { Mic, MicOff, Pause, Play, Zap, Loader2, Square } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { AmbientOrderScribe } from "@/hooks/useAmbientOrderScribe";
import { SUPPORTED_LANGUAGES } from "@/hooks/useVoiceOrderAssistant";
import type { VoiceAutoFillResult } from "@/components/TableOrderForm";

interface OrderScribeCardProps {
  /** Shared capture session, owned by the parent so sibling cards (Retailer
   * Meet Summary) read the same transcript. Order-extraction logic is
   * unchanged. */
  scribe: AmbientOrderScribe;
  /** Applies validated results through the existing table auto-fill path. */
  onAccept: (results: VoiceAutoFillResult[]) => void;
}

export function OrderScribeCard({ scribe, onAccept }: OrderScribeCardProps) {
  const [accepting, setAccepting] = useState(false);

  if (!scribe.isSupported) {
    return (
      <Card className="border border-border bg-muted/30">
        <CardContent className="p-3 text-xs text-muted-foreground">
          <MicOff className="mr-1.5 inline h-3.5 w-3.5 align-text-bottom" />
          Voice capture isn't supported in this browser, so the Order Scribe is unavailable.
        </CardContent>
      </Card>
    );
  }

  const listening = scribe.status === "listening";
  const processing = scribe.status === "processing" || accepting;
  const hasText = !!(scribe.transcript || scribe.interim);

  const handleAccept = async () => {
    if (processing || !hasText) return;
    setAccepting(true);
    try {
      const outcome = await scribe.acceptTranscript(onAccept);
      if (outcome.applied.length) {
        // applyVoiceAutoFill shows its own "added" toast; report skips here.
        if (outcome.skipped.length) {
          toast({
            title: `Skipped ${outcome.skipped.length} item${outcome.skipped.length > 1 ? "s" : ""}`,
            description: `Not found in the product list: ${outcome.skipped.join(", ")}`,
          });
        }
      } else {
        toast({
          title: "Couldn't turn that into order items",
          description: outcome.skipped.length
            ? `Not recognised: ${outcome.skipped.join(", ")}. The text is kept — edit your wording and try Accept again.`
            : "No products were recognised in the speech. The text is kept so you can try again.",
          variant: "destructive",
        });
      }
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Card className="overflow-hidden border-2 border-indigo-300 bg-gradient-to-br from-indigo-50 via-sky-50 to-violet-50 dark:border-indigo-800 dark:from-indigo-950/40 dark:via-sky-950/30 dark:to-violet-950/30">
      <div className="h-1 bg-gradient-to-r from-indigo-500 via-sky-400 to-violet-500" />
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-sky-500/20">
              <Mic className="h-4 w-4 text-indigo-700 dark:text-indigo-400" />
              {listening && (
                <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
                </span>
              )}
            </span>
            <div>
              <p className="text-sm font-semibold">Order Scribe</p>
              <p className="text-[10px] leading-tight text-muted-foreground">
                {scribe.status === "idle" && "Not listening"}
                {listening && <span className="font-medium text-red-600 dark:text-red-400">Listening…</span>}
                {scribe.status === "paused" && "Paused"}
                {processing && "Working…"}
                {scribe.status === "error" && "Stopped"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Select value={scribe.language} onValueChange={scribe.setLanguage} disabled={processing}>
              <SelectTrigger type="button" className="h-8 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code} className="text-xs">
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {scribe.status === "idle" || scribe.status === "error" ? (
              <Button type="button" size="sm" className="gap-1.5" onClick={scribe.start} disabled={processing}>
                <Mic className="h-3.5 w-3.5" />
                Start Listening
              </Button>
            ) : (
              <>
                {listening ? (
                  <Button type="button" size="sm" variant="outline" className="gap-1" onClick={scribe.pause} disabled={processing} title="Pause listening">
                    <Pause className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="outline" className="gap-1" onClick={scribe.start} disabled={processing} title="Resume listening">
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={scribe.stop} disabled={processing} title="Stop listening">
                  <Square className="h-3.5 w-3.5" />
                </Button>
              </>
            )}

            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-black text-white hover:bg-black/85 dark:bg-black dark:text-white dark:hover:bg-black/85"
              onClick={handleAccept}
              disabled={!hasText || processing}
            >
              {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Accept
            </Button>
          </div>
        </div>

        {scribe.status === "error" && scribe.error && (
          <p className="mt-2 text-xs text-destructive">{scribe.error}</p>
        )}

        {(hasText || listening || scribe.status === "paused") && (
          <div className="mt-2 rounded-lg bg-white/60 p-2.5 text-sm leading-snug dark:bg-black/20">
            {hasText ? (
              <>
                <span>{scribe.transcript}</span>
                {scribe.interim && (
                  <span className="text-muted-foreground/70"> {scribe.interim}</span>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                Speak the order — e.g. "3 kg adarak, 2 kg red label aur 5 kilo kadak gold 250"…
              </span>
            )}
            {hasText && !processing && (
              <div className="mt-1.5 text-right">
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                  onClick={scribe.clearTranscript}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}

        <p className="mt-2 text-[10px] leading-tight text-muted-foreground">
          Heard speech may be processed by your browser's speech service. Nothing is saved; text is
          used only when you press Accept.
        </p>
      </CardContent>
    </Card>
  );
}

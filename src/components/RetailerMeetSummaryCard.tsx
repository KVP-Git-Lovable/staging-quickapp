// Retailer Meet Summary — AI minutes-of-meeting from the SAME Order Scribe
// capture session. Purely informational: no order actions, nothing applied
// anywhere. The transcript is sent to the backend ONLY when the user presses
// Generate MOM; the notes are ephemeral (memory only) unless the user copies
// them out. A MOM failure never affects order extraction and vice versa —
// the two consumers of the shared transcript are fully independent.
import { useState } from "react";
import { NotebookPen, Loader2, Copy, Pencil, Check, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { AmbientOrderScribe } from "@/hooks/useAmbientOrderScribe";

const MOM_TIMEOUT_MS = 15000;
const MAX_TRANSCRIPT_CHARS = 6000;

interface Mom {
  summary: string;
  discussionPoints: string[];
  customerNeeds: string[];
  commitments: string[];
  followUps: string[];
  issues: string[];
  nextVisit: string | null;
}

interface RetailerMeetSummaryCardProps {
  scribe: AmbientOrderScribe;
  retailerName?: string;
  /** Optional context: order lines already captured (labels only). */
  getOrderItems?: () => string[];
}

function momToText(mom: Mom, retailerName?: string): string {
  const section = (title: string, items: string[]) =>
    items.length ? `\n${title}:\n${items.map((i) => `- ${i}`).join("\n")}` : "";
  return [
    retailerName ? `Retailer Meet Summary — ${retailerName}` : "Retailer Meet Summary",
    "",
    mom.summary,
    section("Key discussion points", mom.discussionPoints),
    section("Customer needs", mom.customerNeeds),
    section("Commitments", mom.commitments),
    section("Follow-ups", mom.followUps),
    section("Issues / opportunities", mom.issues),
    mom.nextVisit ? `\nNext visit: ${mom.nextVisit}` : "",
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function RetailerMeetSummaryCard({ scribe, retailerName, getOrderItems }: RetailerMeetSummaryCardProps) {
  const [generating, setGenerating] = useState(false);
  const [momText, setMomText] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!scribe.isSupported) return null; // Order Scribe card already explains

  const transcriptNow = `${scribe.transcript} ${scribe.interim}`.trim();

  const generate = async () => {
    if (generating) return;
    const snapshot = transcriptNow.slice(-MAX_TRANSCRIPT_CHARS);
    if (!snapshot) return;
    setGenerating(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MOM_TIMEOUT_MS);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ambient-mom-parser`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transcript: snapshot,
            retailerName: retailerName || undefined,
            orderItems: getOrderItems?.() ?? [],
          }),
          signal: controller.signal,
        },
      );
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.mom?.summary) {
        throw new Error(data?.error || `MOM service error (${resp.status})`);
      }
      setMomText(momToText(data.mom as Mom, retailerName));
      setEditing(false);
    } catch (err: any) {
      setError(
        err?.name === "AbortError"
          ? "MOM generation timed out — please try again."
          : err?.message || "Could not generate the summary.",
      );
    } finally {
      clearTimeout(timer);
      setGenerating(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(momText);
      toast({ title: "✓ Summary copied" });
    } catch {
      toast({ title: "Couldn't copy", description: "Select and copy the text manually.", variant: "destructive" });
    }
  };

  return (
    <Card className="overflow-hidden border-2 border-indigo-300 bg-gradient-to-br from-indigo-50 via-sky-50 to-violet-50 dark:border-indigo-800 dark:from-indigo-950/40 dark:via-sky-950/30 dark:to-violet-950/30">
      <div className="h-1 bg-gradient-to-r from-violet-500 via-sky-400 to-indigo-500" />
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/15 to-indigo-500/20">
              <NotebookPen className="h-4 w-4 text-indigo-700 dark:text-indigo-400" />
            </span>
            <div>
              <p className="text-sm font-semibold">Retailer Meet Summary</p>
              <p className="text-[10px] leading-tight text-muted-foreground">
                Notes from the same conversation — nothing is ordered from here
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {momText && (
              <>
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setEditing((e) => !e)} disabled={generating} title="Edit summary">
                  {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                </Button>
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={copy} disabled={generating || editing} title="Copy summary">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-black text-white hover:bg-black/85 dark:bg-black dark:text-white dark:hover:bg-black/85"
              onClick={generate}
              disabled={!transcriptNow || generating}
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {momText ? "Regenerate" : "Generate MOM"}
            </Button>
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

        {momText ? (
          editing ? (
            <Textarea
              className="mt-2 min-h-[140px] bg-white/70 text-sm dark:bg-black/20"
              value={momText}
              onChange={(e) => setMomText(e.target.value)}
            />
          ) : (
            <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white/60 p-2.5 text-sm leading-snug dark:bg-black/20">
              {momText}
            </div>
          )
        ) : (
          <p className="mt-2 rounded-lg bg-white/60 p-2.5 text-xs text-muted-foreground dark:bg-black/20">
            Finish the conversation, then press Generate MOM. The notes come out in the language
            spoken (Hindi stays Hindi, English stays English) and are kept only on this screen
            unless you copy them.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

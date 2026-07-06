import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, MapPin, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Candidate {
  candidate_user_id: string;
  candidate_name: string;
  distance_km: number | null;
  planned_load: number;
  is_free: boolean;
  score: number;
}

interface Props {
  beatId: string;
  beatName?: string | null;
  date: string;
  absentUserId: string;
  onAssigned?: () => void;
}

export function BeatCoverSuggestion({ beatId, beatName, date, absentUserId, onAssigned }: Props) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [open, setOpen] = useState(false);

  const suggest = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("suggest_beat_cover", {
        p_beat_id: beatId,
        p_date: date,
        p_absent_user: absentUserId,
      });
      if (error) throw error;
      const list = (data || []) as Candidate[];
      setCandidates(list);
      setOpen(true);
      if (list.length === 0) toast.info("No eligible reps found");
    } catch (e: any) {
      toast.error(e?.message || "Failed to fetch suggestions");
    } finally {
      setLoading(false);
    }
  };

  const assign = async (c: Candidate) => {
    setAssigning(c.candidate_user_id);
    try {
      const { data, error } = await (supabase as any).rpc("assign_beat_cover", {
        p_beat_id: beatId,
        p_date: date,
        p_absent_user: absentUserId,
        p_cover_user: c.candidate_user_id,
      });
      if (error) throw error;
      const moved = typeof data === "number" ? data : 0;
      toast.success(`Moved ${moved} retailer${moved === 1 ? "" : "s"} to ${c.candidate_name}`);
      setOpen(false);
      setCandidates(null);
      qc.invalidateQueries({ queryKey: ["bc-dra"] });
      qc.invalidateQueries({ queryKey: ["rep-workload-today"] });
      qc.invalidateQueries({ queryKey: ["bc-absent-retailers"] });
      onAssigned?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to assign cover");
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div className="border rounded-md p-2 space-y-2 bg-muted/20">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium truncate">
          Beat: <span className="text-foreground">{beatName || beatId}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="text-purple-600 border-purple-300 hover:bg-purple-50 h-7"
          onClick={suggest}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 mr-1" />
          )}
          Suggest cover (AI)
        </Button>
      </div>

      {open && candidates && candidates.length > 0 && (
        <div className="space-y-1">
          {candidates.map((c, idx) => (
            <div
              key={c.candidate_user_id}
              className="flex items-center gap-2 p-2 rounded-md border bg-background text-xs"
            >
              <Badge variant="outline" className="text-[10px] shrink-0">#{idx + 1}</Badge>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{c.candidate_name}</div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {c.distance_km != null ? `${Number(c.distance_km).toFixed(1)} km` : "distance n/a"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {c.planned_load} planned
                  </span>
                  {c.is_free && (
                    <Badge className="h-4 px-1.5 text-[9px] bg-emerald-600 hover:bg-emerald-600">
                      Free
                    </Badge>
                  )}
                  <span className={cn("ml-auto", idx === 0 && "text-emerald-600 font-medium")}>
                    score {Number(c.score).toFixed(1)}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                className="h-7"
                onClick={() => assign(c)}
                disabled={assigning === c.candidate_user_id}
              >
                {assigning === c.candidate_user_id && (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                )}
                Assign
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RetailerBeatAssignment {
  id: string;
  retailer_id: string;
  beat_id: string;
  beat_name: string | null;
  assigned_from: string;
  assigned_to: string | null;
  is_current: boolean;
  assigned_by: string | null;
  removed_by: string | null;
  transfer_reason: string | null;
}

interface Options {
  retailerId?: string;
  beatId?: string;
}

export const useRetailerBeatHistory = ({ retailerId, beatId }: Options) => {
  const [rows, setRows] = useState<RetailerBeatAssignment[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!retailerId && !beatId) return;
    setLoading(true);
    try {
      let q = supabase
        .from("retailer_beat_assignments" as any)
        .select("*")
        .order("assigned_from", { ascending: false })
        .limit(500);
      if (retailerId) q = q.eq("retailer_id", retailerId);
      if (beatId) q = q.eq("beat_id", beatId);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data as any) || []);
    } catch (e) {
      console.error("useRetailerBeatHistory", e);
    } finally {
      setLoading(false);
    }
  }, [retailerId, beatId]);

  useEffect(() => {
    load();
  }, [load]);

  return { rows, loading, reload: load };
};

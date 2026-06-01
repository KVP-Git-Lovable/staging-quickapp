import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type BeatDeletability = { deletable: boolean; reasons: string[] };

export const useBeatLifecycle = () => {
  const [loading, setLoading] = useState(false);

  const canDelete = useCallback(async (beatId: string): Promise<BeatDeletability> => {
    const { data, error } = await supabase.rpc("can_delete_beat" as any, { p_beat_id: beatId });
    if (error) {
      console.error("can_delete_beat error", error);
      return { deletable: false, reasons: ["Unable to verify references. Try again."] };
    }
    const d: any = data || {};
    return { deletable: !!d.deletable, reasons: Array.isArray(d.reasons) ? d.reasons : [] };
  }, []);

  const deactivate = useCallback(async (beatId: string, beatName?: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc("deactivate_beat" as any, { p_beat_id: beatId });
      if (error) throw error;
      toast.success(`Beat${beatName ? ` "${beatName}"` : ""} deactivated`);
      return true;
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to deactivate beat");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const reactivate = useCallback(async (beatId: string, beatName?: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc("reactivate_beat" as any, { p_beat_id: beatId });
      if (error) throw error;
      toast.success(`Beat${beatName ? ` "${beatName}"` : ""} reactivated`);
      return true;
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to reactivate beat");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const deletePermanent = useCallback(async (beatId: string, beatName?: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc("delete_beat_permanent" as any, { p_beat_id: beatId });
      if (error) throw error;
      toast.success(`Beat${beatName ? ` "${beatName}"` : ""} deleted`);
      return true;
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Beat has historical data and cannot be deleted");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const transferRetailer = useCallback(
    async (retailerId: string, newBeatId: string, reason?: string) => {
      setLoading(true);
      try {
        const { error } = await supabase.rpc("transfer_retailer_beat" as any, {
          p_retailer_id: retailerId,
          p_new_beat_id: newBeatId,
          p_reason: reason ?? null,
        });
        if (error) throw error;
        toast.success("Retailer transferred");
        return true;
      } catch (e: any) {
        console.error(e);
        toast.error(e.message || "Failed to transfer retailer");
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { loading, canDelete, deactivate, reactivate, deletePermanent, transferRetailer };
};

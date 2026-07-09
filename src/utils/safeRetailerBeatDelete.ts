/**
 * Centralized "delete or deactivate" guards for retailers and beats.
 *
 * Rule: if the entity has any historical references (orders, visits, credit,
 * payments, assignments), we MUST NOT hard-delete it. We soft-deactivate
 * instead so the history stays intact.
 */

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { moveToRecycleBin } from "@/utils/recycleBinUtils";

export type SafeDeleteResult = { action: "deactivated" | "deleted" | "failed"; error?: string };

const isFkViolation = (err: any) =>
  !!err && (err.code === "23503" || /foreign key/i.test(err.message || ""));

/**
 * Delete a retailer if it has zero history; otherwise mark it inactive.
 */
export async function deactivateOrDeleteRetailer(
  retailerId: string,
  recordData?: Record<string, any>
): Promise<SafeDeleteResult> {
  try {
    const { data: hasHistory, error: rpcErr } = await supabase.rpc(
      "retailer_has_history" as any,
      { p_retailer_id: retailerId }
    );

    if (rpcErr) {
      // Fail closed → deactivate rather than risk destroying history.
      console.error("retailer_has_history rpc failed, deactivating as fallback", rpcErr);
      return await softDeactivateRetailer(retailerId);
    }

    if (hasHistory === true) {
      const res = await softDeactivateRetailer(retailerId);
      if (res.action === "deactivated") {
        toast.info("Has order history — moved to Inactive instead of deleted.");
      }
      return res;
    }

    // No history → safe hard delete (recycle-bin first if data provided).
    if (recordData) {
      await moveToRecycleBin({
        tableName: "retailers",
        recordId: retailerId,
        recordData,
        moduleName: "Retailers",
        recordName: recordData.name || "Retailer",
      }).catch((e) => console.warn("recycle bin move failed (continuing):", e));
    }

    const { error: delErr } = await supabase
      .from("retailers")
      .delete()
      .eq("id", retailerId);

    if (delErr) {
      if (isFkViolation(delErr)) {
        const res = await softDeactivateRetailer(retailerId);
        if (res.action === "deactivated") {
          toast.info("Has order history — moved to Inactive instead of deleted.");
        }
        return res;
      }
      throw delErr;
    }

    toast.success("Retailer deleted.");
    return { action: "deleted" };
  } catch (e: any) {
    console.error("deactivateOrDeleteRetailer failed:", e);
    toast.error(e?.message || "Failed to delete retailer");
    return { action: "failed", error: e?.message };
  }
}

async function softDeactivateRetailer(retailerId: string): Promise<SafeDeleteResult> {
  const { error } = await supabase
    .from("retailers")
    .update({ status: "inactive" })
    .eq("id", retailerId);
  if (error) {
    console.error("Retailer deactivate failed:", error);
    toast.error(error.message || "Failed to deactivate retailer");
    return { action: "failed", error: error.message };
  }
  return { action: "deactivated" };
}

/**
 * Delete a beat if it has zero history; otherwise mark it inactive.
 * `beatId` is the text beat_id (not the uuid `id`).
 */
export async function deactivateOrDeleteBeat(beatId: string): Promise<SafeDeleteResult> {
  try {
    const { data: hasHistory, error: rpcErr } = await supabase.rpc(
      "beat_has_history" as any,
      { p_beat_id: beatId }
    );

    if (rpcErr) {
      console.error("beat_has_history rpc failed, deactivating as fallback", rpcErr);
      return await softDeactivateBeat(beatId);
    }

    if (hasHistory === true) {
      const res = await softDeactivateBeat(beatId);
      if (res.action === "deactivated") {
        toast.info("Beat has retailers/orders — moved to Inactive instead of deleted.");
      }
      return res;
    }

    const { error: delErr } = await supabase
      .from("beats")
      .delete()
      .eq("beat_id", beatId);

    if (delErr) {
      if (isFkViolation(delErr)) {
        const res = await softDeactivateBeat(beatId);
        if (res.action === "deactivated") {
          toast.info("Beat has retailers/orders — moved to Inactive instead of deleted.");
        }
        return res;
      }
      throw delErr;
    }

    toast.success("Beat deleted.");
    return { action: "deleted" };
  } catch (e: any) {
    console.error("deactivateOrDeleteBeat failed:", e);
    toast.error(e?.message || "Failed to delete beat");
    return { action: "failed", error: e?.message };
  }
}

async function softDeactivateBeat(beatId: string): Promise<SafeDeleteResult> {
  const { error } = await supabase
    .from("beats")
    .update({ is_active: false })
    .eq("beat_id", beatId);
  if (error) {
    console.error("Beat deactivate failed:", error);
    toast.error(error.message || "Failed to deactivate beat");
    return { action: "failed", error: error.message };
  }
  return { action: "deactivated" };
}

/**
 * Resolve a beat's text `beat_id` from its uuid `id`. Used by offline code paths
 * that only know the uuid.
 */
export async function resolveBeatTextId(uuidId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("beats")
    .select("beat_id")
    .eq("id", uuidId)
    .maybeSingle();
  if (error) {
    console.error("resolveBeatTextId failed:", error);
    return null;
  }
  return (data as any)?.beat_id ?? null;
}

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { offlineStorage, STORES } from "@/lib/offlineStorage";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, XCircle } from "lucide-react";

export type OrderSyncState = "synced" | "pending" | "syncing" | "retrying" | "failed";

export interface OrderSyncStatus {
  state: OrderSyncState;
  isLocalOnly: boolean;
  error?: string | null;
  attempts?: number;
  lastAttemptAt?: string | null;
  idempotencyKey?: string | null;
  queueId?: string | null;
}

export type OrderSyncStatusMap = Record<string, OrderSyncStatus>;

interface OrderLike {
  id: string;
  idempotency_key?: string | null;
}

/**
 * Derive per-order sync status by combining:
 *  - STORES.ORDERS (local sync_status stamped by useOfflineSync)
 *  - STORES.SYNC_QUEUE (unprocessed CREATE_ORDER actions)
 *  - failed_sync_log (unresolved server-side failures)
 * Orders that don't appear locally are treated as confirmed in DB → 'synced'.
 */
export function useOrderSyncStatuses(
  userId: string | undefined,
  orders: OrderLike[],
): { statuses: OrderSyncStatusMap; refresh: () => void } {
  const [statuses, setStatuses] = useState<OrderSyncStatusMap>({});
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const orderKey = orders.map((o) => `${o.id}:${o.idempotency_key || ""}`).join("|");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!orders.length) {
        setStatuses({});
        return;
      }
      try {
        const [localOrders, syncQueue] = await Promise.all([
          offlineStorage.getAll<any>(STORES.ORDERS).catch(() => []),
          offlineStorage.getSyncQueue().catch(() => [] as any[]),
        ]);

        // Index local orders by id + idempotency_key
        const localById = new Map<string, any>();
        const localByKey = new Map<string, any>();
        for (const l of localOrders) {
          if (l?.id) localById.set(l.id, l);
          if (l?.idempotency_key) localByKey.set(l.idempotency_key, l);
        }
        const queueByOrderId = new Map<string, any>();
        const queueByKey = new Map<string, any>();
        for (const q of syncQueue) {
          if (q?.action !== "CREATE_ORDER") continue;
          const oid = q?.data?.order?.id;
          const key = q?.data?.order?.idempotency_key;
          if (oid) queueByOrderId.set(oid, q);
          if (key) queueByKey.set(key, q);
        }

        // Collect idempotency keys to query failed_sync_log
        const keys = new Set<string>();
        for (const o of orders) {
          const key =
            o.idempotency_key ||
            localById.get(o.id)?.idempotency_key ||
            queueByOrderId.get(o.id)?.data?.order?.idempotency_key;
          if (key) keys.add(key);
        }

        let failedByKey = new Map<string, any>();
        if (userId && keys.size > 0) {
          const { data } = await supabase
            .from("failed_sync_log")
            .select("idempotency_key, error, retry_count, last_failed_at")
            .in("idempotency_key", Array.from(keys))
            .is("resolved_at", null);
          if (data) {
            for (const row of data as any[]) {
              failedByKey.set(row.idempotency_key, row);
            }
          }
        }

        // DB-truth check: which orders are confirmed with ≥1 line item?
        const orderIds = orders.map((o) => o.id).filter(Boolean);
        const idemKeys = Array.from(
          new Set(
            orders
              .map(
                (o) =>
                  o.idempotency_key ||
                  localById.get(o.id)?.idempotency_key ||
                  queueByOrderId.get(o.id)?.data?.order?.idempotency_key ||
                  null,
              )
              .filter((k): k is string => !!k),
          ),
        );

        const confirmedIds = new Set<string>();
        const confirmedKeys = new Set<string>();
        try {
          const orFilters: string[] = [];
          if (orderIds.length) orFilters.push(`id.in.(${orderIds.join(",")})`);
          if (idemKeys.length)
            orFilters.push(
              `idempotency_key.in.(${idemKeys.map((k) => `"${k}"`).join(",")})`,
            );
          if (orFilters.length) {
            const { data: dbOrders } = await supabase
              .from("orders")
              .select("id, idempotency_key, order_items!inner(id)")
              .or(orFilters.join(","))
              .limit(1000);
            if (dbOrders) {
              for (const row of dbOrders as any[]) {
                if (row?.id) confirmedIds.add(row.id);
                if (row?.idempotency_key) confirmedKeys.add(row.idempotency_key);
              }
            }
          }
        } catch (e) {
          console.warn("[useOrderSyncStatuses] DB confirmation query failed:", e);
        }

        const next: OrderSyncStatusMap = {};
        for (const o of orders) {
          const local =
            localById.get(o.id) ||
            (o.idempotency_key ? localByKey.get(o.idempotency_key) : undefined);
          const key =
            o.idempotency_key ||
            local?.idempotency_key ||
            queueByOrderId.get(o.id)?.data?.order?.idempotency_key ||
            null;
          const queueItem =
            queueByOrderId.get(o.id) || (key ? queueByKey.get(key) : undefined);
          const failedRow = key ? failedByKey.get(key) : undefined;

          const localSyncStatus: string | undefined = local?.sync_status;
          const confirmedInDb =
            confirmedIds.has(o.id) || (key ? confirmedKeys.has(key) : false);

          let state: OrderSyncState = "synced";
          let isLocalOnly = !!local && localSyncStatus !== "synced";

          if (confirmedInDb) {
            // DB is source of truth — self-heal stale local artifacts
            state = "synced";
            isLocalOnly = false;
            if (local) {
              offlineStorage.delete(STORES.ORDERS, local.id).catch(() => {});
            }
            if (queueItem?.id) {
              offlineStorage
                .delete(STORES.SYNC_QUEUE, queueItem.id)
                .catch(() => {});
            }
          } else if (failedRow || localSyncStatus === "failed") {
            state = "failed";
          } else if (
            localSyncStatus === "syncing" ||
            localSyncStatus === "retrying" ||
            localSyncStatus === "pending" ||
            (!!queueItem && localSyncStatus !== "synced")
          ) {
            state =
              localSyncStatus === "syncing"
                ? "syncing"
                : localSyncStatus === "retrying"
                  ? "retrying"
                  : "pending";
          } else if (local && (local.status === 'confirmed' || local.status === 'delivered' || local.invoice_number)) {
            state = 'synced'; isLocalOnly = false;
          } else if (isLocalOnly && !localSyncStatus) {
            state = "pending";
          }

          next[o.id] = {
            state,
            isLocalOnly: state !== "synced" && isLocalOnly,
            error:
              state === "synced"
                ? null
                : (failedRow?.error as string) ||
                  (typeof local?.sync_error === "string"
                    ? local.sync_error
                    : local?.sync_error?.message) ||
                  null,
            attempts:
              (failedRow?.retry_count as number) ||
              (local?.sync_attempts as number) ||
              (queueItem?.retryCount as number) ||
              0,
            lastAttemptAt:
              (failedRow?.last_failed_at as string) ||
              (local?.last_attempt_at as string) ||
              null,
            idempotencyKey: key,
            queueId: state === "synced" ? null : queueItem?.id || null,
          };
        }

        if (!cancelled) setStatuses(next);
      } catch (e) {
        console.warn("[useOrderSyncStatuses] failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, orderKey, tick]);

  // Refresh on sync events
  useEffect(() => {
    const on = () => refresh();
    window.addEventListener("syncComplete", on);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("syncComplete", on);
      window.removeEventListener("online", on);
    };
  }, [refresh]);

  return { statuses, refresh };
}

const STYLES: Record<OrderSyncState, { dot: string; label: string; text: string }> = {
  synced: { dot: "bg-green-500", label: "Synced", text: "text-green-700 dark:text-green-400" },
  pending: { dot: "bg-amber-500", label: "Pending", text: "text-amber-700 dark:text-amber-400" },
  syncing: { dot: "bg-amber-500 animate-pulse", label: "Syncing", text: "text-amber-700 dark:text-amber-400" },
  retrying: { dot: "bg-amber-500 animate-pulse", label: "Retrying", text: "text-amber-700 dark:text-amber-400" },
  failed: { dot: "bg-red-500", label: "Failed", text: "text-red-700 dark:text-red-400" },
};

export function OrderSyncBadge({ status }: { status?: OrderSyncStatus }) {
  const s = status?.state || "synced";
  const style = STYLES[s];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium ${style.text}`}
      title={`Order ${style.label}`}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

/**
 * Trigger a re-sync of a specific queued order (reset retry count) and kick the queue.
 */
export async function retryOrderSync(status: OrderSyncStatus): Promise<void> {
  try {
    const queue = await offlineStorage.getSyncQueue();
    const target = queue.find(
      (q: any) =>
        q?.action === "CREATE_ORDER" &&
        (q?.id === status.queueId ||
          (status.idempotencyKey &&
            q?.data?.order?.idempotency_key === status.idempotencyKey)),
    );
    if (target) {
      (target as any).retryCount = 0;
      (target as any).nextRetryAt = Date.now();
      await offlineStorage.save(STORES.SYNC_QUEUE, target);
    }
    // Clear failed_sync_log lock so RPC can attempt again
    if (status.idempotencyKey) {
      try {
        await supabase
          .from("failed_sync_log")
          .update({ resolved_at: new Date().toISOString(), resolved_by: "manual_retry" })
          .eq("idempotency_key", status.idempotencyKey)
          .is("resolved_at", null);
      } catch {
        /* non-fatal */
      }
    }
    // Fire online event to nudge processSyncQueue subscribers
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new CustomEvent("trigger-sync"));
    toast({ title: "Retrying sync", description: "Order re-queued for immediate sync." });
  } catch (e: any) {
    toast({ title: "Retry failed", description: e?.message || String(e), variant: "destructive" });
  }
}

/**
 * Cancel a stuck order:
 *  - If it never reached the DB (isLocalOnly), remove from STORES.ORDERS + SYNC_QUEUE.
 *  - If it did reach the DB, soft-cancel via status='cancelled'.
 * Also resolves any failed_sync_log row.
 */
export async function cancelStuckOrder(
  orderId: string,
  status: OrderSyncStatus,
): Promise<void> {
  try {
    // Check DB presence for the order
    let existsInDb = false;
    try {
      const { data } = await supabase
        .from("orders")
        .select("id")
        .eq("id", orderId)
        .maybeSingle();
      existsInDb = !!data;
    } catch {
      /* ignore */
    }

    if (existsInDb) {
      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", orderId);
      if (error) throw error;
    } else {
      // Local-only: purge from ORDERS + SYNC_QUEUE
      try {
        await offlineStorage.delete(STORES.ORDERS, orderId);
      } catch {
        /* ignore */
      }
      try {
        const queue = await offlineStorage.getSyncQueue();
        for (const q of queue) {
          const oid = (q as any)?.data?.order?.id;
          const key = (q as any)?.data?.order?.idempotency_key;
          if (
            oid === orderId ||
            (status.idempotencyKey && key === status.idempotencyKey)
          ) {
            await offlineStorage.delete(STORES.SYNC_QUEUE, (q as any).id);
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (status.idempotencyKey) {
      try {
        await supabase
          .from("failed_sync_log")
          .update({ resolved_at: new Date().toISOString(), resolved_by: "user_cancelled" })
          .eq("idempotency_key", status.idempotencyKey)
          .is("resolved_at", null);
      } catch {
        /* ignore */
      }
    }
    toast({
      title: existsInDb ? "Order cancelled" : "Order discarded",
      description: existsInDb
        ? "The DB record was marked cancelled. You can place a fresh order."
        : "The local order was removed. You can place a fresh order.",
    });
    window.dispatchEvent(new CustomEvent("syncComplete"));
  } catch (e: any) {
    toast({
      title: "Cancel failed",
      description: e?.message || String(e),
      variant: "destructive",
    });
  }
}

export function OrderSyncDetails({
  orderId,
  status,
  onChanged,
}: {
  orderId: string;
  status?: OrderSyncStatus;
  onChanged?: () => void;
}) {
  if (!status || status.state === "synced") return null;
  const isFailed = status.state === "failed";
  const isPending =
    status.state === "pending" ||
    status.state === "syncing" ||
    status.state === "retrying";
  return (
    <div
      className={`mt-2 p-2 rounded-md text-[11px] space-y-1 border ${
        isFailed
          ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
          : "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">Sync status</span>
        <OrderSyncBadge status={status} />
      </div>
      {status.error && (
        <div className="text-muted-foreground break-words">
          <span className="font-medium">Reason:</span> {status.error}
        </div>
      )}
      <div className="flex gap-3 text-muted-foreground">
        <span>Attempts: {status.attempts ?? 0}</span>
        {status.lastAttemptAt && (
          <span>
            Last: {new Date(status.lastAttemptAt).toLocaleTimeString()}
          </span>
        )}
      </div>
      {(isFailed || isPending) && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={async () => {
              await retryOrderSync(status);
              onChanged?.();
            }}
          >
            <RefreshCw size={12} className="mr-1" />
            Retry now
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={async () => {
              await cancelStuckOrder(orderId, status);
              onChanged?.();
            }}
          >
            <XCircle size={12} className="mr-1" />
            Cancel & re-enter
          </Button>
        </div>
      )}
    </div>
  );
}

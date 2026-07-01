/**
 * QA-only: Offline sync test actions.
 *
 * IMPORTANT — Real primitives in this codebase:
 *   - Offline storage is Capacitor Preferences (NOT IndexedDB),
 *     wrapped by `src/lib/offlineStorage.ts` with stores named via
 *     `STORES`. The pending-actions queue is `STORES.SYNC_QUEUE`
 *     ('syncQueue'); queued orders live in `STORES.ORDERS`.
 *   - The in-app offline toggle is `setManualOfflineMode` from
 *     `src/contexts/NetworkContext.tsx`. In QA builds we expose it
 *     on `window.__qaSetOffline` (wired in `src/App.tsx`) so actions
 *     can flip offline/online programmatically. Production builds
 *     never expose this.
 *   - Sync-queue items use `tempId` as their local identifier; the
 *     server `orders` row has no `local_ref_id` / `tempId` column,
 *     so duplicate-sync detection is done by matching retailer_id
 *     within a timestamp window of when the offline order was queued.
 *
 * QA-build-only. Must not be imported from production code paths.
 */
import type { QATestAction } from '@/qa/types';
import { offlineStorage, STORES } from '@/lib/offlineStorage';
import { supabase } from '@/integrations/supabase/client';
import { table } from '@/lib/tableRouter';

import { Preferences } from '@capacitor/preferences';

declare global {
  interface Window {
    __qaSetOffline?: (offline: boolean) => void;
  }
}

const HAS_OFFLINE_TOGGLE = (): boolean => typeof window !== 'undefined' && typeof window.__qaSetOffline === 'function';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface SyncQueueItem {
  id: string;
  action: string;
  data: any;
  timestamp: number;
  retryCount?: number;
}

async function findPendingOrderForRetailer(retailerId: string): Promise<SyncQueueItem | null> {
  const queue = await offlineStorage.getAll<SyncQueueItem>(STORES.SYNC_QUEUE);
  // Queued orders sit under action names like 'order' / 'placeOrder' /
  // 'syncOrder' depending on the path that enqueued them. Match by
  // payload shape (retailer reference) rather than action name to be
  // resilient to future renaming.
  return (
    queue.find((item) => {
      const d = item?.data ?? {};
      const rid = d.retailer_id ?? d.retailerId ?? d?.order?.retailer_id ?? d?.order?.retailerId;
      return rid === retailerId;
    }) ?? null
  );
}

export const offlineSyncActions: QATestAction[] = [
  {
    id: 'offline.order-queued-locally',
    label: 'Offline order saves to local queue',
    entity: 'Offline Sync',
    description:
      'Switches the app to manual-offline mode, then programmatically ' +
      'enqueues a CREATE_ORDER item into the same syncQueue the app ' +
      'uses (offlineStorage.addToSyncQueue). Verifies the pending ' +
      'entry lands in STORES.SYNC_QUEUE — no human tester needed.',
    inputs: [
      { key: 'retailer_id', label: 'Retailer ID', type: 'string', fromContext: 'retailer.id', required: true },
    ],
    run: async (input, ctx) => {
      if (!HAS_OFFLINE_TOGGLE()) {
        return {
          pass: false,
          errorMessage:
            'window.__qaSetOffline not registered — QA offline bridge missing. ' +
            'Ensure the app rendered AppContent (which wires it) before running this test.',
        };
      }
      try {
        const queueBefore = await offlineStorage.getAll<SyncQueueItem>(STORES.SYNC_QUEUE);
        const idsBefore = new Set(queueBefore.map((q) => q.id));

        window.__qaSetOffline!(true);
        await sleep(250);

        // Programmatic enqueue — mirrors what the real order submit
        // path does when offline. We use a synthetic minimal order
        // payload; the sync worker's server-side write will fail
        // gracefully if the tenant has stricter requirements, and
        // this test's job is only to prove the queue+drain cycle.
        const tempId = `qa-${crypto.randomUUID()}`;
        const queuedAt = Date.now();
        const payload = {
          tempId,
          retailer_id: input.retailer_id,
          items: [],
          created_at: new Date(queuedAt).toISOString(),
          qa_synthetic: true,
        };
        await offlineStorage.addToSyncQueue('CREATE_ORDER', payload);
        // Force cache invalidation so the immediate getAll returns the
        // freshly persisted row (the getStoreData 60s memory cache was
        // populated by queueBefore above and could otherwise mask it).
        offlineStorage.invalidateCache(STORES.SYNC_QUEUE);
        try {
          const keys = await Preferences.keys();
          console.log('[QA] Preferences keys after enqueue:', keys.keys);
        } catch { /* diagnostic only */ }

        // Confirm a new row landed.
        const deadline = Date.now() + 5_000;
        let queued: SyncQueueItem | null = null;
        while (Date.now() < deadline) {
          offlineStorage.invalidateCache(STORES.SYNC_QUEUE);
          const match = await findPendingOrderForRetailer(input.retailer_id);
          if (match && !idsBefore.has(match.id)) {
            queued = match;
            break;
          }
          await sleep(200);
        }

        if (!queued) {
          return {
            pass: false,
            errorMessage: 'Enqueue reported success but no new syncQueue row was found.',
          };
        }

        ctx.remember('offlineOrder', {
          queueId: queued.id,
          tempId,
          retailerId: input.retailer_id,
          queuedAt,
        });
        return { pass: true, output: { queueId: queued.id, tempId, queuedAt } };
      } catch (e: any) {
        return { pass: false, errorMessage: e.message ?? String(e) };
      }
    },
  },

  {
    id: 'offline.sync-completes-and-clears-queue',
    label: 'Offline order syncs and clears local queue',
    entity: 'Offline Sync',
    description:
      'Restores network via the manual-offline toggle and waits ' +
      'for useOfflineSync to drain. Confirms (a) the queued ' +
      'syncQueue entry is gone, and (b) exactly one new server ' +
      'row exists for this retailer within a ±5-minute window of ' +
      'when the offline order was queued. Fails on 0 (sync did ' +
      'not happen) or >1 (duplicate sync).',
    inputs: [
      { key: 'queue_id', label: 'Queued record ID', type: 'string', fromContext: 'offlineOrder.queueId', required: true },
      { key: 'retailer_id', label: 'Retailer ID', type: 'string', fromContext: 'offlineOrder.retailerId', required: true },
      { key: 'queued_at_ms', label: 'Queued at (ms epoch)', type: 'number', fromContext: 'offlineOrder.queuedAt', required: true },
    ],
    run: async (input) => {
      if (!HAS_OFFLINE_TOGGLE()) {
        return {
          pass: false,
          errorMessage: 'window.__qaSetOffline not registered — cannot restore network in-app.',
        };
      }
      try {
        window.__qaSetOffline!(false);
        // useOfflineSync runs on online + interval — give it room.
        const deadline = Date.now() + 45_000;
        let stillPending: SyncQueueItem | null | undefined;
        while (Date.now() < deadline) {
          await sleep(2000);
          offlineStorage.invalidateCache(STORES.SYNC_QUEUE);
          const queue = await offlineStorage.getAll<SyncQueueItem>(STORES.SYNC_QUEUE);
          stillPending = queue.find((q) => q.id === input.queue_id);
          if (!stillPending) break;
        }

        if (stillPending) {
          return {
            pass: false,
            errorMessage: `Sync queue entry ${input.queue_id} did not drain within 45s after restoring network.`,
          };
        }

        // Verify server side. No local_ref_id column exists on orders
        // in this schema, so we match by retailer + a ±5-min window
        // around the queued timestamp. Duplicate detection is what
        // matters here: 0 → sync silently dropped, >1 → double-send.
        const windowMs = 5 * 60 * 1000;
        const fromIso = new Date(input.queued_at_ms - windowMs).toISOString();
        const toIso = new Date(input.queued_at_ms + windowMs).toISOString();
        const { data, error } = await supabase
          .from(table('orders') as any)
          .select('id, created_at')
          .eq('retailer_id', input.retailer_id)
          .gte('created_at', fromIso)
          .lte('created_at', toIso);

        if (error) return { pass: false, errorMessage: error.message };
        const rows = (data ?? []) as Array<{ id: string; created_at: string }>;
        if (rows.length === 0) {
          return { pass: false, errorMessage: 'Queue drained but no matching server order found in the ±5-min window.' };
        }
        if (rows.length > 1) {
          return {
            pass: false,
            output: { rows },
            errorMessage: `Duplicate sync detected: ${rows.length} server orders for one queued record.`,
          };
        }
        return { pass: true, output: rows[0] };
      } catch (e: any) {
        return { pass: false, errorMessage: e.message ?? String(e) };
      }
    },
  },
];

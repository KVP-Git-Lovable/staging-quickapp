/**
 * offlineHealth — self-healing health monitor (Offline Architecture v2 · Phase 9).
 *
 * Detects a drifted/corrupt local cache and repairs it automatically:
 *  - SQLite `PRAGMA integrity_check`
 *  - per-table row-count reconciliation vs the server (sync_counts RPC)
 * On corruption or significant drift, resets the delta watermark and re-pulls.
 * SQLite-engine only; inert otherwise. Read-only except the repair re-pull.
 */
import { supabase } from '@/integrations/supabase/client';
import { sqliteStore } from './sqliteStore';
import { STORES } from './offlineStorage';
import { runDeltaPull, resetDeltaWatermark } from './syncPull';

// Server count key → local store to reconcile.
const COUNT_STORE: Record<string, string> = {
  products: STORES.PRODUCTS,
  product_uom_mapping: STORES.PRODUCT_UOM_MAPPING,
  uom_master: STORES.UOM_MASTER,
  product_schemes: STORES.SCHEMES,
  retailers: STORES.RETAILERS,
  beats: STORES.BEATS,
};

// Allow a small delta (rows changing between the count and the read) before repairing.
const DRIFT_TOLERANCE = 2;

export interface HealthReport {
  integrityOk: boolean;
  drift: { store: string; server: number; local: number }[];
  repaired: boolean;
}

let lastRun = 0;
const MIN_INTERVAL_MS = 10 * 60 * 1000; // at most every 10 min

export async function runHealthCheck(force = false): Promise<HealthReport | null> {
  if (!sqliteStore.isSupported()) return null;
  if (!force && Date.now() - lastRun < MIN_INTERVAL_MS) return null;
  if (!(await sqliteStore.ready())) return null;
  lastRun = Date.now();

  const integrityOk = await sqliteStore.integrityCheck();
  const drift: HealthReport['drift'] = [];

  try {
    const { data, error } = await supabase.rpc('sync_counts' as any);
    if (!error && data) {
      const counts = data as Record<string, number>;
      for (const [key, store] of Object.entries(COUNT_STORE)) {
        const server = Number(counts[key] ?? 0);
        const local = await sqliteStore.count(store);
        if (Math.abs(server - local) > DRIFT_TOLERANCE) {
          drift.push({ store, server, local });
        }
      }
    }
  } catch (e) {
    console.warn('[offlineHealth] count reconcile failed:', e);
  }

  let repaired = false;
  if (!integrityOk || drift.length > 0) {
    console.warn('[offlineHealth] drift/corruption detected — self-healing', { integrityOk, drift });
    await resetDeltaWatermark();
    const res = await runDeltaPull();
    repaired = !!res;
    // Best-effort telemetry (table exists in staging schema)
    try {
      await supabase.from('data_health_log' as any).insert({
        check_type: 'offline_cache_drift',
        details: { integrityOk, drift, repaired } as any,
      } as any);
    } catch { /* non-fatal */ }
  }

  return { integrityOk, drift, repaired };
}

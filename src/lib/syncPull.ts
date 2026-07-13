/**
 * syncPull — client delta engine (Offline Architecture v2 · Phase 3).
 *
 * Calls the server `sync_pull(since)` RPC with the stored watermark, upserts the
 * changed rows into SQLite, applies tombstones (deletes), and advances the
 * watermark. Only active when the SQLite engine is on (native + flag). Inert
 * otherwise. This makes re-syncs incremental instead of full re-warms.
 */
import { supabase } from '@/integrations/supabase/client';
import { sqliteStore, type KvRow } from './sqliteStore';
import { STORES } from './offlineStorage';

// Map server table keys (from sync_pull) → local offline store names.
const TABLE_STORE: Record<string, string> = {
  products: STORES.PRODUCTS,
  product_variants: STORES.VARIANTS,
  product_uom_mapping: STORES.PRODUCT_UOM_MAPPING,
  uom_master: STORES.UOM_MASTER,
  product_schemes: STORES.SCHEMES,
  product_categories: STORES.CATEGORIES,
  retailers: STORES.RETAILERS,
  beats: STORES.BEATS,
  // no dedicated store today — cached under their own key for future use
  enabled_units: 'enabledUnits',
  tax_masters: 'taxMasters',
  tax_components: 'taxComponents',
};

const WATERMARK_KEY = 'delta_watermark';
const EPOCH = '1970-01-01T00:00:00Z';

let inFlight = false;

export interface DeltaResult { applied: number; deleted: number; watermark: string | null; }

/**
 * Run one incremental delta pull. Returns null if the SQLite engine isn't active
 * or the pull failed (caller keeps the previous watermark → safe to retry).
 */
export async function runDeltaPull(): Promise<DeltaResult | null> {
  if (inFlight) return null;
  if (!sqliteStore.isSupported()) return null;
  if (!(await sqliteStore.ready())) return null;

  inFlight = true;
  try {
    const since = (await sqliteStore.metaGet(WATERMARK_KEY)) || EPOCH;
    const { data, error } = await supabase.rpc('sync_pull', { p_since: since } as any);
    if (error || !data) {
      console.warn('[deltaPull] sync_pull failed (keeping watermark):', error?.message);
      return null;
    }

    const payload = data as Record<string, any>;
    let applied = 0;
    let deleted = 0;

    // Upsert changed rows per table
    for (const [tableKey, store] of Object.entries(TABLE_STORE)) {
      const rows = payload[tableKey];
      if (Array.isArray(rows) && rows.length) {
        const kv: KvRow[] = rows
          .filter((r: any) => r && r.id != null)
          .map((r: any) => ({ id: String(r.id), data: r }));
        if (kv.length) {
          await sqliteStore.upsertMany(store, kv);
          applied += kv.length;
        }
      }
    }

    // Apply tombstones (deletes)
    const dels = payload.deletions;
    if (Array.isArray(dels)) {
      for (const d of dels) {
        const store = TABLE_STORE[d?.table_name];
        if (store && d?.row_id != null) {
          await sqliteStore.remove(store, String(d.row_id));
          deleted++;
        }
      }
    }

    // Advance the watermark to the server's clock (only on success)
    const serverTime: string | null = payload.server_time ?? null;
    if (serverTime) await sqliteStore.metaSet(WATERMARK_KEY, serverTime);

    console.log(`[deltaPull] applied ${applied} rows, ${deleted} deletions, watermark→${serverTime}`);
    return { applied, deleted, watermark: serverTime };
  } catch (e) {
    console.warn('[deltaPull] error (keeping watermark):', e);
    return null;
  } finally {
    inFlight = false;
  }
}

/** Reset the delta watermark so the next pull re-fetches everything (used by self-heal). */
export async function resetDeltaWatermark(): Promise<void> {
  try { await sqliteStore.metaSet(WATERMARK_KEY, EPOCH); } catch { /* ignore */ }
}

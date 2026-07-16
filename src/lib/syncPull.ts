/**
 * syncPull — client delta engine (Offline Architecture v2 · Phase 3 + Phase 2 resumable).
 *
 * Preferred path: RESUMABLE keyset-chunked pull via the `sync_pull_chunk(table, …)` RPC.
 * Each table is fetched in bounded pages ordered by (updated_at, id); the cursor is
 * checkpointed to SQLite AFTER each page commits, so a dropped connection resumes exactly
 * where it left off instead of restarting — and the same cursor doubles as the per-table
 * delta watermark (updated rows bump updated_at and re-surface past the cursor next run).
 * Deletes arrive as tombstones from `sync_deletions`. Falls back to the single-shot
 * `sync_pull(since)` RPC if the chunk path is unavailable. Only active when the SQLite
 * engine is on (native + flag); inert otherwise.
 */
import { supabase } from '@/integrations/supabase/client';
import { sqliteStore, type KvRow } from './sqliteStore';
import { STORES } from './offlineStorage';

// Map server table keys → local offline store names.
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

// Tables the resumable engine paginates (must have a uuid `id` + `updated_at`;
// enabled_units is excluded server-side — no id column).
const CHUNK_TABLES: { table: string; store: string }[] = [
  { table: 'products', store: STORES.PRODUCTS },
  { table: 'product_variants', store: STORES.VARIANTS },
  { table: 'product_uom_mapping', store: STORES.PRODUCT_UOM_MAPPING },
  { table: 'uom_master', store: STORES.UOM_MASTER },
  { table: 'product_schemes', store: STORES.SCHEMES },
  { table: 'product_categories', store: STORES.CATEGORIES },
  { table: 'retailers', store: STORES.RETAILERS },
  { table: 'beats', store: STORES.BEATS },
  { table: 'tax_masters', store: 'taxMasters' },
  { table: 'tax_components', store: 'taxComponents' },
];

const CHUNK_LIMIT = 500;
const MAX_PAGES = 10000; // safety bound (5M rows/table) — never infinite-loop
const WATERMARK_KEY = 'delta_watermark';       // legacy single-shot watermark
const DEL_WATERMARK = 'delta_del_watermark';   // tombstone stream watermark
const EPOCH = '1970-01-01T00:00:00Z';
const uaKey = (t: string) => `cursor_ua:${t}`;
const idKey = (t: string) => `cursor_id:${t}`;

let inFlight = false;

export interface DeltaResult { applied: number; deleted: number; watermark: string | null; }

/** One table, paginated to exhaustion, resuming from its stored cursor. */
async function pullTableChunks(table: string, store: string): Promise<number> {
  let ua = (await sqliteStore.metaGet(uaKey(table))) || null;
  let id = (await sqliteStore.metaGet(idKey(table))) || null;
  let total = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await (supabase.rpc as any)('sync_pull_chunk', {
      p_table: table,
      p_since: EPOCH,
      p_after_updated_at: ua,
      p_after_id: id,
      p_limit: CHUNK_LIMIT,
    });
    if (error || !data) {
      console.warn(`[deltaChunk] ${table} failed (keeping cursor):`, error?.message);
      break;
    }
    const rows = ((data as any).rows ?? []) as any[];
    if (rows.length) {
      const kv: KvRow[] = rows
        .filter((r: any) => r && r.id != null)
        .map((r: any) => ({ id: String(r.id), data: r }));
      if (kv.length) await sqliteStore.upsertMany(store, kv); // atomic batch (executeSet txn)
      const last = rows[rows.length - 1];
      ua = last.updated_at;
      id = String(last.id);
      // Checkpoint AFTER the upsert commits → safe resume point.
      await sqliteStore.metaSet(uaKey(table), ua as string);
      await sqliteStore.metaSet(idKey(table), id);
      total += kv.length;
    }
    if (!(data as any).has_more) break;
  }
  return total;
}

/** Apply tombstones since the deletion watermark — removes only rows we actually hold. */
async function applyDeletions(): Promise<number> {
  const since = (await sqliteStore.metaGet(DEL_WATERMARK)) || EPOCH;
  const { data, error } = await supabase
    .from('sync_deletions' as any)
    .select('table_name,row_id,deleted_at')
    .gt('deleted_at', since)
    .order('deleted_at', { ascending: true })
    .limit(5000);
  if (error || !Array.isArray(data)) return 0;

  let deleted = 0;
  let maxTs = since;
  for (const d of data as any[]) {
    const store = TABLE_STORE[d?.table_name];
    if (store && d?.row_id != null) {
      await sqliteStore.remove(store, String(d.row_id));
      deleted++;
    }
    if (d?.deleted_at && d.deleted_at > maxTs) maxTs = d.deleted_at;
  }
  if (maxTs !== since) await sqliteStore.metaSet(DEL_WATERMARK, maxTs);
  return deleted;
}

/** Resumable, keyset-chunked pull across all tables + tombstones. No in-flight guard (internal). */
async function resumablePull(): Promise<DeltaResult> {
  let applied = 0;
  for (const { table, store } of CHUNK_TABLES) {
    applied += await pullTableChunks(table, store);
  }
  const deleted = await applyDeletions();
  console.log(`[deltaResumable] applied ${applied} rows, ${deleted} deletions`);
  return { applied, deleted, watermark: null };
}

/** Legacy single-shot pull (whole delta in one RPC). Fallback only. No in-flight guard (internal). */
async function singleShotPull(): Promise<DeltaResult | null> {
  const since = (await sqliteStore.metaGet(WATERMARK_KEY)) || EPOCH;
  const { data, error } = await supabase.rpc('sync_pull', { p_since: since } as any);
  if (error || !data) {
    console.warn('[deltaPull] sync_pull failed (keeping watermark):', error?.message);
    return null;
  }
  const payload = data as Record<string, any>;
  let applied = 0;
  let deleted = 0;
  for (const [tableKey, store] of Object.entries(TABLE_STORE)) {
    const rows = payload[tableKey];
    if (Array.isArray(rows) && rows.length) {
      const kv: KvRow[] = rows
        .filter((r: any) => r && r.id != null)
        .map((r: any) => ({ id: String(r.id), data: r }));
      if (kv.length) { await sqliteStore.upsertMany(store, kv); applied += kv.length; }
    }
  }
  const dels = payload.deletions;
  if (Array.isArray(dels)) {
    for (const d of dels) {
      const store = TABLE_STORE[d?.table_name];
      if (store && d?.row_id != null) { await sqliteStore.remove(store, String(d.row_id)); deleted++; }
    }
  }
  const serverTime: string | null = payload.server_time ?? null;
  if (serverTime) await sqliteStore.metaSet(WATERMARK_KEY, serverTime);
  console.log(`[deltaPull] (single-shot) applied ${applied} rows, ${deleted} deletions, watermark→${serverTime}`);
  return { applied, deleted, watermark: serverTime };
}

/**
 * Run one incremental delta pull. Prefers the resumable chunked engine; falls back to the
 * single-shot RPC. Returns null if the SQLite engine isn't active or the pull failed.
 */
export async function runDeltaPull(): Promise<DeltaResult | null> {
  if (inFlight) return null;
  if (!sqliteStore.isSupported()) return null;
  if (!(await sqliteStore.ready())) return null;

  inFlight = true;
  try {
    try {
      return await resumablePull();
    } catch (e) {
      console.warn('[deltaPull] resumable path errored, falling back to single-shot:', e);
      return await singleShotPull();
    }
  } catch (e) {
    console.warn('[deltaPull] error (keeping watermark):', e);
    return null;
  } finally {
    inFlight = false;
  }
}

/** Explicit resumable entry (same engine as runDeltaPull's preferred path). */
export async function runResumableDeltaPull(): Promise<DeltaResult | null> {
  return runDeltaPull();
}

/** Reset ALL watermarks/cursors so the next pull re-fetches everything (used by self-heal). */
export async function resetDeltaWatermark(): Promise<void> {
  try {
    await sqliteStore.metaSet(WATERMARK_KEY, EPOCH);
    await sqliteStore.metaSet(DEL_WATERMARK, EPOCH);
    for (const { table } of CHUNK_TABLES) {
      await sqliteStore.metaSet(uaKey(table), '');
      await sqliteStore.metaSet(idKey(table), '');
    }
  } catch { /* ignore */ }
}

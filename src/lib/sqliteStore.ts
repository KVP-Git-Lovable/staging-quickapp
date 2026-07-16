/**
 * sqliteStore — SQLite storage engine for the offline layer (Offline Architecture v2, Phase 1).
 *
 * Backs the existing `offlineStorage` interface with a real indexed SQL database
 * instead of Capacitor Preferences JSON blobs. This kills the ~10 MB single-value
 * limit, the chunking workaround, and the whole-blob O(n²) rewrites, and gives
 * indexed `getById` lookups.
 *
 * Model: a generic row-per-item store so the public interface is unchanged.
 *   kv_store(store, id, data, updated_at)   -- one row per cached item
 *   sync_queue(id, action, data, created_at)-- the offline outbox
 *   sync_meta(key, value)                   -- sync metadata / watermarks
 *
 * Scope of Phase 1: native platforms only (Android/iOS). On web (dev preview) this
 * reports unavailable so `offlineStorage` falls back to the current Preferences code.
 * Encryption (SQLCipher), typed tables and delta come in later phases.
 */
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';

const DB_NAME = 'quickapp_offline';
const DB_VERSION = 1;

export interface KvRow { id: string; data: any; }

/** Phase 5: encryption opt-in via a separate encrypted DB (no in-place migration risk). */
function encryptEnabled(): boolean {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem('offline_encrypt') === '1'; }
  catch { return false; }
}
// App-level passphrase. In production, derive per-user/device; constant here is fine for a gated rollout.
function deriveSecret(): string { return 'qa-offline-v2-8f3c1a9e-secret'; }

class SqliteStore {
  private sqlite: SQLiteConnection | null = null;
  private db: SQLiteDBConnection | null = null;
  private initPromise: Promise<boolean> | null = null;
  private available = false;

  /** SQLite is used only on native platforms in Phase 1. */
  isSupported(): boolean {
    try { return Capacitor.isNativePlatform(); } catch { return false; }
  }

  /** Idempotent init — opens the DB and ensures the schema exists. Returns false if unusable. */
  async ready(): Promise<boolean> {
    if (this.available && this.db) return true;
    if (!this.isSupported()) return false;
    if (!this.initPromise) this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<boolean> {
    try {
      this.sqlite = new SQLiteConnection(CapacitorSQLite);
      const encrypt = encryptEnabled();
      const dbName = encrypt ? `${DB_NAME}_enc` : DB_NAME;
      const mode = encrypt ? 'secret' : 'no-encryption';
      if (encrypt) {
        try {
          const stored = await this.sqlite.isSecretStored();
          if (!stored?.result) await this.sqlite.setEncryptionSecret(deriveSecret());
        } catch (e) { console.warn('[sqliteStore] encryption secret setup failed:', e); }
      }
      const conn = await this.sqlite.isConnection(dbName, false);
      this.db = conn.result
        ? await this.sqlite.retrieveConnection(dbName, false)
        : await this.sqlite.createConnection(dbName, encrypt, mode, DB_VERSION, false);
      await this.db.open();
      // Phase 3: durability + concurrency. WAL survives crashes mid-write and lets
      // reads proceed during a sync; synchronous=NORMAL is the safe WAL companion;
      // busy_timeout avoids "database is locked" under background sync. Best-effort.
      try {
        await this.db.execute(
          'PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;'
        );
      } catch (e) { console.warn('[sqliteStore] PRAGMA setup skipped:', e); }
      await this.migrate();
      this.available = true;
      console.log(`[sqliteStore] ✅ SQLite offline engine ready${encrypt ? ' (encrypted)' : ''}`);
      return true;
    } catch (e) {
      console.warn('[sqliteStore] init failed, falling back to Preferences:', e);
      this.available = false;
      this.db = null;
      return false;
    }
  }

  private async migrate(): Promise<void> {
    if (!this.db) return;
    const ddl = `
      CREATE TABLE IF NOT EXISTS kv_store (
        store      TEXT NOT NULL,
        id         TEXT NOT NULL,
        data       TEXT NOT NULL,
        updated_at INTEGER,
        PRIMARY KEY (store, id)
      );
      CREATE INDEX IF NOT EXISTS idx_kv_store ON kv_store(store);
      CREATE TABLE IF NOT EXISTS sync_queue (
        id         TEXT PRIMARY KEY,
        action     TEXT NOT NULL,
        data       TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);
      CREATE TABLE IF NOT EXISTS sync_meta (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER
      );
    `;
    await this.db.execute(ddl);
    await this.db.run('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)', [DB_VERSION, Date.now()]);
  }

  private parse<T>(rows: any[] | undefined): T[] {
    const out: T[] = [];
    for (const r of rows ?? []) {
      try { out.push(JSON.parse(r.data)); } catch { /* skip corrupt row */ }
    }
    return out;
  }

  // ---------------- kv_store operations ----------------

  async getAll<T>(store: string): Promise<T[]> {
    if (!(await this.ready()) || !this.db) return [];
    const res = await this.db.query('SELECT data FROM kv_store WHERE store = ?', [store]);
    return this.parse<T>(res.values);
  }

  async getById<T>(store: string, id: string): Promise<T | null> {
    if (!(await this.ready()) || !this.db) return null;
    const res = await this.db.query('SELECT data FROM kv_store WHERE store = ? AND id = ? LIMIT 1', [store, id]);
    const rows = this.parse<T>(res.values);
    return rows[0] ?? null;
  }

  /** Upsert a single item (data must carry an `id`). */
  async upsert(store: string, id: string, data: any): Promise<void> {
    if (!(await this.ready()) || !this.db) return;
    await this.db.run(
      'INSERT OR REPLACE INTO kv_store(store, id, data, updated_at) VALUES (?, ?, ?, ?)',
      [store, id, JSON.stringify(data), Date.now()]
    );
  }

  /** Bulk upsert in one transaction — replaces the O(n²) whole-blob rewrite. */
  async upsertMany(store: string, rows: KvRow[]): Promise<void> {
    if (!rows.length) return;
    if (!(await this.ready()) || !this.db) return;
    const now = Date.now();
    const set = rows.map((r) => ({
      statement: 'INSERT OR REPLACE INTO kv_store(store, id, data, updated_at) VALUES (?, ?, ?, ?)',
      values: [store, r.id, JSON.stringify(r.data), now],
    }));
    await this.db.executeSet(set, true);
  }

  /** Replace an entire store's contents atomically. */
  async replaceAll(store: string, rows: KvRow[]): Promise<void> {
    if (!(await this.ready()) || !this.db) return;
    try {
      await this.db.beginTransaction();
      await this.db.run('DELETE FROM kv_store WHERE store = ?', [store]);
      if (rows.length) {
        const now = Date.now();
        const set = rows.map((r) => ({
          statement: 'INSERT OR REPLACE INTO kv_store(store, id, data, updated_at) VALUES (?, ?, ?, ?)',
          values: [store, r.id, JSON.stringify(r.data), now],
        }));
        await this.db.executeSet(set, false);
      }
      await this.db.commitTransaction();
    } catch (e) {
      try { await this.db.rollbackTransaction(); } catch { /* noop */ }
      throw e;
    }
  }

  async remove(store: string, id: string): Promise<void> {
    if (!(await this.ready()) || !this.db) return;
    await this.db.run('DELETE FROM kv_store WHERE store = ? AND id = ?', [store, id]);
  }

  async clearStore(store: string): Promise<void> {
    if (!(await this.ready()) || !this.db) return;
    await this.db.run('DELETE FROM kv_store WHERE store = ?', [store]);
  }

  async count(store: string): Promise<number> {
    if (!(await this.ready()) || !this.db) return 0;
    const res = await this.db.query('SELECT COUNT(*) AS c FROM kv_store WHERE store = ?', [store]);
    return Number(res.values?.[0]?.c ?? 0);
  }

  // ---------------- sync_queue operations ----------------

  async queueAdd(id: string, action: string, data: any): Promise<void> {
    if (!(await this.ready()) || !this.db) return;
    await this.db.run(
      'INSERT OR REPLACE INTO sync_queue(id, action, data, created_at) VALUES (?, ?, ?, ?)',
      [id, action, JSON.stringify(data), Date.now()]
    );
  }

  async queueAll<T = any>(): Promise<T[]> {
    if (!(await this.ready()) || !this.db) return [];
    const res = await this.db.query('SELECT data FROM sync_queue ORDER BY created_at ASC');
    return this.parse<T>(res.values);
  }

  async queueRemove(id: string): Promise<void> {
    if (!(await this.ready()) || !this.db) return;
    await this.db.run('DELETE FROM sync_queue WHERE id = ?', [id]);
  }

  async queueClear(): Promise<void> {
    if (!(await this.ready()) || !this.db) return;
    await this.db.run('DELETE FROM sync_queue');
  }

  async queueCount(): Promise<number> {
    if (!(await this.ready()) || !this.db) return 0;
    const res = await this.db.query('SELECT COUNT(*) AS c FROM sync_queue');
    return Number(res.values?.[0]?.c ?? 0);
  }

  // ---------------- sync_meta operations ----------------

  async metaGet(key: string): Promise<string | null> {
    if (!(await this.ready()) || !this.db) return null;
    const res = await this.db.query('SELECT value FROM sync_meta WHERE key = ? LIMIT 1', [key]);
    return res.values?.[0]?.value ?? null;
  }

  async metaSet(key: string, value: string): Promise<void> {
    if (!(await this.ready()) || !this.db) return;
    await this.db.run('INSERT OR REPLACE INTO sync_meta(key, value) VALUES (?, ?)', [key, value]);
  }

  // ---------------- maintenance ----------------

  /** SQLite self-check — returns false if the DB reports corruption. */
  async integrityCheck(): Promise<boolean> {
    if (!(await this.ready()) || !this.db) return true;
    try {
      const res = await this.db.query('PRAGMA integrity_check');
      const first: any = res.values?.[0];
      const val = first ? (first.integrity_check ?? Object.values(first)[0]) : 'ok';
      return String(val).toLowerCase() === 'ok';
    } catch { return false; }
  }

  /** Wipe all cached rows; optionally keep the outbox (unsynced writes). */
  async clearAll(preserveQueue = false): Promise<void> {
    if (!(await this.ready()) || !this.db) return;
    await this.db.run('DELETE FROM kv_store');
    if (!preserveQueue) await this.db.run('DELETE FROM sync_queue');
  }
}

export const sqliteStore = new SqliteStore();

import { Preferences } from '@capacitor/preferences';

// Capacitor Preferences for offline storage (works in both PWA and APK)
// STORAGE STRATEGY: Only cache essential data needed for offline operations
// - PRODUCTS, VARIANTS, SCHEMES, CATEGORIES: Active items for order entry
// - BEATS, RETAILERS: User's active beats and retailers
// - BEAT_PLANS: Only today + next 3 days (not historical)
// - VISITS: Only current date visits
// - ORDERS: ONLY pending orders in sync queue (not all historical orders)
// - SYNC_QUEUE: Pending actions to sync when online
// - SYNC_METADATA: Track last synced timestamps for delta sync

// Object store names
export const STORES = {
  ORDERS: 'orders',
  VARIANTS: 'variants', 
  RETAILERS: 'retailers',
  VISITS: 'visits',
  SYNC_QUEUE: 'syncQueue',
  PRODUCTS: 'products',
  BEATS: 'beats',
  CATEGORIES: 'categories',
  SCHEMES: 'schemes',
  BEAT_PLANS: 'beatPlans',
  COMPETITION_MASTER: 'competitionMaster',
  COMPETITION_SKUS: 'competitionSkus',
  COMPETITION_DATA: 'competitionData',
  ATTENDANCE: 'attendance',
  RETAILER_VISIT_LOGS: 'retailerVisitLogs',
  SYNC_METADATA: 'syncMetadata',
  SYNC_LOGS: 'syncLogs',
  // Attendance-specific config caching
  WEEK_OFF_CONFIG: 'weekOffConfig',
  HOLIDAYS: 'holidays',
  // Phase 7-1: product availability rules + territory lookup (region/zone)
  PRODUCT_AVAILABILITY: 'productAvailability',
  TERRITORIES_LOOKUP: 'territoriesLookup',
  EXPENSES: 'expenses',
  UOM_MASTER: 'uomMaster',
  PRODUCT_UOM_MAPPING: 'productUomMapping',
  PROFILES: 'profiles',
  DISTRIBUTORS: 'distributors',
  DISTRIBUTOR_BEAT_MAPPINGS: 'distributorBeatMappings'
} as const;

// Sync metadata interface
export interface SyncMetadata {
  id: string; // e.g., "visits_2025-12-18" or "retailers"
  lastSyncedAt: string; // ISO timestamp
  dataType: string;
  userId?: string;
  date?: string;
}

// Minimum sync interval (5 minutes)
export const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000;

// Chunk size for large datasets (retailers, products)
const CHUNK_SIZE = 1000;

class OfflineStorage {
  private initialized = false;
  // In-memory cache to avoid repeated JSON parsing
  private memoryCache: Map<string, { data: any[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute cache
  private readonly MAX_CACHE_SIZE = 10; // Limit number of cached stores to prevent memory bloat
  private readonly CHUNK_SIZE = 1_000_000; // ~1MB/value — safely under the SharedPreferences bridge limit


  async init(): Promise<void> {
    if (this.initialized) return;
    console.log('[OfflineStorage] ✅ Capacitor Preferences ready - data persists across app restarts');
    this.initialized = true;
  }

  // Prune cache if it exceeds max size (LRU-like: remove oldest entries)
  private pruneCache(): void {
    if (this.memoryCache.size <= this.MAX_CACHE_SIZE) return;
    
    // Sort by timestamp, remove oldest entries
    const entries = Array.from(this.memoryCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = entries.slice(0, entries.length - this.MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      this.memoryCache.delete(key);
    }
    console.log(`[OfflineStorage] Pruned ${toRemove.length} cache entries`);
  }

  private async ensureReady(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  // Helper to get store key
  private getStoreKey(storeName: string): string {
    return `offline_${storeName}`;
  }

  // Helper to get data from Preferences with memory caching
  private async getStoreData<T>(storeName: string): Promise<T[]> {
    try {
      // Check memory cache first (avoids JSON parsing on repeated reads)
      const cached = this.memoryCache.get(storeName);
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
        return cached.data as T[];
      }
      
      const key = this.getStoreKey(storeName);
      const meta = await Preferences.get({ key: `${key}::meta` });
      let json: string | null;
      if (meta.value) {
        const n = parseInt(meta.value, 10) || 0;
        let acc = '';
        let incomplete = false;
        for (let i = 0; i < n; i++) {
          const part = await Preferences.get({ key: `${key}::c${i}` });
          if (part.value == null) { incomplete = true; break; }
          acc += part.value;
        }
        json = incomplete ? null : (acc || null);
      } else {
        json = (await Preferences.get({ key })).value;
      }
      const data = json ? JSON.parse(json) : [];
      
      // Cache in memory for fast subsequent reads
      this.memoryCache.set(storeName, { data, timestamp: Date.now() });
      
      return data;
    } catch (error) {
      console.error(`[OfflineStorage] Error reading ${storeName}:`, error);
      return [];
    }
  }

  // Helper to save data to Preferences and update cache
  private async setStoreData(storeName: string, data: any[]): Promise<void> {
    try {
      const key = this.getStoreKey(storeName);
      const json = JSON.stringify(data);

      // Clear any previous chunk manifest first
      const prev = await Preferences.get({ key: `${key}::meta` });
      if (prev.value) {
        const pn = parseInt(prev.value, 10) || 0;
        for (let i = 0; i < pn; i++) await Preferences.remove({ key: `${key}::c${i}` });
        await Preferences.remove({ key: `${key}::meta` });
      }

      if (json.length <= this.CHUNK_SIZE) {
        await Preferences.set({ key, value: json });
      } else {
        await Preferences.remove({ key }); // avoid a stale single value
        const n = Math.ceil(json.length / this.CHUNK_SIZE);
        for (let i = 0; i < n; i++) {
          await Preferences.set({
            key: `${key}::c${i}`,
            value: json.slice(i * this.CHUNK_SIZE, (i + 1) * this.CHUNK_SIZE),
          });
        }
        await Preferences.set({ key: `${key}::meta`, value: String(n) });
      }
      
      // Update memory cache and prune if needed
      this.memoryCache.set(storeName, { data, timestamp: Date.now() });
      this.pruneCache();
    } catch (error) {
      console.error(`[OfflineStorage] Error writing ${storeName}:`, error);
      throw error;
    }
  }


  // Invalidate memory cache for a store (call after external updates)
  invalidateCache(storeName: string): void {
    this.memoryCache.delete(storeName);
  }

  // Clear all memory cache
  clearMemoryCache(): void {
    this.memoryCache.clear();
    console.log('[OfflineStorage] Memory cache cleared');
  }

  // Generic CRUD operations
  async save<T>(storeName: string, data: T): Promise<void> {
    await this.ensureReady();
    
    try {
      const items = await this.getStoreData<T>(storeName);
      const dataWithId = data as any;
      
      // Auto-generate ID if not present
      if (!dataWithId.id) {
        dataWithId.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      }
      
      const existingIndex = items.findIndex((item: any) => item.id === dataWithId.id);
      
      if (existingIndex >= 0) {
        items[existingIndex] = dataWithId;
      } else {
        items.push(dataWithId);
      }
      
      await this.setStoreData(storeName, items);
      console.log(`[OfflineStorage] ✅ Saved to ${storeName}`);
    } catch (error) {
      console.error(`[OfflineStorage] ❌ Failed to save to ${storeName}:`, error);
      throw error;
    }
  }

  // Replace the entire store in ONE write (critical for large datasets like retailers)
  async replaceAll<T>(storeName: string, items: T[]): Promise<void> {
    await this.ensureReady();

    try {
      await this.setStoreData(storeName, items as any[]);
      console.log(`[OfflineStorage] ✅ Replaced ${storeName} with ${items.length} items`);
    } catch (error) {
      console.error(`[OfflineStorage] ❌ Failed to replace ${storeName}:`, error);
      throw error;
    }
  }

  // BATCH upsert: merge many records into a store with a SINGLE underlying write.
  // Replaces the legacy `for (const r of rows) await save(...)` pattern that
  // re-read + re-parsed + re-wrote the entire JSON blob N times (O(N²) and
  // the cause of multi-second UI freezes at ~8k+ products).
  async saveMany<T extends { id?: string | number }>(storeName: string, records: T[]): Promise<void> {
    await this.ensureReady();
    if (!records || records.length === 0) return;

    try {
      const items = await this.getStoreData<T>(storeName);
      const indexById = new Map<any, number>();
      items.forEach((it: any, idx) => { if (it?.id != null) indexById.set(it.id, idx); });

      for (const rec of records) {
        const r: any = rec as any;
        if (r.id == null) {
          r.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        }
        const existingIdx = indexById.get(r.id);
        if (existingIdx !== undefined) {
          items[existingIdx] = r;
        } else {
          indexById.set(r.id, items.length);
          items.push(r);
        }
      }

      await this.setStoreData(storeName, items as any[]);
      console.log(`[OfflineStorage] ✅ saveMany ${records.length} → ${storeName} (single write)`);
    } catch (error) {
      console.error(`[OfflineStorage] ❌ saveMany failed for ${storeName}:`, error);
      throw error;
    }
  }

  async getById<T>(storeName: string, id: string): Promise<T | null> {
    await this.ensureReady();
    
    try {
      const items = await this.getStoreData<T>(storeName);
      const item = items.find((item: any) => item.id === id);
      return item || null;
    } catch (error) {
      console.error(`[OfflineStorage] Error getting item from ${storeName}:`, error);
      return null;
    }
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    await this.ensureReady();
    
    try {
      const items = await this.getStoreData<T>(storeName);
      console.log(`[OfflineStorage] Retrieved ${items.length} items from ${storeName}`);
      return items;
    } catch (error) {
      console.error(`[OfflineStorage] Error getting all from ${storeName}:`, error);
      return [];
    }
  }

  async delete(storeName: string, id: string | number): Promise<void> {
    await this.ensureReady();
    
    try {
      const items = await this.getStoreData(storeName);
      const filtered = items.filter((item: any) => item.id !== id);
      await this.setStoreData(storeName, filtered);
    } catch (error) {
      console.error(`[OfflineStorage] Error deleting from ${storeName}:`, error);
      throw error;
    }
  }

  async clear(storeName: string): Promise<void> {
    await this.ensureReady();
    
    try {
      await this.setStoreData(storeName, []);
      console.log(`[OfflineStorage] Cleared ${storeName}`);
    } catch (error) {
      console.error(`[OfflineStorage] Error clearing ${storeName}:`, error);
      throw error;
    }
  }

  // Notify UI that sync queue changed
  private emitSyncQueueUpdated(): void {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('syncQueueUpdated'));
      }
    } catch {
      // no-op
    }
  }

  // Sync queue operations for offline actions
  async addToSyncQueue(action: string, data: any): Promise<void> {
    const syncItem = {
      action,
      data,
      timestamp: Date.now(),
      createdAt: Date.now(),
      retryCount: 0,
      // Bump when queue payload format changes. Drain treats missing/older
      // versions as legacy and handles them gracefully.
      queue_version: 2
    };
    
    await this.save(STORES.SYNC_QUEUE, syncItem);
    this.emitSyncQueueUpdated();
    console.log('[OfflineStorage] 📤 syncQueueUpdated event dispatched');
  }


  async getSyncQueue(): Promise<any[]> {
    return this.getAll(STORES.SYNC_QUEUE);
  }

  async clearSyncQueue(): Promise<void> {
    await this.clear(STORES.SYNC_QUEUE);
    this.emitSyncQueueUpdated();
  }

  // No-op: items are never auto-deleted from sync queue.
  // They remain until successfully synced and verified in the database.
  async deleteOldSyncedItems(_maxAgeMs?: number): Promise<void> {
    // Intentionally empty — sync queue items persist until confirmed synced
    return;
  }

  // Sync metadata operations for delta sync
  async getSyncMetadata(dataType: string, userId?: string, date?: string): Promise<SyncMetadata | null> {
    await this.ensureReady();
    try {
      const metadataKey = this.buildSyncMetadataKey(dataType, userId, date);
      const items = await this.getStoreData<SyncMetadata>(STORES.SYNC_METADATA);
      return items.find(item => item.id === metadataKey) || null;
    } catch (error) {
      console.error('[OfflineStorage] Error getting sync metadata:', error);
      return null;
    }
  }

  async setSyncMetadata(dataType: string, userId?: string, date?: string): Promise<void> {
    await this.ensureReady();
    try {
      const metadataKey = this.buildSyncMetadataKey(dataType, userId, date);
      const metadata: SyncMetadata = {
        id: metadataKey,
        lastSyncedAt: new Date().toISOString(),
        dataType,
        userId,
        date
      };
      await this.save(STORES.SYNC_METADATA, metadata);
    } catch (error) {
      console.error('[OfflineStorage] Error setting sync metadata:', error);
    }
  }

  private buildSyncMetadataKey(dataType: string, userId?: string, date?: string): string {
    let key = dataType;
    if (userId) key += `_${userId}`;
    if (date) key += `_${date}`;
    return key;
  }

  // Check if we should sync (respects minimum interval)
  async shouldSync(dataType: string, userId?: string, date?: string): Promise<boolean> {
    const metadata = await this.getSyncMetadata(dataType, userId, date);
    if (!metadata) return true; // Never synced, should sync
    
    const lastSyncTime = new Date(metadata.lastSyncedAt).getTime();
    const now = Date.now();
    return (now - lastSyncTime) >= MIN_SYNC_INTERVAL_MS;
  }

  // Merge delta data with existing data (upsert pattern)
  // IMPORTANT: Preserves _synced flag for visits to prevent rebuild loop in sync queue
  async mergeData<T extends { id: string }>(storeName: string, newItems: T[]): Promise<void> {
    await this.ensureReady();
    try {
      const existingItems = await this.getStoreData<T>(storeName);
      const existingMap = new Map(existingItems.map(item => [item.id, item]));
      
      // Upsert new items, preserving _synced flag for visits
      for (const newItem of newItems) {
        const existing = existingMap.get(newItem.id) as any;
        
        // Preserve _synced flag if it exists in the existing item
        // This prevents sync queue from rebuilding already-synced visits
        if (storeName === STORES.VISITS && existing?._synced) {
          existingMap.set(newItem.id, { ...newItem, _synced: true } as T);
        } else {
          existingMap.set(newItem.id, newItem);
        }
      }
      
      await this.setStoreData(storeName, Array.from(existingMap.values()));
      console.log(`[OfflineStorage] ✅ Merged ${newItems.length} items into ${storeName}`);
    } catch (error) {
      console.error(`[OfflineStorage] Error merging data in ${storeName}:`, error);
      throw error;
    }
  }

  // Get last sync timestamp as ISO string (or null if never synced)
  async getLastSyncTimestamp(dataType: string, userId?: string, date?: string): Promise<string | null> {
    const metadata = await this.getSyncMetadata(dataType, userId, date);
    return metadata?.lastSyncedAt || null;
  }

  // Check if there are unsynced items in the sync queue
  async hasUnsyncedItems(): Promise<boolean> {
    try {
      const queue = await this.getStoreData(STORES.SYNC_QUEUE);
      return queue.length > 0;
    } catch {
      return false;
    }
  }

  // CRITICAL: Clear all offline storage data (used on sign out to prevent data leakage)
  // preserveUnsynced: if true, keeps ORDERS and SYNC_QUEUE when items are pending
  async clearAll(preserveUnsynced: boolean = false): Promise<void> {
    try {
      const hasUnsynced = preserveUnsynced ? await this.hasUnsyncedItems() : false;
      
      const storesToClear: string[] = [
        STORES.PRODUCTS,
        STORES.RETAILERS,
        STORES.VISITS,
        STORES.BEATS,
        STORES.BEAT_PLANS,
        STORES.SYNC_METADATA,
        STORES.SYNC_LOGS,
      ];
      
      // Only clear orders and sync queue if no unsynced items (or not preserving)
      if (!hasUnsynced) {
        storesToClear.push(STORES.ORDERS);
        storesToClear.push(STORES.SYNC_QUEUE);
      } else {
        console.log('[OfflineStorage] ⚠️ Preserving ORDERS and SYNC_QUEUE — unsynced items exist');
      }
      
      await Promise.all(storesToClear.map(store => this.clear(store)));
      console.log('[OfflineStorage] ✅ Cleared stores', hasUnsynced ? '(preserved unsynced)' : '(all)');
    } catch (error) {
      console.error('[OfflineStorage] Error clearing all stores:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const offlineStorage = new OfflineStorage();

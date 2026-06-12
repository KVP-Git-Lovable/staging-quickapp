import { Preferences } from '@capacitor/preferences';
import { offlineStorage, STORES } from '@/lib/offlineStorage';
import { clearRetailerIndex } from '@/lib/retailerIndex';
import { clearCachedPermissions } from '@/utils/cachedAuthIntegrity';

const USER_SCOPED_LOCAL_PREFIXES = [
  'home_dashboard_cache_',
  'attendance_lock_',
  'myvisits_snapshot_',
];

const USER_SCOPED_LOCAL_KEYS = [
  'cached_user',
  'cached_user_id',
  'cached_user_sig',
  'visit_status_cache',
  'cached_profile',
  'cached_role',
  'cached_security_profile',
  'master_data_cached_at',
  'cache_warmed_at',
];

const USER_SCOPED_PREFERENCE_KEYS = [
  'visit_status_cache',
];

export async function clearUserScopedCaches(options: {
  previousUserId?: string | null;
  preserveUnsynced?: boolean;
} = {}) {
  const { previousUserId, preserveUnsynced = true } = options;
  const hasUnsynced = preserveUnsynced
    ? await offlineStorage.hasUnsyncedItems().catch(() => false)
    : false;

  const stores: string[] = [
    STORES.BEATS,
    STORES.BEAT_PLANS,
    STORES.RETAILERS,
    STORES.VISITS,
    STORES.ATTENDANCE,
    STORES.SYNC_METADATA,
  ];

  if (!hasUnsynced) {
    stores.push(STORES.ORDERS);
  }

  await Promise.all(stores.map((store) => offlineStorage.clear(store).catch(() => undefined)));
  offlineStorage.clearMemoryCache();
  clearRetailerIndex();

  if (previousUserId) {
    clearCachedPermissions(previousUserId);
  }

  try {
    USER_SCOPED_LOCAL_KEYS.forEach((key) => localStorage.removeItem(key));
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => !!key)
      .filter((key) => USER_SCOPED_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Best-effort cache cleanup only.
  }

  try {
    const { keys } = await Preferences.keys();
    await Promise.all(
      keys
        .filter(
          (key) =>
            USER_SCOPED_PREFERENCE_KEYS.includes(key) ||
            USER_SCOPED_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix))
        )
        .map((key) => Preferences.remove({ key }).catch(() => undefined))
    );
  } catch {
    await Promise.all(USER_SCOPED_PREFERENCE_KEYS.map((key) => Preferences.remove({ key }).catch(() => undefined)));
  }

  window.dispatchEvent(new CustomEvent('userScopedCachesCleared'));
}
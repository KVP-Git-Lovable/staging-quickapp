/**
 * Startup Cleanup Hook
 * Runs cleanup routines when app starts and is online
 * Cleans orphan orders, stale cache, and synced data
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { runFullOrderCleanup, cleanupStaleSyncedOrders } from '@/utils/orderCleanup';
import { cleanupOldSnapshots } from '@/lib/myVisitsSnapshot';
import { offlineStorage, STORES } from '@/lib/offlineStorage';
import { getLocalTodayDate } from '@/utils/dateUtils';

const LEGACY_PERSPECTIVE_MIGRATION_KEY = 'legacy_perspective_stripped_v1';

/**
 * One-time migration: remove stale `_source`/`_actor` perspective tags that were
 * persisted into IndexedDB before the stripPerspective fix. These tags are the
 * fetching user's PERSPECTIVE, not a property of the row, so persisting them
 * causes the wrong user's rows to be shown as "teammate" activity on reload.
 */
async function stripLegacyPerspectiveTags(): Promise<void> {
  try {
    if (localStorage.getItem(LEGACY_PERSPECTIVE_MIGRATION_KEY) === '1') return;

    let touched = 0;
    for (const store of [STORES.VISITS, STORES.ORDERS]) {
      const rows = await offlineStorage.getAll<any>(store);
      for (const row of rows) {
        if (row && (row._source !== undefined || row._actor !== undefined)) {
          const { _source, _actor, ...clean } = row;
          await offlineStorage.save(store, clean);
          touched++;
        }
      }
    }

    localStorage.setItem(LEGACY_PERSPECTIVE_MIGRATION_KEY, '1');
    if (touched > 0) {
      console.log(`🧹 [startupCleanup] Stripped legacy perspective tags from ${touched} rows`);
    }
  } catch (e) {
    console.warn('🧹 [startupCleanup] Legacy perspective migration failed:', e);
  }
}

/**
 * Hook that runs cleanup routines on app startup when online
 */
export function useStartupCleanup() {
  const hasRunCleanupRef = useRef(false);
  
  useEffect(() => {
    const runStartupCleanup = async () => {
      // Only run once per app session
      if (hasRunCleanupRef.current) {
        return;
      }
      
      // Only run if online
      if (!navigator.onLine) {
        console.log('🧹 [startupCleanup] Offline - skipping cleanup');
        return;
      }
      
      // Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('🧹 [startupCleanup] No user - skipping cleanup');
        return;
      }
      
      hasRunCleanupRef.current = true;
      
      console.log('🧹 [startupCleanup] Starting cleanup routines...');
      
      try {
        // Use LOCAL today (device tz) — new Date().toISOString() is UTC,
        // which returns the wrong date for IST users before 5:30 AM.
        const today = getLocalTodayDate();

        // One-time strip of legacy _source/_actor tags in IDB
        await stripLegacyPerspectiveTags();

        // Run cleanup in parallel but with lower priority for order cleanup
        // Order cleanup syncs snapshot with DB, so it should refresh UI afterwards
        await Promise.all([
          // Clean old snapshots (older than 7 days) - safe, doesn't affect today
          cleanupOldSnapshots(user.id),
          
          // Clean stale synced orders globally - safe
          cleanupStaleSyncedOrders(),
          
          // Clean old sync queue items - safe
          cleanupOldSyncQueue()
        ]);
        
        // Run order cleanup separately - this SYNCS snapshot with DB
        // (updates _synced flag on local rows; does NOT delete matched-by-id rows)
        await runFullOrderCleanup(user.id, today);
        
        // IMPORTANT: don't dispatch 'visitDataChanged' — that makes the hook
        // reload from snapshot/IndexedDB (the stores we just touched). Instead
        // ask it to run a NETWORK sync directly, so the freshest DB truth
        // wins and race conditions with the local cache are avoided.
        window.dispatchEvent(new CustomEvent('visitDataChanged', {
          detail: { source: 'cleanup', date: today }
        }));
        
        console.log('🧹 [startupCleanup] Cleanup routines completed');
      } catch (error) {
        console.error('🧹 [startupCleanup] Error during cleanup:', error);
      }
    };
    
    // Delay cleanup to not block app startup - give time for initial UI to render
    const timeoutId = setTimeout(() => {
      runStartupCleanup();
    }, 5000); // Wait 5 seconds after mount (increased from 3s)
    
    return () => clearTimeout(timeoutId);
  }, []);
  
  // Also run cleanup when coming back online after being offline
  useEffect(() => {
    const handleOnline = async () => {
      // Small delay to ensure stable connection
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (!navigator.onLine) return;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const today = getLocalTodayDate();
      console.log('🧹 [startupCleanup] Online restored - running cleanup and sync');
      
      // Run order cleanup which syncs snapshot with DB
      await runFullOrderCleanup(user.id, today);
      
      // Ask the visits hook to refresh from NETWORK, not from IDB
      window.dispatchEvent(new CustomEvent('visitDataChanged', {
        detail: { source: 'cleanup', date: today }
      }));
    };
    
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);
}

/**
 * Clean up old sync queue items that have been processed
 */
async function cleanupOldSyncQueue(): Promise<void> {
  try {
    const syncQueue = await offlineStorage.getSyncQueue();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    let cleaned = 0;
    
    for (const item of syncQueue) {
      // Remove items older than 24 hours
      if (item.timestamp && item.timestamp < oneDayAgo) {
        await offlineStorage.delete(STORES.SYNC_QUEUE, item.id);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 [startupCleanup] Cleaned ${cleaned} old sync queue items`);
    }
  } catch (error) {
    console.error('🧹 [startupCleanup] Error cleaning sync queue:', error);
  }
}

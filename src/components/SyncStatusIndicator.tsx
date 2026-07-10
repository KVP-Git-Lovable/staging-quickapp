import { useEffect, useState, memo, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertCircle, Database, CloudCog } from "lucide-react";
import { useConnectivity } from "@/hooks/useConnectivity";
import { offlineStorage } from "@/lib/offlineStorage";
import { toast } from "@/hooks/use-toast";
import { SyncProgressModal } from "./SyncProgressModal";
import { CacheWarmingProgress, useCacheWarming } from "./CacheWarmingProgress";
import { useMasterDataCache } from "@/hooks/useMasterDataCache";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useManagedInterval } from "@/utils/intervalManager";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export const SyncStatusIndicator = memo(() => {
  const isOnline = useConnectivity() === 'online';
  const { processSyncQueue } = useOfflineSync();
  const { warmCacheWithProgress } = useMasterDataCache();
  const [syncQueueCount, setSyncQueueCount] = useState(0);
  const [slowRetryCount, setSlowRetryCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSyncingUI, setShowSyncingUI] = useState(false); // Only show if sync takes >500ms
  const [lastSyncStatus, setLastSyncStatus] = useState<'success' | 'error' | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const mountedRef = useRef(true);
  const syncingDisplayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cache warming state
  const {
    isWarming,
    steps,
    currentStep,
    startWarming,
    updateStep,
    completeWarming,
    dismissWarming,
  } = useCacheWarming();

  // Derive offline-readiness signals from warming steps
  const cacheWarming = steps.some(s => s.status === 'loading');
  const allDone = steps.length > 0 && steps.every(s => s.status === 'done');

  // Persist "ready today" so a reopen doesn't flash amber before background re-warm confirms
  const [readyHydrated, setReadyHydrated] = useState<boolean>(() => {
    try {
      const ts = Number(localStorage.getItem('master_cache_ready_at') || 0);
      if (!ts) return false;
      const d = new Date(ts);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (allDone) setReadyHydrated(true);
  }, [allDone]);
  const cacheReady = allDone || (readyHydrated && !cacheWarming);
  
  // Only show syncing UI if sync takes more than 500ms (reduces visual noise)
  useEffect(() => {
    if (isSyncing) {
      syncingDisplayRef.current = setTimeout(() => {
        if (mountedRef.current) setShowSyncingUI(true);
      }, 500);
    } else {
      if (syncingDisplayRef.current) {
        clearTimeout(syncingDisplayRef.current);
      }
      setShowSyncingUI(false);
    }
    
    return () => {
      if (syncingDisplayRef.current) {
        clearTimeout(syncingDisplayRef.current);
      }
    };
  }, [isSyncing]);

  // NOTE: Do not auto-delete queue items from UI layer.
  // Queue lifecycle is handled by sync logic to avoid hiding unsynced orders.

  // Check sync queue
  const checkQueue = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      const queue = await offlineStorage.getSyncQueue();
      if (mountedRef.current) {
        setSyncQueueCount(queue.length);
        const slowCount = queue.filter((i: any) => i.syncState === 'RETRYING' && (i.retryCount || 0) >= 5).length;
        setSlowRetryCount(slowCount);
      }
    } catch (error) {
      console.error('Error checking sync queue:', error);
    }
  }, []);

  // Initial check and online listener
  useEffect(() => {
    mountedRef.current = true;
    checkQueue();

    // Listen for online event to trigger immediate sync check
    const handleOnline = () => {
      console.log('🌐 SyncStatusIndicator: Online detected, checking queue...');
      checkQueue();
    };

    // Listen for queue updates to trigger immediate sync check (when items are added while already online)
    const handleQueueUpdated = () => {
      console.log('📥 SyncStatusIndicator: Queue updated, checking queue...');
      checkQueue();
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('syncQueueUpdated', handleQueueUpdated);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('syncQueueUpdated', handleQueueUpdated);
    };
  }, [checkQueue]);

  // Periodic queue refresh as safety net (in case any event is missed)
  useManagedInterval(
    'sync-status-indicator-queue-check',
    checkQueue,
    5000,
    { runWhenHidden: false }
  );

  // Track last sync time to avoid rapid re-sync loops
  const lastSyncTimeRef = useRef<number>(0);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Monitor syncing status when coming online
  useEffect(() => {
    if (isSyncing || !isOnline || syncQueueCount === 0) return;

    const now = Date.now();
    if (now - lastSyncTimeRef.current < 15000) {
      return;
    }

    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
    }

    syncDebounceRef.current = setTimeout(async () => {
      if (!mountedRef.current || isSyncing) return;

      lastSyncTimeRef.current = Date.now();
      setIsSyncing(true);
      setLastSyncStatus(null);

      try {
        await processSyncQueue();
        await checkQueue();

        if (!mountedRef.current) return;

        const queue = await offlineStorage.getSyncQueue();
        if (queue.length === 0) {
          setLastSyncStatus('success');
          setSyncQueueCount(0);
          setTimeout(() => {
            if (mountedRef.current) setLastSyncStatus(null);
          }, 3000);
        } else {
          setSyncQueueCount(queue.length);
        }
      } catch (error) {
        if (mountedRef.current) setLastSyncStatus('error');
      } finally {
        if (mountedRef.current) setIsSyncing(false);
      }
    }, 1200);
    
    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
      }
    };
  }, [isOnline, syncQueueCount, isSyncing, processSyncQueue, checkQueue]);

  // Handle prepare offline data click
  const handlePrepareOfflineData = useCallback(() => {
    if (!isOnline) {
      toast({
        title: "You're offline",
        description: "Please connect to the internet to prepare offline data.",
        variant: "destructive"
      });
      return;
    }
    
    startWarming();
    warmCacheWithProgress((stepId, status) => {
      updateStep(stepId, status);
    });
  }, [isOnline, startWarming, warmCacheWithProgress, updateStep]);

  // Handle view sync queue click
  const handleViewSyncQueue = useCallback(() => {
    setShowSyncModal(true);
  }, []);

  // Render the dropdown menu trigger - use showSyncingUI instead of isSyncing to reduce visual noise
  const renderTrigger = () => {
    if (showSyncingUI) {
      return (
        <button
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          title="Syncing data..."
        >
          <RefreshCw className="h-4 w-4 animate-spin text-primary-foreground/70" />
          {syncQueueCount > 0 && (
            <span className="text-xs text-primary-foreground/70">{syncQueueCount}</span>
          )}
        </button>
      );
    }
    
    if (syncQueueCount > 0) {
      return (
        <button
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          title={isOnline ? `${syncQueueCount} items pending sync${slowRetryCount > 0 ? ` (${slowRetryCount} retrying slow)` : ''}` : `${syncQueueCount} items waiting to sync when online`}
        >
          {slowRetryCount > 0 ? (
            <AlertCircle className="h-4 w-4 text-orange-400" />
          ) : isOnline ? (
            <Cloud className="h-4 w-4 text-primary-foreground/70" />
          ) : (
            <CloudOff className="h-4 w-4 text-yellow-400" />
          )}
          <span className={`text-xs ${slowRetryCount > 0 ? 'text-orange-400' : 'text-primary-foreground/70'}`}>{syncQueueCount}</span>
        </button>
      );
    }
    
    // Amber: preparing offline data (any warming step loading)
    if (cacheWarming) {
      return (
        <button
          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
          title="Preparing offline data…"
        >
          <CloudCog className="h-4 w-4 text-amber-400" />
          <RefreshCw className="h-3 w-3 animate-spin text-amber-400" />
          <span className="text-xs text-amber-400 hidden sm:inline">Preparing…</span>
        </button>
      );
    }

    // Green: fully cached and safe to go offline
    if (isOnline && cacheReady && syncQueueCount === 0) {
      return (
        <button
          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
          title="Ready for offline"
        >
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-xs text-green-500 hidden sm:inline">Ready for offline</span>
        </button>
      );
    }

    // Default: sync icon for access to Prepare Offline Data
    return (
      <button
        className="flex items-center gap-1 hover:opacity-80 transition-opacity"
        title="Sync options"
      >
        <Database className="h-4 w-4 text-primary-foreground/70" />
      </button>
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {renderTrigger()}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          <DropdownMenuItem onClick={handlePrepareOfflineData} disabled={!isOnline}>
            <Database className="h-4 w-4 mr-2 text-blue-500" />
            <span>Prepare Offline Data</span>
          </DropdownMenuItem>
          {syncQueueCount > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleViewSyncQueue}>
                <RefreshCw className="h-4 w-4 mr-2 text-green-500" />
                <span>View Sync Queue ({syncQueueCount})</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sync Queue Modal */}
      <SyncProgressModal 
        open={showSyncModal} 
        onOpenChange={setShowSyncModal}
        onTriggerSync={processSyncQueue}
      />

      {/* Cache Warming Progress Modal */}
      <CacheWarmingProgress
        isOpen={isWarming}
        onComplete={completeWarming}
        onDismiss={dismissWarming}
        steps={steps}
        currentStep={currentStep}
        isOnline={isOnline}
      />
    </>
  );
});

SyncStatusIndicator.displayName = 'SyncStatusIndicator';

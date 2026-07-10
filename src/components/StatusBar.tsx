import { useEffect, useState, useCallback } from "react";
import { useConnectivity } from "@/hooks/useConnectivity";
import { offlineStorage } from "@/lib/offlineStorage";
import { WifiOff } from "lucide-react";
import { useManagedInterval } from "@/utils/intervalManager";

export const StatusBar = () => {
  const connectivityStatus = useConnectivity();
  const [syncQueueCount, setSyncQueueCount] = useState(0);
  const isOnline = connectivityStatus === 'online';

  // Check sync queue with managed interval
  const checkQueue = useCallback(async () => {
    try {
      const queue = await offlineStorage.getSyncQueue();
      setSyncQueueCount(queue.length);
    } catch (error) {
      console.error('Error checking sync queue:', error);
    }
  }, []);

  useEffect(() => {
    checkQueue();
  }, [checkQueue]);

  useManagedInterval(
    'status-bar-queue-check',
    checkQueue,
    5000, // Increased from 2s to 5s
    { runWhenHidden: false }
  );

  // Only show when offline
  if (isOnline) {
    return null;
  }

  return (
    <div
      className="fixed left-0 right-0 z-40 py-2 px-4 bg-orange-600 text-white text-sm font-medium transition-all duration-300"
      style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <WifiOff className="h-4 w-4" />
          <span>Offline Mode</span>
          {syncQueueCount > 0 && (
            <>
              <span className="mx-2">•</span>
              <span>{syncQueueCount} {syncQueueCount === 1 ? 'item' : 'items'} queued</span>
            </>
          )}
        </div>
        
        <span className="hidden sm:inline text-xs opacity-80">Data stored locally</span>
      </div>
    </div>
  );
};

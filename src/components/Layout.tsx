import { ReactNode, useEffect, memo, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Navbar } from "./Navbar";
import { ChatWidget } from "./chat/ChatWidget";
import { useMasterDataCache } from "@/hooks/useMasterDataCache";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useStartupCleanup } from "@/hooks/useStartupCleanup";
import { periodicMemoryCleanup, initMemoryPressureHandler } from "@/utils/memoryManager";
import { useBatteryMonitor } from "@/hooks/useBatteryMonitor";
import { useNotifications } from "@/hooks/useNotifications";
import { LeaderboardBanner } from "@/components/notifications/LeaderboardBanner";

interface LayoutProps {
  children: ReactNode;
}

// Initialize memory pressure handlers once
let memoryHandlersInitialized = false;

export const Layout = memo(({ children }: LayoutProps) => {
  const { cacheAllMasterData, isOnline } = useMasterDataCache();
  const { processSyncQueue } = useOfflineSync();
  const location = useLocation();
  const hasCachedRef = useRef(false);
  const wasOfflineRef = useRef(false);
  
  // Run startup cleanup routines (orphan orders, stale cache, etc.)
  useStartupCleanup();
  useBatteryMonitor();

  // Initialize memory pressure handlers once per app lifecycle
  useEffect(() => {
    if (!memoryHandlersInitialized) {
      memoryHandlersInitialized = true;
      initMemoryPressureHandler();
    }
  }, []);

  // Periodic memory cleanup on route changes to prevent memory bloat
  useEffect(() => {
    periodicMemoryCleanup();
  }, [location.pathname]);

  // Auto-cache master data when online - only once per session
  useEffect(() => {
    if (isOnline && !hasCachedRef.current) {
      hasCachedRef.current = true;
      console.log('🔄 Layout: Caching master data...');
      // Defer caching to not block UI
      const ric = (window as any).requestIdleCallback as
        | undefined
        | ((cb: () => void) => number);

      if (typeof ric === "function") {
        ric(() => {
          cacheAllMasterData();
          processSyncQueue();
        });
      } else {
        setTimeout(() => {
          cacheAllMasterData();
          processSyncQueue();
        }, 100);
      }
    }
  }, [isOnline, cacheAllMasterData, processSyncQueue]);

  // Trigger sync whenever connectivity is restored (offline -> online transition)
  // NOTE: syncComplete event is dispatched by useOfflineSync, not here (avoid duplicate dispatches)
  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
    } else if (wasOfflineRef.current) {
      // We just came back online after being offline
      wasOfflineRef.current = false;
      console.log('🔄 Layout: Connectivity restored, triggering sync...');
      // Small delay to ensure network is stable - processSyncQueue will dispatch syncComplete
      setTimeout(() => {
        processSyncQueue();
      }, 1000);
    }
  }, [isOnline, processSyncQueue]);

  return (
    <div className="min-h-screen bg-gradient-subtle w-full flex flex-col">
      {/* Safe area top spacer - covers status bar with primary color, always fixed at top */}
      <div 
        className="fixed top-0 left-0 right-0 z-[9999]"
        style={{ 
          height: 'env(safe-area-inset-top, 0px)',
          backgroundColor: 'hsl(var(--primary))'
        }}
      />
      
      <Navbar />
      <main className="flex-1 safe-area-main">
        {children}
      </main>
      
      {/* Safe area bottom spacer for navigation bar */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-[9999]"
        style={{ 
          height: 'env(safe-area-inset-bottom, 0px)',
          backgroundColor: 'hsl(var(--background))'
        }}
      />
      
      <ChatWidget />
    </div>
  );
});

Layout.displayName = 'Layout';

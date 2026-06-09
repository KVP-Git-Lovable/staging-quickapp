import { useState, useEffect, useRef, useMemo, memo, useDeferredValue } from 'react';
import { VisitCard } from './VisitCard';
import type { VisitPointsBreakdown } from './VisitPointsDisplay';

interface Visit {
  id: string;
  retailerId?: string;
  retailerName: string;
  address: string;
  phone: string;
  retailerCategory: string;
  status: "planned" | "in-progress" | "productive" | "unproductive" | "store-closed" | "cancelled";
  visitType: string;
  time?: string;
  day?: string;
  createdAt?: string;
  checkInStatus?: "not-checked-in" | "checked-in-correct" | "checked-in-wrong-location";
  hasOrder?: boolean;
  orderValue?: number;
  noOrderReason?: "over-stocked" | "owner-not-available" | "store-closed" | "permanently-closed";
  distributor?: string;
  retailerLat?: number;
  retailerLng?: number;
  priority?: "high" | "medium" | "low";
  teammateActivity?: {
    userId: string;
    name: string;
    hasOrder: boolean;
    orderValue: number;
    visitTime?: string;
    ownActivity: boolean;
  };
}

interface VirtualizedVisitListProps {
  visits: Visit[];
  onViewDetails: (visitId: string) => void;
  selectedDate: string;
  viewingUserId?: string;
  pointsByRetailer?: Map<string, VisitPointsBreakdown>;
}

// Memoized VisitCard wrapper to prevent unnecessary re-renders
const MemoizedVisitCard = memo(VisitCard, (prevProps, nextProps) => {
  // Only re-render if key props change
  return (
    prevProps.visit.id === nextProps.visit.id &&
    prevProps.visit.status === nextProps.visit.status &&
    prevProps.visit.hasOrder === nextProps.visit.hasOrder &&
    prevProps.visit.orderValue === nextProps.visit.orderValue &&
    prevProps.visit.noOrderReason === nextProps.visit.noOrderReason &&
    prevProps.selectedDate === nextProps.selectedDate &&
    prevProps.skipInitialCheck === nextProps.skipInitialCheck &&
    prevProps.viewingUserId === nextProps.viewingUserId &&
    prevProps.pointsBreakdown === nextProps.pointsBreakdown
  );
});

MemoizedVisitCard.displayName = 'MemoizedVisitCard';

// Progressive loading constants
const INITIAL_BATCH_SIZE = 8; // Load first 8 immediately
const LOAD_MORE_SIZE = 15; // Load 15 more at a time (user requested)
const LOAD_MORE_THRESHOLD = 200; // Pixels from bottom to trigger load

export const VirtualizedVisitList = ({ 
  visits, 
  onViewDetails, 
  selectedDate,
  viewingUserId,
  pointsByRetailer
}: VirtualizedVisitListProps) => {
  const [displayCount, setDisplayCount] = useState(INITIAL_BATCH_SIZE);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  // Use deferred value for smoother rendering during updates
  const deferredVisits = useDeferredValue(visits);
  const deferredDate = useDeferredValue(selectedDate);

  // Reset display count when visits change significantly
  useEffect(() => {
    setDisplayCount(Math.min(INITIAL_BATCH_SIZE, deferredVisits.length));
  }, [deferredVisits.length, deferredDate]);

  // Visible visits (progressively loaded)
  const visibleVisits = useMemo(() => {
    return deferredVisits.slice(0, displayCount);
  }, [deferredVisits, displayCount]);

  const hasMore = displayCount < deferredVisits.length;

  // Load more on scroll - with proper cleanup
  useEffect(() => {
    const controller = new AbortController();
    
    const handleScroll = () => {
      if (loadingRef.current || !hasMore) return;

      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = document.documentElement.scrollTop;
      const clientHeight = document.documentElement.clientHeight;

      if (scrollHeight - scrollTop - clientHeight < LOAD_MORE_THRESHOLD) {
        loadingRef.current = true;
        
        // Use requestAnimationFrame to batch DOM updates
        requestAnimationFrame(() => {
          if (!controller.signal.aborted) {
            setDisplayCount(prev => Math.min(prev + LOAD_MORE_SIZE, deferredVisits.length));
          }
          loadingRef.current = false;
        });
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true, signal: controller.signal } as AddEventListenerOptions);
    
    return () => {
      controller.abort();
    };
  }, [hasMore, deferredVisits.length]);

  // Immediate load more for fast scrollers
  const loadMore = () => {
    if (!hasMore) return;
    setDisplayCount(prev => Math.min(prev + LOAD_MORE_SIZE, deferredVisits.length));
  };

  return (
    <div ref={containerRef} className="space-y-2 sm:space-y-3">
      {visibleVisits.map((visit) => (
        <MemoizedVisitCard
          key={visit.id}
          visit={visit}
          onViewDetails={onViewDetails}
          selectedDate={selectedDate}
          skipInitialCheck={true}
          viewingUserId={viewingUserId}
          pointsBreakdown={
            visit.retailerId && pointsByRetailer
              ? pointsByRetailer.get(visit.retailerId) ?? null
              : null
          }
        />
      ))}
      
      {hasMore && (
        <div className="flex justify-center py-3">
          <button
            onClick={loadMore}
            className="px-4 py-2 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            Load more ({deferredVisits.length - displayCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
};

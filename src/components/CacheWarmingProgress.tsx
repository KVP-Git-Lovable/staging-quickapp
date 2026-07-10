import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Check, Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CacheStep {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'done' | 'error';
}

interface CacheWarmingProgressProps {
  isOpen: boolean;
  onComplete: () => void;
  onDismiss: () => void;
  steps: CacheStep[];
  currentStep: number;
  isOnline: boolean;
}

export const CacheWarmingProgress = ({
  isOpen,
  onComplete,
  onDismiss,
  steps,
  currentStep,
  isOnline
}: CacheWarmingProgressProps) => {
  const completedSteps = steps.filter(s => s.status === 'done').length;
  const progress = steps.length > 0 ? (completedSteps / steps.length) * 100 : 0;
  const allDone = steps.every(s => s.status === 'done');
  const hasError = steps.some(s => s.status === 'error');

  useEffect(() => {
    if (allDone && isOpen) {
      // Auto-dismiss after 1s when complete
      const timer = setTimeout(() => {
        onComplete();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [allDone, isOpen, onComplete]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isOnline ? (
              <Wifi className="h-5 w-5 text-green-500" />
            ) : (
              <WifiOff className="h-5 w-5 text-amber-500" />
            )}
            {allDone ? 'Data Ready!' : 'Preparing Offline Data...'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Progress bar */}
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">
              {completedSteps} of {steps.length} completed
            </p>
          </div>

          {/* Steps list */}
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-lg transition-colors",
                  step.status === 'loading' && "bg-primary/5",
                  step.status === 'done' && "bg-green-50 dark:bg-green-950/20",
                  step.status === 'error' && "bg-red-50 dark:bg-red-950/20"
                )}
              >
                <div className="flex-shrink-0">
                  {step.status === 'pending' && (
                    <div className="h-5 w-5 rounded-full border-2 border-muted" />
                  )}
                  {step.status === 'loading' && (
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  )}
                  {step.status === 'done' && (
                    <Check className="h-5 w-5 text-green-600" />
                  )}
                  {step.status === 'error' && (
                    <RefreshCw className="h-5 w-5 text-red-500" />
                  )}
                </div>
                <span className={cn(
                  "text-sm",
                  step.status === 'done' && "text-green-700 dark:text-green-400",
                  step.status === 'error' && "text-red-700 dark:text-red-400",
                  step.status === 'pending' && "text-muted-foreground"
                )}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {/* Info text */}
          <p className="text-xs text-muted-foreground text-center">
            {allDone 
              ? "All data cached! You can now work offline." 
              : hasError 
                ? "Some data couldn't be synced. You can continue with partial cache."
                : "Please wait while we prepare your data for offline use..."
            }
          </p>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            {(allDone || hasError) && (
              <Button onClick={onComplete} size="sm">
                {allDone ? 'Continue' : 'Continue Anyway'}
              </Button>
            )}
            {!allDone && !hasError && (
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                Skip for Now
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Shared cache-warming store (module-level singleton) so multiple components —
// SyncStatusIndicator header badge, MasterDataCacheInitializer background
// warmup, and the modal itself — all observe the same step state.
// ---------------------------------------------------------------------------

const INITIAL_STEPS: CacheStep[] = [
  { id: 'products', label: 'Products & Variants', status: 'pending' },
  { id: 'schemes', label: 'Schemes & Offers', status: 'pending' },
  { id: 'beats', label: 'Beat Routes', status: 'pending' },
  { id: 'retailers', label: 'Retailers', status: 'pending' },
  { id: 'beatPlans', label: 'Beat Plans', status: 'pending' },
  { id: 'competition', label: 'Competition Data', status: 'pending' },
];

interface CacheWarmingState {
  isWarming: boolean;   // dialog visible (manual "Prepare Offline Data")
  steps: CacheStep[];
  currentStep: number;
}

let sharedState: CacheWarmingState = {
  isWarming: false,
  steps: INITIAL_STEPS.map(s => ({ ...s })),
  currentStep: 0,
};

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};
const emit = () => {
  sharedState = { ...sharedState };
  listeners.forEach(l => l());
};
const getSnapshot = () => sharedState;

const resetStepsInternal = () => {
  sharedState.steps = INITIAL_STEPS.map(s => ({ ...s }));
  sharedState.currentStep = 0;
};

export const cacheWarmingStore = {
  subscribe,
  getSnapshot,
  startWarming() {
    resetStepsInternal();
    sharedState.isWarming = true;
    emit();
  },
  startBackgroundWarming() {
    // Reset only if not currently in the middle of a warm
    const anyLoading = sharedState.steps.some(s => s.status === 'loading');
    if (!anyLoading) {
      resetStepsInternal();
      emit();
    }
  },
  updateStep(stepId: string, status: CacheStep['status']) {
    sharedState.steps = sharedState.steps.map(s =>
      s.id === stepId ? { ...s, status } : s
    );
    if (status === 'done') sharedState.currentStep += 1;

    // Persist "ready" timestamp when all steps complete
    if (sharedState.steps.length > 0 && sharedState.steps.every(s => s.status === 'done')) {
      try { localStorage.setItem('master_cache_ready_at', String(Date.now())); } catch { /* no-op */ }
    }
    emit();
  },
  completeWarming() {
    sharedState.isWarming = false;
    try { localStorage.setItem('cache_warmed_at', Date.now().toString()); } catch { /* no-op */ }
    emit();
  },
  dismissWarming() {
    sharedState.isWarming = false;
    emit();
  },
  /** Mark all steps as done using the persisted cache; used when freshness check passes. */
  markReadyFromCache() {
    sharedState.steps = sharedState.steps.map(s => ({ ...s, status: 'done' as const }));
    sharedState.currentStep = sharedState.steps.length;
    emit();
  },
};

// Hook to manage cache warming state (shared across all consumers)
export const useCacheWarming = () => {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const startWarming = useCallback(() => cacheWarmingStore.startWarming(), []);
  const updateStep = useCallback(
    (stepId: string, status: CacheStep['status']) => cacheWarmingStore.updateStep(stepId, status),
    []
  );
  const completeWarming = useCallback(() => cacheWarmingStore.completeWarming(), []);
  const dismissWarming = useCallback(() => cacheWarmingStore.dismissWarming(), []);

  // Check if cache needs warming
  const needsWarming = useCallback((): boolean => {
    const lastWarmed = localStorage.getItem('cache_warmed_at');
    const masterDataCached = localStorage.getItem('master_data_cached_at');
    if (!lastWarmed && !masterDataCached) return true;
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    const lastTime = parseInt(lastWarmed || masterDataCached || '0');
    return lastTime < twentyFourHoursAgo;
  }, []);

  return {
    isWarming: state.isWarming,
    steps: state.steps,
    currentStep: state.currentStep,
    startWarming,
    updateStep,
    completeWarming,
    dismissWarming,
    needsWarming,
  };
};


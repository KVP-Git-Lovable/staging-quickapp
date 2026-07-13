import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Check, Loader2, Wifi, WifiOff, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMasterDataCache } from '@/hooks/useMasterDataCache';
import { useConnectivity } from '@/hooks/useConnectivity';
import { useAuth } from '@/hooks/useAuth';
import { Preferences } from '@capacitor/preferences';
import { getLocalTodayDate } from '@/utils/dateUtils';
import { OfflineEngineToggle } from '@/components/OfflineEngineToggle';

interface SyncStep {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'done' | 'error';
  count?: number;
}

interface SyncDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

const DEFAULT_STEPS: SyncStep[] = [
  { id: 'products', label: 'Products & Variants', status: 'pending' },
  { id: 'schemes', label: 'Schemes & Categories', status: 'pending' },
  { id: 'beats', label: 'Beat Routes', status: 'pending' },
  { id: 'retailers', label: 'Retailers', status: 'pending' },
  { id: 'beatPlans', label: 'Beat Plans', status: 'pending' },
  { id: 'competition', label: 'Competition Data', status: 'pending' },
  { id: 'visits', label: "Today's Visits", status: 'pending' },
  { id: 'orders', label: "Today's Orders", status: 'pending' },
];

export const SyncDataModal = ({ isOpen, onClose, onComplete }: SyncDataModalProps) => {
  const [steps, setSteps] = useState<SyncStep[]>(DEFAULT_STEPS);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncComplete, setSyncComplete] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const { fullOfflineSync } = useMasterDataCache();
  const { user } = useAuth();
  const networkStatus = useConnectivity();
  const isOnline = networkStatus === 'online';

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSteps(DEFAULT_STEPS.map(s => ({ ...s, status: 'pending', count: undefined })));
      setIsSyncing(false);
      setSyncComplete(false);
      setTotalItems(0);
      setError(null);
    }
  }, [isOpen]);

  const updateStepStatus = useCallback((stepId: string, status: SyncStep['status']) => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, status } : s));
  }, []);

  const updateStepCount = useCallback((stepId: string, count: number) => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, count } : s));
  }, []);

  const handleSync = async () => {
    if (!isOnline) {
      setError('No internet connection. Please connect to sync data.');
      return;
    }

    setIsSyncing(true);
    setError(null);
    
    try {
      // CRITICAL: Clear today's snapshot first to prevent stale data
      if (user?.id) {
        const today = getLocalTodayDate();
        const snapshotKey = `myvisits_snapshot_${user.id}_${today}`;
        await Preferences.remove({ key: snapshotKey });
        await Preferences.remove({ key: 'visit_status_cache' });
        console.log('[SyncModal] Cleared snapshot for fresh sync');
      }
      
      const summary = await fullOfflineSync(updateStepStatus, updateStepCount);
      setTotalItems(summary.total);
      setSyncComplete(true);
    } catch (err) {
      console.error('Sync error:', err);
      setError('Sync failed. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleComplete = () => {
    onComplete?.();
    onClose();
  };

  const completedSteps = steps.filter(s => s.status === 'done').length;
  const progress = steps.length > 0 ? (completedSteps / steps.length) * 100 : 0;
  const hasErrors = steps.some(s => s.status === 'error');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSyncing && onClose()}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => isSyncing && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isOnline ? (
              <Wifi className="h-5 w-5 text-green-500" />
            ) : (
              <WifiOff className="h-5 w-5 text-amber-500" />
            )}
            {syncComplete ? 'Sync Complete!' : isSyncing ? 'Syncing Data...' : 'Sync All Data'}
          </DialogTitle>
          <DialogDescription>
            {syncComplete 
              ? 'All data has been downloaded and is ready for offline use.'
              : 'Download all data from the server to your device for offline access.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <OfflineEngineToggle />
          {/* Progress bar (only show when syncing or complete) */}
          {(isSyncing || syncComplete) && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {completedSteps} of {steps.length} completed
              </p>
            </div>
          )}

          {/* Steps list (only show when syncing or complete) */}
          {(isSyncing || syncComplete) && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className={cn(
                    "flex items-center justify-between gap-3 p-2 rounded-lg transition-colors",
                    step.status === 'loading' && "bg-primary/5",
                    step.status === 'done' && "bg-green-50 dark:bg-green-950/20",
                    step.status === 'error' && "bg-red-50 dark:bg-red-950/20"
                  )}
                >
                  <div className="flex items-center gap-3">
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
                        <AlertCircle className="h-5 w-5 text-red-500" />
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
                  {step.count !== undefined && step.status === 'done' && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {step.count} items
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Sync Complete Summary */}
          {syncComplete && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-2" />
              <p className="font-semibold text-green-700 dark:text-green-400">
                All data synced successfully!
              </p>
              <p className="text-sm text-green-600 dark:text-green-500 mt-1">
                {totalItems} items ready for offline use
              </p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-center">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Info text (before sync starts) */}
          {!isSyncing && !syncComplete && (
            <div className="text-center text-sm text-muted-foreground space-y-2">
              <p>This will download:</p>
              <ul className="text-xs space-y-1">
                <li>• Products, variants & schemes</li>
                <li>• Your beats & retailers</li>
                <li>• Today's visits & orders</li>
                <li>• Competition data</li>
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            {!isSyncing && !syncComplete && (
              <>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSync} 
                  size="sm"
                  disabled={!isOnline}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Sync All Data
                </Button>
              </>
            )}
            {syncComplete && (
              <Button onClick={handleComplete} size="sm" className="gap-2">
                <Check className="h-4 w-4" />
                Done
              </Button>
            )}
            {hasErrors && !syncComplete && !isSyncing && (
              <Button onClick={handleSync} size="sm" variant="outline">
                Retry
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

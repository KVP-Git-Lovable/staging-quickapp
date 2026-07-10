import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle2, AlertCircle, Clock, RefreshCw, AlertTriangle, XCircle, WifiOff, ChevronDown, ChevronUp, Package, MapPin, User, Calendar, Trash2 } from "lucide-react";
import { offlineStorage, STORES } from "@/lib/offlineStorage";
import { useManagedInterval } from "@/utils/intervalManager";
import { type SyncErrorType, type SyncState, SLOW_RETRY_THRESHOLD } from "@/lib/syncErrorClassifier";
import { supabase } from "@/integrations/supabase/client";

interface SyncItem {
  id: string;
  action: string;
  syncState: SyncState;
  errorType?: SyncErrorType;
  lastError?: string;
  data?: any;
  timestamp?: number;
  retryCount?: number;
}

interface SyncProgressModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTriggerSync?: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  'CREATE_ORDER': 'Creating Order',
  'UPDATE_ORDER': 'Updating Order',
  'CREATE_VISIT': 'Creating Visit',
  'CHECK_IN': 'Check In',
  'CHECK_OUT': 'Check Out',
  'CREATE_STOCK': 'Creating Stock',
  'UPDATE_STOCK': 'Updating Stock',
  'CREATE_RETAILER': 'Creating Retailer',
  'UPDATE_RETAILER': 'Updating Retailer',
  'DELETE_RETAILER': 'Deleting Retailer',
  'CREATE_ATTENDANCE': 'Check In Attendance',
  'UPDATE_ATTENDANCE': 'Check Out Attendance',
  'CREATE_BEAT': 'Creating Beat',
  'UPDATE_BEAT': 'Updating Beat',
  'DELETE_BEAT': 'Deleting Beat',
  'CREATE_BEAT_PLAN': 'Creating Beat Plan',
  'UPDATE_BEAT_PLAN': 'Updating Beat Plan',
  'NO_ORDER': 'Recording No Order',
  'UPDATE_VISIT_NO_ORDER': 'Recording No Order',
  'CREATE_COMPETITION_DATA': 'Recording Competition Data',
  'CREATE_RETURN_STOCK': 'Recording Return Stock',
  'SEND_INVOICE_SMS': 'Sending Invoice SMS/WhatsApp',
};

const getActionLabel = (action: string) => ACTION_LABELS[action] || action;

const getItemSummary = (item: SyncItem): string => {
  const { action, data } = item;
  if (!data) return '';

  if (action === 'CREATE_ORDER' && data) {
    const order = data.order || data;
    const retailerName = order.retailer_name || 'Retailer';
    const amount = order.total_amount || order.amount || 0;
    const itemCount = data.items?.length || 0;
    return `${retailerName} - ₹${Number(amount).toFixed(2)}${itemCount ? ` (${itemCount} items)` : ''}`;
  }
  if (action === 'SEND_INVOICE_SMS' && data) {
    return `${data.retailerName || 'Retailer'} - Invoice Message`;
  }
  if (action === 'CREATE_RETAILER' && data) return data.shop_name || data.name || 'New Retailer';
  if (action === 'UPDATE_VISIT_NO_ORDER' && data) {
    return `${data.retailerName || 'Retailer'} - ${data.noOrderReason || 'No Order'}`;
  }
  if (action === 'CREATE_BEAT' && data) return data.beat_name || 'New Beat';
  if (action === 'CREATE_BEAT_PLAN' && data) return data.beat_name || 'Beat Plan';
  if (action === 'CREATE_ATTENDANCE' && data) {
    return data.check_in_time ? `Check-in at ${new Date(data.check_in_time).toLocaleTimeString()}` : 'Attendance';
  }
  if (action === 'UPDATE_ATTENDANCE' && data) {
    return data.check_out_time ? `Check-out at ${new Date(data.check_out_time).toLocaleTimeString()}` : 'Attendance';
  }
  if (action === 'CHECK_IN' && data) return data.retailer_name || data.retailerName || 'Visit Check-In';
  if (action === 'CHECK_OUT' && data) return data.retailer_name || data.retailerName || 'Visit Check-Out';
  if (action === 'CREATE_VISIT' && data) return data.retailer_name || data.retailerName || 'New Visit';
  if (action === 'CREATE_STOCK' && data) return data.product_name || 'Stock Entry';
  if (action === 'CREATE_RETURN_STOCK' && data) return data.product_name || 'Return Stock';
  if (action === 'CREATE_COMPETITION_DATA' && data) return data.brand_name || 'Competition Data';
  return '';
};

/** Expandable detail rows for a sync item */
const SyncItemDetails = ({ item }: { item: SyncItem }) => {
  const { action, data, timestamp } = item;
  if (!data) return <p className="text-xs text-muted-foreground">No additional details</p>;

  const rows: { label: string; value: string }[] = [];

  if (timestamp) {
    rows.push({ label: 'Queued At', value: new Date(timestamp).toLocaleString() });
  }

  if (action === 'CREATE_ORDER') {
    const order = data.order || data;
    if (order.retailer_name) rows.push({ label: 'Retailer', value: order.retailer_name });
    if (order.total_amount) rows.push({ label: 'Amount', value: `₹${Number(order.total_amount).toFixed(2)}` });
    if (order.order_date) rows.push({ label: 'Order Date', value: order.order_date });
    if (order.id) rows.push({ label: 'Order ID', value: order.id.substring(0, 8) + '...' });
    if (data.items?.length) {
      rows.push({ label: 'Items', value: `${data.items.length} products` });
      data.items.slice(0, 5).forEach((itm: any, idx: number) => {
        const name = itm.product_name || itm.name || `Item ${idx + 1}`;
        const qty = itm.quantity || 0;
        const total = itm.total || 0;
        rows.push({ label: `  ${name}`, value: `${qty} × ₹${Number(total).toFixed(2)}` });
      });
      if (data.items.length > 5) {
        rows.push({ label: '', value: `... and ${data.items.length - 5} more items` });
      }
    }
  } else if (action === 'UPDATE_VISIT_NO_ORDER') {
    if (data.retailerName) rows.push({ label: 'Retailer', value: data.retailerName });
    if (data.noOrderReason) rows.push({ label: 'Reason', value: data.noOrderReason });
    if (data.plannedDate) rows.push({ label: 'Date', value: data.plannedDate });
    if (data.checkOutTime) rows.push({ label: 'Check-out', value: new Date(data.checkOutTime).toLocaleTimeString() });
  } else if (action === 'CREATE_RETAILER') {
    if (data.shop_name || data.name) rows.push({ label: 'Name', value: data.shop_name || data.name });
    if (data.address) rows.push({ label: 'Address', value: data.address });
    if (data.beat_name) rows.push({ label: 'Beat', value: data.beat_name });
    if (data.mobile) rows.push({ label: 'Mobile', value: data.mobile });
  } else if (action === 'CREATE_ATTENDANCE' || action === 'UPDATE_ATTENDANCE') {
    if (data.check_in_time) rows.push({ label: 'Check-in', value: new Date(data.check_in_time).toLocaleString() });
    if (data.check_out_time) rows.push({ label: 'Check-out', value: new Date(data.check_out_time).toLocaleString() });
    if (data.check_in_address) rows.push({ label: 'Location', value: data.check_in_address });
  } else if (action === 'CREATE_BEAT' || action === 'UPDATE_BEAT') {
    if (data.beat_name) rows.push({ label: 'Beat', value: data.beat_name });
    if (data.beat_id) rows.push({ label: 'Beat ID', value: data.beat_id });
  } else if (action === 'CREATE_BEAT_PLAN' || action === 'UPDATE_BEAT_PLAN') {
    if (data.beat_name) rows.push({ label: 'Beat', value: data.beat_name });
    if (data.plan_date) rows.push({ label: 'Date', value: data.plan_date });
  } else if (action === 'SEND_INVOICE_SMS') {
    if (data.retailerName) rows.push({ label: 'Retailer', value: data.retailerName });
    if (data.phone) rows.push({ label: 'Phone', value: data.phone });
  } else {
    // Generic: show all string/number fields
    Object.entries(data).forEach(([key, val]) => {
      if (typeof val === 'string' || typeof val === 'number') {
        rows.push({ label: key.replace(/_/g, ' '), value: String(val) });
      }
    });
  }

  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No additional details</p>;

  return (
    <div className="mt-2 space-y-1.5 border-t pt-2">
      {rows.map((row, idx) => (
        <div key={idx} className="flex flex-col text-xs gap-0.5">
          {row.label && (
            <span className="text-muted-foreground text-[10px] uppercase tracking-wide">{row.label}</span>
          )}
          <span className="font-medium break-words line-clamp-2">{row.value}</span>
        </div>
      ))}
    </div>
  );
};

const SyncStateIcon = ({ item }: { item: SyncItem }) => {
  const isSlowRetry = (item.retryCount || 0) >= SLOW_RETRY_THRESHOLD;
  switch (item.syncState) {
    case 'RETRYING': return isSlowRetry
      ? <AlertTriangle className="h-4 w-4 text-orange-500" />
      : <RefreshCw className="h-4 w-4 text-orange-500" />;
    case 'SYNCING': return <RefreshCw className="h-4 w-4 text-primary animate-spin" />;
    default: return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
};

const SyncStateBadge = ({ item }: { item: SyncItem }) => {
  const retryCount = item.retryCount || 0;
  const isSlowRetry = retryCount >= SLOW_RETRY_THRESHOLD;
  switch (item.syncState) {
    case 'RETRYING': return isSlowRetry
      ? <Badge className="bg-orange-100 text-orange-700 text-[10px] px-1.5">Retrying (slow)</Badge>
      : <Badge className="bg-orange-100 text-orange-700 text-[10px] px-1.5">Retry #{retryCount}</Badge>;
    case 'SYNCING': return <Badge className="bg-blue-100 text-blue-700 text-[10px] px-1.5">Syncing</Badge>;
    default: return <Badge variant="secondary" className="text-[10px] px-1.5">Queued</Badge>;
  }
};

export const SyncProgressModal = ({ open, onOpenChange, onTriggerSync }: SyncProgressModalProps) => {
  const [syncItems, setSyncItems] = useState<SyncItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const loadSyncQueue = useCallback(async () => {
    try {
      const queue = await offlineStorage.getSyncQueue();
      setTotalItems(queue.length);
      setSyncItems(queue.map(item => ({
        id: item.id,
        action: item.action,
        syncState: item.syncState || (item.retryCount > 0 ? 'RETRYING' : 'QUEUED'),
        errorType: item.errorType,
        lastError: item.lastError,
        data: item.data,
        timestamp: item.timestamp,
        retryCount: item.retryCount
      })));
    } catch (error) {
      console.error('Error loading sync queue:', error);
    }
  }, []);

  const handleManualRetry = useCallback(async () => {
    try {
      const queue = await offlineStorage.getSyncQueue();
      for (const item of queue) {
        if (item.syncState === 'RETRYING' || (item.retryCount || 0) >= SLOW_RETRY_THRESHOLD) {
          await offlineStorage.save(STORES.SYNC_QUEUE, {
            ...item,
            retryCount: 0,
            syncState: 'QUEUED',
            // Clear previous error so the item can be retried after a fix (e.g., schema change)
            errorType: undefined,
            lastError: undefined,
            lastRetryAt: undefined,
          });
        }
      }
      if (onTriggerSync) onTriggerSync();
      await loadSyncQueue();
    } catch (e) {
      console.error('Error resetting sync items:', e);
    }
  }, [onTriggerSync, loadSyncQueue]);

  const handleDiscard = useCallback(async (item: SyncItem) => {
    if (!confirm('Discard this queued item permanently? It will not be retried.')) return;
    try {
      await offlineStorage.delete(STORES.SYNC_QUEUE, item.id);
      const idemKey = (item.data as any)?.order?.idempotency_key
        || (item.data as any)?.idempotency_key
        || (item.data as any)?.order?.id
        || (item.data as any)?.id;
      if (idemKey && navigator.onLine) {
        try {
          await supabase.from('failed_sync_log' as any)
            .update({ resolved: true, resolved_at: new Date().toISOString() } as any)
            .eq('idempotency_key', idemKey);
        } catch (e) {
          console.warn('failed_sync_log resolve failed (non-fatal):', e);
        }
      }
      await loadSyncQueue();
    } catch (e) {
      console.error('Discard failed:', e);
    }
  }, [loadSyncQueue]);

  useEffect(() => {
    if (!open) return;
    loadSyncQueue();
    if (onTriggerSync) onTriggerSync();
  }, [open, onTriggerSync, loadSyncQueue]);

  useManagedInterval('sync-progress-modal', loadSyncQueue, 2000, { enabled: open, runWhenHidden: false });

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const slowRetryCount = syncItems.filter(i => i.syncState === 'RETRYING' && (i.retryCount || 0) >= SLOW_RETRY_THRESHOLD).length;
  const retryingCount = syncItems.filter(i => i.syncState === 'RETRYING' && (i.retryCount || 0) < SLOW_RETRY_THRESHOLD).length;
  const queuedCount = syncItems.filter(i => i.syncState === 'QUEUED' || i.syncState === 'SYNCING').length;

  const ERROR_TYPE_LABELS: Record<SyncErrorType, { label: string; icon: React.ReactNode }> = {
    NETWORK: { label: 'Network', icon: <WifiOff className="h-3 w-3" /> },
    VALIDATION: { label: 'Invalid Data', icon: <XCircle className="h-3 w-3" /> },
    AUTH: { label: 'Auth Error', icon: <AlertCircle className="h-3 w-3" /> },
    CONFLICT: { label: 'Conflict', icon: <AlertTriangle className="h-3 w-3" /> },
    SERVER: { label: 'Server Error', icon: <AlertCircle className="h-3 w-3" /> },
    UNKNOWN: { label: 'Unknown', icon: <AlertCircle className="h-3 w-3" /> },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Sync Progress</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="flex gap-2 flex-wrap">
            {queuedCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                <Clock className="h-3 w-3 mr-1" /> {queuedCount} Queued
              </Badge>
            )}
            {retryingCount > 0 && (
              <Badge className="bg-orange-100 text-orange-700 text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" /> {retryingCount} Retrying
              </Badge>
            )}
            {slowRetryCount > 0 && (
              <Badge className="bg-orange-100 text-orange-700 text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" /> {slowRetryCount} Slow Retry
              </Badge>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Pending Items ({totalItems})</h4>
            <div className="flex gap-2">
              {slowRetryCount > 0 && (
                <Button size="sm" variant="outline" onClick={handleManualRetry} className="h-7 text-xs">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Force Retry All
                </Button>
              )}
              {onTriggerSync && syncItems.length > 0 && (
                <Button size="sm" variant="outline" onClick={onTriggerSync} className="h-7 text-xs">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Sync Now
                </Button>
              )}
            </div>
          </div>

          {/* Sync Items List */}
          {syncItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p>All data synced successfully!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {syncItems.map((item) => {
                const summary = getItemSummary(item);
                const errorInfo = item.errorType ? ERROR_TYPE_LABELS[item.errorType] : null;
                const isExpanded = expandedItems.has(item.id);
                return (
                  <Collapsible key={item.id} open={isExpanded} onOpenChange={() => toggleExpand(item.id)}>
                    <div
                      className={`rounded-lg border bg-card ${
                        (item.retryCount || 0) >= SLOW_RETRY_THRESHOLD ? 'border-orange-300/30 bg-orange-50/5' : ''
                      }`}
                    >
                      <CollapsibleTrigger asChild>
                        <button className="flex items-start justify-between p-3 gap-2 w-full text-left">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <div className="mt-0.5 flex-shrink-0">
                              <SyncStateIcon item={item} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium flex items-center gap-1">
                                {getActionLabel(item.action)}
                                {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                              </div>
                              {summary && (
                                <div className="text-xs text-muted-foreground truncate mt-0.5">
                                  {summary}
                                </div>
                              )}
                              {item.lastError && (
                                <div className="text-xs text-destructive mt-1 flex items-start gap-1 min-w-0">
                                  {errorInfo && <span className="flex-shrink-0 mt-0.5">{errorInfo.icon}</span>}
                                  <span className="break-words line-clamp-2">
                                    {errorInfo ? `${errorInfo.label}: ` : ''}{item.lastError}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <SyncStateBadge item={item} />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-3 pb-3">
                          <SyncItemDetails item={item} />
                          <div className="mt-2 flex justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDiscard(item)}
                              className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Discard
                            </Button>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

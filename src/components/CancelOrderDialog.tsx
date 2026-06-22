import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle, XCircle, Loader2, Truck, Wallet } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cancelOrder, CancelOrderOptions } from "@/utils/orderCancellation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export interface CancelableOrder {
  id: string;
  invoice_number?: string;
  total_amount: number;
  is_credit_order: boolean;
  credit_pending_amount?: number;
  credit_paid_amount?: number;
  is_van_sale?: boolean;
}

interface CancelOrderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orders: CancelableOrder[];
  retailerName: string;
  onCancelled: (cancelledOrderIds: string[]) => void;
}

const CANCELLATION_REASONS = [
  { value: 'wrong-details', label: 'Wrong order details' },
  { value: 'customer-request', label: 'Customer requested cancellation' },
  { value: 'duplicate-order', label: 'Duplicate order' },
  { value: 'pricing-error', label: 'Pricing error' },
  { value: 'other', label: 'Other' }
];

type Step = 'select' | 'reason' | 'options' | 'confirm';

interface OrderMeta {
  credit_paid_amount: number;
  is_van_sale: boolean;
}

interface PerOrderOptions extends CancelOrderOptions {}

export const CancelOrderDialog = ({
  isOpen,
  onClose,
  orders,
  retailerName,
  onCancelled
}: CancelOrderDialogProps) => {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('select');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedReason, setSelectedReason] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderMeta, setOrderMeta] = useState<Record<string, OrderMeta>>({});
  const [optionsByOrder, setOptionsByOrder] = useState<Record<string, PerOrderOptions>>({});
  const [loadingMeta, setLoadingMeta] = useState(false);

  const handleClose = () => {
    setStep('select');
    setSelectedIds(new Set());
    setSelectedReason('');
    setAdditionalNotes('');
    setIsSubmitting(false);
    setOrderMeta({});
    setOptionsByOrder({});
    onClose();
  };

  const toggleOrder = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === orders.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(orders.map(o => o.id)));
  };

  const selectedOrders = orders.filter(o => selectedIds.has(o.id));
  const selectedTotal = selectedOrders.reduce((s, o) => s + o.total_amount, 0);
  const allSelected = selectedIds.size === orders.length;

  // Fetch per-order metadata (credit_paid_amount, van-sale detection) when entering options/confirm flow
  const fetchMeta = async (ids: string[]) => {
    setLoadingMeta(true);
    try {
      const { data: rows } = await supabase
        .from('orders')
        .select('id, credit_paid_amount, assigned_van_id, user_id, order_date')
        .in('id', ids);

      const meta: Record<string, OrderMeta> = {};
      // Detect van-sale: assigned_van_id present OR a van_stock row exists for user_id+order_date
      const needVanLookup = (rows || []).filter(r => !r.assigned_van_id && r.user_id && r.order_date);
      let vanSaleSet = new Set<string>();
      if (needVanLookup.length > 0) {
        const orFilter = needVanLookup.map(r => `and(user_id.eq.${r.user_id},stock_date.eq.${r.order_date})`).join(',');
        const { data: vs } = await supabase
          .from('van_stock')
          .select('user_id, stock_date')
          .or(orFilter);
        (vs || []).forEach(v => vanSaleSet.add(`${v.user_id}|${v.stock_date}`));
      }
      (rows || []).forEach(r => {
        const isVan = !!r.assigned_van_id || vanSaleSet.has(`${r.user_id}|${r.order_date}`);
        meta[r.id] = {
          credit_paid_amount: Number(r.credit_paid_amount || 0),
          is_van_sale: isVan,
        };
      });
      setOrderMeta(meta);

      // Initialize default options
      const init: Record<string, PerOrderOptions> = {};
      selectedOrders.forEach(o => {
        const m = meta[o.id];
        if (!m) return;
        const opt: PerOrderOptions = {};
        if (m.credit_paid_amount > 0) {
          opt.settlement_method = 'refund';
          opt.settlement_amount = m.credit_paid_amount;
        }
        if (m.is_van_sale) {
          opt.van_stock_action = 'not_collected';
        }
        init[o.id] = opt;
      });
      setOptionsByOrder(init);
    } finally {
      setLoadingMeta(false);
    }
  };

  const needsOptionsStep = () =>
    selectedOrders.some(o => {
      const m = orderMeta[o.id];
      return m && (m.credit_paid_amount > 0 || m.is_van_sale);
    });

  const handleProceedToReason = () => {
    if (selectedIds.size === 0) return;
    setStep('reason');
  };

  const handleProceedAfterReason = async () => {
    if (!selectedReason) {
      toast({ title: "Reason required", description: "Please select a reason for cancellation", variant: "destructive" });
      return;
    }
    await fetchMeta(selectedOrders.map(o => o.id));
    setStep(prev => 'options');
  };

  // After meta loaded, decide whether to skip options step
  useEffect(() => {
    if (step !== 'options') return;
    if (loadingMeta) return;
    if (!needsOptionsStep()) setStep('confirm');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loadingMeta, orderMeta]);

  const updateOpt = (orderId: string, patch: Partial<PerOrderOptions>) => {
    setOptionsByOrder(prev => ({ ...prev, [orderId]: { ...prev[orderId], ...patch } }));
  };

  const optionsValid = () =>
    selectedOrders.every(o => {
      const m = orderMeta[o.id];
      if (!m) return true;
      const opt = optionsByOrder[o.id] || {};
      if (m.credit_paid_amount > 0) {
        if (!opt.settlement_method) return false;
        const amt = Number(opt.settlement_amount || 0);
        if (amt <= 0 || amt > m.credit_paid_amount + 0.01) return false;
      }
      if (m.is_van_sale && !opt.van_stock_action) return false;
      return true;
    });

  const handleConfirmCancellation = async () => {
    if (!user?.id) return;
    setIsSubmitting(true);

    const reasonLabel = CANCELLATION_REASONS.find(r => r.value === selectedReason)?.label || selectedReason;
    const fullReason = additionalNotes ? `${reasonLabel}: ${additionalNotes}` : reasonLabel;

    const cancelledIds: string[] = [];
    const failures: string[] = [];

    for (const order of selectedOrders) {
      try {
        const opt = optionsByOrder[order.id] || {};
        const result = await cancelOrder(order.id, fullReason, user.id, opt);
        if (result.success) cancelledIds.push(order.id);
        else failures.push(order.invoice_number || order.id);
      } catch {
        failures.push(order.invoice_number || order.id);
      }
    }

    if (cancelledIds.length > 0) {
      toast({
        title: `${cancelledIds.length} order${cancelledIds.length > 1 ? 's' : ''} cancelled`,
        description: failures.length > 0
          ? `Failed to cancel: ${failures.join(', ')}`
          : `Successfully cancelled ${cancelledIds.length} invoice${cancelledIds.length > 1 ? 's' : ''}.`,
      });
      onCancelled(cancelledIds);
      handleClose();
    } else {
      toast({ title: "Cancellation failed", description: "Unable to cancel selected orders.", variant: "destructive" });
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-[95%] max-w-md mx-auto rounded-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            Cancel Order{orders.length > 1 ? 's' : ''}
          </DialogTitle>
          <DialogDescription>{retailerName}</DialogDescription>
        </DialogHeader>

        {/* Step 1: Selection */}
        {step === 'select' && (
          <div className="space-y-3 py-2">
            {orders.length > 1 && (
              <div className="flex items-center gap-2 pb-2 border-b">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} id="select-all" />
                <Label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                  Select All ({orders.length})
                </Label>
              </div>
            )}
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {orders.map(order => (
                <div
                  key={order.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedIds.has(order.id) ? 'border-destructive/50 bg-destructive/5' : 'border-border hover:bg-muted/50'
                  }`}
                  onClick={() => toggleOrder(order.id)}
                >
                  <Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleOrder(order.id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{order.invoice_number || 'No Invoice'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm font-semibold">₹{Math.round(order.total_amount).toLocaleString()}</span>
                      {order.is_credit_order && (
                        <span className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded">Credit</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {selectedIds.size > 0 && (
              <div className="bg-muted/50 p-2.5 rounded-lg flex justify-between text-sm">
                <span className="text-muted-foreground">{selectedIds.size} of {orders.length} selected</span>
                <span className="font-semibold">₹{Math.round(selectedTotal).toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Reason */}
        {step === 'reason' && (
          <div className="space-y-4 py-2">
            <div className="bg-muted/50 p-3 rounded-lg text-sm">
              <span className="text-muted-foreground">Cancelling:</span>{' '}
              <span className="font-medium">{selectedIds.size} invoice{selectedIds.size > 1 ? 's' : ''}</span>
              <span className="text-muted-foreground"> — </span>
              <span className="font-semibold">₹{Math.round(selectedTotal).toLocaleString()}</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for cancellation *</Label>
              <Select value={selectedReason} onValueChange={setSelectedReason}>
                <SelectTrigger id="reason"><SelectValue placeholder="Select a reason..." /></SelectTrigger>
                <SelectContent>
                  {CANCELLATION_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Additional notes (optional)</Label>
              <Textarea id="notes" placeholder="Enter any additional details..." value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} rows={3} />
            </div>
          </div>
        )}

        {/* Step 3: Options (settlement + van stock) */}
        {step === 'options' && (
          <div className="space-y-4 py-2">
            {loadingMeta ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading order details…
              </div>
            ) : (
              selectedOrders.map(o => {
                const m = orderMeta[o.id];
                if (!m || (m.credit_paid_amount === 0 && !m.is_van_sale)) return null;
                const opt = optionsByOrder[o.id] || {};
                return (
                  <div key={o.id} className="border rounded-lg p-3 space-y-3">
                    <div className="text-sm font-medium">{o.invoice_number || 'No Invoice'} — ₹{Math.round(o.total_amount).toLocaleString()}</div>

                    {m.credit_paid_amount > 0 && (
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5 text-sm">
                          <Wallet className="h-4 w-4" /> Settle paid amount (₹{Math.round(m.credit_paid_amount).toLocaleString()})
                        </Label>
                        <RadioGroup
                          value={opt.settlement_method || ''}
                          onValueChange={(v) => updateOpt(o.id, { settlement_method: v as any })}
                          className="space-y-1.5"
                        >
                          <div className="flex items-center gap-2"><RadioGroupItem value="refund" id={`r-${o.id}`} /><Label htmlFor={`r-${o.id}`} className="text-sm cursor-pointer">Refund (cash/bank returned)</Label></div>
                          <div className="flex items-center gap-2"><RadioGroupItem value="credit_note" id={`cn-${o.id}`} /><Label htmlFor={`cn-${o.id}`} className="text-sm cursor-pointer">Credit note (GST)</Label></div>
                          <div className="flex items-center gap-2"><RadioGroupItem value="carry_forward" id={`cf-${o.id}`} /><Label htmlFor={`cf-${o.id}`} className="text-sm cursor-pointer">Carry forward (retailer advance)</Label></div>
                        </RadioGroup>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Amount ₹</Label>
                          <Input
                            type="number"
                            min={0}
                            max={m.credit_paid_amount}
                            value={opt.settlement_amount ?? m.credit_paid_amount}
                            onChange={(e) => updateOpt(o.id, { settlement_amount: Number(e.target.value) })}
                            className="h-8"
                          />
                        </div>
                      </div>
                    )}

                    {m.is_van_sale && (
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5 text-sm">
                          <Truck className="h-4 w-4" /> Goods on van
                        </Label>
                        <RadioGroup
                          value={opt.van_stock_action || ''}
                          onValueChange={(v) => updateOpt(o.id, { van_stock_action: v as any })}
                          className="space-y-1.5"
                        >
                          <div className="flex items-center gap-2"><RadioGroupItem value="collected" id={`vc-${o.id}`} /><Label htmlFor={`vc-${o.id}`} className="text-sm cursor-pointer">Collected back → restore to van stock</Label></div>
                          <div className="flex items-center gap-2"><RadioGroupItem value="damaged" id={`vd-${o.id}`} /><Label htmlFor={`vd-${o.id}`} className="text-sm cursor-pointer">Damaged / write-off (not sellable)</Label></div>
                          <div className="flex items-center gap-2"><RadioGroupItem value="not_collected" id={`vn-${o.id}`} /><Label htmlFor={`vn-${o.id}`} className="text-sm cursor-pointer">Not collected (no stock change)</Label></div>
                        </RadioGroup>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 'confirm' && (
          <div className="space-y-4 py-2">
            <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-lg">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="font-medium text-destructive">
                    This will cancel {selectedIds.size} invoice{selectedIds.size > 1 ? 's' : ''}:
                  </p>
                  <ul className="text-sm space-y-1 text-foreground/80">
                    {selectedOrders.map(o => {
                      const opt = optionsByOrder[o.id];
                      return (
                        <li key={o.id}>
                          • {o.invoice_number || 'No Invoice'} — ₹{Math.round(o.total_amount).toLocaleString()}
                          {opt?.settlement_method && (
                            <span className="text-xs text-muted-foreground"> · {opt.settlement_method.replace('_', ' ')} ₹{Math.round(opt.settlement_amount || 0).toLocaleString()}</span>
                          )}
                          {opt?.van_stock_action && (
                            <span className="text-xs text-muted-foreground"> · van: {opt.van_stock_action.replace('_', ' ')}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
            <div className="bg-muted/50 p-3 rounded-lg space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reason:</span>
                <span className="font-medium text-right max-w-[60%]">
                  {CANCELLATION_REASONS.find(r => r.value === selectedReason)?.label}
                </span>
              </div>
              {additionalNotes && (
                <div className="pt-1 border-t">
                  <span className="text-muted-foreground">Notes:</span>
                  <p className="mt-1 text-xs">{additionalNotes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'select' && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button variant="destructive" onClick={handleProceedToReason} disabled={selectedIds.size === 0}>Continue</Button>
            </>
          )}
          {step === 'reason' && (
            <>
              <Button variant="outline" onClick={() => setStep('select')}>Back</Button>
              <Button variant="destructive" onClick={handleProceedAfterReason} disabled={!selectedReason}>Continue</Button>
            </>
          )}
          {step === 'options' && (
            <>
              <Button variant="outline" onClick={() => setStep('reason')}>Back</Button>
              <Button variant="destructive" onClick={() => setStep('confirm')} disabled={loadingMeta || !optionsValid()}>Continue</Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep(needsOptionsStep() ? 'options' : 'reason')} disabled={isSubmitting}>Back</Button>
              <Button variant="destructive" onClick={handleConfirmCancellation} disabled={isSubmitting}>
                {isSubmitting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cancelling...</>) : 'Confirm Cancellation'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

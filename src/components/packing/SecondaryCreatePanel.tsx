import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, addDays } from 'date-fns';
import {
  Package, Search, MapPin, Calendar, ChevronDown, ChevronRight,
  ShoppingCart, Globe, Store, Users, IndianRupee, Boxes
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePackingList, OrderForPacking } from '@/hooks/usePackingList';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import OrderReviewApprovalDialog, { ApprovedItemMap, ManualBatchEntry } from './OrderReviewApprovalDialog';

interface Props {
  distributorId?: string;
  onPackingListCreated?: () => void;
}

interface Beat {
  id: string;
  beat_name: string;
}

interface RetailerGroup {
  retailer_id: string;
  retailer_name: string;
  orders: OrderForPacking[];
}

interface BeatGroup {
  beat_id: string | null;
  beat_name: string;
  retailers: RetailerGroup[];
  allOrders: OrderForPacking[];
}

interface RetailerBeatRow {
  id: string;
  beat_id: string | null;
  beat_name: string | null;
}

export default function SecondaryCreatePanel({ distributorId: propDistributorId, onPackingListCreated }: Props) {
  const { toast } = useToast();
  const { loading, fetchOrdersForPacking, createPackingList } = usePackingList();

  const [orders, setOrders] = useState<OrderForPacking[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBeatId, setSelectedBeatId] = useState<string>('');
  const [beats, setBeats] = useState<Beat[]>([]);
  const [expandedBeats, setExpandedBeats] = useState<Set<string>>(new Set());
  const [expandedRetailers, setExpandedRetailers] = useState<Set<string>>(new Set());
  const [deliveryDate, setDeliveryDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [creating, setCreating] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [allocationStrategy, setAllocationStrategy] = useState<'FIFO' | 'FEFO'>('FIFO');
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [resolvedDistributorId, setResolvedDistributorId] = useState<string | null>(propDistributorId ?? null);

  // Load beats from all retailer links for this distributor
  useEffect(() => {
    const loadBeats = async () => {
      if (!propDistributorId) {
        const { data } = await supabase
          .from('beats')
          .select('beat_id, beat_name')
          .eq('is_active', true);

        if (data) {
          const uniqueBeats = (data as Array<{ beat_id: string | null; beat_name: string | null }>)
            .filter((beat): beat is { beat_id: string; beat_name: string } => Boolean(beat.beat_id && beat.beat_name))
            .filter((beat, index, arr) => arr.findIndex(item => item.beat_id === beat.beat_id) === index)
            .map(beat => ({ id: beat.beat_id, beat_name: beat.beat_name }));
          setBeats(uniqueBeats);
        }
        return;
      }

      const { data: distData } = await supabase
        .from('distributors')
        .select('name')
        .eq('id', propDistributorId)
        .single();

      const distributorName = distData?.name || '';
      const retailerMap = new Map<string, RetailerBeatRow>();

      const { data: mappedRetailers } = await supabase
        .from('distributor_retailer_mappings')
        .select('retailer_id')
        .eq('distributor_id', propDistributorId);

      const mappedRetailerIds = (mappedRetailers || []).map(row => row.retailer_id).filter(Boolean);

      const [directRetailers, parentRetailers, mappedRetailerRows] = await Promise.all([
        supabase
          .from('retailers')
          .select('id, beat_id, beat_name')
          .eq('distributor_id', propDistributorId),
        distributorName
          ? supabase
              .from('retailers')
              .select('id, beat_id, beat_name')
              .ilike('parent_name', distributorName)
          : Promise.resolve({ data: [] as RetailerBeatRow[] }),
        mappedRetailerIds.length > 0
          ? supabase
              .from('retailers')
              .select('id, beat_id, beat_name')
              .in('id', mappedRetailerIds)
          : Promise.resolve({ data: [] as RetailerBeatRow[] }),
      ]);

      [directRetailers.data, parentRetailers.data, mappedRetailerRows.data].forEach(group => {
        (group || []).forEach((retailer: RetailerBeatRow) => {
          if (retailer?.id) retailerMap.set(retailer.id, retailer);
        });
      });

      const uniqueBeats = Array.from(retailerMap.values())
        .filter((retailer): retailer is RetailerBeatRow & { beat_id: string; beat_name: string } => Boolean(retailer.beat_id && retailer.beat_name))
        .filter((retailer, index, arr) => arr.findIndex(item => item.beat_id === retailer.beat_id) === index)
        .map(retailer => ({ id: retailer.beat_id, beat_name: retailer.beat_name }));

      setBeats(uniqueBeats);
    };

    loadBeats();
  }, [propDistributorId]);

  // Load orders when beat is selected
  useEffect(() => {
    if (!selectedBeatId) {
      setOrders([]);
      return;
    }
    loadOrders();
  }, [selectedBeatId, propDistributorId]);

  const loadOrders = useCallback(async () => {
    if (!selectedBeatId) return;
    const distId = propDistributorId ?? null;
    setResolvedDistributorId(distId);
    const result = await fetchOrdersForPacking({
      distributorId: distId || undefined,
      beatIds: [selectedBeatId],
    });
    setOrders(result);
    // Auto-expand when results come in
    if (result.length > 0) {
      const beatNames = [...new Set(result.map(o => o.beat_name || 'No Beat'))];
      setExpandedBeats(new Set(beatNames));
    }
  }, [selectedBeatId, propDistributorId, fetchOrdersForPacking]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    let filtered = orders;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(o =>
        o.retailer_name?.toLowerCase().includes(q) ||
        o.order_number?.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q)
      );
    }
    if (showPendingOnly) {
      filtered = filtered.filter(o => o.delivery_status === 'pending');
    }
    return filtered;
  }, [orders, searchQuery, showPendingOnly]);

  // Group by Beat → Retailer → Orders
  const beatGroups = useMemo((): BeatGroup[] => {
    const beatMap: Record<string, BeatGroup> = {};
    filteredOrders.forEach(o => {
      const bKey = o.beat_name || 'No Beat';
      if (!beatMap[bKey]) {
        beatMap[bKey] = { beat_id: o.beat_id || null, beat_name: bKey, retailers: [], allOrders: [] };
      }
      beatMap[bKey].allOrders.push(o);

      let retailer = beatMap[bKey].retailers.find(r => r.retailer_id === o.retailer_id);
      if (!retailer) {
        retailer = { retailer_id: o.retailer_id, retailer_name: o.retailer_name || 'Unknown', orders: [] };
        beatMap[bKey].retailers.push(retailer);
      }
      retailer.orders.push(o);
    });
    return Object.values(beatMap);
  }, [filteredOrders]);

  // Selection helpers
  const toggleOrder = (orderId: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      next.has(orderId) ? next.delete(orderId) : next.add(orderId);
      return next;
    });
  };

  const toggleRetailer = (retailerOrders: OrderForPacking[]) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      const allSelected = retailerOrders.every(o => next.has(o.id));
      retailerOrders.forEach(o => allSelected ? next.delete(o.id) : next.add(o.id));
      return next;
    });
  };

  const toggleBeat = (beatOrders: OrderForPacking[]) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      const allSelected = beatOrders.every(o => next.has(o.id));
      beatOrders.forEach(o => allSelected ? next.delete(o.id) : next.add(o.id));
      return next;
    });
  };

  const isRetailerSelected = (retailerOrders: OrderForPacking[]) =>
    retailerOrders.length > 0 && retailerOrders.every(o => selectedOrderIds.has(o.id));
  const isRetailerIndeterminate = (retailerOrders: OrderForPacking[]) =>
    retailerOrders.some(o => selectedOrderIds.has(o.id)) && !isRetailerSelected(retailerOrders);
  const isBeatSelected = (beatOrders: OrderForPacking[]) =>
    beatOrders.length > 0 && beatOrders.every(o => selectedOrderIds.has(o.id));
  const isBeatIndeterminate = (beatOrders: OrderForPacking[]) =>
    beatOrders.some(o => selectedOrderIds.has(o.id)) && !isBeatSelected(beatOrders);

  // Selected orders derived
  const selectedOrders = useMemo(() =>
    orders.filter(o => selectedOrderIds.has(o.id)), [orders, selectedOrderIds]);

  const selectedRetailerIds = useMemo(() =>
    new Set(selectedOrders.map(o => o.retailer_id)), [selectedOrders]);

  const selectedTotal = selectedOrders.reduce((s, o) => s + o.total_amount, 0);
  const selectedQty = selectedOrders.reduce((s, o) => s + o.items.reduce((q, i) => q + i.quantity, 0), 0);

  // Summary cards data
  const totalRetailers = useMemo(() =>
    new Set(filteredOrders.map(o => o.retailer_id)).size, [filteredOrders]);
  const totalQty = filteredOrders.reduce((s, o) => s + o.items.reduce((q, i) => q + i.quantity, 0), 0);
  const totalValue = filteredOrders.reduce((s, o) => s + o.total_amount, 0);

  // Handlers
  const handleOpenReview = () => {
    if (selectedOrderIds.size === 0) {
      toast({ title: 'No orders selected', description: 'Select orders to create a packing list', variant: 'destructive' });
      return;
    }
    setShowReviewDialog(true);
  };

  const handleApprovalConfirmed = async (
    approvedItems: ApprovedItemMap,
    warehouseId?: string | null,
    strategy?: string,
    manualAllocations?: Record<string, ManualBatchEntry[]>
  ) => {
    setCreating(true);
    setShowReviewDialog(false);
    try {
      const orderIds = Array.from(selectedOrderIds);
      const result = await createPackingList(
        deliveryDate, resolvedDistributorId, orderIds, selectedOrders,
        'secondary', approvedItems, warehouseId, strategy || allocationStrategy, manualAllocations
      );
      if (result) {
        setSelectedOrderIds(new Set());
        await loadOrders();
        onPackingListCreated?.();
      }
    } finally {
      setCreating(false);
    }
  };

  const getSourceLabel = (order: OrderForPacking) => {
    switch (order.order_source) {
      case 'portal_order': return 'Portal Order';
      case 'manual': return 'Store Visit';
      case 'voice': return 'Phone Order';
      case 'whatsapp': return 'WhatsApp';
      default: return order.order_source || null;
    }
  };

  const getSourceIcon = (source?: string) =>
    source === 'portal_order' ? <Globe className="h-3 w-3 mr-0.5" /> : <Store className="h-3 w-3 mr-0.5" />;

  // No beat selected state
  if (!selectedBeatId) {
    return (
      <div className="flex flex-col h-full">
        {/* Header filters */}
        <div className="p-4 border-b space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="w-40 h-9 text-sm" />
            </div>
            <Select value={selectedBeatId} onValueChange={setSelectedBeatId}>
              <SelectTrigger className="w-52 h-9">
                <MapPin className="h-4 w-4 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Select Beat / Route *" />
              </SelectTrigger>
              <SelectContent>
                {beats.map(b => <SelectItem key={b.id} value={b.id}>{b.beat_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Empty state */}
        <div className="flex flex-col items-center justify-center py-20">
          <MapPin className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">Select a Beat to begin</p>
          <p className="text-xs text-muted-foreground mt-1">Choose a beat/route above to load retailers and orders</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative pb-24">
      {/* Full-width Orders Panel */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header Filters */}
        <div className="p-4 border-b space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="w-40 h-9 text-sm" />
            </div>
            <Select value={selectedBeatId} onValueChange={v => { setSelectedBeatId(v); setSelectedOrderIds(new Set()); }}>
              <SelectTrigger className="w-52 h-9">
                <MapPin className="h-4 w-4 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Select Beat / Route *" />
              </SelectTrigger>
              <SelectContent>
                {beats.map(b => <SelectItem key={b.id} value={b.id}>{b.beat_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Search & Toggle */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search retailers or orders…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-9 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <Checkbox checked={showPendingOnly} onCheckedChange={(c) => setShowPendingOnly(!!c)} />
              Show only pending
            </label>
          </div>
        </div>

        {/* Summary Cards */}
        {filteredOrders.length > 0 && (
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-2 border-b">
            <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <CardContent className="p-2.5 text-center">
                <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{totalRetailers}</p>
                <p className="text-[10px] text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1"><Users className="h-3 w-3" />Retailers</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
              <CardContent className="p-2.5 text-center">
                <p className="text-lg font-bold text-green-700 dark:text-green-300">{filteredOrders.length}</p>
                <p className="text-[10px] text-green-600 dark:text-green-400 flex items-center justify-center gap-1"><ShoppingCart className="h-3 w-3" />Orders</p>
              </CardContent>
            </Card>
            <Card className="bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800">
              <CardContent className="p-2.5 text-center">
                <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{totalQty}</p>
                <p className="text-[10px] text-purple-600 dark:text-purple-400 flex items-center justify-center gap-1"><Boxes className="h-3 w-3" />Quantity</p>
              </CardContent>
            </Card>
            <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
              <CardContent className="p-2.5 text-center">
                <p className="text-lg font-bold text-amber-700 dark:text-amber-300">₹{totalValue.toLocaleString()}</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1"><IndianRupee className="h-3 w-3" />Value</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main List: Beat → Retailer → Orders */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-2">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-40" />
                  <p className="text-muted-foreground font-medium">No pending orders found</p>
                  <p className="text-xs text-muted-foreground mt-1">No confirmed B2R orders for this beat</p>
                </CardContent>
              </Card>
            ) : (
              beatGroups.map(beatGroup => (
                <Collapsible
                  key={beatGroup.beat_name}
                  open={expandedBeats.has(beatGroup.beat_name)}
                  onOpenChange={() => setExpandedBeats(prev => {
                    const next = new Set(prev);
                    next.has(beatGroup.beat_name) ? next.delete(beatGroup.beat_name) : next.add(beatGroup.beat_name);
                    return next;
                  })}
                >
                  {/* Beat Header */}
                  <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                    <CardContent className="p-3 flex items-center gap-2">
                      <Checkbox
                        checked={isBeatSelected(beatGroup.allOrders)}
                        // @ts-ignore
                        indeterminate={isBeatIndeterminate(beatGroup.allOrders)}
                        onCheckedChange={() => toggleBeat(beatGroup.allOrders)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <CollapsibleTrigger asChild>
                        <div className="flex-1 flex items-center justify-between cursor-pointer">
                          <div className="flex items-center gap-2">
                            {expandedBeats.has(beatGroup.beat_name) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">{beatGroup.beat_name}</span>
                            <Badge variant="outline" className="text-xs">{beatGroup.retailers.length} retailers</Badge>
                            <Badge variant="secondary" className="text-xs">{beatGroup.allOrders.length} orders</Badge>
                          </div>
                          <span className="text-sm font-medium">₹{beatGroup.allOrders.reduce((s, o) => s + o.total_amount, 0).toLocaleString()}</span>
                        </div>
                      </CollapsibleTrigger>
                    </CardContent>
                  </Card>

                  <CollapsibleContent className="space-y-2 mt-2 ml-4">
                    {beatGroup.retailers.map(retailer => (
                      <Collapsible
                        key={retailer.retailer_id}
                        open={expandedRetailers.has(retailer.retailer_id) || beatGroup.retailers.length <= 3}
                        onOpenChange={() => setExpandedRetailers(prev => {
                          const next = new Set(prev);
                          next.has(retailer.retailer_id) ? next.delete(retailer.retailer_id) : next.add(retailer.retailer_id);
                          return next;
                        })}
                      >
                        {/* Retailer Header */}
                        <Card className="cursor-pointer hover:bg-accent/30 transition-colors">
                          <CardContent className="p-2.5 flex items-center gap-2">
                            <Checkbox
                              checked={isRetailerSelected(retailer.orders)}
                              // @ts-ignore
                              indeterminate={isRetailerIndeterminate(retailer.orders)}
                              onCheckedChange={() => toggleRetailer(retailer.orders)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <CollapsibleTrigger asChild>
                              <div className="flex-1 flex items-center justify-between cursor-pointer">
                                <div className="flex items-center gap-2">
                                  {expandedRetailers.has(retailer.retailer_id) || beatGroup.retailers.length <= 3
                                    ? <ChevronDown className="h-3.5 w-3.5" />
                                    : <ChevronRight className="h-3.5 w-3.5" />}
                                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-sm font-medium">{retailer.retailer_name}</span>
                                  <Badge variant="outline" className="text-[10px]">{retailer.orders.length} orders</Badge>
                                </div>
                                <span className="text-xs font-medium">₹{retailer.orders.reduce((s, o) => s + o.total_amount, 0).toLocaleString()}</span>
                              </div>
                            </CollapsibleTrigger>
                          </CardContent>
                        </Card>

                        <CollapsibleContent className="space-y-1.5 mt-1.5 ml-6">
                          {retailer.orders.map(order => {
                            const sourceLabel = getSourceLabel(order);
                            return (
                              <Card
                                key={order.id}
                                className={`transition-all ${selectedOrderIds.has(order.id) ? 'ring-2 ring-primary bg-primary/5' : 'hover:shadow-sm'}`}
                              >
                                <CardContent className="p-2.5">
                                  <div className="flex items-start gap-2">
                                    <Checkbox
                                      checked={selectedOrderIds.has(order.id)}
                                      onCheckedChange={() => toggleOrder(order.id)}
                                      className="mt-0.5"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <span className="text-xs font-mono text-muted-foreground">{order.order_number || order.id.slice(0, 8)}</span>
                                          {sourceLabel && (
                                            <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                                              {getSourceIcon(order.order_source)}
                                              {sourceLabel}
                                            </Badge>
                                          )}
                                        </div>
                                        <span className="text-xs font-semibold shrink-0 ml-2">₹{order.total_amount.toLocaleString()}</span>
                                      </div>
                                      <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                                        <span>{format(new Date(order.order_date), 'dd MMM')}</span>
                                        <span>{order.items.length} items</span>
                                        <span>{order.items.reduce((q, i) => q + i.quantity, 0)} qty</span>
                                      </div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Sticky CTA (matches Primary flow) */}
      {selectedOrderIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 z-20 shadow-lg">
          <div className="flex items-center justify-between max-w-screen-xl mx-auto">
            <div>
              <p className="text-sm font-medium">
                {selectedOrderIds.size} orders selected ({selectedRetailerIds.size} retailers)
              </p>
              <p className="text-xs text-muted-foreground">
                Total: ₹{selectedTotal.toLocaleString()} • {selectedQty} qty
              </p>
            </div>
            <Button onClick={handleOpenReview} disabled={creating} className="min-w-[200px]">
              {creating ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
              ) : (
                <Package className="h-4 w-4 mr-2" />
              )}
              Review & Approve ({selectedOrderIds.size})
            </Button>
          </div>
        </div>
      )}

      {/* Review Dialog */}
      <OrderReviewApprovalDialog
        open={showReviewDialog}
        onOpenChange={setShowReviewDialog}
        orders={selectedOrders}
        orderType="secondary"
        distributorId={resolvedDistributorId}
        onConfirm={handleApprovalConfirmed}
        confirming={creating}
      />
    </div>
  );
}

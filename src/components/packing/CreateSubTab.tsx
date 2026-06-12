import { useState, useEffect, useMemo } from 'react';
import { format, addDays } from 'date-fns';
import {
  Package, Search, MapPin, Calendar, ChevronDown, ChevronRight, ShoppingCart, Globe, Store
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePackingList, OrderForPacking } from '@/hooks/usePackingList';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import OrderReviewApprovalDialog, { ApprovedItemMap, ManualBatchEntry } from './OrderReviewApprovalDialog';
import SecondaryCreatePanel from './SecondaryCreatePanel';

interface Props {
  orderType: 'primary' | 'secondary';
  onPackingListCreated?: () => void;
  distributorId?: string;
}

interface Beat {
  id: string;
  beat_name: string;
}

export default function CreateSubTab({ orderType, onPackingListCreated, distributorId: propDistributorId }: Props) {
  const { toast } = useToast();
  const { loading, fetchOrdersForPacking, fetchPrimaryOrdersForPacking, createPackingList } = usePackingList();

  const [orders, setOrders] = useState<OrderForPacking[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [beatFilter, setBeatFilter] = useState('all');
  const [beats, setBeats] = useState<Beat[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [deliveryDate, setDeliveryDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [creating, setCreating] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [resolvedDistributorId, setResolvedDistributorId] = useState<string | null>(propDistributorId ?? null);

  // Primary-specific filters
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Load beats
  useEffect(() => {
    const loadBeats = async () => {
      const { data } = await supabase.from('beats').select('id, beat_name').eq('is_active', true);
      if (data) setBeats(data);
    };
    loadBeats();
  }, []);

  // Load orders
  useEffect(() => {
    loadOrders();
  }, [orderType, propDistributorId]);

  const loadOrders = async () => {
    if (orderType === 'primary') {
      let distId = propDistributorId ?? null;

      if (!distId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setResolvedDistributorId(null);
          setOrders([]);
          return;
        }

        const { data: dists } = await supabase.from('distributors').select('id').limit(1);
        if (dists && dists.length > 0) {
          distId = dists[0].id;
        }
      }

      setResolvedDistributorId(distId);

      if (!distId) {
        setOrders([]);
        return;
      }

      const result = await fetchPrimaryOrdersForPacking(distId);
      setOrders(result);
      return;
    }

    const distId = propDistributorId ?? null;
    setResolvedDistributorId(distId);
    const result = await fetchOrdersForPacking({ distributorId: distId || undefined });
    setOrders(result);
  };

  // Unique territories from orders (for primary filter)
  const territories = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach(o => {
      if (o.territory_id && o.territory_name) map.set(o.territory_id, o.territory_name);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [orders]);

  // Unique statuses from orders (for primary filter)
  const statuses = useMemo(() => {
    const set = new Set<string>();
    orders.forEach(o => { if (o.order_status) set.add(o.order_status); });
    return Array.from(set);
  }, [orders]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    let filtered = orders;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(o =>
        o.retailer_name?.toLowerCase().includes(q) ||
        o.source_distributor_name?.toLowerCase().includes(q) ||
        o.order_number?.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q)
      );
    }
    if (beatFilter !== 'all') {
      filtered = filtered.filter(o => o.beat_id === beatFilter);
    }
    if (orderType === 'primary') {
      if (territoryFilter !== 'all') {
        filtered = filtered.filter(o => o.territory_id === territoryFilter);
      }
      if (statusFilter !== 'all') {
        filtered = filtered.filter(o => o.order_status === statusFilter);
      }
    }
    return filtered;
  }, [orders, searchQuery, beatFilter, territoryFilter, statusFilter, orderType]);

  // Group orders by beat (secondary only)
  const groupedByBeat = useMemo(() => {
    const groups: Record<string, OrderForPacking[]> = {};
    filteredOrders.forEach(o => {
      const key = o.beat_name || 'No Beat';
      if (!groups[key]) groups[key] = [];
      groups[key].push(o);
    });
    return groups;
  }, [filteredOrders]);

  const toggleOrder = (orderId: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.size === filteredOrders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filteredOrders.map(o => o.id)));
    }
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const handleOpenReview = () => {
    if (selectedOrderIds.size === 0) {
      toast({ title: 'No orders selected', description: 'Select orders to create a packing list', variant: 'destructive' });
      return;
    }
    if (orderType === 'primary' && !resolvedDistributorId) {
      toast({ title: 'Distributor not resolved', description: 'Unable to resolve the distributor for this primary packing list', variant: 'destructive' });
      return;
    }
    setShowReviewDialog(true);
  };

  const handleApprovalConfirmed = async (approvedItems: ApprovedItemMap, warehouseId?: string | null, strategy?: string, manualAllocations?: Record<string, ManualBatchEntry[]>) => {
    if (orderType === 'primary' && !resolvedDistributorId) {
      toast({ title: 'Distributor not resolved', description: 'Unable to create a primary packing list without a distributor context', variant: 'destructive' });
      return;
    }

    setCreating(true);
    setShowReviewDialog(false);
    try {
      const selectedOrders = orders.filter(o => selectedOrderIds.has(o.id));
      const orderIds = Array.from(selectedOrderIds);
      const result = await createPackingList(deliveryDate, resolvedDistributorId, orderIds, selectedOrders, orderType, approvedItems, warehouseId, strategy, manualAllocations);
      if (result) {
        setSelectedOrderIds(new Set());
        await loadOrders();
        onPackingListCreated?.();
      }
    } finally {
      setCreating(false);
    }
  };

  // Legacy direct create (fallback, kept for backward compatibility)
  const handleCreatePackingList = async () => {
    if (selectedOrderIds.size === 0) {
      toast({ title: 'No orders selected', description: 'Select orders to create a packing list', variant: 'destructive' });
      return;
    }
    if (orderType === 'primary' && !resolvedDistributorId) {
      toast({ title: 'Distributor not resolved', description: 'Unable to create a primary packing list without a distributor context', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const selectedOrders = orders.filter(o => selectedOrderIds.has(o.id));
      const orderIds = Array.from(selectedOrderIds);
      const result = await createPackingList(deliveryDate, resolvedDistributorId, orderIds, selectedOrders, orderType);
      if (result) {
        setSelectedOrderIds(new Set());
        await loadOrders();
        onPackingListCreated?.();
      }
    } finally {
      setCreating(false);
    }
  };

  const selectedTotal = orders
    .filter(o => selectedOrderIds.has(o.id))
    .reduce((sum, o) => sum + o.total_amount, 0);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'confirmed': return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">Confirmed</Badge>;
      case 'submitted': return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs">Submitted</Badge>;
      case 'processing': return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs">Processing</Badge>;
      default: return <Badge variant="outline" className="text-xs">{status || 'Unknown'}</Badge>;
    }
  };

  // ========== PRIMARY (B2D) TABLE LAYOUT ==========
  if (orderType === 'primary') {
    return (
      <div className="relative pb-24">
        {/* Summary Bar */}
        {filteredOrders.length > 0 && (
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{filteredOrders.length}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">Total Orders</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">₹{filteredOrders.reduce((s, o) => s + o.total_amount, 0).toLocaleString()}</p>
                <p className="text-xs text-green-600 dark:text-green-400">Total Value</p>
              </CardContent>
            </Card>
            <Card className="bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{filteredOrders.reduce((s, o) => s + (o.total_qty || 0), 0)}</p>
                <p className="text-xs text-purple-600 dark:text-purple-400">Total Qty</p>
              </CardContent>
            </Card>
            <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{selectedOrderIds.size}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400">Selected</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <div className="px-4 pb-3 flex flex-wrap gap-3">
          <div className="flex-1 min-w-[180px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by Order ID / Distributor..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          {territories.length > 0 && (
            <Select value={territoryFilter} onValueChange={setTerritoryFilter}>
              <SelectTrigger className="w-40">
                <MapPin className="h-4 w-4 mr-1" />
                <SelectValue placeholder="Territory" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Territories</SelectItem>
                {territories.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {statuses.length > 1 && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {statuses.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="w-40" />
          </div>
        </div>

        {/* Table */}
        <div className="px-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-40" />
                <p className="text-muted-foreground font-medium">No pending orders available for packing</p>
                <p className="text-xs text-muted-foreground mt-1">No confirmed B2D orders awaiting fulfillment</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedOrderIds.size === filteredOrders.length && filteredOrders.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="text-xs font-semibold">Order ID</TableHead>
                      <TableHead className="text-xs font-semibold">Distributor (Party)</TableHead>
                      <TableHead className="text-xs font-semibold">Territory</TableHead>
                      <TableHead className="text-xs font-semibold">Order Date</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Total Qty</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Order Value (₹)</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map(order => (
                      <TableRow
                        key={order.id}
                        className={`cursor-pointer transition-colors ${selectedOrderIds.has(order.id) ? 'bg-primary/5' : ''}`}
                        onClick={() => toggleOrder(order.id)}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedOrderIds.has(order.id)}
                            onCheckedChange={() => toggleOrder(order.id)}
                            onClick={e => e.stopPropagation()}
                          />
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {order.order_number || order.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="text-sm font-medium max-w-[200px] truncate">
                          {order.source_distributor_name || order.retailer_name}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {order.territory_name || '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {format(new Date(order.order_date), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell className="text-xs text-right font-medium">
                          {order.total_qty || order.items.reduce((s, i) => s + i.quantity, 0)}
                        </TableCell>
                        <TableCell className="text-sm text-right font-semibold">
                          ₹{order.total_amount.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(order.order_status)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </div>

        {/* Sticky CTA */}
        {selectedOrderIds.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 z-20 shadow-lg">
            <div className="flex items-center justify-between max-w-screen-xl mx-auto">
              <div>
                <p className="text-sm font-medium">{selectedOrderIds.size} orders selected</p>
                <p className="text-xs text-muted-foreground">Total: ₹{selectedTotal.toLocaleString()}</p>
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

        <OrderReviewApprovalDialog
          open={showReviewDialog}
          onOpenChange={setShowReviewDialog}
          orders={orders.filter(o => selectedOrderIds.has(o.id))}
          orderType={orderType}
          distributorId={resolvedDistributorId}
          onConfirm={handleApprovalConfirmed}
          confirming={creating}
        />
      </div>
    );
  }

  // ========== SECONDARY (B2R) – New redesigned panel ==========
  return (
    <SecondaryCreatePanel
      distributorId={propDistributorId}
      onPackingListCreated={onPackingListCreated}
    />
  );
}

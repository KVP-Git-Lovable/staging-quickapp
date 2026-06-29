import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { resolveProduct } from '@/utils/resolveProduct';

/**
 * Per-line product label resolution. Orders here are read-only snapshots, but we
 * route the displayed name through the shared resolver so when an item carries
 * variant metadata, the resolved display_name is shown — keeping parity with
 * order entry / customer portal / invoice.
 */
const resolveItemName = (item: any): string => {
  // Snapshot already carries product_name/variant_name; treat the snapshot row as
  // the base and (if present) its variant_* fields as the variant override.
  const base = { id: item.product_id, name: item.product_name };
  const variant = item.variant_id
    ? { id: item.variant_id, variant_name: item.variant_name, sku: item.variant_sku }
    : null;
  return resolveProduct(base, variant).display_name || item.product_name;
};
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, 
  Search, 
  Package, 
  MapPin, 
  Phone,
  Store,
  Calendar,
  IndianRupee,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Building2,
  LogOut,
  ShieldCheck,
  X,
  ChevronDown,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { format, subDays, isToday, isYesterday } from 'date-fns';

interface DistributorUser {
  id: string;
  full_name: string;
  role: string;
  distributor_id: string;
  distributors?: { name: string };
  is_impersonated?: boolean;
}

interface SecondaryOrder {
  id: string;
  retailer_id: string;
  retailer_name: string;
  order_date: string | null;
  created_at: string;
  total_amount: number;
  status: string;
  credit_paid_amount?: number;
  retailer?: {
    address: string;
    phone: string;
    beat_name: string;
    beat_id: string;
  };
  items?: OrderItem[];
}

interface OrderItem {
  id: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  rate: number;
  unit: string;
  total: number;
}

interface DateGroup {
  date: string;
  formattedDate: string;
  orders: SecondaryOrder[];
  totalValue: number;
  orderCount: number;
}

interface RetailerGroup {
  retailerId: string;
  retailerName: string;
  orders: SecondaryOrder[];
  totalValue: number;
  products: { productName: string; quantity: number; unit: string; total: number }[];
}

interface ProductGroup {
  productName: string;
  unit: string;
  totalQuantity: number;
  totalValue: number;
  retailers: { retailerName: string; quantity: number; total: number }[];
}

const SecondarySales = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<DistributorUser | null>(null);
  const [orders, setOrders] = useState<SecondaryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBeat, setSelectedBeat] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [beats, setBeats] = useState<{ id: string; name: string }[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<SecondaryOrder | null>(null);
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<string>('');
  const [amountCollected, setAmountCollected] = useState<string>('');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [updating, setUpdating] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    const storedUser = localStorage.getItem('distributor_user');
    if (!storedUser) {
      navigate('/distributor-portal/login');
      return;
    }
    const userData = JSON.parse(storedUser);
    setUser(userData);
    loadOrders(userData.distributor_id);
  }, [navigate]);

  const loadOrders = async (distributorId: string) => {
    try {
      setLoading(true);
      
      // Get distributor name for matching
      const { data: distData } = await supabase
        .from('distributors')
        .select('id, name')
        .eq('id', distributorId)
        .single();
      
      const distributorName = distData?.name || '';
      
      // Get retailer IDs from multiple sources (same logic as DistributorSecondaryOrders)
      const retailerIdSet = new Set<string>();
      const retailerMap = new Map<string, any>();
      
      // From distributor_retailer_mappings
      const { data: mappedRetailers } = await supabase
        .from('distributor_retailer_mappings')
        .select('retailer_id')
        .eq('distributor_id', distributorId);
      
      mappedRetailers?.forEach(r => retailerIdSet.add(r.retailer_id));
      
      // From retailers table (direct link or parent_name match)
      const { data: linkedRetailers } = await supabase
        .from('retailers')
        .select('id, name, address, phone, beat_name, beat_id')
        .or(`distributor_id.eq.${distributorId}${distributorName ? `,parent_name.ilike.${distributorName}` : ''}`);
      
      linkedRetailers?.forEach(r => {
        retailerIdSet.add(r.id);
        retailerMap.set(r.id, r);
      });
      
      const retailerIds = Array.from(retailerIdSet);
      
      if (retailerIds.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      // Fetch retailer details for IDs from mappings that weren't in linkedRetailers
      const missingIds = retailerIds.filter(id => !retailerMap.has(id));
      if (missingIds.length > 0) {
        const { data: missingRetailers } = await supabase
          .from('retailers')
          .select('id, name, address, phone, beat_name, beat_id')
          .in('id', missingIds);
        missingRetailers?.forEach(r => retailerMap.set(r.id, r));
      }

      // Get unique beats
      const allRetailers = Array.from(retailerMap.values());
      const uniqueBeats = [...new Set(allRetailers.filter(r => r.beat_name).map(r => ({ 
        id: r.beat_id || r.beat_name, 
        name: r.beat_name 
      })))];
      setBeats(uniqueBeats.filter((b, i, arr) => arr.findIndex(x => x.name === b.name) === i));

      // Get orders - both directly linked to distributor AND from linked retailers
      let allOrders: any[] = [];
      
      // Orders directly linked to this distributor
      const { data: directOrders } = await supabase
        .from('orders')
        .select('*')
        .eq('distributor_id', distributorId)
        .order('created_at', { ascending: false })
        .limit(500);
      
      if (directOrders) allOrders = [...directOrders];

      // Also get orders from linked retailers (regardless of distributor_id on order)
      if (retailerIds.length > 0) {
        const { data: retailerOrders, error } = await supabase
          .from('orders')
          .select('*')
          .in('retailer_id', retailerIds)
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) throw error;
        if (retailerOrders) {
          const existingIds = new Set(allOrders.map(o => o.id));
          retailerOrders.forEach(o => {
            if (!existingIds.has(o.id)) {
              allOrders.push(o);
            }
          });
        }
      }

      // Fetch order items for all orders
      if (allOrders.length > 0) {
        const orderIds = allOrders.map(o => o.id);
        const { data: itemsData } = await supabase
          .from('order_items')
          .select('*')
          .in('order_id', orderIds);

        const itemsMap = new Map<string, OrderItem[]>();
        itemsData?.forEach(item => {
          const existing = itemsMap.get(item.order_id) || [];
          existing.push(item);
          itemsMap.set(item.order_id, existing);
        });

        // Combine data
        allOrders = allOrders.map(order => ({
          ...order,
          retailer: retailerMap.get(order.retailer_id),
          items: itemsMap.get(order.id) || [],
        }));
      }
      
      // Sort by date
      allOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setOrders(allOrders);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast.error('Failed to load secondary orders');
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.retailer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.retailer?.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.items?.some(item => item.product_name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesBeat = selectedBeat === 'all' || order.retailer?.beat_name === selectedBeat;
    
    const matchesStatus = selectedStatus === 'all' || 
      (selectedStatus === 'pending' && order.status === 'confirmed') ||
      (selectedStatus === 'delivered' && order.status === 'delivered') ||
      (selectedStatus === 'partial' && order.status === 'partial_delivery') ||
      (selectedStatus === 'cancelled' && order.status === 'cancelled');
    
    const matchesDate = !dateFilter || (order.order_date || order.created_at.split('T')[0]) === dateFilter;
    
    return matchesSearch && matchesBeat && matchesStatus && matchesDate;
  });

  // Group orders by date
  const groupedByDate: DateGroup[] = (() => {
    const dateMap = new Map<string, SecondaryOrder[]>();
    
    filteredOrders.forEach(order => {
      const date = order.order_date || order.created_at.split('T')[0];
      if (!dateMap.has(date)) {
        dateMap.set(date, []);
      }
      dateMap.get(date)!.push(order);
    });

    return Array.from(dateMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, orders]) => ({
        date,
        formattedDate: formatDateLabel(date),
        orders,
        totalValue: orders.reduce((sum, o) => sum + (o.total_amount || 0), 0),
        orderCount: orders.length
      }));
  })();

  function formatDateLabel(dateStr: string): string {
    const date = new Date(dateStr);
    if (isToday(date)) return `Today, ${format(date, 'MMM d')}`;
    if (isYesterday(date)) return `Yesterday, ${format(date, 'MMM d')}`;
    return format(date, 'EEEE, MMM d, yyyy');
  }

  // Group orders by retailer for a date
  const getRetailerGroups = (orders: SecondaryOrder[]): RetailerGroup[] => {
    const retailerMap = new Map<string, RetailerGroup>();

    orders.forEach(order => {
      const key = order.retailer_id;
      if (!retailerMap.has(key)) {
        retailerMap.set(key, {
          retailerId: order.retailer_id,
          retailerName: order.retailer_name,
          orders: [],
          totalValue: 0,
          products: []
        });
      }
      const group = retailerMap.get(key)!;
      group.orders.push(order);
      group.totalValue += order.total_amount || 0;

      // Aggregate products (display label via shared resolver)
      order.items?.forEach(item => {
        const label = resolveItemName(item);
        const existingProduct = group.products.find(p => p.productName === label);
        if (existingProduct) {
          existingProduct.quantity += item.quantity;
          existingProduct.total += item.total;
        } else {
          group.products.push({
            productName: label,
            quantity: item.quantity,
            unit: item.unit,
            total: item.total
          });
        }
      });
    });

    return Array.from(retailerMap.values()).sort((a, b) => b.totalValue - a.totalValue);
  };

  // Group orders by product for a date
  const getProductGroups = (orders: SecondaryOrder[]): ProductGroup[] => {
    const productMap = new Map<string, ProductGroup>();

    orders.forEach(order => {
      order.items?.forEach(item => {
        const key = resolveItemName(item);
        if (!productMap.has(key)) {
          productMap.set(key, {
            productName: key,
            unit: item.unit,
            totalQuantity: 0,
            totalValue: 0,
            retailers: []
          });
        }
        const group = productMap.get(key)!;
        group.totalQuantity += item.quantity;
        group.totalValue += item.total;

        const existingRetailer = group.retailers.find(r => r.retailerName === order.retailer_name);
        if (existingRetailer) {
          existingRetailer.quantity += item.quantity;
          existingRetailer.total += item.total;
        } else {
          group.retailers.push({
            retailerName: order.retailer_name,
            quantity: item.quantity,
            total: item.total
          });
        }
      });
    });

    return Array.from(productMap.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
  };

  const toggleDate = (date: string) => {
    const newExpanded = new Set(expandedDates);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedDates(newExpanded);
  };

  // Helper function to convert quantity between units
  const convertQuantity = (quantity: number, fromUnit: string, toUnit: string): number => {
    const from = (fromUnit || '').toLowerCase().trim();
    const to = (toUnit || '').toLowerCase().trim();
    
    // Same unit, no conversion needed
    if (from === to) return quantity;
    
    // Convert to grams first (base unit for weight)
    let inGrams = quantity;
    
    if (from === 'kg' || from === 'kilogram' || from === 'kilograms') {
      inGrams = quantity * 1000;
    } else if (from === 'g' || from === 'gram' || from === 'grams') {
      inGrams = quantity;
    } else if (from === 'l' || from === 'liter' || from === 'liters' || from === 'litre' || from === 'litres') {
      inGrams = quantity * 1000;
    } else if (from === 'ml' || from === 'milliliter' || from === 'milliliters') {
      inGrams = quantity;
    } else {
      // pieces or unknown - no conversion
      return quantity;
    }
    
    // Now convert from grams to target unit
    if (to === 'kg' || to === 'kilogram' || to === 'kilograms') {
      return inGrams / 1000;
    } else if (to === 'g' || to === 'gram' || to === 'grams') {
      return inGrams;
    } else if (to === 'l' || to === 'liter' || to === 'liters' || to === 'litre' || to === 'litres') {
      return inGrams / 1000;
    } else if (to === 'ml' || to === 'milliliter' || to === 'milliliters') {
      return inGrams;
    }
    
    return quantity;
  };

  // Check if a ledger entry already exists for an order
  const checkLedgerExists = async (orderId: string): Promise<boolean> => {
    const { data } = await supabase
      .from('distributor_inventory_transactions')
      .select('id')
      .eq('reference_id', orderId)
      .eq('transaction_type', 'sale')
      .limit(1);
    
    return (data && data.length > 0);
  };

  const deductInventoryWithLedger = async (
    orderItems: OrderItem[], 
    orderId: string,
    orderNumber: string,
    retailerName: string,
    skipInventoryDeduction: boolean = false // For backfill - only create ledger, don't deduct again
  ): Promise<{ success: boolean; itemsProcessed: number }> => {
    const distributorId = user?.distributor_id;
    if (!distributorId || !orderItems.length) return { success: false, itemsProcessed: 0 };

    // Get current user ID for audit trail
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const currentUserId = authUser?.id || user?.id;

    let itemsProcessed = 0;

    for (const item of orderItems) {
      let inventoryItem = null;
      
      // Step 1: Find inventory - prefer product_id, fallback to name
      if (item.product_id) {
        const { data } = await supabase
          .from('distributor_inventory')
          .select('*')
          .eq('distributor_id', distributorId)
          .eq('product_id', item.product_id)
          .maybeSingle();
        inventoryItem = data;
      }
      
      // Fallback to product name matching
      if (!inventoryItem) {
        const { data } = await supabase
          .from('distributor_inventory')
          .select('*')
          .eq('distributor_id', distributorId)
          .ilike('product_name', item.product_name)
          .maybeSingle();
        inventoryItem = data;
      }

      if (!inventoryItem) {
        console.warn(`Inventory not found for ${item.product_name}`);
        continue;
      }

      // Step 2: Convert order quantity to inventory unit
      const inventoryUnit = (inventoryItem.unit || 'kg').toLowerCase();
      const orderUnit = (item.unit || 'g').toLowerCase();
      const convertedQty = convertQuantity(item.quantity, orderUnit, inventoryUnit);
      
      console.log(`Unit conversion: ${item.quantity} ${orderUnit} → ${convertedQty} ${inventoryUnit}`);

      // Step 3: Capture BEFORE state for audit
      const stockBefore = inventoryItem.quantity;
      const stockAfter = skipInventoryDeduction ? stockBefore : Math.max(0, stockBefore - convertedQty);
      const newAvailable = skipInventoryDeduction 
        ? (inventoryItem.available_quantity || 0) 
        : Math.max(0, (inventoryItem.available_quantity || 0) - convertedQty);
      const newValue = stockAfter * (inventoryItem.unit_cost || 0);

      // Step 4: Update inventory (skip if backfilling)
      if (!skipInventoryDeduction) {
        const { error: updateError } = await supabase
          .from('distributor_inventory')
          .update({
            quantity: stockAfter,
            available_quantity: newAvailable,
            total_value: newValue,
            last_issued_date: new Date().toISOString().split('T')[0],
            updated_at: new Date().toISOString(),
          })
          .eq('id', inventoryItem.id);

        if (updateError) {
          console.error('Inventory update failed:', updateError);
          throw updateError;
        }
      }

      // Step 5: Create transaction/ledger entry for audit trail
      const { error: txError } = await supabase
        .from('distributor_inventory_transactions')
        .insert({
          distributor_id: distributorId,
          product_id: inventoryItem.product_id,
          variant_id: inventoryItem.variant_id || null,
          transaction_type: 'sale',
          quantity: -convertedQty,            // Negative for stock OUT, in inventory unit
          running_balance: stockAfter,        // Stock AFTER deduction
          reference_type: 'secondary_order',
          reference_id: orderId,
          reference_number: orderNumber,
          batch_number: inventoryItem.batch_number || null,
          expiry_date: inventoryItem.expiry_date || null,
          unit: inventoryUnit,                // Use inventory unit for consistency
          unit_cost: item.rate || inventoryItem.unit_cost,
          notes: `Secondary sale to ${retailerName} | Before: ${stockBefore} ${inventoryUnit} → After: ${stockAfter} ${inventoryUnit}`,
          created_by: currentUserId,
        });

      if (txError) {
        console.error('Transaction ledger creation failed:', txError);
      } else {
        itemsProcessed++;
      }
    }

    return { success: itemsProcessed > 0, itemsProcessed };
  };

  // Sync ledger for already-delivered orders that are missing ledger entries
  const syncLedgerForOrder = async (order: SecondaryOrder) => {
    if (!order.items || order.items.length === 0) {
      toast.error('No items found for this order');
      return;
    }

    const ledgerExists = await checkLedgerExists(order.id);
    if (ledgerExists) {
      toast.info('Ledger entries already exist for this order');
      return;
    }

    try {
      setUpdating(true);
      const result = await deductInventoryWithLedger(
        order.items,
        order.id,
        order.id.substring(0, 8).toUpperCase(),
        order.retailer_name,
        true // Skip inventory deduction, only create ledger entries
      );

      if (result.success) {
        toast.success(`Ledger synced: ${result.itemsProcessed} items recorded`);
      } else {
        toast.error('No ledger entries could be created');
      }
    } catch (error) {
      console.error('Error syncing ledger:', error);
      toast.error('Failed to sync ledger');
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateDelivery = async () => {
    if (!selectedOrder || !deliveryStatus) return;

    setUpdating(true);
    try {
      const updates: any = { status: deliveryStatus };
      
      if (deliveryStatus === 'delivered' || deliveryStatus === 'partial_delivery') {
        updates.credit_paid_amount = parseFloat(amountCollected) || 0;
      }

      const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', selectedOrder.id);

      if (error) throw error;

      // Deduct inventory AND create ledger entry when delivered (not for cancelled)
      if ((deliveryStatus === 'delivered' || deliveryStatus === 'partial_delivery') && 
          selectedOrder.status === 'confirmed' && selectedOrder.items) {
        await deductInventoryWithLedger(
          selectedOrder.items,
          selectedOrder.id,
          selectedOrder.id.substring(0, 8).toUpperCase(),
          selectedOrder.retailer_name
        );
      }

      // Update local state
      setOrders(prev => prev.map(o => 
        o.id === selectedOrder.id 
          ? { ...o, status: deliveryStatus, credit_paid_amount: updates.credit_paid_amount } 
          : o
      ));

      toast.success('Delivery confirmed, inventory deducted & ledger updated');
      setShowDeliveryDialog(false);
      resetDeliveryForm();
    } catch (error) {
      console.error('Error updating delivery:', error);
      toast.error('Failed to update delivery status');
    } finally {
      setUpdating(false);
    }
  };

  const resetDeliveryForm = () => {
    setSelectedOrder(null);
    setDeliveryStatus('');
    setAmountCollected('');
    setDeliveryNotes('');
  };

  const openDeliveryDialog = (order: SecondaryOrder) => {
    setSelectedOrder(order);
    setDeliveryStatus(order.status);
    setAmountCollected(order.credit_paid_amount?.toString() || order.total_amount?.toString() || '');
    setShowDeliveryDialog(true);
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { color: string; icon: any; label: string }> = {
      confirmed: { color: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'Pending' },
      delivered: { color: 'bg-green-100 text-green-700', icon: CheckCircle2, label: 'Delivered' },
      partial_delivery: { color: 'bg-blue-100 text-blue-700', icon: Truck, label: 'Partial' },
      cancelled: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Cancelled' },
    };
    const cfg = config[status] || config.confirmed;
    const Icon = cfg.icon;
    return (
      <Badge className={`${cfg.color} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {cfg.label}
      </Badge>
    );
  };

  const handleLogout = async () => {
    const isImpersonated = user?.is_impersonated;
    if (isImpersonated) {
      localStorage.removeItem('distributor_user');
      localStorage.removeItem('distributor_id');
      sessionStorage.removeItem('admin_impersonation');
      window.close();
      return;
    }
    await supabase.auth.signOut();
    localStorage.removeItem('distributor_user');
    localStorage.removeItem('distributor_id');
    navigate('/distributor-portal/login');
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedBeat('all');
    setSelectedStatus('all');
    setDateFilter('');
  };

  const isImpersonated = user?.is_impersonated;

  // Summary stats
  const totalAmount = filteredOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const pendingCount = filteredOrders.filter(o => o.status === 'confirmed').length;
  const deliveredCount = filteredOrders.filter(o => o.status === 'delivered').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Secondary Sales</h1>
          <p className="text-muted-foreground">Orders from field sales visits</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{filteredOrders.length}</p>
            <p className="text-xs text-muted-foreground">Total Orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">₹{(totalAmount/1000).toFixed(1)}K</p>
            <p className="text-xs text-muted-foreground">Total Value</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
      </div>

        {/* Search and Filters */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Secondary Orders ({filteredOrders.length})
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-1"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="h-3 w-3" />
                  Filters
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/distributor-portal/packing-list')}
                >
                  <Package className="w-3 h-3 mr-1" />
                  Packing
                </Button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by retailer, product or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Filters */}
            {showFilters && (
              <div className="flex gap-2 mt-3 flex-wrap">
                <Select value={selectedBeat} onValueChange={setSelectedBeat}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Beat" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Beats</SelectItem>
                    {beats.map(beat => (
                      <SelectItem key={beat.id} value={beat.name}>{beat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-40"
                />
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear
                </Button>
              </div>
            )}
          </CardHeader>

          <CardContent>
            {groupedByDate.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No secondary orders found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {groupedByDate.map(dateGroup => (
                  <Collapsible 
                    key={dateGroup.date}
                    open={expandedDates.has(dateGroup.date)}
                    onOpenChange={() => toggleDate(dateGroup.date)}
                  >
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
                        <div className="flex items-center gap-3">
                          {expandedDates.has(dateGroup.date) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <p className="font-medium text-sm">{dateGroup.formattedDate}</p>
                            <p className="text-xs text-muted-foreground">
                              {dateGroup.orderCount} order{dateGroup.orderCount !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm flex items-center gap-1">
                            <IndianRupee className="h-3 w-3" />
                            {dateGroup.totalValue.toLocaleString('en-IN')}
                          </p>
                        </div>
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent className="mt-2">
                      <div className="border rounded-lg p-3">
                        <Tabs defaultValue="retailer" className="w-full">
                          <TabsList className="grid w-full grid-cols-2 mb-3">
                            <TabsTrigger value="retailer" className="gap-1 text-xs">
                              <Store className="h-3 w-3" />
                              By Retailer
                            </TabsTrigger>
                            <TabsTrigger value="product" className="gap-1 text-xs">
                              <Package className="h-3 w-3" />
                              By Product
                            </TabsTrigger>
                          </TabsList>

                          <TabsContent value="retailer" className="space-y-3 mt-0">
                            {getRetailerGroups(dateGroup.orders).map(retailer => (
                              <div key={retailer.retailerId} className="border rounded-lg p-3 bg-background">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Store className="h-4 w-4 text-primary" />
                                    <span className="font-medium text-sm">{retailer.retailerName}</span>
                                    {retailer.orders[0] && getStatusBadge(retailer.orders[0].status)}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-sm">
                                      ₹{retailer.totalValue.toLocaleString('en-IN')}
                                    </span>
                                    {retailer.orders[0]?.status === 'confirmed' && (
                                      <Button
                                        size="sm"
                                        variant="default"
                                        className="h-7 text-xs"
                                        onClick={() => openDeliveryDialog(retailer.orders[0])}
                                      >
                                        <Truck className="w-3 h-3 mr-1" />
                                        Deliver
                                      </Button>
                                    )}
                                    {(retailer.orders[0]?.status === 'delivered' || retailer.orders[0]?.status === 'partial_delivery') && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                        onClick={() => syncLedgerForOrder(retailer.orders[0])}
                                        disabled={updating}
                                      >
                                        <RefreshCw className={`w-3 h-3 mr-1 ${updating ? 'animate-spin' : ''}`} />
                                        Sync Ledger
                                      </Button>
                                    )}
                                    {retailer.orders[0]?.status !== 'confirmed' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs"
                                        onClick={() => openDeliveryDialog(retailer.orders[0])}
                                      >
                                        Update
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-1 pl-6">
                                  {retailer.products.map((product, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-xs text-muted-foreground">
                                      <span>{product.productName}</span>
                                      <span>
                                        {product.quantity} {product.unit} • ₹{product.total.toLocaleString('en-IN')}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </TabsContent>

                          <TabsContent value="product" className="space-y-3 mt-0">
                            {getProductGroups(dateGroup.orders).map((product, idx) => (
                              <div key={idx} className="border rounded-lg p-3 bg-background">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Package className="h-4 w-4 text-primary" />
                                    <span className="font-medium text-sm">{product.productName}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="font-semibold text-sm">
                                      {product.totalQuantity} {product.unit}
                                    </span>
                                    <p className="text-xs text-muted-foreground">
                                      ₹{product.totalValue.toLocaleString('en-IN')}
                                    </p>
                                  </div>
                                </div>
                                <div className="space-y-1 pl-6">
                                  {product.retailers.map((retailer, ridx) => (
                                    <div key={ridx} className="flex items-center justify-between text-xs text-muted-foreground">
                                      <span>{retailer.retailerName}</span>
                                      <span>
                                        {retailer.quantity} {product.unit} • ₹{retailer.total.toLocaleString('en-IN')}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </TabsContent>
                        </Tabs>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      {/* Delivery Status Dialog */}
      <Dialog open={showDeliveryDialog} onOpenChange={setShowDeliveryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Delivery Status</DialogTitle>
            <DialogDescription>
              {selectedOrder?.retailer_name} - ₹{selectedOrder?.total_amount?.toLocaleString('en-IN')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Delivery Status</label>
              <Select value={deliveryStatus} onValueChange={setDeliveryStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Pending</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="partial_delivery">Partial Delivery</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(deliveryStatus === 'delivered' || deliveryStatus === 'partial_delivery') && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount Collected (₹)</label>
                <Input
                  type="number"
                  value={amountCollected}
                  onChange={(e) => setAmountCollected(e.target.value)}
                  placeholder="Enter amount collected"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (Optional)</label>
              <Input
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="Any delivery notes..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeliveryDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateDelivery} disabled={!deliveryStatus || updating}>
              {updating ? 'Updating...' : 'Update Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SecondarySales;

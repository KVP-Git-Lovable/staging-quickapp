import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getDisplayValues } from '@/utils/unitDisplayUtils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Warehouse, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useWarehouses } from '@/hooks/useWarehouses';
import InventorySummaryCards from '@/components/distributor-portal/inventory/InventorySummaryCards';
import StockOverviewTable from '@/components/distributor-portal/inventory/StockOverviewTable';
import StockActionsPanel from '@/components/distributor-portal/inventory/StockActionsPanel';
import RecentTransactionsPanel from '@/components/distributor-portal/inventory/RecentTransactionsPanel';
import TransactionsLedgerPanel from '@/components/distributor-portal/inventory/TransactionsLedgerPanel';
import OpeningStockDialog from '@/components/distributor-portal/inventory/OpeningStockDialog';
import WarehouseManagement from '@/components/distributor-portal/inventory/WarehouseManagement';

interface InventoryRow {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  available_quantity: number;
  reserved_quantity: number;
  damaged_quantity: number;
  expired_quantity: number;
  updated_at: string;
  warehouse_id: string | null;
}

const DistributorInventory = () => {
  const navigate = useNavigate();
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<{ id: string; name: string; unit?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState('all');
  const [openingStockOpen, setOpeningStockOpen] = useState(false);
  const [warehouseFilter, setWarehouseFilter] = useState('all');

  const distributorId = localStorage.getItem('distributor_id');
  const { warehouses, defaultWarehouse, loading: whLoading, reload: reloadWarehouses, createWarehouse, updateWarehouse, deleteWarehouse } = useWarehouses(distributorId);
  const distributorUser = (() => {
    try { return JSON.parse(localStorage.getItem('distributor_user') || '{}'); } catch { return {}; }
  })();
  const entityType = distributorUser?.distributor_type || 'Distributor';
  const entityName = distributorUser?.distributors?.name || distributorUser?.distributor_name || 'Inventory';

  const hasWarehouses = warehouses.length > 0;

  const loadData = useCallback(async () => {
    if (!distributorId) return;
    setLoadError(null);
    try {
      // Verify auth session is still valid
      const { data: { session } } = await supabase.auth.getSession();
      const isImpersonated = distributorUser?.is_impersonated;
      
      if (!session && !isImpersonated) {
        setLoadError('Session expired. Please log in again.');
        setLoading(false);
        return;
      }

      const invResult = await supabase
        .from('distributor_inventory')
        .select('id, product_id, product_name, quantity, reserved_quantity, damaged_quantity, expired_quantity, updated_at, warehouse_id')
        .eq('distributor_id', distributorId)
        .not('product_id', 'is', null)
        .order('product_name');

      if (invResult.error) throw invResult.error;
      const rows = (invResult.data || []).map(row => ({
        ...row,
        available_quantity: (row.quantity || 0) - (row.reserved_quantity || 0) - (row.damaged_quantity || 0) - (row.expired_quantity || 0),
      }));
      setInventory(rows as InventoryRow[]);

      // Load transactions separately
      const txnResult = await supabase
        .from('distributor_inventory_transactions')
        .select('id, reference_type, transaction_type, quantity, notes, created_at, product_name, product_id, batch_number')
        .eq('distributor_id', distributorId)
        .order('created_at', { ascending: false })
        .limit(10);
      setTransactions(txnResult.data || []);

      const prodResult = await supabase
        .from('products')
        .select('id, name, unit')
        .eq('is_active', true)
        .order('name');
      const loadedProducts = (prodResult.data || []).map(p => ({ id: p.id, name: p.name, unit: p.unit || undefined }));
      setAllProducts(loadedProducts);
    } catch (error: any) {
      console.error('Error loading inventory:', error);
      setLoadError(error?.message || 'Failed to load inventory');
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [distributorId]);

  useEffect(() => {
    if (!distributorId) {
      navigate('/distributor-portal/login');
      return;
    }
    loadData();
  }, [distributorId, navigate, loadData]);

  useEffect(() => {
    if (!distributorId) return;
    const invChannel = supabase
      .channel('inv-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'distributor_inventory', filter: `distributor_id=eq.${distributorId}` }, () => loadData())
      .subscribe();
    const txnChannel = supabase
      .channel('txn-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'distributor_inventory_transactions', filter: `distributor_id=eq.${distributorId}` }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(invChannel); supabase.removeChannel(txnChannel); };
  }, [distributorId, loadData]);

  let filteredInventory = inventory;
  if (warehouseFilter !== 'all') {
    filteredInventory = filteredInventory.filter(i => i.warehouse_id === warehouseFilter);
  }
  if (productFilter !== 'all') {
    filteredInventory = filteredInventory.filter(i => i.product_id === productFilter);
  }

  const summaryData = {
    available: filteredInventory.reduce((s, i) => s + (i.available_quantity || 0), 0),
    reserved: filteredInventory.reduce((s, i) => s + (i.reserved_quantity || 0), 0),
    damaged: filteredInventory.reduce((s, i) => s + (i.damaged_quantity || 0), 0),
    expired: filteredInventory.reduce((s, i) => s + (i.expired_quantity || 0), 0),
  };

  const productUnitMap = Object.fromEntries(allProducts.map(p => [p.id, p.unit || '']));
  const products = inventory.map(i => ({ id: i.product_id, name: i.product_name, unit: productUnitMap[i.product_id] }));
  const uniqueProducts = products.filter((p, idx, arr) => arr.findIndex(x => x.id === p.id) === idx);

  // Convert summary values to display units (e.g., grams → KG)
  // Since all products may have different units, we aggregate per-product then sum display values
  const summaryDisplayData = (() => {
    let available = 0, reserved = 0, damaged = 0, expired = 0;
    const grouped = new Map<string, { avail: number; res: number; dam: number; exp: number; unit: string }>();
    filteredInventory.forEach(i => {
      const unit = productUnitMap[i.product_id] || '';
      const key = unit.toLowerCase().trim() || '__none__';
      const existing = grouped.get(key) || { avail: 0, res: 0, dam: 0, exp: 0, unit };
      existing.avail += i.available_quantity || 0;
      existing.res += i.reserved_quantity || 0;
      existing.dam += i.damaged_quantity || 0;
      existing.exp += i.expired_quantity || 0;
      grouped.set(key, existing);
    });
    grouped.forEach(g => {
      available += getDisplayValues(g.avail, 1, 1, g.unit).displayQty;
      reserved += getDisplayValues(g.res, 1, 1, g.unit).displayQty;
      damaged += getDisplayValues(g.dam, 1, 1, g.unit).displayQty;
      expired += getDisplayValues(g.exp, 1, 1, g.unit).displayQty;
    });
    return { available, reserved, damaged, expired };
  })();

  if (loading || whLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Failed to Load Inventory</h2>
        <p className="text-sm text-muted-foreground max-w-md">{loadError}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setLoading(true); loadData(); }}>
            Retry
          </Button>
          <Button variant="default" onClick={() => navigate('/distributor-portal/login')}>
            Re-Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="bg-slate-800 text-white rounded-lg px-5 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Inventory Management</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-300">Entity: <span className="text-white font-medium">{entityType}</span></span>
          {hasWarehouses && (
            <>
              <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="All Warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
                  {warehouses.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger className="w-[150px] h-8 text-xs bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="All Products" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Products</SelectItem>
                  {uniqueProducts.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => setOpeningStockOpen(true)}
                className="bg-teal-100 text-teal-800 hover:bg-teal-200 border border-teal-200 text-sm h-8"
              >
                <Plus className="w-4 h-4 mr-1" /> Add Opening Stock
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Subtitle */}
      <p className="text-sm font-medium text-foreground">
        {entityType}: <span className="font-semibold">{entityName}</span> <span className="text-muted-foreground">▾</span>
      </p>

      {/* Warehouse Management (always visible) */}
      <WarehouseManagement
        warehouses={warehouses}
        loading={whLoading}
        onCreateWarehouse={createWarehouse}
        onUpdateWarehouse={updateWarehouse}
        onDeleteWarehouse={deleteWarehouse}
        defaultOpen={!hasWarehouses}
      />

      {/* Blocking gate if no warehouses */}
      {!hasWarehouses ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
          <div className="rounded-full bg-amber-100 p-4">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">No Warehouses Found</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Please create at least one warehouse before managing inventory.
            Use the "Add Warehouse" button above to get started.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Pills */}
          <InventorySummaryCards data={summaryDisplayData} loading={loading} />

          {/* Stock Overview Table */}
          <StockOverviewTable
            inventory={filteredInventory as any}
            productFilter={productFilter}
            onProductFilterChange={setProductFilter}
            products={uniqueProducts}
            distributorId={distributorId!}
          />

          {/* Stock Actions */}
          <StockActionsPanel
            distributorId={distributorId!}
            products={uniqueProducts}
            onActionComplete={loadData}
          />

          {/* Recent Transactions */}
          <RecentTransactionsPanel
            transactions={transactions.map(txn => ({
              ...txn,
              product_name: txn.product_name || (txn.product_id ? (allProducts.find(p => p.id === txn.product_id)?.name || inventory.find(i => i.product_id === txn.product_id)?.product_name) : null),
            }))}
            loading={loading}
            
          />

          {/* Full Transactions Ledger */}
          <TransactionsLedgerPanel
            distributorId={distributorId!}
            products={uniqueProducts}
            warehouses={warehouses.map(w => ({ id: w.id, name: w.name }))}
          />

          {/* Opening Stock Dialog */}
          <OpeningStockDialog
            open={openingStockOpen}
            onOpenChange={setOpeningStockOpen}
            distributorId={distributorId!}
            products={allProducts.length > 0 ? allProducts : uniqueProducts}
            onSuccess={loadData}
          />
        </>
      )}
    </div>
  );
};

export default DistributorInventory;

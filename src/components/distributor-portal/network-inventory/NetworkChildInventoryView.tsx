// READ-ONLY: do not add mutations here
import { Badge } from '@/components/ui/badge';
import { Eye, AlertCircle } from 'lucide-react';
import { useNetworkChildInventory } from './useNetworkChildInventory';
import NetworkInventorySummary from './NetworkInventorySummary';
import NetworkInventoryFilters from './NetworkInventoryFilters';
import NetworkInventoryAlertStrip from './NetworkInventoryAlertStrip';
import NetworkInventoryTable from './NetworkInventoryTable';
import MovementSummaryPanel from './MovementSummaryPanel';

interface Props {
  childId: string;
  childName?: string;
}

const NetworkChildInventoryView = ({ childId, childName }: Props) => {
  const {
    loading, error, filters, updateFilters, warehouses,
    rows, summary, alerts, movementSummary,
  } = useNetworkChildInventory(childId);

  const handleChipClick = (key: 'lowStock' | 'notMoving' | 'expiringSoon' | 'overstock') => {
    if (key === 'lowStock') updateFilters({ status: 'low' });
    else if (key === 'notMoving') updateFilters({ movement: 'not_moving' });
    else if (key === 'expiringSoon') updateFilters({ status: 'all', movement: 'all' });
    else if (key === 'overstock') updateFilters({ status: 'overstock' });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Inventory Control Tower</h2>
          {childName && <p className="text-xs text-muted-foreground">{childName}</p>}
        </div>
        <Badge variant="outline" className="text-xs gap-1 bg-amber-50 text-amber-800 border-amber-200">
          <Eye className="h-3 w-3" /> View Only (Child Distributor Inventory)
        </Badge>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Summary pills */}
      <NetworkInventorySummary data={summary} loading={loading} />

      {/* Alerts */}
      <NetworkInventoryAlertStrip alerts={alerts} onChipClick={handleChipClick} />

      {/* Filters */}
      <NetworkInventoryFilters
        warehouses={warehouses}
        warehouseId={filters.warehouseId}
        productSearch={filters.productSearch}
        status={filters.status}
        movement={filters.movement}
        windowDays={filters.windowDays}
        onChange={updateFilters}
      />

      {/* Table + Movement panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        <NetworkInventoryTable rows={rows} childId={childId} loading={loading} />
        <MovementSummaryPanel data={movementSummary} />
      </div>
    </div>
  );
};

export default NetworkChildInventoryView;

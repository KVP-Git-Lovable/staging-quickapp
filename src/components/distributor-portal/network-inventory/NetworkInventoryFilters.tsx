import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';
import type { StockStatus } from './useNetworkChildInventory';

interface Props {
  warehouses: Array<{ id: string; name: string }>;
  warehouseId: string;
  productSearch: string;
  status: StockStatus | 'all';
  movement: 'all' | 'active' | 'not_moving';
  windowDays: number;
  onChange: (patch: any) => void;
}

const NetworkInventoryFilters = ({ warehouses, warehouseId, productSearch, status, movement, windowDays, onChange }: Props) => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={productSearch}
          onChange={(e) => onChange({ productSearch: e.target.value })}
          placeholder="Search product..."
          className="pl-8 h-9"
        />
      </div>

      <Select value={warehouseId} onValueChange={(v) => onChange({ warehouseId: v })}>
        <SelectTrigger className="w-[180px] h-9">
          <SelectValue placeholder="Warehouse" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Warehouses</SelectItem>
          {warehouses.map((w) => (
            <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={status} onValueChange={(v) => onChange({ status: v })}>
        <SelectTrigger className="w-[150px] h-9">
          <SelectValue placeholder="Stock Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="critical">Critical</SelectItem>
          <SelectItem value="low">Low</SelectItem>
          <SelectItem value="healthy">Healthy</SelectItem>
          <SelectItem value="overstock">Overstock</SelectItem>
        </SelectContent>
      </Select>

      <Select value={movement} onValueChange={(v) => onChange({ movement: v })}>
        <SelectTrigger className="w-[140px] h-9">
          <SelectValue placeholder="Movement" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Movement</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="not_moving">Not Moving</SelectItem>
        </SelectContent>
      </Select>

      <Select value={String(windowDays)} onValueChange={(v) => onChange({ windowDays: Number(v) })}>
        <SelectTrigger className="w-[140px] h-9">
          <SelectValue placeholder="Window" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7">Last 7 days</SelectItem>
          <SelectItem value="14">Last 14 days</SelectItem>
          <SelectItem value="30">Last 30 days</SelectItem>
          <SelectItem value="60">Last 60 days</SelectItem>
          <SelectItem value="90">Last 90 days</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export default NetworkInventoryFilters;

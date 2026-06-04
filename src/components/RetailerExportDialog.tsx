import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Download, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { downloadCSV, downloadExcel } from "@/utils/fileDownloader";
import * as XLSX from "xlsx";

export type ExportableRetailer = {
  id: string;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  category?: string | null;
  status?: string | null;
  beat_id?: string | null;
  beat_name?: string | null;
  retail_type?: string | null;
  entity_type?: string | null;
  contact_name?: string | null;
  contact_title?: string | null;
  created_at?: string | null;
  gst_number?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  last_order_date?: string | null;
  last_order_value?: number | null;
  last_visit_date?: string | null;
  pending_amount?: number | null;
  owner_name?: string | null;
  order_value?: number | null;
  avg_monthly_orders_3m?: number | null;
  total_visits_3m?: number | null;
  productive_visits_3m?: number | null;
  state?: string | null;
  priority?: string | null;
  potential?: string | null;
  verified?: boolean | null;
  parent_name?: string | null;
  notes?: string | null;
};

interface ColumnDef {
  key: string;
  label: string;
  getter: (r: ExportableRetailer, extra: ExtraData) => string | number | null | undefined;
}

interface ExtraData {
  totalOrders: Map<string, number>;
  totalSales: Map<string, number>;
}

const DEFAULT_KEYS = [
  "name", "code", "beat_name", "retail_type", "contact_name",
  "phone", "address", "status", "created_at",
];

const COLUMN_DEFS: ColumnDef[] = [
  // Defaults
  { key: "name", label: "Retailer Name", getter: (r) => r.name ?? "" },
  { key: "code", label: "Retailer Code", getter: (r) => r.id?.slice(0, 8).toUpperCase() ?? "" },
  { key: "beat_name", label: "Beat Name", getter: (r) => r.beat_name || (r.beat_id === "unassigned" ? "Unassigned" : r.beat_id) || "" },
  { key: "retail_type", label: "Retailer Type", getter: (r) => r.retail_type || r.entity_type || r.category || "" },
  { key: "contact_name", label: "Contact Person", getter: (r) => r.contact_name || "" },
  { key: "phone", label: "Mobile Number", getter: (r) => r.phone || "" },
  { key: "address", label: "Address", getter: (r) => r.address || "" },
  { key: "status", label: "Status", getter: (r) => r.status || "" },
  { key: "created_at", label: "Created Date", getter: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : "" },
  // Optional
  { key: "order_value", label: "Retailer Revenue", getter: (r) => r.order_value ?? 0 },
  { key: "total_orders", label: "Total Orders", getter: (r, e) => e.totalOrders.get(r.id) ?? 0 },
  { key: "total_sales", label: "Total Sales Value", getter: (r, e) => e.totalSales.get(r.id) ?? 0 },
  { key: "last_order_date", label: "Last Order Date", getter: (r) => r.last_order_date ? new Date(r.last_order_date).toLocaleDateString() : "" },
  { key: "last_order_value", label: "Last Order Value", getter: (r) => r.last_order_value ?? 0 },
  { key: "last_visit_date", label: "Last Visit Date", getter: (r) => r.last_visit_date ? new Date(r.last_visit_date).toLocaleDateString() : "" },
  { key: "pending_amount", label: "Outstanding Amount", getter: (r) => r.pending_amount ?? 0 },
  { key: "gst_number", label: "GST Number", getter: (r) => r.gst_number || "" },
  { key: "latitude", label: "Latitude", getter: (r) => r.latitude ?? "" },
  { key: "longitude", label: "Longitude", getter: (r) => r.longitude ?? "" },
  { key: "owner_name", label: "Assigned Salesperson", getter: (r) => r.owner_name || "" },
  { key: "category", label: "Category", getter: (r) => r.category || "" },
  { key: "priority", label: "Priority", getter: (r) => r.priority || "" },
  { key: "potential", label: "Potential", getter: (r) => r.potential || "" },
  { key: "state", label: "State", getter: (r) => r.state || "" },
  { key: "parent_name", label: "Parent Name", getter: (r) => r.parent_name || "" },
  { key: "contact_title", label: "Contact Title", getter: (r) => r.contact_title || "" },
  { key: "verified", label: "Verified", getter: (r) => (r.verified ? "Yes" : "No") },
  { key: "avg_monthly_orders_3m", label: "Avg Monthly Orders (3M)", getter: (r) => r.avg_monthly_orders_3m ?? 0 },
  { key: "total_visits_3m", label: "Total Visits (3M)", getter: (r) => r.total_visits_3m ?? 0 },
  { key: "productive_visits_3m", label: "Productive Visits (3M)", getter: (r) => r.productive_visits_3m ?? 0 },
  { key: "notes", label: "Notes", getter: (r) => r.notes || "" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  retailers: ExportableRetailer[];
  filteredCount: number;
}

export const RetailerExportDialog = ({ open, onOpenChange, retailers, filteredCount }: Props) => {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(DEFAULT_KEYS));
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [exporting, setExporting] = useState(false);

  const { defaults, optional } = useMemo(() => {
    return {
      defaults: COLUMN_DEFS.filter((c) => DEFAULT_KEYS.includes(c.key)),
      optional: COLUMN_DEFS.filter((c) => !DEFAULT_KEYS.includes(c.key)),
    };
  }, []);

  const toggle = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resetDefaults = () => setSelectedKeys(new Set(DEFAULT_KEYS));
  const selectAll = () => setSelectedKeys(new Set(COLUMN_DEFS.map((c) => c.key)));
  const clearAll = () => setSelectedKeys(new Set());

  const fetchOrderAggregates = async (retailerIds: string[]): Promise<ExtraData> => {
    const totalOrders = new Map<string, number>();
    const totalSales = new Map<string, number>();
    // Batch in chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < retailerIds.length; i += chunkSize) {
      const chunk = retailerIds.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from("orders")
        .select("retailer_id, total_amount, status")
        .in("retailer_id", chunk);
      if (error) throw error;
      (data || []).forEach((o: any) => {
        if (o.status === "cancelled") return;
        totalOrders.set(o.retailer_id, (totalOrders.get(o.retailer_id) || 0) + 1);
        totalSales.set(o.retailer_id, (totalSales.get(o.retailer_id) || 0) + Number(o.total_amount || 0));
      });
    }
    return { totalOrders, totalSales };
  };

  const handleExport = async () => {
    if (selectedKeys.size === 0) {
      toast({ title: "Select at least one column", variant: "destructive" });
      return;
    }
    if (retailers.length === 0) {
      toast({ title: "No retailers to export", variant: "destructive" });
      return;
    }
    setExporting(true);
    try {
      const needsOrders = selectedKeys.has("total_orders") || selectedKeys.has("total_sales");
      const extra: ExtraData = needsOrders
        ? await fetchOrderAggregates(retailers.map((r) => r.id))
        : { totalOrders: new Map(), totalSales: new Map() };

      const cols = COLUMN_DEFS.filter((c) => selectedKeys.has(c.key));
      const headers = cols.map((c) => c.label);
      const rows = retailers.map((r) => cols.map((c) => c.getter(r, extra)));

      const filename = `retailers_export_${new Date().toISOString().slice(0, 10)}`;

      if (format === "xlsx") {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(wb, ws, "Retailers");
        await downloadExcel(wb, filename, XLSX);
      } else {
        const escape = (v: any) => {
          const s = v == null ? "" : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
        await downloadCSV(csv, filename);
      }

      toast({ title: "Export complete", description: `${retailers.length} retailers exported.` });
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast({ title: "Export failed", description: e.message || "Unknown error", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Retailers</DialogTitle>
          <DialogDescription>
            Exporting {filteredCount.toLocaleString()} retailer{filteredCount === 1 ? "" : "s"} (current filters applied).
            Select columns to include.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button type="button" size="sm" variant="outline" onClick={resetDefaults}>Reset to defaults</Button>
          <Button type="button" size="sm" variant="outline" onClick={selectAll}>Select all</Button>
          <Button type="button" size="sm" variant="outline" onClick={clearAll}>Clear all</Button>
          <span className="ml-auto text-muted-foreground">{selectedKeys.size} selected</span>
        </div>

        <ScrollArea className="h-[360px] pr-3">
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold mb-2">Default columns</div>
              <div className="grid grid-cols-2 gap-2">
                {defaults.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={selectedKeys.has(c.key)} onCheckedChange={() => toggle(c.key)} />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <Separator />
            <div>
              <div className="text-sm font-semibold mb-2">Optional columns</div>
              <div className="grid grid-cols-2 gap-2">
                {optional.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={selectedKeys.has(c.key)} onCheckedChange={() => toggle(c.key)} />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Format:</span>
          <Button type="button" size="sm" variant={format === "xlsx" ? "default" : "outline"} onClick={() => setFormat("xlsx")}>Excel (.xlsx)</Button>
          <Button type="button" size="sm" variant={format === "csv" ? "default" : "outline"} onClick={() => setFormat("csv")}>CSV</Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>Cancel</Button>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RetailerExportDialog;

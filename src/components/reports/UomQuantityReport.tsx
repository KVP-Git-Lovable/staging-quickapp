import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronDown, ChevronRight, Download, Loader2, Scale } from 'lucide-react';
import { formatBaseQty, type UomCategoryGuess } from '@/lib/uomQuantity';
import { toast } from 'sonner';

type SummaryRow = {
  product_id: string;
  product_name: string;
  base_uom_code: string | null;
  category: string | null;
  total_base_qty: number;
  total_kg: number | null;
  total_litre: number | null;
  total_pieces: number | null;
  line_count: number;
};

type DetailRow = {
  uom_code: string;
  uom_name: string | null;
  total_qty: number;
  total_base_qty: number;
  line_count: number;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function categoryBadge(category?: string | null) {
  const c = (category || 'Unknown') as UomCategoryGuess;
  const cls =
    c === 'Weight'
      ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
      : c === 'Volume'
        ? 'bg-blue-100 text-blue-800 hover:bg-blue-100'
        : c === 'Quantity'
          ? 'bg-green-100 text-green-800 hover:bg-green-100'
          : 'bg-muted text-muted-foreground';
  return <Badge className={cls} variant="secondary">{c}</Badge>;
}

export default function UomQuantityReport() {
  const { user } = useAuth();
  const [dateFrom, setDateFrom] = useState<string>(daysAgoISO(30));
  const [dateTo, setDateTo] = useState<string>(todayISO());
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, DetailRow[] | 'loading'>>({});

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('get_sales_quantity_summary', {
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_distributor_id: null,
        p_user_id: null,
      });
      if (error) throw error;
      setRows((data || []) as SummaryRow[]);
      setExpanded({});
    } catch (e: any) {
      console.error('[UomQuantityReport] load failed', e);
      toast.error('Failed to load quantity report', { description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const toggle = async (productId: string) => {
    if (expanded[productId] && expanded[productId] !== 'loading') {
      const { [productId]: _drop, ...rest } = expanded;
      setExpanded(rest);
      return;
    }
    setExpanded((prev) => ({ ...prev, [productId]: 'loading' }));
    try {
      const { data, error } = await (supabase as any).rpc('get_sales_quantity_report', {
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_distributor_id: null,
        p_user_id: null,
        p_product_id: productId,
      });
      if (error) throw error;
      setExpanded((prev) => ({ ...prev, [productId]: (data || []) as DetailRow[] }));
    } catch (e: any) {
      console.error('[UomQuantityReport] detail failed', e);
      toast.error('Failed to load breakdown', { description: e?.message });
      setExpanded((prev) => {
        const { [productId]: _drop, ...rest } = prev;
        return rest;
      });
    }
  };

  const exportCSV = () => {
    const header = ['Product', 'Category', 'Base UOM', 'Total Base Qty', 'KG', 'Litre', 'Pieces', 'Lines'];
    const lines = rows.map((r) =>
      [
        JSON.stringify(r.product_name || ''),
        r.category || '',
        r.base_uom_code || '',
        r.total_base_qty ?? 0,
        r.total_kg ?? '',
        r.total_litre ?? '',
        r.total_pieces ?? '',
        r.line_count ?? 0,
      ].join(','),
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uom-quantity-${dateFrom}_to_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totals = useMemo(() => {
    let kg = 0,
      l = 0,
      pcs = 0,
      lines = 0;
    for (const r of rows) {
      kg += Number(r.total_kg || 0);
      l += Number(r.total_litre || 0);
      pcs += Number(r.total_pieces || 0);
      lines += Number(r.line_count || 0);
    }
    return { kg, l, pcs, lines };
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            UOM Quantity Report
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[150px]"
            />
            <span className="text-muted-foreground text-sm">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[150px]"
            />
            <Button onClick={load} disabled={loading} size="sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!rows.length}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-4">
          <span>Products: <b>{rows.length}</b></span>
          <span>Lines: <b>{totals.lines.toLocaleString()}</b></span>
          <span>Total KG: <b>{totals.kg.toFixed(2)}</b></span>
          <span>Total L: <b>{totals.l.toFixed(2)}</b></span>
          <span>Total Pcs: <b>{totals.pcs.toLocaleString()}</b></span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Base Qty</TableHead>
                <TableHead className="text-right">KG</TableHead>
                <TableHead className="text-right">Litre</TableHead>
                <TableHead className="text-right">Pieces</TableHead>
                <TableHead className="text-right">Lines</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin inline" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No sales found for this range.
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                rows.map((r) => {
                  const isOpen = !!expanded[r.product_id];
                  const detail = expanded[r.product_id];
                  const fmt = formatBaseQty(
                    Number(r.total_base_qty || 0),
                    (r.category || 'Unknown') as UomCategoryGuess,
                  );
                  return (
                    <>
                      <TableRow
                        key={r.product_id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggle(r.product_id)}
                      >
                        <TableCell>
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{r.product_name}</TableCell>
                        <TableCell>{categoryBadge(r.category)}</TableCell>
                        <TableCell className="text-right">
                          <div>{fmt.primary}</div>
                          {fmt.secondary && (
                            <div className="text-xs text-muted-foreground">{fmt.secondary}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.total_kg != null ? Number(r.total_kg).toFixed(2) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.total_litre != null ? Number(r.total_litre).toFixed(2) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.total_pieces != null ? Number(r.total_pieces).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {r.line_count}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={`${r.product_id}-detail`}>
                          <TableCell></TableCell>
                          <TableCell colSpan={7} className="bg-muted/30">
                            {detail === 'loading' ? (
                              <div className="py-3 text-center text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                                Loading breakdown…
                              </div>
                            ) : Array.isArray(detail) && detail.length > 0 ? (
                              <div className="py-2">
                                <div className="text-xs font-semibold text-muted-foreground mb-2">
                                  Sold across {detail.length} unit{detail.length > 1 ? 's' : ''}:
                                </div>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Unit</TableHead>
                                      <TableHead className="text-right">Quantity</TableHead>
                                      <TableHead className="text-right">Base Equivalent</TableHead>
                                      <TableHead className="text-right">Lines</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {detail.map((d, idx) => (
                                      <TableRow key={`${d.uom_code}-${idx}`}>
                                        <TableCell>
                                          <span className="font-mono text-xs">{d.uom_code}</span>{' '}
                                          <span className="text-muted-foreground text-xs">
                                            {d.uom_name || ''}
                                          </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {Number(d.total_qty).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                          {Number(d.total_base_qty).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                          {d.line_count}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            ) : (
                              <div className="py-3 text-center text-sm text-muted-foreground">
                                No breakdown available.
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

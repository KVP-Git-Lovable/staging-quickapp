import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronRight, Info, RefreshCw, Search } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EditLogRow {
  id: string;
  created_at: string;
  edited_by: string | null;
  editor_name?: string;
  reason: string | null;
  original_order_id: string;
  replacement_order_id: string | null;
  original_snapshot: any;
  replacement_snapshot: any;
  edit_summary: any;
}

const fmtMoney = (n: any) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function getItems(snap: any): any[] {
  if (!snap) return [];
  return snap.items || snap.order_items || [];
}

const ITEM_FIELDS = ['quantity', 'rate', 'discount_amount', 'discount_percent', 'scheme_id', 'scheme_name', 'line_total', 'total_amount'];

type ItemStatus = 'added' | 'removed' | 'changed' | 'unchanged';

interface MergedItem {
  product_id: string;
  product_name: string;
  before?: any;
  after?: any;
  status: ItemStatus;
  changedFields: string[];
}

function mergeItems(original: any, replacement: any): MergedItem[] {
  const origItems = getItems(original);
  const replItems = getItems(replacement);
  const origMap = new Map<string, any>();
  origItems.forEach((i: any) => i?.product_id && origMap.set(i.product_id, i));
  const replMap = new Map<string, any>();
  replItems.forEach((i: any) => i?.product_id && replMap.set(i.product_id, i));

  const allIds = new Set<string>([...origMap.keys(), ...replMap.keys()]);
  const merged: MergedItem[] = [];
  for (const pid of allIds) {
    const before = origMap.get(pid);
    const after = replMap.get(pid);
    const name = before?.product_name || before?.name || after?.product_name || after?.name || pid;
    if (before && !after) {
      merged.push({ product_id: pid, product_name: name, before, status: 'removed', changedFields: [] });
    } else if (!before && after) {
      merged.push({ product_id: pid, product_name: name, after, status: 'added', changedFields: [] });
    } else {
      const changed: string[] = [];
      for (const f of ITEM_FIELDS) {
        if (before[f] !== undefined || after[f] !== undefined) {
          if (String(before[f] ?? '') !== String(after[f] ?? '')) changed.push(f);
        }
      }
      merged.push({
        product_id: pid,
        product_name: name,
        before,
        after,
        status: changed.length ? 'changed' : 'unchanged',
        changedFields: changed,
      });
    }
  }
  return merged.sort((a, b) => a.product_name.localeCompare(b.product_name));
}

function lineTotal(it: any): number {
  if (!it) return 0;
  const lt = it.line_total ?? it.total_amount;
  if (lt !== undefined && lt !== null) return Number(lt);
  return Number(it.quantity ?? 0) * Number(it.rate ?? 0);
}

const ORDER_FIELDS = ['total_amount', 'payment_method', 'credit_paid_amount', 'credit_pending_amount', 'payment_status'];

const statusStyles: Record<ItemStatus, string> = {
  added: 'bg-emerald-50 dark:bg-emerald-950/30',
  removed: 'bg-rose-50 dark:bg-rose-950/30',
  changed: 'bg-amber-50 dark:bg-amber-950/30',
  unchanged: '',
};

const statusBadge: Record<ItemStatus, { label: string; cls: string } | null> = {
  added: { label: 'Added', cls: 'bg-emerald-600 hover:bg-emerald-600 text-white' },
  removed: { label: 'Removed', cls: 'bg-rose-600 hover:bg-rose-600 text-white' },
  changed: { label: 'Changed', cls: 'bg-amber-500 hover:bg-amber-500 text-white' },
  unchanged: null,
};

function FieldCell({ side, item, field, formatter, changedFields }: { side: 'before' | 'after'; item: any; field: string; formatter?: (v: any) => string; changedFields?: string[] }) {
  if (!item) return <span className="text-muted-foreground">—</span>;
  const val = item[field];
  const display = formatter ? formatter(val) : String(val ?? '—');
  const isChanged = changedFields?.includes(field);
  return <span className={isChanged ? (side === 'before' ? 'line-through text-rose-700 dark:text-rose-300' : 'font-semibold text-emerald-700 dark:text-emerald-300') : ''}>{display}</span>;
}

function SideTable({ side, items, headerInvoice }: { side: 'before' | 'after'; items: MergedItem[]; headerInvoice: string }) {
  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      <div className={`px-4 py-2 border-b text-xs font-semibold uppercase tracking-wide ${side === 'before' ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'}`}>
        {side === 'before' ? 'Before' : 'After'} · {headerInvoice}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[90px]">Status</TableHead>
            <TableHead>Product</TableHead>
            <TableHead className="text-right w-[70px]">Qty</TableHead>
            <TableHead className="text-right w-[90px]">Rate</TableHead>
            <TableHead className="text-right w-[110px]">Line Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No items</TableCell></TableRow>
          ) : items.map(m => {
            const it = side === 'before' ? m.before : m.after;
            const shouldShow = !!it;
            const badge = statusBadge[m.status];
            return (
              <TableRow key={m.product_id} className={statusStyles[m.status]}>
                <TableCell>
                  {shouldShow && badge ? <Badge className={`${badge.cls} text-[10px]`}>{badge.label}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                </TableCell>
                <TableCell className="font-medium">{shouldShow ? m.product_name : <span className="text-muted-foreground italic">—</span>}</TableCell>
                <TableCell className="text-right">
                  <FieldCell side={side} item={it} field="quantity" changedFields={m.changedFields} />
                </TableCell>
                <TableCell className="text-right">
                  <FieldCell side={side} item={it} field="rate" formatter={fmtMoney} changedFields={m.changedFields} />
                </TableCell>
                <TableCell className="text-right">
                  {it ? <span className={m.status === 'changed' ? (side === 'before' ? 'line-through text-rose-700 dark:text-rose-300' : 'font-semibold text-emerald-700 dark:text-emerald-300') : ''}>{fmtMoney(lineTotal(it))}</span> : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function OrderSummary({ side, order, changedFields }: { side: 'before' | 'after'; order: any; changedFields: string[] }) {
  const get = (f: string) => order?.[f];
  const cls = (f: string) => changedFields.includes(f) ? (side === 'before' ? 'line-through text-rose-700 dark:text-rose-300' : 'font-semibold text-emerald-700 dark:text-emerald-300') : 'font-medium';
  return (
    <div className={`rounded-lg border p-3 text-xs space-y-1 ${side === 'before' ? 'bg-rose-50/40 dark:bg-rose-950/20' : 'bg-emerald-50/40 dark:bg-emerald-950/20'}`}>
      <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className={cls('total_amount')}>{fmtMoney(get('total_amount'))}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Payment Method</span><span className={cls('payment_method')}>{get('payment_method') || '—'}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className={cls('credit_paid_amount')}>{fmtMoney(get('credit_paid_amount'))}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Pending</span><span className={cls('credit_pending_amount')}>{fmtMoney(get('credit_pending_amount'))}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className={cls('payment_status')}>{get('payment_status') || '—'}</span></div>
    </div>
  );
}

const EditedOrdersSection: React.FC = () => {
  const [rows, setRows] = useState<EditLogRow[]>([]);
  const [invoiceMap, setInvoiceMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');

  const getInvoiceNo = (row: EditLogRow): string => {
    return (
      (row.replacement_order_id && invoiceMap[row.replacement_order_id]) ||
      (row.original_order_id && invoiceMap[row.original_order_id]) ||
      row.replacement_snapshot?.order?.invoice_number ||
      row.original_snapshot?.order?.invoice_number ||
      row.original_order_id?.slice(0, 8) ||
      '—'
    );
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('order_edit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const logs = (data || []) as EditLogRow[];

      const userIds = Array.from(new Set(logs.map(l => l.edited_by).filter(Boolean))) as string[];
      const nameMap = new Map<string, string>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, username')
          .in('id', userIds);
        (profs || []).forEach((p: any) => nameMap.set(p.id, p.full_name || p.username || p.id));
      }

      const orderIds = Array.from(new Set(
        logs.flatMap(l => [l.replacement_order_id, l.original_order_id]).filter(Boolean)
      )) as string[];
      const invMap: Record<string, string> = {};
      if (orderIds.length) {
        const { data: ords } = await supabase
          .from('orders')
          .select('id, invoice_number')
          .in('id', orderIds);
        (ords || []).forEach((o: any) => { if (o.invoice_number) invMap[o.id] = o.invoice_number; });
      }
      setInvoiceMap(invMap);

      setRows(logs.map(l => ({
        ...l,
        editor_name: l.edited_by ? (nameMap.get(l.edited_by) || l.edited_by.slice(0, 8)) : '—',
      })));
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Failed to load edit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      getInvoiceNo(r).toLowerCase().includes(q) ||
      (r.editor_name || '').toLowerCase().includes(q) ||
      (r.reason || '').toLowerCase().includes(q)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, invoiceMap]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle>Edit Log ({filtered.length})</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search invoice / editor / reason" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Order No</TableHead>
              <TableHead>Edited By</TableHead>
              <TableHead>Edited At</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Old → New Total</TableHead>
              <TableHead>Payment (carried → target)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No edits found</TableCell></TableRow>
            ) : filtered.map(row => {
              const open = !!expanded[row.id];
              const summary = row.edit_summary || {};
              const oldTotal = summary.old_total_amount ?? summary.old_total ?? row.original_snapshot?.order?.total_amount;
              const newTotal = summary.new_total_amount ?? summary.new_total ?? row.replacement_snapshot?.order?.total_amount;
              const hasSnapshots = !!(row.original_snapshot || row.replacement_snapshot);
              const merged = open && hasSnapshots ? mergeItems(row.original_snapshot, row.replacement_snapshot) : [];
              const orderChanged = open && hasSnapshots
                ? ORDER_FIELDS.filter(f => String(row.original_snapshot?.order?.[f] ?? '') !== String(row.replacement_snapshot?.order?.[f] ?? ''))
                : [];
              const beforeInv = (row.original_order_id && invoiceMap[row.original_order_id]) || row.original_snapshot?.order?.invoice_number || (row.original_order_id?.slice(0, 8) ?? '—');
              const afterInv = (row.replacement_order_id && invoiceMap[row.replacement_order_id]) || row.replacement_snapshot?.order?.invoice_number || (row.replacement_order_id?.slice(0, 8) ?? '—');
              return (
                <React.Fragment key={row.id}>
                  <TableRow className="cursor-pointer" onClick={() => setExpanded(s => ({ ...s, [row.id]: !s[row.id] }))}>
                    <TableCell>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell className="font-medium">{getInvoiceNo(row)}</TableCell>
                    <TableCell>{row.editor_name}</TableCell>
                    <TableCell>{format(new Date(row.created_at), 'dd MMM yyyy, HH:mm')}</TableCell>
                    <TableCell className="max-w-[240px] truncate" title={row.reason || ''}>{row.reason || '—'}</TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{fmtMoney(oldTotal)}</span>
                      <span className="mx-1">→</span>
                      <span className="font-semibold">{fmtMoney(newTotal)}</span>
                    </TableCell>
                    <TableCell>
                      {fmtMoney(summary.payment_carried)} → {fmtMoney(summary.target_paid)}
                    </TableCell>
                  </TableRow>
                  {open && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/30">
                        <div className="py-3 space-y-4">
                          {!hasSnapshots ? (
                            <div className="flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-3 text-sm text-blue-900 dark:text-blue-200">
                              <Info className="h-4 w-4 mt-0.5 shrink-0" />
                              <div>
                                Detailed item-level before/after was not recorded for this edit (it predates the audit-snapshot feature).
                                Totals and payment changes are shown above.
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <SideTable side="before" items={merged} headerInvoice={beforeInv} />
                                <SideTable side="after" items={merged} headerInvoice={afterInv} />
                              </div>
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <OrderSummary side="before" order={row.original_snapshot?.order} changedFields={orderChanged} />
                                <OrderSummary side="after" order={row.replacement_snapshot?.order} changedFields={orderChanged} />
                              </div>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default EditedOrdersSection;

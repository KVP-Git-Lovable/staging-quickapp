import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, ChevronDown, ChevronRight, RefreshCw, Search } from 'lucide-react';
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

function getInvoiceNo(row: EditLogRow): string {
  return (
    row.replacement_snapshot?.order?.invoice_number ||
    row.original_snapshot?.order?.invoice_number ||
    row.original_order_id.slice(0, 8)
  );
}

function getItems(snap: any): any[] {
  if (!snap) return [];
  return snap.items || snap.order_items || [];
}

interface ItemDiff {
  type: 'removed' | 'added' | 'changed';
  product_id: string;
  product_name?: string;
  before?: any;
  after?: any;
  changedFields?: string[];
}

const ITEM_FIELDS = ['quantity', 'rate', 'discount_amount', 'discount_percent', 'scheme_id', 'scheme_name', 'line_total', 'total_amount'];

function computeItemDiff(original: any, replacement: any): ItemDiff[] {
  const origItems = getItems(original);
  const replItems = getItems(replacement);
  const origMap = new Map<string, any>();
  origItems.forEach((i: any) => i?.product_id && origMap.set(i.product_id, i));
  const replMap = new Map<string, any>();
  replItems.forEach((i: any) => i?.product_id && replMap.set(i.product_id, i));

  const diffs: ItemDiff[] = [];
  for (const [pid, oi] of origMap) {
    if (!replMap.has(pid)) {
      diffs.push({ type: 'removed', product_id: pid, product_name: oi.product_name || oi.name, before: oi });
    } else {
      const ri = replMap.get(pid);
      const changed: string[] = [];
      for (const f of ITEM_FIELDS) {
        if (oi[f] !== undefined || ri[f] !== undefined) {
          if (String(oi[f] ?? '') !== String(ri[f] ?? '')) changed.push(f);
        }
      }
      if (changed.length) {
        diffs.push({ type: 'changed', product_id: pid, product_name: oi.product_name || oi.name || ri.product_name, before: oi, after: ri, changedFields: changed });
      }
    }
  }
  for (const [pid, ri] of replMap) {
    if (!origMap.has(pid)) {
      diffs.push({ type: 'added', product_id: pid, product_name: ri.product_name || ri.name, after: ri });
    }
  }
  return diffs;
}

const ORDER_FIELDS = ['total_amount', 'payment_method', 'credit_paid_amount', 'credit_pending_amount', 'payment_status'];

function computeOrderDiff(original: any, replacement: any) {
  const o = original?.order || {};
  const r = replacement?.order || {};
  return ORDER_FIELDS
    .filter(f => String(o[f] ?? '') !== String(r[f] ?? ''))
    .map(f => ({ field: f, before: o[f], after: r[f] }));
}

const EditedOrders: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<EditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');

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
      let nameMap = new Map<string, string>();
      if (userIds.length) {
        const { data: profs } = await (supabase as any)
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', userIds);
        (profs || []).forEach((p: any) => nameMap.set(p.user_id, p.full_name || p.user_id));
      }
      setRows(logs.map(l => ({ ...l, editor_name: l.edited_by ? (nameMap.get(l.edited_by) || l.edited_by.slice(0, 8)) : '—' })));
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
  }, [rows, search]);

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle p-4">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/operations')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-foreground">Edited Orders</h1>
                <p className="text-muted-foreground">Audit trail of order edits — who, when, why and what changed.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle>Edit Log ({filtered.length})</CardTitle>
                <div className="relative w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search invoice / editor / reason" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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
                    const oldTotal = summary.old_total ?? row.original_snapshot?.order?.total_amount;
                    const newTotal = summary.new_total ?? row.replacement_snapshot?.order?.total_amount;
                    const itemDiffs = open ? computeItemDiff(row.original_snapshot, row.replacement_snapshot) : [];
                    const orderDiffs = open ? computeOrderDiff(row.original_snapshot, row.replacement_snapshot) : [];
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
                              <div className="space-y-4 py-2">
                                <div>
                                  <h4 className="font-semibold text-sm mb-2">Item Changes</h4>
                                  {itemDiffs.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No item-level changes detected.</p>
                                  ) : (
                                    <div className="space-y-1">
                                      {itemDiffs.map((d, i) => (
                                        <div key={i} className="text-sm flex items-start gap-3 p-2 bg-background rounded border">
                                          <Badge variant={d.type === 'added' ? 'default' : d.type === 'removed' ? 'destructive' : 'secondary'} className="uppercase shrink-0">
                                            {d.type}
                                          </Badge>
                                          <div className="flex-1">
                                            <div className="font-medium">{d.product_name || d.product_id}</div>
                                            {d.type === 'changed' && d.changedFields && (
                                              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                                {d.changedFields.map(f => (
                                                  <div key={f}>
                                                    <span className="font-medium">{f}:</span>{' '}
                                                    <span className="line-through">{String(d.before?.[f] ?? '—')}</span>
                                                    {' → '}
                                                    <span className="text-foreground">{String(d.after?.[f] ?? '—')}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                            {d.type === 'added' && (
                                              <div className="text-xs text-muted-foreground mt-1">
                                                qty {d.after?.quantity} @ {fmtMoney(d.after?.rate)}
                                              </div>
                                            )}
                                            {d.type === 'removed' && (
                                              <div className="text-xs text-muted-foreground mt-1">
                                                qty {d.before?.quantity} @ {fmtMoney(d.before?.rate)}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <h4 className="font-semibold text-sm mb-2">Order-Level Changes</h4>
                                  {orderDiffs.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No order-level changes detected.</p>
                                  ) : (
                                    <div className="space-y-1">
                                      {orderDiffs.map(d => (
                                        <div key={d.field} className="text-sm p-2 bg-background rounded border">
                                          <span className="font-medium">{d.field}:</span>{' '}
                                          <span className="line-through text-muted-foreground">{String(d.before ?? '—')}</span>
                                          {' → '}
                                          <span>{String(d.after ?? '—')}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
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
        </div>
      </div>
    </Layout>
  );
};

export default EditedOrders;

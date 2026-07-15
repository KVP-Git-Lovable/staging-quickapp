import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Pencil, Copy, Loader2, Percent, Search, Package, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Layers } from 'lucide-react';
import { useAdminAccess } from '@/hooks/useAdminAccess';

interface TaxComponent {
  component_type: 'CGST' | 'SGST' | 'IGST' | 'CESS';
  percentage: number;
  is_enabled: boolean;
}

interface TaxMasterRecord {
  id: string;
  name: string;
  tax_type: string;
  description: string | null;
  is_active: boolean;
  apply_to_primary_orders: boolean;
  apply_to_secondary_orders: boolean;
  version: number;
  effective_from: string | null;
  effective_to: string | null;
  product_count: number;
  created_at: string;
  components: TaxComponent[];
}

interface PmProduct {
  id: string;               // real row id (products.id or product_variants.id)
  key: string;              // selection key: 'p:<id>' for base product, 'v:<id>' for variant
  isVariant: boolean;
  name: string;             // variants shown as "Parent — Variant"
  sku: string;
  gst_percentage: number | null;
  tax_master_id: string | null;
  category_name: string | null;
}

const DEFAULT_COMPONENTS: TaxComponent[] = [
  { component_type: 'CGST', percentage: 0, is_enabled: false },
  { component_type: 'SGST', percentage: 0, is_enabled: false },
  { component_type: 'IGST', percentage: 0, is_enabled: false },
  { component_type: 'CESS', percentage: 0, is_enabled: false },
];

const PAGE_SIZE = 50;

// Per-bracket inline product manager (also used for "unassigned")
interface ProductPanelState {
  loading: boolean;
  saving: boolean;
  search: string;
  page: number;
  total: number;
  products: PmProduct[];
  selected: Set<string>;
  targetBracket: string;
}

const emptyPanel = (): ProductPanelState => ({
  loading: false, saving: false, search: '', page: 0, total: 0,
  products: [], selected: new Set(), targetBracket: '',
});

const TaxMaster = () => {
  const navigate = useNavigate();
  const { hasAdminAccess, loading: authLoading } = useAdminAccess();
  const [taxes, setTaxes] = useState<TaxMasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [taxedCount, setTaxedCount] = useState(0);
  const [unassignedCount, setUnassignedCount] = useState(0);

  // Expand state per bracket id ("__unassigned__" for the unassigned card)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [panels, setPanels] = useState<Record<string, ProductPanelState>>({});

  // Form dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('GST');
  const [formDescription, setFormDescription] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formPrimary, setFormPrimary] = useState(true);
  const [formSecondary, setFormSecondary] = useState(true);
  const [formEffectiveFrom, setFormEffectiveFrom] = useState('');
  const [formEffectiveTo, setFormEffectiveTo] = useState('');
  const [formComponents, setFormComponents] = useState<TaxComponent[]>(DEFAULT_COMPONENTS);

  useEffect(() => {
    if (!authLoading && hasAdminAccess) loadTaxes();
  }, [authLoading, hasAdminAccess]);

  const loadTaxes = async () => {
    setLoading(true);
    try {
      const { data: masters, error } = await supabase
        .from('tax_masters')
        .select('*')
        .order('total_rate', { ascending: true });
      if (error) throw error;

      const ids = (masters || []).map(m => m.id);
      const { data: comps } = ids.length > 0
        ? await supabase.from('tax_components').select('*').in('tax_master_id', ids)
        : { data: [] };

      // EXACT, uncapped counts per bracket — run head-count queries in parallel.
      const countResults = await Promise.all(
        ids.map(id =>
          Promise.all([
            supabase.from('products').select('id', { count: 'exact', head: true }).eq('tax_master_id', id),
            supabase.from('product_variants').select('id', { count: 'exact', head: true }).eq('tax_master_id', id),
          ]).then(([pr, vr]) => ({ id, count: (pr.count || 0) + (vr.count || 0) }))
        )
      );
      const countMap: Record<string, number> = {};
      countResults.forEach(r => { countMap[r.id] = r.count; });

      const result: TaxMasterRecord[] = (masters || []).map(m => ({
        ...m,
        product_count: countMap[m.id] || 0,
        components: (comps || []).filter(c => c.tax_master_id === m.id).map(c => ({
          component_type: c.component_type as TaxComponent['component_type'],
          percentage: c.percentage,
          is_enabled: c.is_enabled,
        })),
      }));
      setTaxes(result);

      // Summary head counts
      const [pTaxed, vTaxed, pUnassigned, vUnassigned] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }).not('tax_master_id', 'is', null),
        supabase.from('product_variants').select('id', { count: 'exact', head: true }).not('tax_master_id', 'is', null),
        supabase.from('products').select('id', { count: 'exact', head: true }).is('tax_master_id', null),
        supabase.from('product_variants').select('id', { count: 'exact', head: true }).is('tax_master_id', null),
      ]);
      setTaxedCount((pTaxed.count || 0) + (vTaxed.count || 0));
      setUnassignedCount((pUnassigned.count || 0) + (vUnassigned.count || 0));
    } catch (e: any) {
      toast.error('Failed to load tax masters');
    } finally {
      setLoading(false);
    }
  };

  const updatePanel = (key: string, patch: Partial<ProductPanelState>) => {
    setPanels(prev => ({ ...prev, [key]: { ...(prev[key] ?? emptyPanel()), ...patch } }));
  };

  const loadPanelProducts = useCallback(async (key: string, bracketId: string | null) => {
    const cur = panels[key] ?? emptyPanel();
    updatePanel(key, { loading: true });
    try {
      const trimmed = cur.search.trim();
      const from = cur.page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // Base products
      let pq = supabase
        .from('products')
        .select('id, name, sku, gst_percentage, tax_master_id, product_categories(name)', { count: 'exact' });
      pq = bracketId === null ? pq.is('tax_master_id', null) : pq.eq('tax_master_id', bracketId);
      if (trimmed) pq = pq.or(`name.ilike.%${trimmed}%,sku.ilike.%${trimmed}%`);

      // Variants — each carries its own tax_master_id / gst, so they belong here too
      let vq = supabase
        .from('product_variants')
        .select('id, variant_name, sku, gst_percentage, tax_master_id, products(name)', { count: 'exact' });
      vq = bracketId === null ? vq.is('tax_master_id', null) : vq.eq('tax_master_id', bracketId);
      if (trimmed) vq = vq.or(`variant_name.ilike.%${trimmed}%,sku.ilike.%${trimmed}%`);

      const [{ data: pData, count: pCount, error: pErr }, { data: vData, count: vCount, error: vErr }] =
        await Promise.all([pq.order('name').range(from, to), vq.order('variant_name').range(from, to)]);
      if (pErr) throw pErr;
      if (vErr) throw vErr;

      const rows: PmProduct[] = [
        ...(pData || []).map((p: any) => ({
          id: p.id, key: `p:${p.id}`, isVariant: false,
          name: p.name, sku: p.sku, gst_percentage: p.gst_percentage,
          tax_master_id: p.tax_master_id, category_name: p.product_categories?.name ?? null,
        })),
        ...(vData || []).map((v: any) => ({
          id: v.id, key: `v:${v.id}`, isVariant: true,
          name: `${v.products?.name ?? 'Product'} — ${v.variant_name ?? 'Variant'}`,
          sku: v.sku, gst_percentage: v.gst_percentage,
          tax_master_id: v.tax_master_id, category_name: null,
        })),
      ].sort((a, b) => a.name.localeCompare(b.name));

      updatePanel(key, {
        loading: false,
        total: (pCount || 0) + (vCount || 0),
        products: rows,
      });
    } catch (e: any) {
      updatePanel(key, { loading: false });
      toast.error(`Failed to load products: ${e.message}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels]);

  const toggleExpand = (key: string, bracketId: string | null) => {
    const isOpen = !!expanded[key];
    setExpanded(prev => ({ ...prev, [key]: !isOpen }));
    if (!isOpen) {
      if (!panels[key]) setPanels(prev => ({ ...prev, [key]: emptyPanel() }));
      // load on next tick so panel state exists
      setTimeout(() => loadPanelProducts(key, bracketId), 0);
    }
  };

  const handleSearchChange = (key: string, bracketId: string | null, value: string) => {
    updatePanel(key, { search: value, page: 0 });
    setTimeout(() => loadPanelProducts(key, bracketId), 0);
  };

  const handlePageChange = (key: string, bracketId: string | null, page: number) => {
    updatePanel(key, { page });
    setTimeout(() => loadPanelProducts(key, bracketId), 0);
  };

  const handleBulkMove = async (key: string, bracketId: string | null) => {
    const p = panels[key];
    if (!p || p.selected.size === 0) { toast.error('Select at least one product'); return; }
    if (!p.targetBracket) { toast.error('Choose a target GST bracket'); return; }
    updatePanel(key, { saving: true });
    try {
      const keys = Array.from(p.selected);
      const productIds = keys.filter(k => k.startsWith('p:')).map(k => k.slice(2));
      const variantIds = keys.filter(k => k.startsWith('v:')).map(k => k.slice(2));
      const ops: Promise<any>[] = [];
      if (productIds.length) ops.push(supabase.from('products').update({ tax_master_id: p.targetBracket }).in('id', productIds));
      if (variantIds.length) ops.push(supabase.from('product_variants').update({ tax_master_id: p.targetBracket }).in('id', variantIds));
      const results = await Promise.all(ops);
      const failed = results.find((r: any) => r.error);
      if (failed) throw (failed as any).error;
      toast.success(`Moved ${keys.length} item(s) to the selected bracket`);
      updatePanel(key, { saving: false, selected: new Set() });
      await Promise.all([
        loadPanelProducts(key, bracketId),
        loadTaxes(),
      ]);
    } catch (e: any) {
      updatePanel(key, { saving: false });
      toast.error(`Bulk move failed: ${e.message}`);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setFormName(''); setFormType('GST'); setFormDescription('');
    setFormActive(true); setFormPrimary(true); setFormSecondary(true);
    setFormEffectiveFrom(''); setFormEffectiveTo('');
    setFormComponents(DEFAULT_COMPONENTS.map(c => ({ ...c })));
    setDialogOpen(true);
  };

  const openEdit = (tax: TaxMasterRecord) => {
    setEditingId(tax.id);
    setFormName(tax.name); setFormType(tax.tax_type);
    setFormDescription(tax.description || '');
    setFormActive(tax.is_active);
    setFormPrimary(tax.apply_to_primary_orders);
    setFormSecondary(tax.apply_to_secondary_orders);
    setFormEffectiveFrom(tax.effective_from || '');
    setFormEffectiveTo(tax.effective_to || '');
    setFormComponents(DEFAULT_COMPONENTS.map(dc => {
      const existing = tax.components.find(c => c.component_type === dc.component_type);
      return existing ? { ...existing } : { ...dc };
    }));
    setDialogOpen(true);
  };

  const toggleActive = async (tax: TaxMasterRecord) => {
    try {
      const { error } = await supabase.from('tax_masters')
        .update({ is_active: !tax.is_active }).eq('id', tax.id);
      if (error) throw error;
      toast.success(`${tax.name} ${!tax.is_active ? 'activated' : 'deactivated'}`);
      loadTaxes();
    } catch (e: any) {
      toast.error('Failed to update status');
    }
  };

  const handleClone = async (tax: TaxMasterRecord) => {
    setSaving(true);
    try {
      const { data: newMaster, error } = await supabase
        .from('tax_masters')
        .insert({
          name: `${tax.name} (Clone)`,
          tax_type: tax.tax_type,
          description: tax.description,
          is_active: false,
          apply_to_primary_orders: tax.apply_to_primary_orders,
          apply_to_secondary_orders: tax.apply_to_secondary_orders,
          cloned_from_id: tax.id,
          version: tax.version + 1,
        })
        .select()
        .single();
      if (error) throw error;
      const enabledComps = tax.components.filter(c => c.is_enabled);
      if (enabledComps.length > 0) {
        const { error: compError } = await supabase
          .from('tax_components')
          .insert(enabledComps.map(c => ({
            tax_master_id: newMaster.id,
            component_type: c.component_type,
            percentage: c.percentage,
            is_enabled: true,
          })));
        if (compError) throw compError;
      }
      toast.success('Tax cloned. Edit the clone to update rates.');
      loadTaxes();
    } catch (e: any) {
      toast.error('Failed to clone tax');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('Tax name is required'); return; }
    const enabledComps = formComponents.filter(c => c.is_enabled);
    if (enabledComps.length === 0) { toast.error('Enable at least one tax component'); return; }
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase.from('tax_masters').update({
          name: formName, tax_type: formType,
          description: formDescription || null, is_active: formActive,
          apply_to_primary_orders: formPrimary, apply_to_secondary_orders: formSecondary,
          effective_from: formEffectiveFrom || null, effective_to: formEffectiveTo || null,
        }).eq('id', editingId);
        if (error) throw error;
        await supabase.from('tax_components').delete().eq('tax_master_id', editingId);
        const { error: compError } = await supabase.from('tax_components').insert(
          formComponents.map(c => ({
            tax_master_id: editingId,
            component_type: c.component_type,
            percentage: c.percentage,
            is_enabled: c.is_enabled,
          }))
        );
        if (compError) throw compError;
        toast.success('Tax updated');
      } else {
        const { data: newMaster, error } = await supabase.from('tax_masters').insert({
          name: formName, tax_type: formType,
          description: formDescription || null, is_active: formActive,
          apply_to_primary_orders: formPrimary, apply_to_secondary_orders: formSecondary,
          effective_from: formEffectiveFrom || null, effective_to: formEffectiveTo || null,
        }).select().single();
        if (error) throw error;
        const { error: compError } = await supabase.from('tax_components').insert(
          formComponents.map(c => ({
            tax_master_id: newMaster.id,
            component_type: c.component_type,
            percentage: c.percentage,
            is_enabled: c.is_enabled,
          }))
        );
        if (compError) throw compError;
        toast.success('Tax created');
      }
      setDialogOpen(false);
      loadTaxes();
    } catch (e: any) {
      toast.error('Failed to save tax');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return <Layout><div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div></Layout>;
  if (!hasAdminAccess) { navigate('/dashboard'); return null; }

  const activeBrackets = taxes.filter(t => t.is_active).length;

  const renderProductPanel = (key: string, bracketId: string | null) => {
    const p = panels[key] ?? emptyPanel();
    const from = p.products.length === 0 ? 0 : p.page * PAGE_SIZE + 1;
    const to = p.page * PAGE_SIZE + p.products.length;
    const hasNext = (p.page + 1) * PAGE_SIZE < p.total;

    return (
      <div className="mt-3 border-t pt-3 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder="Search by name or SKU…"
              value={p.search}
              onChange={e => handleSearchChange(key, bracketId, e.target.value)}
            />
          </div>
          <Select value={p.targetBracket} onValueChange={v => updatePanel(key, { targetBracket: v })}>
            <SelectTrigger className="w-[220px] h-9"><SelectValue placeholder="Move to bracket…" /></SelectTrigger>
            <SelectContent>
              {taxes.filter(t => t.is_active && t.id !== bracketId).map(t => {
                const total = t.components.filter(c => c.is_enabled).reduce((s, c) => s + c.percentage, 0);
                return <SelectItem key={t.id} value={t.id}>{t.name} ({total}%)</SelectItem>;
              })}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => handleBulkMove(key, bracketId)}
            disabled={p.saving || p.selected.size === 0 || !p.targetBracket}>
            {p.saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Move{p.selected.size > 0 ? ` (${p.selected.size})` : ''}
          </Button>
        </div>

        <div className="border rounded-md overflow-auto max-h-[420px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={p.products.length > 0 && p.selected.size === p.products.length}
                    onCheckedChange={(checked) => {
                      updatePanel(key, {
                        selected: checked ? new Set(p.products.map(x => x.key)) : new Set(),
                      });
                    }}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">GST</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
              ) : p.products.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No products found.</TableCell></TableRow>
              ) : p.products.map(pr => (
                <TableRow key={pr.key}>
                  <TableCell>
                    <Checkbox
                      checked={p.selected.has(pr.key)}
                      onCheckedChange={(checked) => {
                        const next = new Set(p.selected);
                        if (checked) next.add(pr.key); else next.delete(pr.key);
                        updatePanel(key, { selected: next });
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {pr.name}
                    {pr.isVariant && <Badge variant="secondary" className="ml-2 text-[10px] align-middle">Variant</Badge>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{pr.sku}</TableCell>
                  <TableCell>{pr.category_name || '—'}</TableCell>
                  <TableCell className="text-right">
                    {pr.tax_master_id == null ? (
                      <Badge variant="destructive" className="text-xs">Unassigned</Badge>
                    ) : (
                      <span>{pr.gst_percentage ?? 0}%</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Showing {from}–{to} of {p.total.toLocaleString()}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={p.page === 0 || p.loading}
              onClick={() => handlePageChange(key, bracketId, p.page - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={!hasNext || p.loading}
              onClick={() => handlePageChange(key, bracketId, p.page + 1)}>Next</Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle p-4">
        <div className="w-full space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">Tax Master</h1>
              <p className="text-sm text-muted-foreground">Configure GST/IGST brackets and assign products</p>
            </div>
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Create Bracket
            </Button>
          </div>

          {/* Summary bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Products taxed</div>
                  <div className="text-xl font-semibold">{taxedCount.toLocaleString()}</div>
                </div>
              </CardContent>
            </Card>
            <Card className={unassignedCount > 0 ? 'border-red-300' : ''}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${unassignedCount > 0 ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}`}>
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Unassigned</div>
                  <div className={`text-xl font-semibold ${unassignedCount > 0 ? 'text-red-600' : ''}`}>{unassignedCount.toLocaleString()}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Active brackets</div>
                  <div className="text-xl font-semibold">{activeBrackets}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tax List */}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="grid gap-4">
              {/* Unassigned safety-net card (expandable) */}
              <Card className={unassignedCount > 0 ? 'border-red-300 bg-red-50/40 dark:bg-red-950/10' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      className="flex items-center gap-2 text-left flex-1"
                      onClick={() => toggleExpand('__unassigned__', null)}
                    >
                      {expanded['__unassigned__'] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground">Unassigned Products</h3>
                          <Badge variant={unassignedCount > 0 ? 'destructive' : 'secondary'} className="text-xs">
                            {unassignedCount.toLocaleString()}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Products without a GST bracket. Assign them so they're taxed correctly.
                        </p>
                      </div>
                    </button>
                  </div>
                  {expanded['__unassigned__'] && renderProductPanel('__unassigned__', null)}
                </CardContent>
              </Card>

              {taxes.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">No brackets configured yet. Click "Create Bracket" to get started.</CardContent></Card>
              ) : taxes.map(tax => {
                const compMap: Record<string, number> = {};
                tax.components.filter(c => c.is_enabled).forEach(c => { compMap[c.component_type] = c.percentage; });
                const totalPct = Object.values(compMap).reduce((s, v) => s + v, 0);
                const isOpen = !!expanded[tax.id];

                return (
                  <Card key={tax.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <button className="flex-1 min-w-0 text-left" onClick={() => toggleExpand(tax.id, tax.id)}>
                          <div className="flex items-center gap-2 flex-wrap">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <h3 className="font-semibold text-foreground">{tax.name}</h3>
                            <Badge variant={tax.is_active ? 'default' : 'secondary'} className="text-xs">
                              {tax.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">{tax.tax_type}</Badge>
                            {tax.version > 1 && <Badge variant="outline" className="text-xs">v{tax.version}</Badge>}
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium">
                              <Package className="h-3 w-3" />
                              {tax.product_count.toLocaleString()} {tax.product_count === 1 ? 'product' : 'products'}
                            </span>
                          </div>
                          {tax.description && <p className="text-sm text-muted-foreground mt-1 ml-6">{tax.description}</p>}

                          {/* Full rate breakdown */}
                          <div className="flex flex-wrap gap-2 mt-2 ml-6">
                            {(['CGST', 'SGST', 'IGST', 'CESS'] as const).map(t => (
                              <span key={t} className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${compMap[t] !== undefined ? 'bg-muted text-foreground' : 'bg-muted/40 text-muted-foreground'}`}>
                                {t}: {compMap[t] ?? 0}%
                              </span>
                            ))}
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-semibold">
                              Total: {totalPct}%
                            </span>
                          </div>
                          <div className="flex gap-3 mt-2 ml-6 text-xs text-muted-foreground">
                            {tax.apply_to_primary_orders && <span>✓ Primary</span>}
                            {tax.apply_to_secondary_orders && <span>✓ Secondary</span>}
                          </div>
                        </button>
                        <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" onClick={() => toggleActive(tax)} title={tax.is_active ? 'Deactivate' : 'Activate'}>
                            <Switch checked={tax.is_active} />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(tax)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleClone(tax)} disabled={saving} title="Clone">
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {isOpen && renderProductPanel(tax.id, tax.id)}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Bracket' : 'Create Bracket'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Bracket Name *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. GST 18%" />
            </div>
            <div>
              <Label>Tax Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GST">GST</SelectItem>
                  <SelectItem value="IGST">IGST</SelectItem>
                  <SelectItem value="Custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Optional" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Effective From</Label>
                <Input type="date" value={formEffectiveFrom} onChange={e => setFormEffectiveFrom(e.target.value)} />
              </div>
              <div>
                <Label>Effective To</Label>
                <Input type="date" value={formEffectiveTo} onChange={e => setFormEffectiveTo(e.target.value)} />
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Tax Components</Label>
              <div className="space-y-3 border rounded-lg p-3">
                {formComponents.map((comp, idx) => (
                  <div key={comp.component_type} className="flex items-center gap-3">
                    <Checkbox
                      checked={comp.is_enabled}
                      onCheckedChange={(checked) => {
                        const updated = [...formComponents];
                        updated[idx] = { ...comp, is_enabled: !!checked };
                        setFormComponents(updated);
                      }}
                    />
                    <span className="text-sm font-medium w-12">{comp.component_type}</span>
                    <div className="flex items-center gap-1 flex-1">
                      <Input
                        type="number"
                        value={comp.percentage}
                        onChange={e => {
                          const updated = [...formComponents];
                          updated[idx] = { ...comp, percentage: parseFloat(e.target.value) || 0 };
                          setFormComponents(updated);
                        }}
                        disabled={!comp.is_enabled}
                        min="0" max="100" step="0.01"
                        className="w-24"
                      />
                      <Percent className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Applicability</Label>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Apply for Primary Orders</span>
                  <Switch checked={formPrimary} onCheckedChange={setFormPrimary} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Apply for Secondary Orders</span>
                  <Switch checked={formSecondary} onCheckedChange={setFormSecondary} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Status</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{formActive ? 'Active' : 'Inactive'}</span>
                <Switch checked={formActive} onCheckedChange={setFormActive} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingId ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default TaxMaster;

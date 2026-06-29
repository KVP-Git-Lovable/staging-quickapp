import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ArrowLeft, Plus, Pencil, Copy, Loader2, Percent, Search, Package } from 'lucide-react';
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
  product_count?: number;
  created_at: string;
  components: TaxComponent[];
}

interface ProductVariantRow {
  id: string;
  variant_name: string;
  sku: string;
  price: number;
  product_name: string;
  category_name: string;
  product_id: string;
  category_id: string | null;
  is_mapped: boolean;
}

const DEFAULT_COMPONENTS: TaxComponent[] = [
  { component_type: 'CGST', percentage: 0, is_enabled: false },
  { component_type: 'SGST', percentage: 0, is_enabled: false },
  { component_type: 'IGST', percentage: 0, is_enabled: false },
  { component_type: 'CESS', percentage: 0, is_enabled: false },
];

const TaxMaster = () => {
  const navigate = useNavigate();
  const { hasAdminAccess, loading: authLoading } = useAdminAccess();
  const [taxes, setTaxes] = useState<TaxMasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
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
  
  // Product mapping dialog
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [mappingTaxId, setMappingTaxId] = useState<string | null>(null);
  const [mappingTaxName, setMappingTaxName] = useState('');
  const [variants, setVariants] = useState<ProductVariantRow[]>([]);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingSearch, setMappingSearch] = useState('');
  const [mappingCategoryFilter, setMappingCategoryFilter] = useState('all');
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  // Bracket / Unassigned products manager
  const [pmOpen, setPmOpen] = useState(false);
  const [pmMode, setPmMode] = useState<'unassigned' | 'bracket'>('unassigned');
  const [pmBracketId, setPmBracketId] = useState<string | null>(null);
  const [pmProducts, setPmProducts] = useState<Array<{ id: string; name: string; sku: string; gst_percentage: number | null; tax_master_id: string | null; category_name: string | null }>>([]);
  const [pmLoading, setPmLoading] = useState(false);
  const [pmSearch, setPmSearch] = useState('');
  const [pmPage, setPmPage] = useState(0);
  const [pmTotal, setPmTotal] = useState(0);
  const PM_PAGE_SIZE = 50;
  const [pmSelected, setPmSelected] = useState<Set<string>>(new Set());
  const [pmTargetBracket, setPmTargetBracket] = useState<string>('');
  const [pmSaving, setPmSaving] = useState(false);
  const [unassignedCount, setUnassignedCount] = useState(0);

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

      // Load components for each
      const ids = (masters || []).map(m => m.id);
      const { data: comps } = ids.length > 0
        ? await supabase.from('tax_components').select('*').in('tax_master_id', ids)
        : { data: [] };

      // Count ALL products per slab (not filtered by is_active — products.is_active
      // is false for most products; that is a price-book active flag, not tax relevance)
      const { data: prodCounts } = ids.length > 0
        ? await supabase.from('products').select('tax_master_id').in('tax_master_id', ids)
        : { data: [] };
      const countMap: Record<string, number> = {};
      (prodCounts || []).forEach((p: any) => {
        if (p.tax_master_id) countMap[p.tax_master_id] = (countMap[p.tax_master_id] || 0) + 1;
      });

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

      // Unassigned product count (head-only for badge)
      const { count: unCount } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .is('tax_master_id', null);
      setUnassignedCount(unCount || 0);
    } catch (e: any) {
      toast.error('Failed to load tax masters');
    } finally {
      setLoading(false);
    }
  };

  const loadPmProducts = async (mode: 'unassigned' | 'bracket', bracketId: string | null, search: string, page: number) => {
    setPmLoading(true);
    try {
      let q = supabase
        .from('products')
        .select('id, name, sku, gst_percentage, tax_master_id, product_categories(name)', { count: 'exact' });
      if (mode === 'unassigned') q = q.is('tax_master_id', null);
      else if (bracketId) q = q.eq('tax_master_id', bracketId);
      const trimmed = search.trim();
      if (trimmed) q = q.or(`name.ilike.%${trimmed}%,sku.ilike.%${trimmed}%`);
      const from = page * PM_PAGE_SIZE;
      const to = from + PM_PAGE_SIZE - 1;
      const { data, count, error } = await q.order('name').range(from, to);
      if (error) throw error;
      setPmProducts((data || []).map((p: any) => ({
        id: p.id, name: p.name, sku: p.sku,
        gst_percentage: p.gst_percentage, tax_master_id: p.tax_master_id,
        category_name: p.product_categories?.name ?? null,
      })));
      setPmTotal(count || 0);
    } catch (e: any) {
      toast.error(`Failed to load products: ${e.message}`);
    } finally {
      setPmLoading(false);
    }
  };

  const openProductManager = (mode: 'unassigned' | 'bracket', bracketId: string | null = null) => {
    setPmMode(mode);
    setPmBracketId(bracketId);
    setPmSearch('');
    setPmPage(0);
    setPmSelected(new Set());
    setPmTargetBracket('');
    setPmOpen(true);
    loadPmProducts(mode, bracketId, '', 0);
  };

  const handleBulkMove = async () => {
    if (pmSelected.size === 0) { toast.error('Select at least one product'); return; }
    if (!pmTargetBracket) { toast.error('Choose a target GST bracket'); return; }
    setPmSaving(true);
    try {
      const ids = Array.from(pmSelected);
      const { error } = await supabase
        .from('products')
        .update({ tax_master_id: pmTargetBracket })
        .in('id', ids);
      if (error) throw error;
      toast.success(`Moved ${ids.length} product(s) to the selected bracket`);
      setPmSelected(new Set());
      await Promise.all([
        loadPmProducts(pmMode, pmBracketId, pmSearch, pmPage),
        loadTaxes(),
      ]);
    } catch (e: any) {
      toast.error(`Bulk move failed: ${e.message}`);
    } finally {
      setPmSaving(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setFormName('');
    setFormType('GST');
    setFormDescription('');
    setFormActive(true);
    setFormPrimary(true);
    setFormSecondary(true);
    setFormEffectiveFrom('');
    setFormEffectiveTo('');
    setFormComponents(DEFAULT_COMPONENTS.map(c => ({ ...c })));
    setDialogOpen(true);
  };

  const openEdit = (tax: TaxMasterRecord) => {
    setEditingId(tax.id);
    setFormName(tax.name);
    setFormType(tax.tax_type);
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

      // Clone components
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

      // Clone product mappings
      const { data: existingMaps } = await supabase
        .from('tax_product_map')
        .select('product_variant_id')
        .eq('tax_master_id', tax.id)
        .eq('is_applicable', true);

      if (existingMaps && existingMaps.length > 0) {
        const { error: mapError } = await supabase
          .from('tax_product_map')
          .insert(existingMaps.map(m => ({
            tax_master_id: newMaster.id,
            product_variant_id: m.product_variant_id,
            is_applicable: true,
          })));
        if (mapError) throw mapError;
      }

      toast.success('Tax cloned successfully! Edit the clone to update percentages.');
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
          name: formName,
          tax_type: formType,
          description: formDescription || null,
          is_active: formActive,
          apply_to_primary_orders: formPrimary,
          apply_to_secondary_orders: formSecondary,
          effective_from: formEffectiveFrom || null,
          effective_to: formEffectiveTo || null,
        }).eq('id', editingId);
        if (error) throw error;

        // Upsert components
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
          name: formName,
          tax_type: formType,
          description: formDescription || null,
          is_active: formActive,
          apply_to_primary_orders: formPrimary,
          apply_to_secondary_orders: formSecondary,
          effective_from: formEffectiveFrom || null,
          effective_to: formEffectiveTo || null,
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

  // --- Product Mapping ---
  const openMapping = async (taxId: string, taxName: string) => {
    setMappingTaxId(taxId);
    setMappingTaxName(taxName);
    setMappingSearch('');
    setMappingCategoryFilter('all');
    setShowOnlySelected(false);
    setMappingDialogOpen(true);
    setMappingLoading(true);
    try {
      // Load categories
      const { data: cats } = await supabase.from('product_categories').select('id, name').order('name');
      setCategories(cats || []);

      // Load all variants with product + category info
      // products.is_active=false for most products in this DB — it is a price-book flag,
      // not a tax-eligibility flag. Show all variants so admins can assign tax slabs.
      const { data: allVariants } = await supabase
        .from('product_variants')
        .select('id, variant_name, sku, price, product_id, products!inner(name, category_id, product_categories(name))')
        .order('sku');

      // Load existing mappings
      const { data: mappings } = await supabase
        .from('tax_product_map')
        .select('product_variant_id')
        .eq('tax_master_id', taxId)
        .eq('is_applicable', true);
      const mappedIds = new Set((mappings || []).map(m => m.product_variant_id));

      const rows: ProductVariantRow[] = (allVariants || []).map((v: any) => ({
        id: v.id,
        variant_name: v.variant_name,
        sku: v.sku,
        price: v.price,
        product_name: v.products?.name || '',
        category_name: v.products?.product_categories?.name || 'Uncategorized',
        product_id: v.product_id,
        category_id: v.products?.category_id || null,
        is_mapped: mappedIds.has(v.id),
      }));
      setVariants(rows);
    } catch (e: any) {
      toast.error('Failed to load products');
    } finally {
      setMappingLoading(false);
    }
  };

  const toggleVariantMapping = (variantId: string) => {
    setVariants(prev => prev.map(v => v.id === variantId ? { ...v, is_mapped: !v.is_mapped } : v));
  };

  const toggleCategoryBulk = (categoryId: string | null, checked: boolean) => {
    setVariants(prev => prev.map(v =>
      (categoryId === null ? true : v.category_id === categoryId) ? { ...v, is_mapped: checked } : v
    ));
  };

  const saveMappings = async () => {
    if (!mappingTaxId) return;
    setMappingSaving(true);
    try {
      // Delete existing and re-insert
      await supabase.from('tax_product_map').delete().eq('tax_master_id', mappingTaxId);
      const mapped = variants.filter(v => v.is_mapped);
      if (mapped.length > 0) {
        // Insert in batches of 500
        for (let i = 0; i < mapped.length; i += 500) {
          const batch = mapped.slice(i, i + 500);
          const { error } = await supabase.from('tax_product_map').insert(
            batch.map(v => ({ tax_master_id: mappingTaxId, product_variant_id: v.id, is_applicable: true }))
          );
          if (error) throw error;
        }
      }
      toast.success(`Mapped ${mapped.length} SKUs to tax`);
      setMappingDialogOpen(false);
    } catch (e: any) {
      toast.error('Failed to save mappings');
    } finally {
      setMappingSaving(false);
    }
  };

  const filteredVariants = variants.filter(v => {
    if (showOnlySelected && !v.is_mapped) return false;
    if (mappingCategoryFilter !== 'all' && v.category_id !== mappingCategoryFilter) return false;
    if (mappingSearch) {
      const q = mappingSearch.toLowerCase();
      return v.variant_name.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q) || v.product_name.toLowerCase().includes(q);
    }
    return true;
  });

  const selectedCount = variants.filter(v => v.is_mapped).length;

  if (authLoading) return <Layout><div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div></Layout>;
  if (!hasAdminAccess) { navigate('/dashboard'); return null; }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle p-4">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">Tax Master</h1>
              <p className="text-sm text-muted-foreground">Configure GST/IGST tax rates and map to products</p>
            </div>
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Create Tax
            </Button>
          </div>

          {/* Tax List */}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : taxes.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No taxes configured yet. Click "Create Tax" to get started.</CardContent></Card>
          ) : (
            <div className="grid gap-4">
              {/* Unassigned safety-net card */}
              <Card className={unassignedCount > 0 ? 'border-red-300 bg-red-50/40 dark:bg-red-950/10' : ''}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
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
                  <Button
                    size="sm"
                    variant={unassignedCount > 0 ? 'destructive' : 'outline'}
                    onClick={() => openProductManager('unassigned')}
                  >
                    <Package className="h-4 w-4 mr-2" />
                    Review & Assign
                  </Button>
                </CardContent>
              </Card>
              {taxes.map(tax => {
                const enabledComps = tax.components.filter(c => c.is_enabled);
                const totalPct = enabledComps.reduce((s, c) => s + c.percentage, 0);
                return (
                  <Card key={tax.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-foreground">{tax.name}</h3>
                            <Badge variant={tax.is_active ? "default" : "secondary"} className="text-xs">
                              {tax.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">{tax.tax_type}</Badge>
                            {tax.version > 1 && <Badge variant="outline" className="text-xs">v{tax.version}</Badge>}
                            {tax.product_count !== undefined && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium">
                                <Package className="h-3 w-3" />
                                {tax.product_count.toLocaleString()} {tax.product_count === 1 ? 'product' : 'products'}
                              </span>
                            )}
                          </div>
                          {tax.description && <p className="text-sm text-muted-foreground mt-1">{tax.description}</p>}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {enabledComps.map(c => (
                              <span key={c.component_type} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                                {c.component_type}: {c.percentage}%
                              </span>
                            ))}
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                              Total: {totalPct}%
                            </span>
                          </div>
                          <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                            {tax.apply_to_primary_orders && <span>✓ Primary Orders</span>}
                            {tax.apply_to_secondary_orders && <span>✓ Secondary Orders</span>}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="outline" onClick={() => openProductManager('bracket', tax.id)} title="Manage products in this bracket">
                            <Package className="h-4 w-4 mr-1" /> Manage
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openMapping(tax.id, tax.name)} title="Map Variants (legacy)">
                            <Package className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(tax)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleClone(tax)} disabled={saving} title="Clone">
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
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
            <DialogTitle>{editingId ? 'Edit Tax' : 'Create Tax'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tax Name *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. GST 18% 2026" />
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
              <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Optional description" />
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

            {/* Tax Components */}
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
                        min="0"
                        max="100"
                        step="0.01"
                        className="w-24"
                      />
                      <Percent className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Applicability */}
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

            {/* Status */}
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

      {/* Product Mapping Dialog */}
      <Dialog open={mappingDialogOpen} onOpenChange={setMappingDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Product Mapping — {mappingTaxName}</DialogTitle>
          </DialogHeader>

          {mappingLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <Label className="text-xs">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={mappingSearch}
                      onChange={e => setMappingSearch(e.target.value)}
                      placeholder="Search product or SKU..."
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="w-[180px]">
                  <Label className="text-xs">Category</Label>
                  <Select value={mappingCategoryFilter} onValueChange={setMappingCategoryFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={showOnlySelected} onCheckedChange={(c) => setShowOnlySelected(!!c)} />
                  <span className="text-sm">Selected only</span>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                {selectedCount} / {variants.length} SKUs selected
              </div>

              {/* Bulk actions */}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => toggleCategoryBulk(null, true)}>Select All</Button>
                <Button size="sm" variant="outline" onClick={() => toggleCategoryBulk(null, false)}>Deselect All</Button>
                {mappingCategoryFilter !== 'all' && (
                  <Button size="sm" variant="outline" onClick={() => toggleCategoryBulk(mappingCategoryFilter, true)}>
                    Select Category
                  </Button>
                )}
              </div>

              {/* Table */}
              <div className="border rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">☑</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Base Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVariants.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No SKUs found</TableCell></TableRow>
                    ) : filteredVariants.map(v => (
                      <TableRow key={v.id} className="cursor-pointer" onClick={() => toggleVariantMapping(v.id)}>
                        <TableCell>
                          <Checkbox checked={v.is_mapped} onCheckedChange={() => toggleVariantMapping(v.id)} />
                        </TableCell>
                        <TableCell className="text-sm">{v.category_name}</TableCell>
                        <TableCell className="text-sm font-medium">{v.product_name}</TableCell>
                        <TableCell className="text-sm">{v.variant_name} ({v.sku})</TableCell>
                        <TableCell className="text-sm text-right">₹{v.price.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setMappingDialogOpen(false)}>Cancel</Button>
                <Button onClick={saveMappings} disabled={mappingSaving}>
                  {mappingSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Save Mappings ({selectedCount} SKUs)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Products Manager (Unassigned / per-bracket) */}
      <Dialog open={pmOpen} onOpenChange={setPmOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {pmMode === 'unassigned'
                ? 'Unassigned Products'
                : `Products in: ${taxes.find(t => t.id === pmBracketId)?.name ?? 'bracket'}`}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 flex-1 overflow-hidden">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search by name or SKU…"
                  value={pmSearch}
                  onChange={e => {
                    setPmSearch(e.target.value);
                    setPmPage(0);
                    loadPmProducts(pmMode, pmBracketId, e.target.value, 0);
                  }}
                />
              </div>
              <Select value={pmTargetBracket} onValueChange={setPmTargetBracket}>
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="Move to bracket…" /></SelectTrigger>
                <SelectContent>
                  {taxes.filter(t => t.is_active && t.id !== pmBracketId).map(t => {
                    const total = t.components.filter(c => c.is_enabled).reduce((s, c) => s + c.percentage, 0);
                    return <SelectItem key={t.id} value={t.id}>{t.name} ({total}%)</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleBulkMove} disabled={pmSaving || pmSelected.size === 0 || !pmTargetBracket}>
                {pmSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Move {pmSelected.size > 0 ? `(${pmSelected.size})` : ''}
              </Button>
            </div>

            <div className="flex-1 overflow-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={pmProducts.length > 0 && pmSelected.size === pmProducts.length}
                        onCheckedChange={(checked) => {
                          if (checked) setPmSelected(new Set(pmProducts.map(p => p.id)));
                          else setPmSelected(new Set());
                        }}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Current GST</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pmLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
                  ) : pmProducts.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No products found.</TableCell></TableRow>
                  ) : pmProducts.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Checkbox
                          checked={pmSelected.has(p.id)}
                          onCheckedChange={(checked) => {
                            const next = new Set(pmSelected);
                            if (checked) next.add(p.id); else next.delete(p.id);
                            setPmSelected(next);
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell>{p.category_name || '—'}</TableCell>
                      <TableCell className="text-right">
                        {p.tax_master_id == null ? (
                          <Badge variant="destructive" className="text-xs">Unassigned</Badge>
                        ) : (
                          <span>{p.gst_percentage ?? 0}%</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Showing {pmProducts.length === 0 ? 0 : pmPage * PM_PAGE_SIZE + 1}–{pmPage * PM_PAGE_SIZE + pmProducts.length} of {pmTotal}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={pmPage === 0 || pmLoading}
                  onClick={() => { const np = pmPage - 1; setPmPage(np); loadPmProducts(pmMode, pmBracketId, pmSearch, np); }}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={(pmPage + 1) * PM_PAGE_SIZE >= pmTotal || pmLoading}
                  onClick={() => { const np = pmPage + 1; setPmPage(np); loadPmProducts(pmMode, pmBracketId, pmSearch, np); }}>
                  Next
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default TaxMaster;


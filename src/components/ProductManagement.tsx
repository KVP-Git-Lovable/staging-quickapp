import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { moveToRecycleBin } from '@/utils/recycleBinUtils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Package, Tag, Search, Grid3X3, Camera, Loader2, RefreshCw, SlidersHorizontal, FileText, Download } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { ProductFormFields } from './ProductFormFields';
import { ProductExtendedFields } from './ProductExtendedFields';
import { VariantFocusedFields } from './VariantFocusedFields';
import { VariantExtendedFields } from './VariantExtendedFields';
import { migrateProducts } from '@/utils/productMigration';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/PaginationControls';
import { useNavigate } from 'react-router-dom';
import { ProductUnitsEditor, emptyProductUnitsEditorValue, type ProductUnitsEditorValue } from '@/components/admin/uom/ProductUnitsEditor';
import { reconcileProductUomMapping, hydrateUnitsEditorFromProduct } from '@/lib/productUomPersistence';

interface ProductCategory {
  id: string;
  name: string;
  description: string;
}

interface Product {
  id: string;
  sku: string;
  product_number?: string;
  name: string;
  description: string;
  category_id: string;
  category?: ProductCategory;
  rate: number;
  unit: string;
  base_unit: string;
  conversion_factor: number;
  closing_stock: number;
  is_active: boolean;
  is_focused_product?: boolean;
  focused_due_date?: string;
  focused_target_quantity?: number;
  focused_territories?: string[];
  barcode?: string;
  qr_code?: string;
}


interface ProductVariant {
  id: string;
  product_id: string;
  variant_name: string;
  sku: string;
  price: number;
  stock_quantity: number;
  discount_percentage: number;
  discount_amount: number;
  is_active: boolean;
  is_focused_product?: boolean;
  focused_due_date?: string;
  focused_target_quantity?: number;
  focused_territories?: string[];
  barcode?: string;
  qr_code?: string;
}

interface Territory {
  id: string;
  name: string;
  region: string;
}

const PRODUCT_BASE_UNIT_CATEGORIES = ['Weight', 'Volume', 'Quantity'] as const;

const normalizeProductBaseUnitCategory = (value?: string | null) => {
  const raw = (value || '').trim();
  if (PRODUCT_BASE_UNIT_CATEGORIES.includes(raw as any)) return raw;

  const normalized = raw.toLowerCase();
  if (['kg', 'gram', 'grams', 'g', 'mg', 'lb', 'oz', 'ton'].includes(normalized)) return 'Weight';
  if (['ml', 'litre', 'liter', 'l', 'gal', 'fl_oz'].includes(normalized)) return 'Volume';
  return 'Quantity';
};

const ProductManagement = () => {
  const navigate = useNavigate();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [unitsValue, setUnitsValue] = useState<ProductUnitsEditorValue>(() => emptyProductUnitsEditorValue());
  const [savingProduct, setSavingProduct] = useState(false);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [selectedProductForVariants, setSelectedProductForVariants] = useState<string>('');
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Dialog states
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  
  const [isVariantDialogOpen, setIsVariantDialogOpen] = useState(false);
  const [isVariantsViewOpen, setIsVariantsViewOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    type: 'product' | 'category' | 'variant' | 'all-products' | null;
    id: string;
    name: string;
  }>({ open: false, type: null, id: '', name: '' });

  // Form states
  const [categoryForm, setCategoryForm] = useState({ id: '', name: '', description: '' });
const emptyProductForm = () => ({
  id: '',
  sku: '',
  product_number: '',
  name: '',
  description: '',
  category_id: '',
  is_focused_product: false,
  focused_type: undefined as 'fixed_date' | 'recurring' | 'keep_open' | undefined,
  focused_due_date: '',
  focused_target_quantity: 0,
  focused_territories: [] as string[],
  focused_recurring_config: undefined as {
    days_of_week?: string[];
    weeks_of_month?: string[];
    months_of_year?: string[];
  } | undefined,
  rate: 0,
  unit: 'piece',
  base_unit: 'kg',
  conversion_factor: 1,
  closing_stock: 0,
  is_active: true,
  sku_image_url: '',
  barcode: '',
  barcode_image_url: '',
  qr_code: '',
  hsn_code: '',
  // Extended fields
  product_type: 'Finished Good',
  gross_weight_g: null as number | null,
  packaging_weight_g: null as number | null,
  standard_cost: null as number | null,
  cost_currency: 'INR',
  reorder_quantity: null as number | null,
  last_cost_update: null as string | null,
  primary_supplier_id: null as string | null,
  manufacturer: '',
  country_of_origin: '',
  is_discontinued: false,
  discontinued_date: null as string | null,
  discontinuation_reason: '',
  created_by: null as string | null,
  updated_by: null as string | null,
});

const emptyVariantForm = (): any => ({
  id: '', product_id: '', variant_name: '', sku: '', product_number: '', description: '',
  base_unit: 'kg', unit: 'piece', conversion_factor: 1, price: 0, stock_quantity: 0,
  hsn_code: '90230', discount_percentage: 0, discount_amount: 0, is_active: true,
  is_focused_product: false, focused_type: undefined, focused_due_date: '',
  focused_target_quantity: 0, focused_territories: [] as string[], focused_recurring_config: undefined,
  barcode: '', barcode_image_url: null as string | null, qr_code: '',
  variant_type: 'Other', uom_id: null as string | null, variant_weight_g: null as number | null,
  variant_cost: null as number | null, variant_tax_rate: null as number | null,
  is_discontinued: false, discontinued_date: null as string | null,
});

const [productForm, setProductForm] = useState(emptyProductForm());
  
  const [variantForm, setVariantForm] = useState({
    id: '',
    product_id: '',
    variant_name: '',
    sku: '',
    product_number: '',
    description: '',
    base_unit: 'kg',
    unit: 'piece',
    conversion_factor: 1,
    price: 0,
    stock_quantity: 0,
    hsn_code: '90230',
    discount_percentage: 0,
    discount_amount: 0,
    is_active: true,
    is_focused_product: false,
    focused_type: undefined,
    focused_due_date: '',
    focused_target_quantity: 0,
    focused_territories: [] as string[],
    focused_recurring_config: undefined,
    barcode: '',
    barcode_image_url: null as string | null,
    qr_code: '',
    // Extended variant fields
    variant_type: 'Other',
    uom_id: null as string | null,
    variant_weight_g: null as number | null,
    variant_cost: null as number | null,
    variant_tax_rate: null as number | null,
    is_discontinued: false,
    discontinued_date: null as string | null,
  } as any);

  const executeDeleteAllProducts = async () => {
    try {
      toast.loading('Deactivating all products...');

      const { data, error } = await supabase.rpc('admin_deactivate_all_products');

      if (error) throw error;

      const result = (data ?? {}) as { deactivated_products?: number; deactivated_variants?: number };
      toast.dismiss();
      toast.success(
        `Deactivated ${result.deactivated_products ?? 0} products and ${result.deactivated_variants ?? 0} variants. Order history and inventory preserved.`
      );
      fetchData();
      setDeleteConfirm({ open: false, type: null, id: '', name: '' });
    } catch (error: any) {
      toast.dismiss();
      console.error('Error deactivating products:', error);
      toast.error(`Failed to deactivate products: ${error?.message ?? 'unknown error'}`);
    }
  };


  const handleConfirmAction = () => {
    if (deleteConfirm.type === 'product') {
      executeDeleteProduct(deleteConfirm.id);
    } else if (deleteConfirm.type === 'category') {
      executeDeleteCategory(deleteConfirm.id);
    } else if (deleteConfirm.type === 'variant') {
      executeDeleteVariant(deleteConfirm.id);
    } else if (deleteConfirm.type === 'all-products') {
      executeDeleteAllProducts();
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-uncheck focused products when due date passes or target is met
  useEffect(() => {
    const checkFocusedProducts = async () => {
      const now = new Date();
      
      try {
        // Check products
        const productsToUpdate = products.filter(p => 
          p.is_focused_product && p.focused_due_date && new Date(p.focused_due_date) < now
        );
        
        for (const product of productsToUpdate) {
          await supabase
            .from('products')
            .update({ is_focused_product: false })
            .eq('id', product.id);
        }
        
        // Check variants
        const variantsToUpdate = variants.filter(v => 
          v.is_focused_product && v.focused_due_date && new Date(v.focused_due_date) < now
        );
        
        for (const variant of variantsToUpdate) {
          await supabase
            .from('product_variants')
            .update({ is_focused_product: false })
            .eq('id', variant.id);
        }
        
        if (productsToUpdate.length > 0 || variantsToUpdate.length > 0) {
          fetchData(); // Refresh data if any updates were made
        }
      } catch (error) {
        console.error('Error checking focused products:', error);
      }
    };
    
    checkFocusedProducts();
    const interval = setInterval(checkFocusedProducts, 3600000); // Check hourly
    return () => clearInterval(interval);
  }, [products, variants]);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([fetchCategories(), fetchProducts(), fetchVariants(), fetchTerritories()]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const fetchTerritories = async () => {
    const { data, error } = await supabase
      .from('territories')
      .select('id, name, region')
      .order('name');
    
    if (error) throw error;
    setTerritories(data || []);
  };

  // Generate QR code content
  const generateQRCode = (type: 'product' | 'variant', sku: string, name: string) => {
    return `${type}:${sku}:${name}`;
  };

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('product_categories')
      .select('*')
      .order('name');
    
    if (error) throw error;
    setCategories(data || []);
  };

  const fetchProducts = async () => {
    const pageSize = 1000;
    let from = 0;
    const all: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from('products')
        .select(`*, category:product_categories(*)`)
        .order('name')
        .range(from, from + pageSize - 1);
      if (error) {
        console.error('Error fetching products in ProductManagement:', error);
        throw error;
      }
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    console.log('Fetched products in ProductManagement:', all.length);
    setProducts(all);
  };


  const fetchVariants = async () => {
    const pageSize = 1000;
    let from = 0;
    const all: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from('product_variants')
        .select('*')
        .order('variant_name')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    setVariants(all);
  };



  const handleVariantSubmit = async () => {
    try {
      // Auto-generate SKU if empty
      let variantSku = variantForm.sku.trim();
      if (!variantSku) {
        // Generate unique SKU based on product and variant name
        const baseProduct = products.find(p => p.id === variantForm.product_id);
        const productSku = baseProduct?.sku || 'PROD';
        const variantNameClean = variantForm.variant_name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        variantSku = `${productSku}_${variantNameClean}_${Date.now().toString().slice(-6)}`;
      }

      // Generate QR code if not exists
      const qrCode = variantForm.qr_code || generateQRCode('variant', variantSku, variantForm.variant_name);

      if (variantForm.id) {
        const { error } = await supabase
          .from('product_variants')
          .update({
            product_id: variantForm.product_id,
            variant_name: variantForm.variant_name,
            sku: variantSku,
            price: variantForm.price,
            stock_quantity: variantForm.stock_quantity,
            discount_percentage: variantForm.discount_percentage,
            discount_amount: variantForm.discount_amount,
            is_active: variantForm.is_active,
            is_focused_product: variantForm.is_focused_product,
            focused_type: (variantForm as any).focused_type || null,
            focused_due_date: variantForm.focused_due_date || null,
            focused_target_quantity: variantForm.focused_target_quantity || 0,
            focused_territories: variantForm.focused_territories || [],
            focused_recurring_config: (variantForm as any).focused_recurring_config || null,
            barcode: variantForm.barcode || null,
            qr_code: qrCode,
            barcode_image_url: (variantForm as any).barcode_image_url || null,
            variant_type: (variantForm as any).variant_type || 'Other',
            uom_id: (variantForm as any).uom_id || null,
            variant_weight_g: (variantForm as any).variant_weight_g,
            variant_cost: (variantForm as any).variant_cost,
            variant_tax_rate: (variantForm as any).variant_tax_rate,
            is_discontinued: !!(variantForm as any).is_discontinued,
            discontinued_date: (variantForm as any).is_discontinued ? ((variantForm as any).discontinued_date || null) : null
          })
          .eq('id', variantForm.id);
        
        if (error) throw error;
        toast.success('Variant updated successfully');
      } else {
        const { error } = await supabase
          .from('product_variants')
          .insert({
            product_id: variantForm.product_id,
            variant_name: variantForm.variant_name,
            sku: variantSku,
            price: variantForm.price,
            stock_quantity: variantForm.stock_quantity,
            discount_percentage: variantForm.discount_percentage,
            discount_amount: variantForm.discount_amount,
            is_active: variantForm.is_active,
            is_focused_product: variantForm.is_focused_product,
            focused_type: (variantForm as any).focused_type || null,
            focused_due_date: variantForm.focused_due_date || null,
            focused_target_quantity: variantForm.focused_target_quantity || 0,
            focused_territories: variantForm.focused_territories || [],
            focused_recurring_config: (variantForm as any).focused_recurring_config || null,
            barcode: variantForm.barcode || null,
            qr_code: qrCode,
            barcode_image_url: (variantForm as any).barcode_image_url || null,
            variant_type: (variantForm as any).variant_type || 'Other',
            uom_id: (variantForm as any).uom_id || null,
            variant_weight_g: (variantForm as any).variant_weight_g,
            variant_cost: (variantForm as any).variant_cost,
            variant_tax_rate: (variantForm as any).variant_tax_rate,
            is_discontinued: !!(variantForm as any).is_discontinued,
            discontinued_date: (variantForm as any).is_discontinued ? ((variantForm as any).discontinued_date || null) : null
          });
        
        if (error) throw error;
        toast.success('Variant created successfully');
      }
      
      setIsVariantDialogOpen(false);
      setVariantForm(emptyVariantForm());
      fetchVariants();
    } catch (error) {
      console.error('Error saving variant:', error);
      toast.error('Failed to save variant');
    }
  };

  const handleDeleteVariant = async (id: string) => {
    setDeleteConfirm({ open: true, type: 'variant', id, name: 'this variant' });
  };

  const executeDeleteVariant = async (id: string) => {
    try {
      const variantData = variants.find(v => v.id === id);
      if (variantData) {
        await moveToRecycleBin({
          tableName: 'product_variants',
          recordId: id,
          recordData: variantData,
          moduleName: 'Product Variants',
          recordName: variantData.variant_name || 'Variant'
        });
      }
      
      const { error } = await supabase
        .from('product_variants')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Variant moved to recycle bin');
      fetchVariants();
      setDeleteConfirm({ open: false, type: null, id: '', name: '' });
    } catch (error) {
      console.error('Error deleting variant:', error);
      toast.error('Failed to delete variant');
    }
  };

  const handleCategorySubmit = async () => {
    try {
      if (categoryForm.id) {
        const { error } = await supabase
          .from('product_categories')
          .update({
            name: categoryForm.name,
            description: categoryForm.description
          })
          .eq('id', categoryForm.id);
        
        if (error) throw error;
        toast.success('Category updated successfully');
      } else {
        const { error } = await supabase
          .from('product_categories')
          .insert({
            name: categoryForm.name,
            description: categoryForm.description
          });
        
        if (error) throw error;
        toast.success('Category created successfully');
      }
      
      setIsCategoryDialogOpen(false);
      setCategoryForm({ id: '', name: '', description: '' });
      fetchCategories();
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error('Failed to save category');
    }
  };

  const handleExportCsv = () => {
    try {
      const rows = filteredProducts;
      const headers = ['SKU', 'Manufacturer Code', 'Name', 'Category', 'Rate', 'Unit', 'Base Unit', 'Conversion Factor', 'HSN/SAC', 'Barcode', 'Active'];
      const escape = (v: any) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [headers.join(',')];
      for (const p of rows) {
        const catName = categories.find(c => c.id === p.category_id)?.name || '';
        lines.push([p.sku, (p as any).product_number || '', p.name, catName, p.rate, p.unit, p.base_unit, p.conversion_factor, (p as any).hsn_code || '', p.barcode || '', p.is_active ? 'yes' : 'no'].map(escape).join(','));
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} products`);
    } catch (e) {
      console.error(e);
      toast.error('Export failed');
    }
  };

  const handleImportCsv = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length < 2) {
        toast.error('CSV is empty');
        return;
      }
      const parseLine = (line: string): string[] => {
        const out: string[] = [];
        let cur = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (inQ) {
            if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (c === '"') inQ = false;
            else cur += c;
          } else {
            if (c === ',') { out.push(cur); cur = ''; }
            else if (c === '"') inQ = true;
            else cur += c;
          }
        }
        out.push(cur);
        return out;
      };
      const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
      const idx = (n: string) => headers.indexOf(n);
      const sIdx = idx('sku');
      const nIdx = idx('name');
      if (sIdx < 0 || nIdx < 0) {
        toast.error('CSV must contain SKU and Name columns');
        return;
      }
      const toInsert = lines.slice(1).map(parseLine).map((r) => ({
        sku: r[sIdx]?.trim(),
        name: r[nIdx]?.trim(),
        product_number: idx('manufacturer code') >= 0 ? (r[idx('manufacturer code')] || null) : null,
        rate: Number(r[idx('rate')] || 0) || 0,
        unit: r[idx('unit')] || 'piece',
        base_unit_category: normalizeProductBaseUnitCategory(r[idx('base unit')] || 'kg'),
        conversion_factor: Number(r[idx('conversion factor')] || 1) || 1,
        hsn_code: idx('hsn/sac') >= 0 ? (r[idx('hsn/sac')] || null) : null,
        barcode: idx('barcode') >= 0 ? (r[idx('barcode')] || null) : null,
        is_active: (r[idx('active')] || 'yes').toLowerCase() !== 'no',
      })).filter(r => r.sku && r.name);
      if (toInsert.length === 0) {
        toast.error('No valid rows found');
        return;
      }
      toast.loading(`Importing ${toInsert.length} products...`);
      const { error } = await supabase.from('products').insert(toInsert as any);
      if (error) throw error;
      toast.success(`Imported ${toInsert.length} products`);
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error(`Import failed: ${e.message || e}`);
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const handleProductSubmit = async () => {
    setSavingProduct(true);
    try {
      // Generate QR code if not exists
      const qrCode = productForm.qr_code || generateQRCode('product', productForm.sku, productForm.name);
      const baseUnitCategory = normalizeProductBaseUnitCategory(unitsValue.baseCategory || productForm.base_unit);

      let savedProductId = productForm.id;

      if (productForm.id) {
        const { error } = await supabase
          .from('products')
          .update({
            sku: productForm.sku,
            product_number: productForm.product_number || null,
            name: productForm.name,
            description: productForm.description,
            category_id: productForm.category_id || null,
            rate: productForm.rate,
            unit: productForm.unit,
            base_unit_category: baseUnitCategory,
            conversion_factor: productForm.conversion_factor,
            closing_stock: productForm.closing_stock,
            is_active: productForm.is_active,
            sku_image_url: productForm.sku_image_url || null,
            is_focused_product: productForm.is_focused_product,
            focused_due_date: productForm.focused_due_date || null,
            focused_target_quantity: productForm.focused_target_quantity || 0,
            focused_territories: productForm.focused_territories || [],
            barcode: productForm.barcode || null,
            qr_code: qrCode,
            hsn_code: productForm.hsn_code || null,
            product_type: productForm.product_type || 'Finished Good',
            gross_weight_g: productForm.gross_weight_g,
            packaging_weight_g: productForm.packaging_weight_g,
            standard_cost: productForm.standard_cost,
            cost_currency: productForm.cost_currency || 'INR',
            reorder_quantity: productForm.reorder_quantity,
            primary_supplier_id: productForm.primary_supplier_id,
            manufacturer: productForm.manufacturer || null,
            country_of_origin: productForm.country_of_origin || null,
            is_discontinued: productForm.is_discontinued || false,
            discontinued_date: productForm.is_discontinued ? productForm.discontinued_date : null,
            discontinuation_reason: productForm.is_discontinued ? (productForm.discontinuation_reason || null) : null
          })
          .eq('id', productForm.id);

        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from('products')
          .insert({
            sku: productForm.sku,
            product_number: productForm.product_number || null,
            name: productForm.name,
            description: productForm.description,
            category_id: productForm.category_id || null,
            rate: productForm.rate,
            unit: productForm.unit,
            base_unit_category: baseUnitCategory,
            conversion_factor: productForm.conversion_factor,
            closing_stock: productForm.closing_stock,
            is_active: productForm.is_active,
            sku_image_url: productForm.sku_image_url || null,
            is_focused_product: productForm.is_focused_product,
            focused_due_date: productForm.focused_due_date || null,
            focused_target_quantity: productForm.focused_target_quantity || 0,
            focused_territories: productForm.focused_territories || [],
            barcode: productForm.barcode || null,
            qr_code: qrCode,
            hsn_code: productForm.hsn_code || null,
            product_type: productForm.product_type || 'Finished Good',
            gross_weight_g: productForm.gross_weight_g,
            packaging_weight_g: productForm.packaging_weight_g,
            standard_cost: productForm.standard_cost,
            cost_currency: productForm.cost_currency || 'INR',
            reorder_quantity: productForm.reorder_quantity,
            primary_supplier_id: productForm.primary_supplier_id,
            manufacturer: productForm.manufacturer || null,
            country_of_origin: productForm.country_of_origin || null,
            is_discontinued: productForm.is_discontinued || false,
            discontinued_date: productForm.is_discontinued ? productForm.discontinued_date : null,
            discontinuation_reason: productForm.is_discontinued ? (productForm.discontinuation_reason || null) : null
          })
          .select('id')
          .single();

        if (error) throw error;
        savedProductId = inserted?.id ?? '';
      }

      // Persist Step 1 + Step 2 unit configuration to product_uom_mapping.
      // Only run when the user actually touched the editor (rows present OR
      // a Step-1 selection made) — keeps legacy products that were saved
      // before this editor existed unaffected.
      const editorTouched =
        unitsValue.rows.length > 0 ||
        !!unitsValue.priceBasisCode ||
        !!unitsValue.defaultSalesCode;

      if (editorTouched && savedProductId) {
        try {
          await reconcileProductUomMapping(savedProductId, unitsValue);
        } catch (uomErr: any) {
          console.error('UoM reconcile failed:', uomErr);
          toast.error(uomErr?.message ?? 'Failed to save unit configuration');
          // Don't bail entirely — the product itself saved successfully.
        }
      }

      toast.success(productForm.id ? 'Product updated successfully' : 'Product created successfully');

      setIsProductDialogOpen(false);
      setProductForm(emptyProductForm());
      setUnitsValue(emptyProductUnitsEditorValue());
      fetchProducts();
    } catch (error: any) {
      console.error('Error saving product:', error);
      toast.error(error?.message || 'Failed to save product');
    } finally {
      setSavingProduct(false);
    }
  };

  const processProductPhoto = async (file: File) => {
    setUploadingPhoto(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('product-photos')
        .getPublicUrl(filePath);

      setProductForm(prev => ({ ...prev, sku_image_url: publicUrl }));
      toast.success('Product photo uploaded successfully');
    } catch (error) {
      console.error('Error uploading product photo:', error);
      toast.error('Failed to upload product photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSkuImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processProductPhoto(file);
  };

  const handleCameraCapture = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        await processProductPhoto(file);
      }
    };
    input.click();
    setShowPhotoOptions(false);
  };

  const handleGalleryUpload = () => {
    const input = document.getElementById('sku-image') as HTMLInputElement;
    input?.click();
    setShowPhotoOptions(false);
  };


  const handleDeleteCategory = async (id: string, name: string) => {
    setDeleteConfirm({ open: true, type: 'category', id, name });
  };

  const executeDeleteCategory = async (id: string) => {
    try {
      const categoryData = categories.find(c => c.id === id);
      if (categoryData) {
        await moveToRecycleBin({
          tableName: 'product_categories',
          recordId: id,
          recordData: categoryData,
          moduleName: 'Product Categories',
          recordName: categoryData.name
        });
      }
      
      const { error } = await supabase
        .from('product_categories')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Category moved to recycle bin');
      fetchCategories();
      setDeleteConfirm({ open: false, type: null, id: '', name: '' });
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category');
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    setDeleteConfirm({ open: true, type: 'product', id, name });
  };

  const executeDeleteProduct = async (id: string) => {
    try {
      const productData = products.find(p => p.id === id);
      if (productData) {
        await moveToRecycleBin({
          tableName: 'products',
          recordId: id,
          recordData: productData,
          moduleName: 'Products',
          recordName: productData.name
        });
      }
      
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Product moved to recycle bin');
      fetchProducts();
      setDeleteConfirm({ open: false, type: null, id: '', name: '' });
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Failed to delete product');
    }
  };


  const productStatusMatches = (isActive: boolean | null | undefined) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return isActive !== false;
    return isActive === false;
  };

  const activeProductsCount = products.filter(p => p.is_active !== false).length;
  const inactiveProductsCount = products.filter(p => p.is_active === false).length;

  const filteredProducts = products.filter(product => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      product.name.toLowerCase().includes(q) ||
      product.sku.toLowerCase().includes(q);
    return matchesSearch && productStatusMatches(product.is_active);
  });

  const productsPagination = usePagination(filteredProducts, { pageSize: 15 });

  useEffect(() => {
    productsPagination.goToPage(1);
  }, [searchQuery, statusFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">

          <Tabs defaultValue="products" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="products" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Products & SKUs
              </TabsTrigger>
              <TabsTrigger value="categories" className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Categories
              </TabsTrigger>
            </TabsList>

            <TabsContent value="products" className="space-y-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search products or SKUs..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 w-80"
                    />
                  </div>
                  <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'active' | 'inactive' | 'all')}>
                    <TabsList>
                      <TabsTrigger value="active">Active ({activeProductsCount})</TabsTrigger>
                      <TabsTrigger value="inactive">Inactive ({inactiveProductsCount})</TabsTrigger>
                      <TabsTrigger value="all">All ({products.length})</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Badge variant="secondary" className="rounded-full">
                    Showing: {filteredProducts.length}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="outline" onClick={() => navigate('/admin/uom-master')}>
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    UoM Master
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      toast.loading('Syncing products...');
                      fetchData();
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync
                  </Button>
                  <Button variant="outline" onClick={() => importInputRef.current?.click()}>
                    <FileText className="h-4 w-4 mr-2" />
                    Import Product Data
                  </Button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => handleImportCsv(e.target.files?.[0])}
                  />
                  <Button variant="outline" onClick={handleExportCsv}>
                    <Download className="h-4 w-4 mr-2" />
                    Export Products
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteConfirm({ open: true, type: 'all-products', id: 'all', name: 'ALL active products and variants' })}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete All
                  </Button>
                  <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={() => {
                        setUnitsValue(emptyProductUnitsEditorValue());
                        setProductForm(emptyProductForm());
                      }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Product
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                      <DialogTitle>{productForm.id ? 'Edit Product' : 'Add New Product'}</DialogTitle>
                      <DialogDescription>
                        {productForm.id ? 'Update product details' : 'Add a new product to your catalog'}
                      </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="flex-1 overflow-y-auto pr-2">
                      <div className="p-1 space-y-6">
                        <ProductFormFields
                          form={productForm}
                          categories={categories}
                          territories={territories}
                          onFormChange={(updates) => setProductForm({ ...productForm, ...updates })}
                        />
                        <ProductExtendedFields
                          form={productForm}
                          onFormChange={(updates) => setProductForm({ ...productForm, ...updates })}
                        />
                        <ProductUnitsEditor
                          value={unitsValue}
                          onChange={setUnitsValue}
                          productRate={productForm.rate}
                        />
                      </div>
                     </ScrollArea>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsProductDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleProductSubmit} disabled={savingProduct}>
                        {savingProduct ? 'Saving…' : productForm.id ? 'Update' : 'Create'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                  </Dialog>
                </div>
              </div>

              <div className="h-[400px] rounded-md border overflow-auto">
                <Table className="min-w-[1100px]">

                  <TableHeader>
                    <TableRow>
                      <TableHead>Image</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Rate per Unit</TableHead>
                      <TableHead>Rate per KG</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>HSN/SAC</TableHead>
                      <TableHead>Variants</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productsPagination.paginatedItems.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          {(product as any).sku_image_url ? (
                            <img 
                              src={(product as any).sku_image_url} 
                              alt={product.name}
                              className="w-12 h-12 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => {
                                setProductForm(emptyProductForm());
                                setIsProductDialogOpen(true);
                              }}
                            />
                          ) : (
                            <div 
                              className="w-12 h-12 bg-muted rounded border flex items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors"
                              onClick={() => {
                                setProductForm(emptyProductForm());
                                setIsProductDialogOpen(true);
                              }}
                            >
                              <Package className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono">{product.sku}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{product.name}</span>
                            {product.is_focused_product && (
                              <Badge variant="default" className="text-xs bg-orange-500 hover:bg-orange-600">
                                Focused
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{product.category?.name}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">₹{(product.rate * (product.conversion_factor || 1)).toFixed(2)}</div>
                            <div className="text-xs text-muted-foreground">per {product.unit}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">₹{product.rate.toFixed(2)}</div>
                            <div className="text-xs text-muted-foreground">per {product.base_unit || 'kg'}</div>
                          </div>
                        </TableCell>
                        <TableCell>{product.unit}</TableCell>
                        <TableCell className="font-mono text-sm">{(product as any).hsn_code || '-'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {variants.filter(v => v.product_id === product.id).length} variants
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedProductForVariants(product.id);
                                setIsVariantsViewOpen(true);
                              }}
                            >
                              <Grid3X3 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={product.is_active ? 'default' : 'secondary'}>
                            {product.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setProductForm({
                                  ...emptyProductForm(),
                                  id: product.id,
                                  sku: product.sku,
                                  product_number: product.product_number || '',
                                  name: product.name,
                                  description: product.description || '',
                                  category_id: product.category_id || '',
                                  is_focused_product: product.is_focused_product || false,
                                  focused_type: (product as any).focused_type || undefined,
                                  focused_due_date: product.focused_due_date || '',
                                  focused_target_quantity: product.focused_target_quantity || 0,
                                  focused_territories: product.focused_territories || [],
                                  focused_recurring_config: (product as any).focused_recurring_config || undefined,
                                  rate: product.rate,
                                  unit: product.unit,
                                  base_unit: (product as any).base_unit || 'kg',
                                  conversion_factor: (product as any).conversion_factor || 1,
                                  closing_stock: product.closing_stock,
                                  is_active: product.is_active,
                                  sku_image_url: (product as any).sku_image_url || '',
                                  barcode: (product as any).barcode || '',
                                  barcode_image_url: (product as any).barcode_image_url || '',
                                  qr_code: (product as any).qr_code || '',
                                  hsn_code: (product as any).hsn_code || '',
                                  product_type: (product as any).product_type || 'Finished Good',
                                  gross_weight_g: (product as any).gross_weight_g ?? null,
                                  packaging_weight_g: (product as any).packaging_weight_g ?? null,
                                  standard_cost: (product as any).standard_cost ?? null,
                                  cost_currency: (product as any).cost_currency || 'INR',
                                  reorder_quantity: (product as any).reorder_quantity ?? null,
                                  last_cost_update: (product as any).last_cost_update ?? null,
                                  primary_supplier_id: (product as any).primary_supplier_id ?? null,
                                  manufacturer: (product as any).manufacturer || '',
                                  country_of_origin: (product as any).country_of_origin || '',
                                  is_discontinued: (product as any).is_discontinued || false,
                                  discontinued_date: (product as any).discontinued_date ?? null,
                                  discontinuation_reason: (product as any).discontinuation_reason || '',
                                  created_by: (product as any).created_by ?? null,
                                  updated_by: (product as any).updated_by ?? null,
                                });
                                setUnitsValue(emptyProductUnitsEditorValue());
                                setIsProductDialogOpen(true);
                                hydrateUnitsEditorFromProduct(product.id)
                                  .then((v) => { if (v) setUnitsValue(v); })
                                  .catch((e) => console.error('Hydrate UoM editor failed:', e));
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteProduct(product.id, product.name)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              <PaginationControls
                currentPage={productsPagination.currentPage}
                totalPages={productsPagination.totalPages}
                startIndex={productsPagination.startIndex}
                endIndex={productsPagination.endIndex}
                totalItems={productsPagination.totalItems}
                hasNextPage={productsPagination.hasNextPage}
                hasPrevPage={productsPagination.hasPrevPage}
                onNextPage={productsPagination.nextPage}
                onPrevPage={productsPagination.prevPage}
                onGoToPage={productsPagination.goToPage}
              />
            </TabsContent>

            <TabsContent value="categories" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Product Categories</h3>
                <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => setCategoryForm({ id: '', name: '', description: '' })}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Category
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{categoryForm.id ? 'Edit Category' : 'Add New Category'}</DialogTitle>
                      <DialogDescription>
                        {categoryForm.id ? 'Update category details' : 'Create a new product category'}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="categoryName">Name</Label>
                        <Input
                          id="categoryName"
                          value={categoryForm.name}
                          onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                          placeholder="Enter category name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="categoryDescription">Description</Label>
                        <Textarea
                          id="categoryDescription"
                          value={categoryForm.description}
                          onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                          placeholder="Enter category description"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCategorySubmit}>
                        {categoryForm.id ? 'Update' : 'Create'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <ScrollArea className="h-[400px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((category) => (
                      <TableRow key={category.id}>
                        <TableCell className="font-medium">{category.name}</TableCell>
                        <TableCell>{category.description}</TableCell>
                        <TableCell>
                          {products.filter(p => p.category_id === category.id).length} products
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setCategoryForm({
                                  id: category.id,
                                  name: category.name,
                                  description: category.description || ''
                                });
                                setIsCategoryDialogOpen(true);
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteCategory(category.id, category.name)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>

          </Tabs>
        </CardContent>
      </Card>

      {/* Product Variants Management Dialog */}
      <Dialog open={isVariantsViewOpen} onOpenChange={setIsVariantsViewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Grid3X3 className="h-5 w-5" />
              Product Variants
              {selectedProductForVariants && (
                <span className="text-sm font-normal text-muted-foreground">
                  - {products.find(p => p.id === selectedProductForVariants)?.name}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Manage variants for the selected product with different sizes, prices, and stock
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-4">
            <div className="flex justify-end">
              <Dialog open={isVariantDialogOpen} onOpenChange={setIsVariantDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    onClick={() => setVariantForm({
                      id: '',
                      product_id: selectedProductForVariants,
                      variant_name: '',
                      sku: '',
                      product_number: '',
                      description: '',
                      base_unit: 'kg',
                      unit: 'piece',
                      conversion_factor: 1,
                      price: 0,
                      stock_quantity: 0,
                      hsn_code: '90230',
                      discount_percentage: 0,
                      discount_amount: 0,
                      is_active: true,
                      is_focused_product: false,
                      focused_type: undefined,
                      focused_due_date: '',
                      focused_target_quantity: 0,
                      focused_territories: [],
                      focused_recurring_config: undefined,
                      barcode: '',
                      qr_code: ''
                    } as any)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Variant
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh]">
                  <DialogHeader>
                    <DialogTitle>{variantForm.id ? 'Edit Variant' : 'Add New Variant'}</DialogTitle>
                    <DialogDescription>
                      {variantForm.id ? 'Update variant details' : 'Create a new product variant'}
                    </DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="h-[calc(90vh-180px)]">
                    <div className="space-y-4 pr-4">
                    {/* Active toggle at top like product form */}
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="variantActive"
                        checked={variantForm.is_active}
                        onCheckedChange={(checked) => setVariantForm({ ...variantForm, is_active: checked === true })}
                      />
                      <Label htmlFor="variantActive">Active</Label>
                    </div>

                    {/* SKU and Product Number in 2 columns like product form */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="variantSku">SKU *</Label>
                        <Input
                          id="variantSku"
                          value={variantForm.sku}
                          onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })}
                          placeholder="Enter SKU"
                        />
                      </div>
                      <div>
                        <Label htmlFor="variantProductNumber">Product Number</Label>
                        <Input
                          id="variantProductNumber"
                          value={variantForm.product_number || ''}
                          onChange={(e) => setVariantForm({ ...variantForm, product_number: e.target.value })}
                          placeholder="Enter product number"
                        />
                      </div>
                    </div>

                    {/* Variant Name (full width like product name) */}
                    <div>
                      <Label htmlFor="variantName">Variant Name *</Label>
                      <Input
                        id="variantName"
                        value={variantForm.variant_name}
                        onChange={(e) => setVariantForm({ ...variantForm, variant_name: e.target.value })}
                        placeholder="Enter variant name"
                      />
                    </div>

                    {/* Description (full width like product description) */}
                    <div>
                      <Label htmlFor="variantDescription">Description</Label>
                      <Textarea
                        id="variantDescription"
                        value={variantForm.description || ''}
                        onChange={(e) => setVariantForm({ ...variantForm, description: e.target.value })}
                        placeholder="Enter variant description"
                        rows={3}
                      />
                    </div>

                    {/* Units in 3 columns like product form */}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="variantBaseUnit">Base Unit</Label>
                        <Select 
                          value={variantForm.base_unit || 'kg'} 
                          onValueChange={(value) => setVariantForm({ ...variantForm, base_unit: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="kg">Kilogram (kg)</SelectItem>
                            <SelectItem value="ltr">Liter (ltr)</SelectItem>
                            <SelectItem value="pcs">Pieces (pcs)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="variantUnit">Unit *</Label>
                        <Select 
                          value={variantForm.unit || 'piece'} 
                          onValueChange={(value) => setVariantForm({ ...variantForm, unit: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="kg">Kilogram (kg)</SelectItem>
                            <SelectItem value="ltr">Liter (ltr)</SelectItem>
                            <SelectItem value="pcs">Pieces (pcs)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="variantConversionFactor">Conversion Factor</Label>
                        <Input
                          id="variantConversionFactor"
                          type="number"
                          step="0.01"
                          value={variantForm.conversion_factor || 1}
                          onChange={(e) => setVariantForm({ ...variantForm, conversion_factor: parseFloat(e.target.value) || 1 })}
                          placeholder="1"
                        />
                      </div>
                    </div>

                    {/* Price and Stock in 2 columns */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="variantPrice">Rate (₹) *</Label>
                        <Input
                          id="variantPrice"
                          type="number"
                          step="0.01"
                          value={variantForm.price}
                          onChange={(e) => {
                            const price = parseFloat(e.target.value) || 0;
                            const discountAmount = (price * variantForm.discount_percentage) / 100;
                            setVariantForm({ 
                              ...variantForm, 
                              price,
                              discount_amount: Number(discountAmount.toFixed(2))
                            });
                          }}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label htmlFor="variantStock">Closing Stock</Label>
                        <Input
                          id="variantStock"
                          type="number"
                          value={variantForm.stock_quantity}
                          onChange={(e) => setVariantForm({ ...variantForm, stock_quantity: parseInt(e.target.value) || 0 })}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    {/* HSN Code (full width) */}
                    <div>
                      <Label htmlFor="variantHsnCode">HSN/SAC Code</Label>
                      <Input
                        id="variantHsnCode"
                        value={variantForm.hsn_code || ''}
                        onChange={(e) => setVariantForm({ ...variantForm, hsn_code: e.target.value })}
                        placeholder="Enter HSN/SAC code"
                      />
                    </div>

                    {/* Barcode (full width) */}
                    <div>
                      <Label htmlFor="variantBarcode">Barcode</Label>
                      <Input
                        id="variantBarcode"
                        value={variantForm.barcode || ''}
                        onChange={(e) => setVariantForm({ ...variantForm, barcode: e.target.value })}
                        placeholder="Enter barcode"
                      />
                    </div>

                    {/* Discount in 2 columns */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="discountPerc">Discount %</Label>
                        <Input
                          id="discountPerc"
                          type="number"
                          value={variantForm.discount_percentage}
                          onChange={(e) => {
                            const percentage = parseFloat(e.target.value) || 0;
                            const discountAmount = (variantForm.price * percentage) / 100;
                            setVariantForm({ 
                              ...variantForm, 
                              discount_percentage: percentage,
                              discount_amount: Number(discountAmount.toFixed(2))
                            });
                          }}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <Label htmlFor="discountAmt">Discount Amount (₹)</Label>
                        <Input
                          id="discountAmt"
                          type="number"
                          value={variantForm.discount_amount}
                          onChange={(e) => setVariantForm({ ...variantForm, discount_amount: parseFloat(e.target.value) || 0 })}
                          placeholder="0"
                          readOnly
                          className="bg-muted"
                        />
                      </div>
                    </div>

                    {/* Focused Product Section for Variants */}
                    <VariantFocusedFields
                      isFocused={variantForm.is_focused_product || false}
                      focusedType={(variantForm as any).focused_type}
                      focusedDueDate={variantForm.focused_due_date || ''}
                      focusedTargetQuantity={variantForm.focused_target_quantity || 0}
                      focusedTerritories={variantForm.focused_territories || []}
                      focusedRecurringConfig={(variantForm as any).focused_recurring_config}
                      territories={territories}
                      onIsFocusedChange={(value) => setVariantForm({ ...variantForm, is_focused_product: value })}
                      onFocusedTypeChange={(value) => setVariantForm({ ...variantForm, focused_type: value } as any)}
                      onFocusedDueDateChange={(value) => setVariantForm({ ...variantForm, focused_due_date: value })}
                      onFocusedTargetQuantityChange={(value) => setVariantForm({ ...variantForm, focused_target_quantity: value })}
                      onFocusedTerritoriesChange={(value) => setVariantForm({ ...variantForm, focused_territories: value })}
                      onFocusedRecurringConfigChange={(value) => setVariantForm({ ...variantForm, focused_recurring_config: value } as any)}
                    />

                    {/* Extended Variant Fields: Classification, UoM, Cost/Tax overrides, Barcode image, Lifecycle */}
                    {(() => {
                      const parent: any = products.find((p) => p.id === variantForm.product_id) || {};
                      return (
                        <VariantExtendedFields
                          form={{
                            variant_type: (variantForm as any).variant_type,
                            uom_id: (variantForm as any).uom_id,
                            variant_weight_g: (variantForm as any).variant_weight_g,
                            variant_cost: (variantForm as any).variant_cost,
                            variant_tax_rate: (variantForm as any).variant_tax_rate,
                            is_discontinued: (variantForm as any).is_discontinued,
                            discontinued_date: (variantForm as any).discontinued_date,
                            barcode_image_url: (variantForm as any).barcode_image_url,
                            qr_code: (variantForm as any).qr_code,
                          }}
                          inherited={{
                            uomLabel: parent.uom_id ? undefined : (parent.unit || parent.base_unit),
                            cost: parent.standard_cost ?? null,
                            costCurrency: parent.cost_currency || 'INR',
                            taxRate: parent.tax_rate ?? null,
                          }}
                          onFormChange={(updates) => setVariantForm({ ...variantForm, ...updates } as any)}
                        />
                      );
                    })()}
                    </div>
                  </ScrollArea>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsVariantDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleVariantSubmit}>
                      {variantForm.id ? 'Update' : 'Create'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Variants Table */}
            <ScrollArea className="h-[400px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Variant Name</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variants.filter(v => v.product_id === selectedProductForVariants && productStatusMatches(v.is_active)).map((variant) => (
                    <TableRow key={variant.id}>
                      <TableCell className="font-mono">{variant.sku}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{variant.variant_name}</span>
                          {variant.is_focused_product && (
                            <Badge variant="default" className="text-xs bg-orange-500 hover:bg-orange-600">
                              Focused
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>₹{variant.price.toFixed(2)}</TableCell>
                      <TableCell>{variant.stock_quantity}</TableCell>
                      <TableCell>
                        {variant.discount_percentage > 0 && (
                          <Badge variant="secondary">
                            {variant.discount_percentage}% (₹{variant.discount_amount})
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={variant.is_active ? 'default' : 'secondary'}>
                          {variant.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setVariantForm({
                                ...variant,
                                product_number: (variant as any).product_number || '',
                                description: (variant as any).description || '',
                                base_unit: (variant as any).base_unit || 'kg',
                                unit: (variant as any).unit || 'piece',
                                conversion_factor: (variant as any).conversion_factor || 1,
                                hsn_code: (variant as any).hsn_code || '',
                                is_focused_product: variant.is_focused_product || false,
                                focused_type: (variant as any).focused_type || undefined,
                                focused_due_date: variant.focused_due_date || '',
                                focused_target_quantity: variant.focused_target_quantity || 0,
                                focused_territories: variant.focused_territories || [],
                                focused_recurring_config: (variant as any).focused_recurring_config || undefined,
                                barcode: variant.barcode || '',
                                qr_code: variant.qr_code || '',
                                barcode_image_url: (variant as any).barcode_image_url || null,
                                variant_type: (variant as any).variant_type || 'Other',
                                uom_id: (variant as any).uom_id || null,
                                variant_weight_g: (variant as any).variant_weight_g ?? null,
                                variant_cost: (variant as any).variant_cost ?? null,
                                variant_tax_rate: (variant as any).variant_tax_rate ?? null,
                                is_discontinued: !!(variant as any).is_discontinued,
                                discontinued_date: (variant as any).discontinued_date || null
                              });
                              setIsVariantDialogOpen(true);
                            }}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteVariant(variant.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            
            {variants.filter(v => v.product_id === selectedProductForVariants && productStatusMatches(v.is_active)).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Grid3X3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No variants created yet</p>
                <p className="text-sm">Create variants to manage different sizes and pricing</p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsVariantsViewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => !open && setDeleteConfirm({ open: false, type: null, id: '', name: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm.type === 'all-products' ? (
                <>This will <strong>deactivate {deleteConfirm.name}</strong> (set <em>is_active = false</em>). Order history, distributor inventory, and schemes are preserved. Products can be reactivated individually later.</>
              ) : (
                <>This action cannot be undone. This will permanently delete <strong>{deleteConfirm.name}</strong>.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirm({ open: false, type: null, id: '', name: '' })}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteConfirm.type === 'all-products' ? 'Yes, Deactivate All' : 'Yes, Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProductManagement;
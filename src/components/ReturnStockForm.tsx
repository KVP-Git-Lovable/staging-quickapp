import { useState, useEffect, useMemo } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent } from './ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Package, Plus, ChevronsUpDown, FileText, Trash2, Loader2, ArrowLeft, ArrowRight, CheckCircle2, Download, RotateCcw, Clock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { generateCreditNotePDF, CreditNoteItem, CreditNoteData } from '@/utils/creditNoteGenerator';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { cn } from '@/lib/utils';
import { useOfflineOrderEntry } from '@/hooks/useOfflineOrderEntry';

interface ProductVariant {
  id: string;
  variant_name: string;
  sku: string;
  price: number;
}

interface Product {
  id: string;
  name: string;
  unit: string;
  rate: number;
  sku?: string;
  hsn_code?: string;
  category?: string;
  variants?: ProductVariant[];
}

interface ReturnableLine {
  order_id: string;
  invoice_number: string;
  order_date: string | null;
  sold_qty: number;
  rate: number;
  line_taxable: number;
  cgst_amount: number;
  sgst_amount: number;
  returnable: number;
}

interface ReturnItem {
  productId: string;
  variantId?: string;
  productName: string;
  variantName?: string;
  hsnCode: string;
  unit: string;
  barcode?: string;
  // Linked invoice line (anchored)
  orderId: string;
  invoiceNumber: string;
  soldQty: number;
  rate: number; // original net unit price
  lineTaxableOriginal: number;
  cgstLineOriginal: number;
  sgstLineOriginal: number;
  // Return
  returnQuantity: number;
  returnReason: string;
  // Derived
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  total: number;
}

interface ReturnStockFormProps {
  visitId: string;
  retailerId: string;
  retailerName: string;
  onComplete: () => void;
}

const returnReasons = ['Damaged', 'Expired', 'Wrong Product', 'Quality Issue', 'Excess Stock', 'Customer Return', 'Other'];

const reasonMap: Record<string, string> = {
  Damaged: 'damaged',
  Expired: 'expired',
  'Wrong Product': 'quality_issue',
  'Quality Issue': 'quality_issue',
  'Excess Stock': 'unsold_stock',
  'Customer Return': 'unsold_stock',
  Other: 'other',
};

function deriveLine(line: ReturnableLine, returnQty: number) {
  const taxableAmount = +(line.rate * returnQty).toFixed(2);
  const ratio = line.sold_qty > 0 ? returnQty / line.sold_qty : 0;
  const cgstAmount = +((Number(line.cgst_amount) || 0) * ratio).toFixed(2);
  const sgstAmount = +((Number(line.sgst_amount) || 0) * ratio).toFixed(2);
  const total = +(taxableAmount + cgstAmount + sgstAmount).toFixed(2);
  return { taxableAmount, cgstAmount, sgstAmount, total };
}

export function ReturnStockForm({ visitId, retailerId, retailerName, onComplete }: ReturnStockFormProps) {
  const { products: cachedProducts, loading: cacheLoading, fetchProducts } = useOfflineOrderEntry();
  const [products, setProducts] = useState<Product[]>([]);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingCN, setGeneratingCN] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 3 state
  const [creditNoteNumber, setCreditNoteNumber] = useState('');
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);

  // Step 1 form state
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [returnableLines, setReturnableLines] = useState<ReturnableLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<string>(''); // order_id
  const [returnQuantity, setReturnQuantity] = useState<number>(0);
  const [returnReason, setReturnReason] = useState<string>('');
  const [otherReason, setOtherReason] = useState<string>('');

  // Date filter for invoice-line picker (client-side, over already-loaded returnableLines)
  type FilterMode = 'all' | 'relative' | 'specific';
  type RelUnit = 'day' | 'week' | 'month' | 'year';
  type RelDir = 'within' | 'older';
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [relN, setRelN] = useState<number>(6);
  const [relUnit, setRelUnit] = useState<RelUnit>('month');
  const [relDir, setRelDir] = useState<RelDir>('within');
  const [specificDate, setSpecificDate] = useState<string>(''); // yyyy-mm-dd

  // Reset filter whenever product changes
  useEffect(() => {
    setFilterMode('all');
    setRelN(6);
    setRelUnit('month');
    setRelDir('within');
    setSpecificDate('');
  }, [selectedProduct]);

  const displayedLines = useMemo(() => {
    if (filterMode === 'all') return returnableLines;
    if (filterMode === 'specific') {
      if (!specificDate) return returnableLines;
      return returnableLines.filter(l => {
        if (!l.order_date) return false;
        const d = new Date(l.order_date);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}` === specificDate;
      });
    }
    // relative
    const n = Math.max(0, Math.floor(relN || 0));
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    if (relUnit === 'day') cutoff.setDate(cutoff.getDate() - n);
    else if (relUnit === 'week') cutoff.setDate(cutoff.getDate() - n * 7);
    else if (relUnit === 'month') cutoff.setMonth(cutoff.getMonth() - n);
    else if (relUnit === 'year') cutoff.setFullYear(cutoff.getFullYear() - n);
    return returnableLines.filter(l => {
      if (!l.order_date) return false;
      const d = new Date(l.order_date);
      return relDir === 'within' ? d >= cutoff : d < cutoff;
    });
  }, [filterMode, returnableLines, relN, relUnit, relDir, specificDate]);

  // If currently selected line is filtered out, clear selection (or pick first)
  useEffect(() => {
    if (!selectedLineId) return;
    if (!displayedLines.some(l => l.order_id === selectedLineId)) {
      setSelectedLineId(displayedLines[0]?.order_id || '');
    }
  }, [displayedLines, selectedLineId]);

  useEffect(() => {
    fetchProducts().catch(err => {
      console.error('[ReturnStockForm] fetchProducts failed', err);
      toast.error('Failed to load products');
    });
  }, [fetchProducts]);

  useEffect(() => {
    if (!cachedProducts) return;
    const mapped: Product[] = (cachedProducts as any[]).map(p => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      rate: Number(p.rate ?? 0),
      sku: p.sku || undefined,
      hsn_code: (p as any).hsn_code || undefined,
      category: p.category?.name || undefined,
      variants: ((p.variants || []) as any[]).map(v => ({
        id: v.id,
        variant_name: v.variant_name,
        sku: v.sku,
        price: Number(v.price ?? v.rate ?? 0),
      })) as ProductVariant[],
    }));
    setProducts(mapped);
    setLoading(cacheLoading && mapped.length === 0);
  }, [cachedProducts, cacheLoading]);

  // When product changes, load returnable invoice lines for that retailer/product/variant
  useEffect(() => {
    setReturnableLines([]);
    setSelectedLineId('');
    setReturnQuantity(0);
    if (!selectedProduct) return;

    const [productId, variantId] = selectedProduct.split('_variant_');
    let cancelled = false;
    (async () => {
      setLoadingLines(true);
      const { data, error } = await supabase.rpc('get_returnable_lines', {
        p_retailer_id: retailerId,
        p_product_id: productId,
        p_variant_id: variantId || null,
      });
      if (cancelled) return;
      if (error) {
        console.error('[ReturnStockForm] get_returnable_lines error', error);
        toast.error('Could not load returnable invoices');
        setReturnableLines([]);
      } else {
        const lines = ((data || []) as any[]).map(l => ({
          order_id: l.order_id,
          invoice_number: l.invoice_number || '',
          order_date: l.order_date,
          sold_qty: Number(l.sold_qty) || 0,
          rate: Number(l.rate) || 0,
          line_taxable: Number(l.line_taxable) || 0,
          cgst_amount: Number(l.cgst_amount) || 0,
          sgst_amount: Number(l.sgst_amount) || 0,
          returnable: Number(l.returnable) || 0,
        })) as ReturnableLine[];
        setReturnableLines(lines);
        if (lines.length > 0) setSelectedLineId(lines[0].order_id);
      }
      setLoadingLines(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedProduct, retailerId]);

  const selectedLine = returnableLines.find(l => l.order_id === selectedLineId);
  const maxReturnQty = selectedLine?.returnable ?? 0;
  const qtyOverMax = selectedLine ? returnQuantity > maxReturnQty + 1e-6 : false;

  const handleAddReturn = () => {
    const errors: string[] = [];
    if (!selectedProduct) errors.push('select a product');
    if (!selectedLine) errors.push('select an invoice line');
    if (returnQuantity <= 0) errors.push('enter a valid quantity');
    if (qtyOverMax) errors.push(`quantity cannot exceed returnable (${maxReturnQty})`);
    if (!returnReason) errors.push('select a return reason');
    if (returnReason === 'Other' && !otherReason.trim()) errors.push('enter the reason for returning');

    if (errors.length > 0) {
      toast.error(`Please ${errors.join(', ')}`);
      return;
    }

    const [productId, variantId] = selectedProduct.split('_variant_');
    const product = products.find(p => p.id === productId);
    if (!product || !selectedLine) return;
    const variant = variantId ? product.variants?.find(v => v.id === variantId) : undefined;

    // Prevent adding duplicate (same product+variant+invoice line)
    const dupe = returnItems.find(
      i => i.productId === productId && (i.variantId || '') === (variantId || '') && i.orderId === selectedLine.order_id,
    );
    if (dupe) {
      toast.error('This invoice line is already added — remove it first or pick another.');
      return;
    }

    const derived = deriveLine(selectedLine, returnQuantity);

    const newItem: ReturnItem = {
      productId,
      variantId: variantId || undefined,
      productName: product.name,
      variantName: variant?.variant_name,
      hsnCode: product.hsn_code || '',
      unit: product.unit || 'Piece',
      barcode: product.sku || undefined,
      orderId: selectedLine.order_id,
      invoiceNumber: selectedLine.invoice_number,
      soldQty: selectedLine.sold_qty,
      rate: selectedLine.rate,
      lineTaxableOriginal: selectedLine.line_taxable,
      cgstLineOriginal: selectedLine.cgst_amount,
      sgstLineOriginal: selectedLine.sgst_amount,
      returnQuantity,
      returnReason: returnReason === 'Other' ? `Other: ${otherReason.trim()}` : returnReason,
      ...derived,
    };

    setReturnItems(prev => [...prev, newItem]);
    setSelectedProduct('');
    setSelectedLineId('');
    setReturnableLines([]);
    setReturnQuantity(0);
    setReturnReason('');
    setOtherReason('');
    toast.success(`Added ${newItem.productName}${newItem.variantName ? ` - ${newItem.variantName}` : ''}`);
  };

  const handleRemoveItem = (index: number) => {
    setReturnItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleGoToStep2 = () => {
    if (returnItems.length === 0) return;
    setStep(2);
  };

  const handleGenerateCreditNote = async () => {
    if (returnItems.length === 0) {
      toast.error('No items added for return');
      return;
    }
    setGeneratingCN(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Pick a dominant reason; if all same, use that; else 'Mixed'.
      const reasonsSet = new Set(returnItems.map(i => i.returnReason.split(':')[0].trim()));
      const dominantReason = reasonsSet.size === 1 ? Array.from(reasonsSet)[0] : 'Mixed';
      const reasonForRpc = reasonMap[dominantReason] || 'other';
      const reasonNotes = returnItems
        .map(i => `${i.productName} (INV ${i.invoiceNumber || 'N/A'}): ${i.returnReason} × ${i.returnQuantity}`)
        .join('; ');

      const p_lines = returnItems.map(i => ({
        original_order_id: i.orderId,
        product_id: i.productId,
        variant_id: i.variantId || null,
        product_name: i.variantName ? `${i.productName} - ${i.variantName}` : i.productName,
        hsn_code: i.hsnCode,
        unit: i.unit,
        quantity: i.returnQuantity,
        rate: i.rate,
        total: i.total,
        taxable_amount: i.taxableAmount,
        sgst_amount: i.sgstAmount,
        cgst_amount: i.cgstAmount,
        barcode: i.barcode || '',
      }));

      const { data: rpcResult, error: rpcError } = await supabase.rpc('finalize_credit_note', {
        p_retailer_id: retailerId,
        p_reason: reasonForRpc,
        p_reason_notes: reasonNotes,
        p_created_by: user.id,
        p_visit_id: visitId && visitId.trim() !== '' && !visitId.startsWith('offline_') ? visitId : null,
        p_lines: p_lines as any,
        p_van_id: null,
      });

      if (rpcError) throw rpcError;
      const result: any = rpcResult || {};
      if (result.success === false) {
        toast.error(result.error || 'Could not create credit note');
        return;
      }

      const cnNumber: string = result.credit_note_number;
      const posted: boolean = !!result.posted_to_ledger;
      setCreditNoteNumber(cnNumber);
      setPendingApproval(!posted);

      if (posted) {
        // Build PDF only on the issued path.
        const { data: company } = await supabase
          .from('companies')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        const { data: retailer } = await supabase.from('retailers').select('*').eq('id', retailerId).single();

        const cnItems: CreditNoteItem[] = returnItems.map(i => ({
          product_name: i.variantName ? `${i.productName} - ${i.variantName}` : i.productName,
          hsn_code: i.hsnCode,
          unit: i.unit,
          quantity: i.returnQuantity,
          rate: i.rate,
          total: i.total,
          taxable_amount: i.taxableAmount,
          sgst_amount: i.sgstAmount,
          cgst_amount: i.cgstAmount,
          original_invoice_number: i.invoiceNumber || 'N/A',
          barcode: i.barcode,
        }));
        const subTotal = cnItems.reduce((s, i) => s + i.taxable_amount, 0);
        const sgstTotal = cnItems.reduce((s, i) => s + i.sgst_amount, 0);
        const cgstTotal = cnItems.reduce((s, i) => s + i.cgst_amount, 0);
        const totalAmount = subTotal + sgstTotal + cgstTotal;
        const referenceInvoices = Array.from(new Set(cnItems.map(i => i.original_invoice_number).filter(v => v !== 'N/A')));
        if (referenceInvoices.length === 0) referenceInvoices.push('N/A');

        const cnData: CreditNoteData = {
          creditNoteNumber: cnNumber,
          creditNoteDate: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          referenceInvoices,
          company: company || { name: 'Company' },
          retailer: retailer || { name: retailerName },
          items: cnItems,
          reason: reasonForRpc,
          reasonNotes,
          subTotal,
          sgstTotal,
          cgstTotal,
          totalAmount,
        };
        const blob = await generateCreditNotePDF(cnData);
        setPdfBlob(blob);
        toast.success(`Credit note ${cnNumber} issued`);
      } else {
        setPdfBlob(null);
        toast.success(`Credit note ${cnNumber} submitted for approval`);
      }

      setStep(3);
    } catch (error: any) {
      console.error('Error generating credit note:', error);
      toast.error('Failed to generate credit note: ' + (error.message || 'unknown error'));
    } finally {
      setGeneratingCN(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${creditNoteNumber.replace(/\//g, '-')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleNewReturn = () => {
    setReturnItems([]);
    setSelectedProduct('');
    setReturnableLines([]);
    setSelectedLineId('');
    setReturnQuantity(0);
    setReturnReason('');
    setOtherReason('');
    setCreditNoteNumber('');
    setPdfBlob(null);
    setPendingApproval(false);
    setStep(1);
  };

  const categories = (() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  })();

  const getProductOptions = () => {
    const options: Array<{ value: string; label: string; sku?: string; category?: string }> = [];
    const filtered = selectedCategory === 'all' ? products : products.filter(p => (p.category || 'Uncategorized') === selectedCategory);
    filtered.forEach(product => {
      options.push({ value: product.id, label: product.name, sku: product.sku, category: product.category });
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach(variant => {
          options.push({
            value: `${product.id}_variant_${variant.id}`,
            label: `${product.name} · ${variant.variant_name}`,
            sku: variant.sku,
            category: product.category,
          });
        });
      }
    });
    return options;
  };

  const getSelectedProductLabel = () => {
    if (!selectedProduct) return 'Search product...';
    const option = getProductOptions().find(opt => opt.value === selectedProduct);
    return option ? option.label : 'Search product...';
  };

  const grandTotal = returnItems.reduce((s, i) => s + i.total, 0);
  const subTotal = returnItems.reduce((s, i) => s + i.taxableAmount, 0);
  const sgstAmount = returnItems.reduce((s, i) => s + i.sgstAmount, 0);
  const cgstAmount = returnItems.reduce((s, i) => s + i.cgstAmount, 0);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">Loading products...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 pb-20">
      {/* Step Indicator */}
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-medium text-muted-foreground truncate max-w-[50vw]">{retailerName}</p>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors',
                step === s ? 'bg-primary text-primary-foreground' : step > s ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
            </div>
          ))}
        </div>
      </div>

      {/* ─── STEP 1: Pick product + invoice line ─── */}
      {step === 1 && (
        <>
          <Card>
            <CardContent className="p-3 space-y-3">
              {/* Category */}
              <div>
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="h-10 mt-1">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] bg-background z-50">
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product */}
              <Popover open={productDropdownOpen} onOpenChange={setProductDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between h-11">
                    <span className="truncate">{getSelectedProductLabel()}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-2rem)] max-w-md p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search products..." />
                    <CommandList>
                      <CommandEmpty>No product found.</CommandEmpty>
                      <CommandGroup>
                        {getProductOptions().map(option => (
                          <CommandItem
                            key={option.value}
                            value={`${option.label} ${option.sku || ''}`}
                            onSelect={() => {
                              setSelectedProduct(option.value === selectedProduct ? '' : option.value);
                              setProductDropdownOpen(false);
                            }}
                            className="flex flex-col items-start py-2.5"
                          >
                            <span className="font-medium text-sm">{option.label}</span>
                            {option.sku && <span className="text-xs text-muted-foreground">SKU: {option.sku}</span>}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Invoice line picker */}
              {selectedProduct && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Invoice line to return against
                  </Label>
                  {loadingLines ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Finding returnable invoices...
                    </div>
                  ) : returnableLines.length === 0 ? (
                    <div className="text-xs text-destructive/80 bg-destructive/5 rounded-md p-2.5">
                      No returnable invoice line found for this product at this retailer.
                    </div>
                  ) : (
                    <>
                      {/* Flexible date filter */}
                      <div className="rounded-md border border-border bg-muted/30 p-2 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
                            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All invoices</SelectItem>
                              <SelectItem value="relative">Relative period</SelectItem>
                              <SelectItem value="specific">Specific date</SelectItem>
                            </SelectContent>
                          </Select>

                          {filterMode === 'relative' && (
                            <>
                              <Select value={relDir} onValueChange={(v) => setRelDir(v as RelDir)}>
                                <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="within">within last</SelectItem>
                                  <SelectItem value="older">older than</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                min={0}
                                value={relN}
                                onChange={(e) => setRelN(Math.max(0, parseInt(e.target.value) || 0))}
                                className="h-8 w-16 text-xs"
                              />
                              <Select value={relUnit} onValueChange={(v) => setRelUnit(v as RelUnit)}>
                                <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="day">Day(s)</SelectItem>
                                  <SelectItem value="week">Week(s)</SelectItem>
                                  <SelectItem value="month">Month(s)</SelectItem>
                                  <SelectItem value="year">Year(s)</SelectItem>
                                </SelectContent>
                              </Select>
                            </>
                          )}

                          {filterMode === 'specific' && (
                            <Input
                              type="date"
                              value={specificDate}
                              onChange={(e) => setSpecificDate(e.target.value)}
                              className="h-8 w-[160px] text-xs"
                            />
                          )}

                          {filterMode !== 'all' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              onClick={() => { setFilterMode('all'); setSpecificDate(''); }}
                            >
                              Clear filter
                            </Button>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          showing {displayedLines.length} of {returnableLines.length} invoices
                        </p>
                      </div>

                      {displayedLines.length === 0 ? (
                        <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5">
                          No invoices match this filter.
                        </div>
                      ) : (
                        <RadioGroup value={selectedLineId} onValueChange={setSelectedLineId} className="space-y-1.5">
                          {displayedLines.map(l => (
                            <label
                              key={l.order_id}
                              className={cn(
                                'flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer transition-colors',
                                selectedLineId === l.order_id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                              )}
                            >
                              <RadioGroupItem value={l.order_id} className="mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">INV {l.invoice_number || 'N/A'}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {l.order_date ? new Date(l.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                </p>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                                  <span>
                                    sold <span className="font-medium text-foreground">{l.sold_qty}</span>
                                  </span>
                                  <span>
                                    ₹<span className="font-medium text-foreground">{l.rate.toFixed(2)}</span>/unit
                                  </span>
                                  <span>
                                    returnable <span className="font-medium text-primary">{l.returnable}</span>
                                  </span>
                                </div>
                              </div>
                            </label>
                          ))}
                        </RadioGroup>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Qty + reason */}
              {selectedProduct && selectedLine && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Return Qty (max {maxReturnQty})</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={returnQuantity || ''}
                        onChange={e => setReturnQuantity(parseFloat(e.target.value) || 0)}
                        min="0"
                        max={maxReturnQty}
                        step="0.01"
                        className={cn('h-9 mt-1', qtyOverMax && 'border-destructive')}
                      />
                      {qtyOverMax && <p className="text-[11px] text-destructive mt-1">Cannot exceed {maxReturnQty}</p>}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Credit (est.)</Label>
                      <p className="h-9 mt-1 flex items-center text-sm font-semibold">
                        ₹{returnQuantity > 0 && !qtyOverMax ? deriveLine(selectedLine, returnQuantity).total.toFixed(2) : '0.00'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Reason</Label>
                    <Select
                      value={returnReason}
                      onValueChange={val => {
                        setReturnReason(val);
                        if (val !== 'Other') setOtherReason('');
                      }}
                    >
                      <SelectTrigger className="h-9 mt-1">
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {returnReasons.map(r => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {returnReason === 'Other' && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Specify Reason</Label>
                      <Input
                        placeholder="Enter reason for return..."
                        value={otherReason}
                        onChange={e => setOtherReason(e.target.value)}
                        className="h-9 mt-1"
                        maxLength={200}
                      />
                    </div>
                  )}

                  <Button onClick={handleAddReturn} className="w-full h-10" disabled={qtyOverMax || returnQuantity <= 0}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {returnItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Added Items</p>
                <Badge variant="secondary" className="text-xs">
                  {returnItems.length} items · ₹{Math.round(grandTotal)}
                </Badge>
              </div>
              {returnItems.map((item, index) => (
                <Card key={index}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {item.productName}
                          {item.variantName && <span className="text-muted-foreground"> · {item.variantName}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          INV {item.invoiceNumber || 'N/A'} · {item.returnQuantity} {item.unit} × ₹{item.rate.toFixed(2)}
                        </p>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 mt-1">
                          {item.returnReason}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold">₹{Math.round(item.total)}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveItem(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── STEP 2: Review ─── */}
      {step === 2 && (
        <div className="space-y-3">
          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Return Items</p>
              {returnItems.map((item, idx) => (
                <div key={idx} className="py-1.5 border-b last:border-0">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">
                        {item.productName}
                        {item.variantName && <span className="text-muted-foreground text-xs"> · {item.variantName}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        INV {item.invoiceNumber || 'N/A'} · {item.returnQuantity} {item.unit} × ₹{item.rate.toFixed(2)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        CGST ₹{item.cgstAmount.toFixed(2)} · SGST ₹{item.sgstAmount.toFixed(2)}
                      </p>
                    </div>
                    <span className="font-semibold shrink-0">₹{item.total.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sub Total</span>
                <span>₹{subTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">SGST</span>
                <span>₹{sgstAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CGST</span>
                <span>₹{cgstAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t pt-2">
                <span>Total Credit</span>
                <span className="text-destructive">₹{Math.round(grandTotal)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── STEP 3: Done ─── */}
      {step === 3 && (
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <div
              className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center mx-auto',
                pendingApproval ? 'bg-amber-500/10' : 'bg-primary/10',
              )}
            >
              {pendingApproval ? <Clock className="h-8 w-8 text-amber-600" /> : <CheckCircle2 className="h-8 w-8 text-primary" />}
            </div>
            <div>
              <h3 className="text-lg font-bold">{pendingApproval ? 'Submitted for Approval' : 'Credit Note Issued'}</h3>
              <p className="text-sm text-muted-foreground mt-1">{creditNoteNumber}</p>
              <p className="text-2xl font-bold text-destructive mt-2">₹{Math.round(grandTotal)}</p>
              {pendingApproval && (
                <p className="text-xs text-muted-foreground mt-2 px-4">
                  PDF will be available after this credit note is approved. No ledger change yet.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {!pendingApproval && pdfBlob && (
                <Button onClick={handleDownloadPDF} className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
              )}
              <Button variant="outline" onClick={handleNewReturn} className="w-full">
                <RotateCcw className="h-4 w-4 mr-2" />
                New Return
              </Button>
              <Button variant="ghost" onClick={onComplete} className="w-full text-muted-foreground">
                Done
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fixed Bottom Bar */}
      {step < 3 && (
        <>
          <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-3 flex gap-2 z-40">
            {step === 2 && (
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
            {step === 1 && (
              <Button onClick={handleGoToStep2} disabled={returnItems.length === 0} className="flex-1">
                Review
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
            {step === 2 && (
              <Button onClick={handleGenerateCreditNote} disabled={generatingCN} className="flex-1">
                {generatingCN ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                {generatingCN ? 'Submitting...' : 'Generate Credit Note'}
              </Button>
            )}
          </div>
          <div className="h-16" />
        </>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent } from './ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Package, Plus, ChevronsUpDown, FileText, Trash2, Loader2, ArrowLeft, ArrowRight, CheckCircle2, Download, RotateCcw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { generateCreditNotePDF, getNextCreditNoteNumber, CreditNoteItem, CreditNoteData } from '@/utils/creditNoteGenerator';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { cn } from '@/lib/utils';

interface Product {
  id: string;
  name: string;
  unit: string;
  rate: number;
  sku?: string;
  variants?: ProductVariant[];
}

interface ProductVariant {
  id: string;
  variant_name: string;
  sku: string;
  price: number;
}

interface ReturnItem {
  productId: string;
  variantId?: string;
  productName: string;
  variantName?: string;
  unit: string;
  returnQuantity: number;
  returnReason: string;
  price: number;
}

interface ReturnStockFormProps {
  visitId: string;
  retailerId: string;
  retailerName: string;
  onComplete: () => void;
}

const returnReasons = [
  'Damaged',
  'Expired',
  'Wrong Product',
  'Quality Issue',
  'Excess Stock',
  'Customer Return',
  'Other'
];

const units = ['Piece', 'Box', 'Case', 'Kg', 'grams', 'Litre', 'ml', 'Dozen', 'Pack', 'Carton'];

export function ReturnStockForm({ visitId, retailerId, retailerName, onComplete }: ReturnStockFormProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingCN, setGeneratingCN] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 3 state
  const [creditNoteNumber, setCreditNoteNumber] = useState('');
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  // Invoice linking state for step 2
  const [invoiceOptions, setInvoiceOptions] = useState<Record<string, { invoice_number: string; order_id: string; created_at: string; matched_quantity: number; matched_rate: number }[]>>({});
  const [selectedInvoices, setSelectedInvoices] = useState<Record<string, string>>({});
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Form state
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [returnQuantity, setReturnQuantity] = useState<number>(0);
  const [returnReason, setReturnReason] = useState<string>('');
  const [selectedUnit, setSelectedUnit] = useState<string>('Kg');
  const [otherReason, setOtherReason] = useState<string>('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`id, name, unit, rate, sku, product_variants (id, variant_name, sku, price)`)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const productsWithVariants: Product[] = (data || []).map(p => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        rate: p.rate,
        sku: p.sku || undefined,
        variants: (p.product_variants || []) as ProductVariant[]
      }));

      setProducts(productsWithVariants);
    } catch (error: any) {
      console.error('Error loading products:', error);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleAddReturn = () => {
    const errors: string[] = [];
    if (!selectedProduct) errors.push('select a product');
    if (returnQuantity <= 0) errors.push('enter a valid quantity');
    if (!returnReason) errors.push('select a return reason');
    if (returnReason === 'Other' && !otherReason.trim()) errors.push('enter the reason for returning');

    if (errors.length > 0) {
      toast.error(`Please ${errors.join(', ')}`);
      return;
    }

    const [productId, variantId] = selectedProduct.split('_variant_');
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const variant = variantId ? product.variants?.find(v => v.id === variantId) : undefined;
    const itemPrice = variant ? variant.price : product.rate;

    const newItem: ReturnItem = {
      productId,
      variantId: variantId || undefined,
      productName: product.name,
      variantName: variant?.variant_name,
      unit: selectedUnit || product.unit,
      returnQuantity,
      returnReason: returnReason === 'Other' ? `Other: ${otherReason.trim()}` : returnReason,
      price: itemPrice
    };

    setReturnItems(prev => [...prev, newItem]);
    setSelectedProduct('');
    setReturnQuantity(0);
    setReturnReason('');
    setSelectedUnit('Kg');
    setOtherReason('');
    toast.success(`Added ${newItem.productName}${newItem.variantName ? ` - ${newItem.variantName}` : ''}`);
  };

  // Fetch invoice options for return items when moving to step 2
  const fetchInvoiceOptions = async () => {
    setLoadingInvoices(true);
    try {
      const { data: pastOrders, error: ordersError } = await supabase
        .from('orders')
        .select('id, invoice_number, created_at, status, order_items!order_items_order_id_fkey(product_id, product_name, quantity, rate)')
        .eq('retailer_id', retailerId)
        .not('invoice_number', 'is', null)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(50);

      if (ordersError) {
        console.error('Error fetching invoice options:', ordersError);
        toast.error('Could not load invoice options. Please try again.');
        setLoadingInvoices(false);
        return;
      }

      const optionsMap: Record<string, { invoice_number: string; order_id: string; created_at: string; matched_quantity: number; matched_rate: number }[]> = {};
      const defaultSelections: Record<string, string> = {};

      if (pastOrders) {
        for (const item of returnItems) {
          const key = item.variantId ? `${item.productId}_${item.variantId}` : item.productId;
          optionsMap[key] = [];
          
          for (const order of pastOrders) {
            const orderItems = (order as any).order_items || [];
            const matchedItem = orderItems.find((oi: any) => {
              return oi.product_id === item.productId;
            });
            
            if (matchedItem && order.invoice_number) {
              const exists = optionsMap[key].some(o => o.invoice_number === order.invoice_number);
              if (!exists) {
                optionsMap[key].push({
                  invoice_number: order.invoice_number,
                  order_id: order.id,
                  created_at: order.created_at,
                  matched_quantity: matchedItem.quantity || 0,
                  matched_rate: matchedItem.rate || 0,
                });
              }
            }
          }
          
          // Fallback: if no product-level match found, show all retailer invoices for manual selection
          if (optionsMap[key].length === 0 && pastOrders) {
            for (const order of pastOrders) {
              if (order.invoice_number) {
                const exists = optionsMap[key].some(o => o.invoice_number === order.invoice_number);
                if (!exists) {
                  optionsMap[key].push({
                    invoice_number: order.invoice_number,
                    order_id: order.id,
                    created_at: order.created_at,
                    matched_quantity: 0,
                    matched_rate: 0,
                  });
                }
              }
            }
          }

          if (optionsMap[key].length > 0 && !selectedInvoices[key]) {
            defaultSelections[key] = optionsMap[key][0].invoice_number;
          }
        }
      }

      setInvoiceOptions(optionsMap);
      setSelectedInvoices(prev => ({ ...defaultSelections, ...prev }));
    } catch (err) {
      console.error('Error fetching invoices for linking:', err);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleGoToStep2 = async () => {
    if (returnItems.length === 0) return;
    setStep(2);
    await fetchInvoiceOptions();
  };

  const handleRemoveItem = (index: number) => {
    setReturnItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerateCreditNote = async () => {
    if (returnItems.length === 0) {
      toast.error('No items added for return');
      return;
    }

    setGeneratingCN(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: company } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const { data: retailer } = await supabase
        .from('retailers')
        .select('*')
        .eq('id', retailerId)
        .single();

      // Use the invoice selections from step 2 instead of re-fetching
      const cnItems: CreditNoteItem[] = returnItems.map(item => {
        const key = item.variantId ? `${item.productId}_${item.variantId}` : item.productId;
        const refInvoice = selectedInvoices[key] || 'N/A';
        const total = item.price * item.returnQuantity;
        const taxableAmount = total;
        const sgst = taxableAmount * 0.025;
        const cgst = taxableAmount * 0.025;

        return {
          product_name: item.variantName ? `${item.productName} - ${item.variantName}` : item.productName,
          hsn_code: '',
          unit: item.unit,
          quantity: item.returnQuantity,
          rate: item.price,
          total,
          taxable_amount: taxableAmount,
          sgst_amount: sgst,
          cgst_amount: cgst,
          original_invoice_number: refInvoice,
        };
      });

      const subTotal = cnItems.reduce((s, i) => s + i.total, 0);
      const sgstTotal = cnItems.reduce((s, i) => s + i.sgst_amount, 0);
      const cgstTotal = cnItems.reduce((s, i) => s + i.cgst_amount, 0);
      const totalAmount = subTotal + sgstTotal + cgstTotal;

      const referenceInvoices = [...new Set(cnItems.map(i => i.original_invoice_number).filter(v => v !== 'N/A'))];
      if (referenceInvoices.length === 0) referenceInvoices.push('N/A');

      const cnNumber = await getNextCreditNoteNumber();
      const creditNoteDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

      const primaryReason = returnItems[0]?.returnReason || 'Other';
      const reasonMap: Record<string, string> = {
        'Damaged': 'damaged',
        'Expired': 'expired',
        'Wrong Product': 'quality_issue',
        'Quality Issue': 'quality_issue',
        'Excess Stock': 'unsold_stock',
        'Customer Return': 'unsold_stock',
        'Other': 'other',
      };

      const { data: cnRecord, error: cnError } = await supabase
        .from('credit_notes')
        .insert({
          credit_note_number: cnNumber,
          credit_note_date: new Date().toISOString().split('T')[0],
          retailer_id: retailerId,
          retailer_name: retailerName,
          reason: reasonMap[primaryReason] || 'other',
          reason_notes: returnItems.map(i => `${i.productName}: ${i.returnReason} (Qty: ${i.returnQuantity})`).join('; '),
          sub_total: subTotal,
          sgst_total: sgstTotal,
          cgst_total: cgstTotal,
          total_amount: totalAmount,
          status: 'issued',
          created_by: user.id,
        })
        .select()
        .single();

      if (cnError) throw cnError;

      const cnItemRecords = cnItems.map(item => ({
        credit_note_id: cnRecord.id,
        product_name: item.product_name,
        hsn_code: item.hsn_code,
        unit: item.unit,
        quantity: item.quantity,
        rate: item.rate,
        total: item.total,
        taxable_amount: item.taxable_amount,
        sgst_amount: item.sgst_amount,
        cgst_amount: item.cgst_amount,
        original_invoice_number: item.original_invoice_number,
      }));

      await supabase.from('credit_note_items').insert(cnItemRecords);

      const dateStr = new Date().toISOString().split('T')[0];
      const grnNumber = `RET-${Date.now()}`;
      const validVisitId = visitId && visitId.trim() !== '' ? visitId : null;

      const { data: returnGRN, error: grnError } = await supabase
        .from('van_return_grn')
        .insert({
          user_id: user.id,
          retailer_id: retailerId,
          visit_id: validVisitId,
          return_date: dateStr,
          return_grn_number: grnNumber,
          notes: `Returns from ${retailerName} — CN: ${cnNumber}`
        })
        .select()
        .single();

      if (!grnError && returnGRN) {
        const returnGRNItems = returnItems.map(item => ({
          return_grn_id: returnGRN.id,
          product_id: item.productId,
          variant_id: item.variantId && item.variantId.trim() !== '' ? item.variantId : null,
          return_quantity: item.returnQuantity,
          return_reason: item.returnReason
        }));
        await supabase.from('van_return_grn_items').insert(returnGRNItems);
      }

      const cnData: CreditNoteData = {
        creditNoteNumber: cnNumber,
        creditNoteDate,
        referenceInvoices,
        company: company || { name: 'Company' },
        retailer: retailer || { name: retailerName },
        items: cnItems,
        reason: reasonMap[primaryReason] || 'other',
        reasonNotes: returnItems.map(i => `${i.productName}: ${i.returnReason} (Qty: ${i.returnQuantity})`).join('; '),
        subTotal,
        sgstTotal,
        cgstTotal,
        totalAmount,
      };

      const blob = await generateCreditNotePDF(cnData);
      setCreditNoteNumber(cnNumber);
      setPdfBlob(blob);
      setStep(3);
      toast.success(`Credit Note ${cnNumber} generated!`);
    } catch (error: any) {
      console.error('Error generating credit note:', error);
      toast.error('Failed to generate credit note: ' + error.message);
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
    setReturnQuantity(0);
    setReturnReason('');
    setSelectedUnit('Kg');
    setOtherReason('');
    setCreditNoteNumber('');
    setPdfBlob(null);
    setStep(1);
  };

  const getProductOptions = () => {
    const options: Array<{ value: string; label: string; sku?: string; price: number }> = [];
    products.forEach(product => {
      options.push({ value: product.id, label: product.name, sku: product.sku, price: product.rate });
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach(variant => {
          options.push({
            value: `${product.id}_variant_${variant.id}`,
            label: variant.variant_name,
            sku: variant.sku,
            price: variant.price
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

  const getRunningTotal = () => {
    return returnItems.reduce((sum, item) => sum + item.price * item.returnQuantity, 0);
  };

  // Review calculations
  const subTotal = returnItems.reduce((sum, item) => sum + item.price * item.returnQuantity, 0);
  const sgstAmount = subTotal * 0.025;
  const cgstAmount = subTotal * 0.025;
  const grandTotal = subTotal + sgstAmount + cgstAmount;

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
        <p className="text-sm font-medium text-muted-foreground truncate max-w-[50vw]">
          {retailerName}
        </p>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors",
                step === s
                  ? "bg-primary text-primary-foreground"
                  : step > s
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
            </div>
          ))}
        </div>
      </div>

      {/* ─── STEP 1: Add Items ─── */}
      {step === 1 && (
        <>
          {/* Product Search */}
          <Card>
            <CardContent className="p-3 space-y-3">
              <Popover open={productDropdownOpen} onOpenChange={setProductDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between h-11"
                  >
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
                            <span className="text-xs text-muted-foreground">
                              {option.sku && `SKU: ${option.sku} · `}₹{option.price}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Detail fields - show when product selected */}
              {selectedProduct && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Unit</Label>
                      <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                        <SelectTrigger className="h-9 mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {units.map(u => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Quantity</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={returnQuantity || ''}
                        onChange={(e) => setReturnQuantity(parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                        className="h-9 mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Rate</Label>
                      <p className="h-9 mt-1 flex items-center text-sm font-medium">
                        ₹{getProductOptions().find(o => o.value === selectedProduct)?.price.toFixed(2) || '0.00'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Reason</Label>
                    <Select value={returnReason} onValueChange={(val) => { setReturnReason(val); if (val !== 'Other') setOtherReason(''); }}>
                      <SelectTrigger className="h-9 mt-1">
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {returnReasons.map(r => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
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
                        onChange={(e) => setOtherReason(e.target.value)}
                        className="h-9 mt-1"
                        maxLength={200}
                      />
                    </div>
                  )}

                  <Button onClick={handleAddReturn} className="w-full h-10">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Added Items */}
          {returnItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Added Items
                </p>
                <Badge variant="secondary" className="text-xs">
                  {returnItems.length} items · ₹{Math.round(getRunningTotal())}
                </Badge>
              </div>

              {returnItems.map((item, index) => {
                const itemTotal = item.price * item.returnQuantity;
                return (
                  <Card key={index}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">
                            {item.productName}
                            {item.variantName && <span className="text-muted-foreground"> · {item.variantName}</span>}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {item.returnQuantity} {item.unit} × ₹{item.price.toFixed(2)}
                            </span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {item.returnReason}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-semibold">₹{Math.round(itemTotal)}</span>
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
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ─── STEP 2: Review & Confirm ─── */}
      {step === 2 && (
        <div className="space-y-3">
          {/* Invoice Linking - Radio style per product */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Link Items to Invoices
              </p>
              {loadingInvoices ? (
                <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Finding matching invoices...
                </div>
              ) : (
                returnItems.map((item, idx) => {
                  const key = item.variantId ? `${item.productId}_${item.variantId}` : item.productId;
                  const options = invoiceOptions[key] || [];
                  const selected = selectedInvoices[key] || '';
                  
                  return (
                    <div key={idx} className="rounded-lg bg-background border p-3 space-y-2">
                      <p className="text-sm font-semibold">
                        {item.productName}
                        {item.variantName && <span className="text-muted-foreground font-normal"> · {item.variantName}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Returning: {item.returnQuantity} {item.unit} × ₹{item.price.toFixed(2)}
                      </p>
                      {options.length > 0 ? (
                        <RadioGroup
                          value={selected}
                          onValueChange={(v) => setSelectedInvoices(prev => ({ ...prev, [key]: v }))}
                          className="space-y-1.5 mt-1"
                        >
                          {options.map((opt) => (
                            <label
                              key={opt.invoice_number}
                              className={cn(
                                "flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer transition-colors",
                                selected === opt.invoice_number
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:bg-muted/50"
                              )}
                            >
                              <RadioGroupItem value={opt.invoice_number} className="mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{opt.invoice_number}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {new Date(opt.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-xs text-muted-foreground">
                                    Qty: <span className="font-medium text-foreground">{opt.matched_quantity}</span>
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    Rate: <span className="font-medium text-foreground">₹{opt.matched_rate.toFixed(2)}</span>
                                  </span>
                                </div>
                              </div>
                            </label>
                          ))}
                        </RadioGroup>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-destructive/80 bg-destructive/5 rounded-md p-2">
                          ⚠ No matching invoice found — will show as N/A
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Return Items */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Return Items</p>
              {returnItems.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm py-1.5 border-b last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {item.productName}
                      {item.variantName && <span className="text-muted-foreground text-xs"> · {item.variantName}</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {item.returnQuantity} {item.unit} × ₹{item.price.toFixed(2)}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {item.returnReason}
                      </Badge>
                    </div>
                  </div>
                  <span className="font-medium shrink-0 ml-2">₹{(item.price * item.returnQuantity).toFixed(2)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Tax Breakdown */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sub Total</span>
                <span>₹{subTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">SGST (2.5%)</span>
                <span>₹{sgstAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CGST (2.5%)</span>
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
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Credit Note Generated</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {creditNoteNumber}
              </p>
              <p className="text-2xl font-bold text-destructive mt-2">
                ₹{Math.round(grandTotal)}
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={handleDownloadPDF} className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
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

      {/* ─── Fixed Bottom Bar ─── */}
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
              <Button
                onClick={handleGoToStep2}
                disabled={returnItems.length === 0}
                className="flex-1"
              >
                Review
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
            {step === 2 && (
              <Button
                onClick={handleGenerateCreditNote}
                disabled={generatingCN}
                className="flex-1"
              >
                {generatingCN ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                {generatingCN ? 'Generating...' : 'Generate Credit Note'}
              </Button>
            )}
          </div>
          <div className="h-16" />
        </>
      )}
    </div>
  );
}

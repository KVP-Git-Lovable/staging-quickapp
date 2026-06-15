import React, { useState, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Plus, X, Calendar, Package, Percent, DollarSign, Gift, Users, Clock, Star, Tag, Layers, ChevronsUpDown, Check, Search, Sliders } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SchemeFormFieldsProps {
  schemeForm: any;
  setSchemeForm: (form: any) => void;
  products: any[];
  categories: any[];
}

const UNIT_OPTIONS = [
  { value: 'kg', label: 'KG' },
  { value: 'grams', label: 'Grams' },
  { value: 'pieces', label: 'Pieces' },
  { value: 'liters', label: 'Liters' },
  { value: 'ml', label: 'ML' },
  { value: 'units', label: 'Units' },
];

export const SchemeFormFields = ({ schemeForm, setSchemeForm, products, categories }: SchemeFormFieldsProps) => {
  // Search states
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [multiProductSearch, setMultiProductSearch] = useState('');

  // Helper function to get unit equivalent display (like Order Entry)
  const getUnitEquivalent = (qty: number, unit: string): string => {
    if (!qty || qty <= 0) return '';
    const u = (unit || '').toLowerCase();
    if (u === 'kg') {
      const grams = qty * 1000;
      return `(${grams.toLocaleString()}g)`;
    }
    if (u === 'grams' || u === 'g') {
      const kg = qty / 1000;
      return `(${kg.toFixed(2)}kg)`;
    }
    if (u === 'liters') {
      const ml = qty * 1000;
      return `(${ml.toLocaleString()}ml)`;
    }
    if (u === 'ml') {
      const liters = qty / 1000;
      return `(${liters.toFixed(2)}L)`;
    }
    return '';
  };

  // Helper to determine step value based on unit
  const getStepForUnit = (unit: string): string => {
    const u = (unit || '').toLowerCase();
    return ['kg', 'liters'].includes(u) ? '0.1' : '1';
  };

  // Filtered products for multi-product selection
  const filteredProducts = useMemo(() => {
    if (!multiProductSearch.trim()) return products;
    const search = multiProductSearch.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(search) ||
      p.sku.toLowerCase().includes(search)
    );
  }, [products, multiProductSearch]);

  // Select all filtered products
  const handleSelectAll = () => {
    const allIds = filteredProducts.map(p => p.id);
    const newDiscounts: Record<string, { discount_percentage: number }> = {};
    allIds.forEach(id => {
      newDiscounts[id] = { discount_percentage: schemeForm.discount_percentage || 0 };
    });
    setSchemeForm({
      ...schemeForm,
      target_product_ids: allIds,
      per_product_discounts: newDiscounts
    });
  };

  // Clear all selections
  const handleClearAll = () => {
    setSchemeForm({
      ...schemeForm,
      target_product_ids: [],
      per_product_discounts: {}
    });
  };
  
  const getSchemeTypeIcon = (type: string) => {
    switch (type) {
      case 'percentage_discount': return <Percent size={16} />;
      case 'flat_discount': return <DollarSign size={16} />;
      case 'buy_x_get_y_free': return <Gift size={16} />;
      case 'bundle_combo': return <Package size={16} />;
      case 'tiered_discount': return <Users size={16} />;
      case 'time_based_offer': return <Clock size={16} />;
      case 'first_order_discount': return <Star size={16} />;
      case 'category_wide_discount': return <Tag size={16} />;
      case 'manual_per_unit_discount': return <Sliders size={16} />;
      default: return <Percent size={16} />;
    }
  };

  const addTier = () => {
    setSchemeForm({
      ...schemeForm,
      tier_data: [...schemeForm.tier_data, { min_qty: 0, max_qty: 0, discount_percentage: 0 }]
    });
  };

  const removeTier = (index: number) => {
    setSchemeForm({
      ...schemeForm,
      tier_data: schemeForm.tier_data.filter((_: any, i: number) => i !== index)
    });
  };

  const updateTier = (index: number, field: string, value: number) => {
    const updatedTiers = [...schemeForm.tier_data];
    updatedTiers[index] = { ...updatedTiers[index], [field]: value };
    setSchemeForm({ ...schemeForm, tier_data: updatedTiers });
  };

  const toggleBundleProduct = (productId: string) => {
    const currentIds = schemeForm.bundle_product_ids || [];
    const isSelected = currentIds.includes(productId);
    
    setSchemeForm({
      ...schemeForm,
      bundle_product_ids: isSelected 
        ? currentIds.filter((id: string) => id !== productId)
        : [...currentIds, productId]
    });
  };

  // Multi-product selection handlers
  const toggleTargetProduct = (productId: string) => {
    const currentIds = schemeForm.target_product_ids || [];
    const isSelected = currentIds.includes(productId);
    
    let newIds: string[];
    let newDiscounts = { ...(schemeForm.per_product_discounts || {}) };
    
    if (isSelected) {
      newIds = currentIds.filter((id: string) => id !== productId);
      delete newDiscounts[productId];
    } else {
      newIds = [...currentIds, productId];
      // Initialize with default discount from form
      newDiscounts[productId] = { 
        discount_percentage: schemeForm.discount_percentage || 0 
      };
    }
    
    setSchemeForm({
      ...schemeForm,
      target_product_ids: newIds,
      per_product_discounts: newDiscounts
    });
  };

  const updateProductDiscount = (productId: string, value: number, field: 'discount_percentage' | 'discount_amount' = 'discount_percentage') => {
    setSchemeForm({
      ...schemeForm,
      per_product_discounts: {
        ...(schemeForm.per_product_discounts || {}),
        [productId]: { 
          ...(schemeForm.per_product_discounts?.[productId] || {}),
          [field]: value 
        }
      }
    });
  };

  const applyUniformDiscount = () => {
    const uniformDiscount = schemeForm.discount_percentage || 0;
    const currentIds = schemeForm.target_product_ids || [];
    const newDiscounts: Record<string, { discount_percentage: number }> = {};
    
    currentIds.forEach((id: string) => {
      newDiscounts[id] = { discount_percentage: uniformDiscount };
    });
    
    setSchemeForm({
      ...schemeForm,
      per_product_discounts: newDiscounts
    });
  };

  const renderSchemeTypeFields = () => {
    switch (schemeForm.scheme_type) {
      case 'percentage_discount':
        return (
          <>
            <div>
                <Label htmlFor="conditionQty">Quantity Threshold</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    id="conditionQty"
                    type="number"
                    value={schemeForm.condition_quantity || ""}
                    onChange={(e) => setSchemeForm({ ...schemeForm, condition_quantity: parseFloat(e.target.value) || 0 })}
                    placeholder="Enter quantity"
                    step={getStepForUnit(schemeForm.condition_unit || 'kg')}
                  />
                  {schemeForm.condition_quantity > 0 && (
                    <span className="text-xs text-muted-foreground mt-1 block">
                      {getUnitEquivalent(schemeForm.condition_quantity, schemeForm.condition_unit || 'kg')}
                    </span>
                  )}
                </div>
                <Select
                  value={schemeForm.condition_unit || 'kg'}
                  onValueChange={(value) => setSchemeForm({ ...schemeForm, condition_unit: value })}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map(unit => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="discountPercentage">Discount Percentage (%)</Label>
              <Input
                id="discountPercentage"
                type="number"
                value={schemeForm.discount_percentage || ""}
                onChange={(e) => setSchemeForm({ ...schemeForm, discount_percentage: parseFloat(e.target.value) || 0 })}
                placeholder="Discount percentage"
                max="100"
              />
            </div>
          </>
        );

      case 'flat_discount':
        return (
          <>
            <div>
              <Label htmlFor="conditionQty">Quantity Threshold</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    id="conditionQty"
                    type="number"
                    value={schemeForm.condition_quantity || ""}
                    onChange={(e) => setSchemeForm({ ...schemeForm, condition_quantity: parseFloat(e.target.value) || 0 })}
                    placeholder="Enter quantity"
                    step={getStepForUnit(schemeForm.condition_unit || 'kg')}
                  />
                  {schemeForm.condition_quantity > 0 && (
                    <span className="text-xs text-muted-foreground mt-1 block">
                      {getUnitEquivalent(schemeForm.condition_quantity, schemeForm.condition_unit || 'kg')}
                    </span>
                  )}
                </div>
                <Select
                  value={schemeForm.condition_unit || 'kg'}
                  onValueChange={(value) => setSchemeForm({ ...schemeForm, condition_unit: value })}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map(unit => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="discountAmount">Discount Amount (₹)</Label>
              <Input
                id="discountAmount"
                type="number"
                value={schemeForm.discount_amount || ""}
                onChange={(e) => setSchemeForm({ ...schemeForm, discount_amount: parseFloat(e.target.value) || 0 })}
                placeholder="Fixed discount amount"
              />
            </div>
          </>
        );

      case 'buy_x_get_y_free':
        return (
          <>
            <div>
              <Label htmlFor="buyQuantity">Buy Quantity Threshold (X)</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    id="buyQuantity"
                    type="number"
                    value={schemeForm.buy_quantity || ""}
                    onChange={(e) => setSchemeForm({ ...schemeForm, buy_quantity: parseFloat(e.target.value) || 0 })}
                    placeholder="Quantity to purchase"
                    step={getStepForUnit(schemeForm.buy_quantity_unit || 'kg')}
                  />
                  {schemeForm.buy_quantity > 0 && (
                    <span className="text-xs text-muted-foreground mt-1 block">
                      {getUnitEquivalent(schemeForm.buy_quantity, schemeForm.buy_quantity_unit || 'kg')}
                    </span>
                  )}
                </div>
                <Select
                  value={schemeForm.buy_quantity_unit || 'kg'}
                  onValueChange={(value) => setSchemeForm({ ...schemeForm, buy_quantity_unit: value })}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map(unit => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="freeProduct">Free Product (Y)</Label>
              <Select
                value={schemeForm.free_product_id}
                onValueChange={(value) => setSchemeForm({ ...schemeForm, free_product_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select free product" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="same">Same Product (Free)</SelectItem>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} - ₹{product.rate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="freeQuantity">Free Quantity</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    id="freeQuantity"
                    type="number"
                    value={schemeForm.free_quantity || ""}
                    onChange={(e) => setSchemeForm({ ...schemeForm, free_quantity: parseFloat(e.target.value) || 0 })}
                    placeholder="Free quantity"
                    step={getStepForUnit(schemeForm.free_quantity_unit || 'kg')}
                  />
                  {schemeForm.free_quantity > 0 && (
                    <span className="text-xs text-muted-foreground mt-1 block">
                      {getUnitEquivalent(schemeForm.free_quantity, schemeForm.free_quantity_unit || 'kg')}
                    </span>
                  )}
                </div>
                <Select
                  value={schemeForm.free_quantity_unit || 'kg'}
                  onValueChange={(value) => setSchemeForm({ ...schemeForm, free_quantity_unit: value })}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map(unit => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        );

      case 'bundle_combo':
        return (
          <>
            <div>
              <Label>Bundle Products (Select multiple)</Label>
              <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-2">
                {products.map((product) => (
                  <div key={product.id} className="flex items-center space-x-2">
                    <Checkbox
                      checked={(schemeForm.bundle_product_ids || []).includes(product.id)}
                      onCheckedChange={() => toggleBundleProduct(product.id)}
                    />
                    <span className="text-sm">{product.name} ({product.sku})</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="bundleDiscountPercentage">Bundle Discount (%)</Label>
                <Input
                  id="bundleDiscountPercentage"
                  type="number"
                  value={schemeForm.bundle_discount_percentage || ""}
                  onChange={(e) => setSchemeForm({ ...schemeForm, bundle_discount_percentage: parseFloat(e.target.value) || 0 })}
                  placeholder="Bundle discount %"
                  max="100"
                />
              </div>
              <div>
                <Label htmlFor="bundleDiscountAmount">Or Fixed Amount (₹)</Label>
                <Input
                  id="bundleDiscountAmount"
                  type="number"
                  value={schemeForm.bundle_discount_amount || ""}
                  onChange={(e) => setSchemeForm({ ...schemeForm, bundle_discount_amount: parseFloat(e.target.value) || 0 })}
                  placeholder="Fixed discount amount"
                />
              </div>
            </div>
          </>
        );

      case 'tiered_discount':
        return (
          <>
            <div>
              <Label>Discount Tiers</Label>
              <div className="space-y-2">
                {schemeForm.tier_data.map((tier: any, index: number) => (
                  <div key={index} className="flex items-center gap-2 p-2 border rounded">
                    <Input
                      type="number"
                      placeholder="Min Qty"
                      value={tier.min_qty || ""}
                      onChange={(e) => updateTier(index, 'min_qty', parseFloat(e.target.value) || 0)}
                      className="w-24"
                      step="0.1"
                    />
                    <span className="text-sm">to</span>
                    <Input
                      type="number"
                      placeholder="Max Qty"
                      value={tier.max_qty || ""}
                      onChange={(e) => updateTier(index, 'max_qty', parseFloat(e.target.value) || 0)}
                      className="w-24"
                      step="0.1"
                    />
                    <Input
                      type="number"
                      placeholder="Discount %"
                      value={tier.discount_percentage || ""}
                      onChange={(e) => updateTier(index, 'discount_percentage', parseFloat(e.target.value) || 0)}
                      className="w-28"
                      max="100"
                    />
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => removeTier(index)}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addTier}>
                  <Plus size={14} className="mr-1" />
                  Add Tier
                </Button>
              </div>
            </div>
          </>
        );

      case 'time_based_offer':
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="discountPercentage">Discount Percentage (%)</Label>
                <Input
                  id="discountPercentage"
                  type="number"
                  value={schemeForm.discount_percentage || ""}
                  onChange={(e) => setSchemeForm({ ...schemeForm, discount_percentage: parseFloat(e.target.value) || 0 })}
                  placeholder="Discount percentage"
                  max="100"
                />
              </div>
              <div>
                <Label htmlFor="validityDays">Validity (Days)</Label>
                <Input
                  id="validityDays"
                  type="number"
                  value={schemeForm.validity_days || ''}
                  onChange={(e) => setSchemeForm({ ...schemeForm, validity_days: parseInt(e.target.value) || null })}
                  placeholder="Valid for days"
                />
              </div>
            </div>
          </>
        );

      case 'first_order_discount':
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="discountPercentage">Discount Percentage (%)</Label>
                <Input
                  id="discountPercentage"
                  type="number"
                  value={schemeForm.discount_percentage || ""}
                  onChange={(e) => setSchemeForm({ ...schemeForm, discount_percentage: parseFloat(e.target.value) || 0 })}
                  placeholder="First order discount"
                  max="100"
                />
              </div>
              <div>
                <Label htmlFor="validityDays">Validity (Days)</Label>
                <Input
                  id="validityDays"
                  type="number"
                  value={schemeForm.validity_days || ''}
                  onChange={(e) => setSchemeForm({ ...schemeForm, validity_days: parseInt(e.target.value) || null })}
                  placeholder="Valid for days"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="firstOrderOnly"
                checked={schemeForm.is_first_order_only}
                onCheckedChange={(checked) => setSchemeForm({ ...schemeForm, is_first_order_only: checked })}
              />
              <Label htmlFor="firstOrderOnly">Apply only for first orders</Label>
            </div>
          </>
        );

      case 'category_wide_discount':
        return (
          <>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select
                value={schemeForm.category_id}
                onValueChange={(value) => setSchemeForm({ ...schemeForm, category_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="discountPercentage">Discount Percentage (%)</Label>
                <Input
                  id="discountPercentage"
                  type="number"
                  value={schemeForm.discount_percentage || ""}
                  onChange={(e) => setSchemeForm({ ...schemeForm, discount_percentage: parseFloat(e.target.value) || 0 })}
                  placeholder="Category discount %"
                  max="100"
                />
              </div>
              <div>
                <Label htmlFor="minOrderValue">Minimum Order Value (₹)</Label>
                <Input
                  id="minOrderValue"
                  type="number"
                  value={schemeForm.min_order_value || ""}
                  onChange={(e) => setSchemeForm({ ...schemeForm, min_order_value: parseFloat(e.target.value) || 0 })}
                  placeholder="Minimum order amount"
                />
              </div>
            </div>
          </>
        );

      case 'manual_per_unit_discount':
        return (
          <>
            <div>
              <Label>Discount Type</Label>
              <RadioGroup
                value={schemeForm.discount_value_type || 'amount'}
                onValueChange={(value) => setSchemeForm({ ...schemeForm, discount_value_type: value })}
                className="flex gap-4 mt-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="amount" id="dvt-amount" />
                  <Label htmlFor="dvt-amount" className="font-normal cursor-pointer">Flat Amount (₹/unit)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="percentage" id="dvt-pct" />
                  <Label htmlFor="dvt-pct" className="font-normal cursor-pointer">Percentage (% off rate)</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="maxDiscountPerUnit">
                  {schemeForm.discount_value_type === 'percentage'
                    ? 'Max Discount (%) *'
                    : 'Max Discount per Unit (₹) *'}
                </Label>
                <Input
                  id="maxDiscountPerUnit"
                  type="number"
                  min={0}
                  value={schemeForm.max_discount_per_unit || ""}
                  onChange={(e) => setSchemeForm({ ...schemeForm, max_discount_per_unit: parseFloat(e.target.value) || 0 })}
                  placeholder={schemeForm.discount_value_type === 'percentage' ? 'e.g. 10' : 'e.g. 40'}
                />
              </div>
              <div>
                <Label htmlFor="discountUnit">Per Unit</Label>
                <Select
                  value={schemeForm.discount_unit || 'kg'}
                  onValueChange={(value) => setSchemeForm({ ...schemeForm, discount_unit: value })}
                >
                  <SelectTrigger id="discountUnit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map(unit => (
                      <SelectItem key={unit.value} value={unit.value}>{unit.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="conditionQty">Min Quantity (optional)</Label>
              <Input
                id="conditionQty"
                type="number"
                min={0}
                value={schemeForm.condition_quantity || ""}
                onChange={(e) => setSchemeForm({ ...schemeForm, condition_quantity: parseFloat(e.target.value) || 0 })}
                placeholder="Leave blank for no minimum"
              />
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded border">
              Sales reps can apply this scheme to <strong>one line item</strong> per order and enter any value from{' '}
              {schemeForm.discount_value_type === 'percentage' ? (
                <>0% up to <strong>{schemeForm.max_discount_per_unit || 0}%</strong>. Line discount = rate × % × quantity.</>
              ) : (
                <>₹0 up to <strong>₹{schemeForm.max_discount_per_unit || 0}/{schemeForm.discount_unit || 'kg'}</strong>. Line discount = ₹/unit × quantity.</>
              )}
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Basic Information */}
      <div>
        <Label htmlFor="schemeName">Scheme Name</Label>
        <Input
          id="schemeName"
          value={schemeForm.name}
          onChange={(e) => setSchemeForm({ ...schemeForm, name: e.target.value })}
          placeholder="Enter scheme name"
        />
      </div>

      <div>
        <Label htmlFor="schemeDescription">Description</Label>
        <Textarea
          id="schemeDescription"
          value={schemeForm.description}
          onChange={(e) => setSchemeForm({ ...schemeForm, description: e.target.value })}
          placeholder="Enter scheme description"
        />
      </div>

      {/* Scheme Type Selection */}
      <div>
        <Label htmlFor="schemeType">Scheme Type</Label>
        <Select
          value={schemeForm.scheme_type}
          onValueChange={(value) => 
            setSchemeForm({ 
              ...schemeForm, 
              scheme_type: value,
              // Reset relevant fields when changing type
              condition_quantity: 0,
              discount_percentage: 0,
              discount_amount: 0,
              free_quantity: 0,
              buy_quantity: 0,
              free_product_id: '',
              bundle_product_ids: [],
              tier_data: [],
              category_id: '',
              is_first_order_only: false
            })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percentage_discount">
              <div className="flex items-center gap-2">
                {getSchemeTypeIcon('percentage_discount')}
                Percentage Discount
              </div>
            </SelectItem>
            <SelectItem value="flat_discount">
              <div className="flex items-center gap-2">
                {getSchemeTypeIcon('flat_discount')}
                Flat Discount (Amount Off)
              </div>
            </SelectItem>
            <SelectItem value="buy_x_get_y_free">
              <div className="flex items-center gap-2">
                {getSchemeTypeIcon('buy_x_get_y_free')}
                Buy X Get Y Free (BOGO)
              </div>
            </SelectItem>
            <SelectItem value="bundle_combo">
              <div className="flex items-center gap-2">
                {getSchemeTypeIcon('bundle_combo')}
                Bundle / Combo Discount
              </div>
            </SelectItem>
            <SelectItem value="tiered_discount">
              <div className="flex items-center gap-2">
                {getSchemeTypeIcon('tiered_discount')}
                Tiered Discount
              </div>
            </SelectItem>
            <SelectItem value="time_based_offer">
              <div className="flex items-center gap-2">
                {getSchemeTypeIcon('time_based_offer')}
                Time-Based Offer
              </div>
            </SelectItem>
            <SelectItem value="first_order_discount">
              <div className="flex items-center gap-2">
                {getSchemeTypeIcon('first_order_discount')}
                First Order Discount
              </div>
            </SelectItem>
            <SelectItem value="category_wide_discount">
              <div className="flex items-center gap-2">
                {getSchemeTypeIcon('category_wide_discount')}
                Category-Wide Discount
              </div>
            </SelectItem>
            <SelectItem value="manual_per_unit_discount">
              <div className="flex items-center gap-2">
                {getSchemeTypeIcon('manual_per_unit_discount')}
                Manual Per-Unit Discount
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Target Selection - Only for product-specific schemes */}
      {!['category_wide_discount', 'bundle_combo'].includes(schemeForm.scheme_type) && (
        <div className="space-y-4">
          {/* Multi-Product Toggle */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-muted-foreground" />
              <div>
                <Label htmlFor="multiProductMode" className="cursor-pointer">Apply to Multiple Products</Label>
                <p className="text-xs text-muted-foreground">Select multiple products for this scheme</p>
              </div>
            </div>
            <Switch
              id="multiProductMode"
              checked={schemeForm.multi_product_mode || false}
              onCheckedChange={(checked) => setSchemeForm({ 
                ...schemeForm, 
                multi_product_mode: checked,
                // Clear selections when toggling
                target_product_ids: checked ? [] : [],
                per_product_discounts: {},
                product_id: checked ? '' : schemeForm.product_id,
                discount_mode: 'same'
              })}
            />
          </div>

          {/* Single Product Selection - Searchable */}
          {!schemeForm.multi_product_mode && (
            <div>
              <Label htmlFor="product">Target Product</Label>
              <Popover open={productSearchOpen} onOpenChange={setProductSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={productSearchOpen}
                    className="w-full justify-between font-normal"
                  >
                    {schemeForm.variant_id && schemeForm.variant_id !== 'all'
                      ? products.find(p => p.id === schemeForm.variant_id)?.name || "Select product"
                      : schemeForm.product_id
                        ? products.find(p => p.id === schemeForm.product_id)?.name || "Select product"
                        : "Search and select product..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0 min-w-[350px]" align="start">
                  <Command>
                    <CommandInput placeholder="Search products..." />
                    <CommandList>
                      <CommandEmpty>No product found.</CommandEmpty>
                      <CommandGroup>
                        {products.map((product) => (
                          <CommandItem
                            key={product.id}
                            value={`${product.name} ${product.sku}`}
                            onSelect={() => {
                              setSchemeForm({
                                ...schemeForm,
                                product_id: product.type === 'variant' ? (product.parent_product_id || '') : product.id,
                                variant_id: product.type === 'variant' ? product.id : 'all'
                              });
                              setProductSearchOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                ((product.type === 'variant' && schemeForm.variant_id === product.id) ||
                                (product.type !== 'variant' && schemeForm.product_id === product.id && (!schemeForm.variant_id || schemeForm.variant_id === 'all')))
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            <span className="flex-1">{product.name}</span>
                            <span className="text-muted-foreground text-xs ml-2">₹{product.rate}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Multi-Product Selection with Search */}
          {schemeForm.multi_product_mode && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Select Products</Label>
                  <div className="flex gap-2">
                    <Button 
                      type="button"
                      variant="outline" 
                      size="sm" 
                      onClick={handleSelectAll}
                    >
                      Select All
                    </Button>
                    <Button 
                      type="button"
                      variant="ghost" 
                      size="sm" 
                      onClick={handleClearAll}
                    >
                      Clear All
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Selected: {(schemeForm.target_product_ids || []).length} of {products.length} product(s)
                </p>
                
                {/* Search Input */}
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    value={multiProductSearch}
                    onChange={(e) => setMultiProductSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                
                <div className="h-52 border rounded-md p-2 overflow-y-auto">
                  <div className="space-y-1">
                    {filteredProducts.map((product) => (
                      <div key={product.id} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded">
                        <Checkbox
                          id={`target-${product.id}`}
                          checked={(schemeForm.target_product_ids || []).includes(product.id)}
                          onCheckedChange={() => toggleTargetProduct(product.id)}
                        />
                        <label 
                          htmlFor={`target-${product.id}`}
                          className="text-sm cursor-pointer flex-1"
                        >
                          {product.name} <span className="text-muted-foreground">({product.sku})</span>
                          {product.type === 'variant' && (
                            <Badge variant="secondary" className="ml-2 text-xs">Variant</Badge>
                          )}
                        </label>
                        <Badge variant="outline" className="text-xs">
                          ₹{product.rate}
                        </Badge>
                      </div>
                    ))}
                    {filteredProducts.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No products found</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Discount Mode Selection - Only show when multiple products selected */}
              {(schemeForm.target_product_ids || []).length > 1 && (
                <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
                  <Label>Discount Application</Label>
                  <RadioGroup 
                    value={schemeForm.discount_mode || 'same'} 
                    onValueChange={(value) => {
                      setSchemeForm({ ...schemeForm, discount_mode: value });
                      if (value === 'same') {
                        applyUniformDiscount();
                      }
                    }}
                    className="flex flex-col gap-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="same" id="same" />
                      <Label htmlFor="same" className="cursor-pointer font-normal">
                        Same discount for all products
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="different" id="different" />
                      <Label htmlFor="different" className="cursor-pointer font-normal">
                        Different discount per product
                      </Label>
                    </div>
                  </RadioGroup>

                  {/* Per-Product Discount Table */}
                  {schemeForm.discount_mode === 'different' && (
                    <div className="mt-3 border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Product</TableHead>
                            <TableHead className="text-xs w-24">Price</TableHead>
                            <TableHead className="text-xs w-32">
                              {schemeForm.scheme_type === 'flat_discount' ? 'Discount Amount (₹)' : 'Discount %'}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(schemeForm.target_product_ids || []).map((productId: string) => {
                            const product = products.find(p => p.id === productId);
                            const isFlatDiscount = schemeForm.scheme_type === 'flat_discount';
                            const currentValue = isFlatDiscount 
                              ? (schemeForm.per_product_discounts?.[productId]?.discount_amount || 0)
                              : (schemeForm.per_product_discounts?.[productId]?.discount_percentage || 0);
                            return (
                              <TableRow key={productId}>
                                <TableCell className="text-sm py-2">
                                  {product?.name || 'Unknown'}
                                </TableCell>
                                <TableCell className="text-sm py-2 text-muted-foreground">
                                  ₹{product?.rate || 0}
                                </TableCell>
                                <TableCell className="py-2">
                                  <Input
                                    type="number"
                                    value={currentValue || ""}
                                    onChange={(e) => updateProductDiscount(
                                      productId, 
                                      parseFloat(e.target.value) || 0,
                                      isFlatDiscount ? 'discount_amount' : 'discount_percentage'
                                    )}
                                    className="h-8 w-24"
                                    max={isFlatDiscount ? undefined : 100}
                                    min={0}
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dynamic Fields Based on Scheme Type */}
      {renderSchemeTypeFields()}

      {/* Date Range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="startDate">Start Date</Label>
          <Input
            id="startDate"
            type="date"
            value={schemeForm.start_date}
            onChange={(e) => setSchemeForm({ ...schemeForm, start_date: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="endDate">End Date</Label>
          <Input
            id="endDate"
            type="date"
            value={schemeForm.end_date}
            onChange={(e) => setSchemeForm({ ...schemeForm, end_date: e.target.value })}
          />
        </div>
      </div>

      {/* Active Status */}
      <div className="flex items-center space-x-2">
        <Switch
          id="schemeActive"
          checked={schemeForm.is_active}
          onCheckedChange={(checked) => setSchemeForm({ ...schemeForm, is_active: checked })}
        />
        <Label htmlFor="schemeActive">Active</Label>
      </div>

      {/* Show in Customer Portal */}
      <div className="rounded-lg border p-3 bg-muted/30">
        <div className="flex items-center space-x-2">
          <Switch
            id="schemeShowInPortal"
            checked={!!schemeForm.show_in_portal}
            onCheckedChange={(checked) => setSchemeForm({ ...schemeForm, show_in_portal: checked })}
          />
          <Label htmlFor="schemeShowInPortal" className="font-medium">Show in Customer Portal</Label>
        </div>
        <p className="text-xs text-muted-foreground mt-1 ml-10">
          Enable this to make the scheme visible to customers in the Customer Portal (Schemes tab and cart hints).
        </p>
      </div>
    </div>
  );
};
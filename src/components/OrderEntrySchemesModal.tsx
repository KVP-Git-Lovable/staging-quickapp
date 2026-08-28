import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  Gift, 
  Calendar, 
  Percent, 
  TrendingUp, 
  ShoppingCart, 
  Package, 
  Search,
  Loader2,
  Check,
  Plus,
  WifiOff,
  X,
  Target,
  Globe,
  Info,
  Tag
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ProductScheme } from "@/hooks/useOfflineSchemes";
import { isSchemeConditionMet, schemeHasConditions, SchemeItem, calculateSchemeDiscountForComparison } from "@/utils/schemeEngine";
import { getSchemeProductLabel } from "@/utils/schemeProductLabel";
import { SchemePolicies } from "@/hooks/useSchemePolicies";
import type { ManualSchemeSelection } from "@/utils/schemeEngine";
import { ManualPerUnitApplyDialog } from "@/components/ManualPerUnitApplyDialog";
import { FreeProductChoiceDialog } from "@/components/FreeProductChoiceDialog";

interface Product {
  id: string;
  name: string;
  sku: string;
  rate: number;
  unit: string;
  category_id?: string | null;
}

interface OrderRow {
  id: string;
  product?: Product;
  variant?: any;
  quantity: number;
  unit?: string;
  uomCode?: string | null;
}

interface OrderEntrySchemesModalProps {
  isOpen: boolean;
  onClose: () => void;
  schemes: ProductScheme[];
  loading: boolean;
  isOnline: boolean;
  orderRows: OrderRow[];
  products: Product[];
  otherFreeProducts?: { id: string; name: string }[];
  appliedSchemeIds: string[];
  schemePolicies?: SchemePolicies;
  onApplyScheme: (scheme: ProductScheme, product?: Product, quantity?: number) => void;
  onRemoveScheme: (schemeId: string) => void;
  manualSelections?: Record<string, ManualSchemeSelection>;
  onSetManualSelection?: (schemeId: string, selection: ManualSchemeSelection | null) => void;
}

const getSchemeTypeIcon = (type: string) => {
  switch (type) {
    case 'percentage_discount':
      return <Percent className="w-3.5 h-3.5" />;
    case 'flat_discount':
      return <TrendingUp className="w-3.5 h-3.5" />;
    case 'buy_x_get_y_free':
      return <Gift className="w-3.5 h-3.5" />;
    case 'bundle_combo':
      return <ShoppingCart className="w-3.5 h-3.5" />;
    default:
      return <Package className="w-3.5 h-3.5" />;
  }
};

const getSchemeTypeLabel = (type: string) => {
  switch (type) {
    case 'percentage_discount':
      return 'Discount %';
    case 'flat_discount':
      return 'Flat Off';
    case 'buy_x_get_y_free':
      return 'Buy & Get';
    case 'bundle_combo':
      return 'Bundle';
    case 'tiered_discount':
      return 'Tiered';
    case 'time_based_offer':
      return 'Time Offer';
    case 'first_order_discount':
      return 'First Order';
    case 'category_wide_discount':
      return 'Category';
    case 'manual_per_unit_discount':
      return 'Per-Unit (Manual)';
    default:
      return type;
  }
};

const formatDate = (date: string | null) => {
  if (!date) return 'No limit';
  return new Date(date).toLocaleDateString('en-IN', { 
    day: 'numeric', 
    month: 'short'
  });
};

const formatUnit = (unit: string | undefined) => {
  if (!unit) return '';
  const unitMap: Record<string, string> = {
    'kg': 'KG',
    'grams': 'g',
    'pieces': 'pcs',
    'liters': 'L',
    'ml': 'ml',
    'units': 'units'
  };
  return unitMap[unit.toLowerCase()] || unit.toUpperCase();
};

const getConditionText = (scheme: ProductScheme) => {
  if (scheme.scheme_type === 'bundle_combo') {
    const bundleCount = scheme.bundle_product_ids?.length || 0;
    return `Bundle of ${bundleCount} products`;
  }
  if (scheme.condition_quantity && scheme.quantity_condition_type) {
    const unit = formatUnit(scheme.condition_unit);
    return `Buy ${scheme.quantity_condition_type === 'more_than' ? '>' : '≥'} ${scheme.condition_quantity}${unit ? ` ${unit}` : ''}`;
  }
  if (scheme.buy_quantity) {
    const buyUnit = formatUnit(scheme.buy_quantity_unit);
    return `Buy ${scheme.buy_quantity}${buyUnit ? ` ${buyUnit}` : ''}`;
  }
  if (scheme.min_order_value) {
    return `Min ₹${scheme.min_order_value}`;
  }
  return 'No minimum';
};

const getBenefitText = (scheme: ProductScheme) => {
  if (scheme.scheme_type === 'bundle_combo') {
    if (scheme.bundle_discount_percentage) {
      return `${scheme.bundle_discount_percentage}% off bundle`;
    }
    if (scheme.bundle_discount_amount) {
      return `₹${scheme.bundle_discount_amount} off bundle`;
    }
    return 'Bundle discount';
  }
  if (scheme.discount_percentage) {
    return `${scheme.discount_percentage}% off`;
  }
  if (scheme.discount_amount) {
    return `₹${scheme.discount_amount} off`;
  }
  if (scheme.free_quantity) {
    const freeUnit = formatUnit(scheme.free_quantity_unit);
    if (scheme.free_product_selection_mode === 'user_choice') {
      const poolSize = (scheme.free_target_product_ids?.length || 0) + (scheme.free_target_other_product_ids?.length || 0);
      return `Get ${scheme.free_quantity}${freeUnit ? ` ${freeUnit}` : ''} free — choose 1 of ${poolSize}`;
    }
    const freeProductName = (scheme.free_product_source === 'other' ? scheme.other_free_product_name : scheme.free_product_name) || 'item(s)';
    return `Get ${scheme.free_quantity}${freeUnit ? ` ${freeUnit}` : ''} ${freeProductName} free`;
  }
  return 'Special offer';
};

const isSchemeActive = (scheme: ProductScheme) => {
  if (!scheme.is_active) return false;
  const now = new Date();
  const startDate = scheme.start_date ? new Date(scheme.start_date) : null;
  // Set end_date to end of day (23:59:59) so scheme is valid for the entire day
  let endDate: Date | null = null;
  if (scheme.end_date) {
    endDate = new Date(scheme.end_date);
    endDate.setHours(23, 59, 59, 999);
  }
  
  if (startDate && now < startDate) return false;
  if (endDate && now > endDate) return false;
  return true;
};

export const OrderEntrySchemesModal: React.FC<OrderEntrySchemesModalProps> = ({
  isOpen,
  onClose,
  schemes,
  loading,
  isOnline,
  orderRows,
  products,
  otherFreeProducts = [],
  appliedSchemeIds,
  schemePolicies,
  onApplyScheme,
  onRemoveScheme,
  manualSelections = {},
  onSetManualSelection,
}) => {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [pickerScheme, setPickerScheme] = useState<ProductScheme | null>(null);
  const [freeProductPickerScheme, setFreeProductPickerScheme] = useState<ProductScheme | null>(null);

  // Check if more schemes can be applied based on policies
  const canApplyMore = useMemo(() => {
    if (!schemePolicies) return true;
    
    // Check max schemes limit
    if (appliedSchemeIds.length >= schemePolicies.maxSchemesPerOrder) {
      return false;
    }
    
    // If stacking is off and we have any scheme applied, can't add more
    if (!schemePolicies.allowSchemeStacking && appliedSchemeIds.length > 0) {
      return false;
    }
    
    return true;
  }, [schemePolicies, appliedSchemeIds]);

  // Function to check if a specific scheme can be applied
  const canApplyScheme = (scheme: ProductScheme): boolean => {
    if (!canApplyMore) return false;
    
    // Check same-type stacking if stacking is allowed but same-type is not
    if (schemePolicies && schemePolicies.allowSchemeStacking && !schemePolicies.sameTypeStacking) {
      const appliedTypes = appliedSchemeIds.map(id => 
        schemes.find(s => s.id === id)?.scheme_type
      ).filter(Boolean);
      
      if (appliedTypes.includes(scheme.scheme_type)) {
        return false;
      }
    }

    // Mutually exclusive schemes: can't apply one that shares a non-empty
    // exclusion_group with a scheme already applied.
    if (scheme.exclusion_group) {
      const appliedGroups = appliedSchemeIds
        .map(id => schemes.find(s => s.id === id)?.exclusion_group)
        .filter(Boolean);
      if (appliedGroups.includes(scheme.exclusion_group)) {
        return false;
      }
    }

    return true;
  };

  const activeSchemes = useMemo(() => 
    schemes.filter(s => isSchemeActive(s)), [schemes]);

  // Check if a scheme is product-specific or order-wide (category-scoped
  // schemes are neither — they're product_id-less but still restricted).
  const isOrderWideScheme = (scheme: ProductScheme) => {
    if (scheme.product_id || scheme.category_id) return false;
    if (scheme.scheme_type === 'bundle_combo' && scheme.bundle_product_ids && scheme.bundle_product_ids.length > 0) return false;
    if (scheme.target_product_ids && scheme.target_product_ids.length > 0) return false;
    return true;
  };

  // Check if the product(s) a scheme targets are in cart
  const isProductInCart = (scheme: ProductScheme) => {
    const orderRowsWithProduct = orderRows.filter(row => row.product);
    const orderProductIds = orderRowsWithProduct.map(row => row.product!.id);

    if (scheme.scheme_type === 'bundle_combo' && scheme.bundle_product_ids && scheme.bundle_product_ids.length > 0) {
      return scheme.bundle_product_ids.every(id => orderProductIds.includes(id));
    }

    if (scheme.target_product_ids && scheme.target_product_ids.length > 0) {
      return scheme.target_product_ids.some(id => orderProductIds.includes(id));
    }

    if (scheme.category_id) {
      return orderRowsWithProduct.some(row => row.product!.category_id === scheme.category_id);
    }

    if (isOrderWideScheme(scheme)) return true;

    return !!scheme.product_id && orderProductIds.includes(scheme.product_id);
  };

  // Build items for scheme calculation
  const schemeItems: SchemeItem[] = useMemo(() => {
    return orderRows
      .filter(row => row.product && row.quantity > 0)
      .map(row => ({
        id: row.variant?.id || row.product!.id,
        product_id: row.product!.id,
        variant_id: row.variant?.id,
        quantity: row.quantity,
        rate: row.variant?.price ?? row.product!.rate,
        name: row.variant?.variant_name || row.product!.name,
        category_id: row.product!.category_id ?? null,
        unit: row.uomCode || row.unit
      }));
  }, [orderRows]);

  const subtotal = useMemo(() => 
    schemeItems.reduce((sum, item) => sum + (item.rate * item.quantity), 0),
  [schemeItems]);

  // Find applicable schemes - only those where condition is actually met OR pure % offers
  const applicableSchemes = useMemo(() => {
    if (schemeItems.length === 0) return [];
    
    return activeSchemes.filter(scheme => {
      // Pure percentage offers without conditions - always show (require manual apply)
      if (scheme.scheme_type === 'percentage_discount' && !schemeHasConditions(scheme)) {
        return true;
      }
      
      // For schemes with conditions - only show if condition is met
      return isSchemeConditionMet(scheme, schemeItems, subtotal);
    });
  }, [activeSchemes, schemeItems, subtotal]);

  const filteredSchemes = useMemo(() => {
    return activeSchemes.filter(scheme => {
      const matchesSearch = scheme.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (scheme.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
                           (scheme.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
      return matchesSearch;
    });
  }, [activeSchemes, searchTerm]);

  // Handle apply scheme
  const handleApply = (scheme: ProductScheme) => {
    // Manual per-unit schemes open the picker dialog instead of toggling
    if (scheme.scheme_type === 'manual_per_unit_discount') {
      setPickerScheme(scheme);
      return;
    }

    // Many-to-many buy X get Y: the buyer must pick their free item before it applies
    if (scheme.scheme_type === 'buy_x_get_y_free' && scheme.free_product_selection_mode === 'user_choice') {
      setFreeProductPickerScheme(scheme);
      return;
    }

    // Find the product for this scheme
    let targetProduct: Product | undefined;
    let minQuantity = 1;

    if (scheme.product_id) {
      targetProduct = products.find(p => p.id === scheme.product_id);
    }

    // Calculate minimum quantity to qualify
    if (scheme.condition_quantity) {
      minQuantity = scheme.condition_quantity;
    } else if (scheme.buy_quantity) {
      minQuantity = scheme.buy_quantity;
    }

    // Check if product is already in order
    const existingRow = orderRows.find(row => row.product?.id === scheme.product_id);
    
    if (existingRow && existingRow.quantity >= minQuantity) {
      // Already meets condition
      onApplyScheme(scheme);
    } else if (targetProduct) {
      // Add or update product with minimum quantity
      onApplyScheme(scheme, targetProduct, minQuantity);
    } else {
      // Generic scheme (all products)
      onApplyScheme(scheme);
    }
  };

  // Handle remove scheme
  const handleRemove = (scheme: ProductScheme) => {
    onRemoveScheme(scheme.id);
    toast({
      title: "Offer Removed",
      description: `${scheme.name} has been removed from your order`,
    });
  };

  const SchemeCard = ({ scheme, showInAllTab = false }: { scheme: ProductScheme; showInAllTab?: boolean }) => {
    const isApplied = appliedSchemeIds.includes(scheme.id);
    const productLabel = getSchemeProductLabel(scheme, products);
    const isOrderWide = isOrderWideScheme(scheme);
    const productInCart = isProductInCart(scheme);
    const hasConditions = schemeHasConditions(scheme);
    const conditionMet = schemeItems.length > 0 && isSchemeConditionMet(scheme, schemeItems, subtotal);
    const isPurePercentage = scheme.scheme_type === 'percentage_discount' && !hasConditions;
    const isManualPerUnit = scheme.scheme_type === 'manual_per_unit_discount';
    const isFreeProductChoicePool = scheme.scheme_type === 'buy_x_get_y_free' && scheme.free_product_selection_mode === 'user_choice';
    const manualSel = manualSelections[scheme.id];
    const manualValueType: 'amount' | 'percentage' =
      (scheme.discount_value_type as 'amount' | 'percentage') === 'percentage' ? 'percentage' : 'amount';
    const manualUnit = scheme.discount_unit || 'unit';
    const manualLineName = manualSel
      ? schemeItems.find(i => i.id === manualSel.itemId)?.name
      : undefined;
    
    // In "All Offers" tab, show condition status for schemes with conditions
    const showConditionStatus = showInAllTab && hasConditions && !conditionMet;
    
    return (
      <Card className={`border ${isApplied ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : conditionMet || isPurePercentage ? 'border-primary/50 bg-primary/5' : 'border-border/50 opacity-60'}`}>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm truncate">{scheme.name}</h3>
              {/* Product-specific label */}
              <div className="flex items-center gap-1 mt-1">
                {scheme.category_id ? (
                  <Badge
                    variant={productInCart ? "default" : "outline"}
                    className={`text-[9px] px-1.5 py-0 flex items-center gap-0.5 ${!productInCart ? 'text-muted-foreground' : ''}`}
                  >
                    <Tag className="w-2.5 h-2.5" />
                    {scheme.category_name || 'Category'}
                  </Badge>
                ) : isOrderWide ? (
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 flex items-center gap-0.5">
                    <Globe className="w-2.5 h-2.5" />
                    All Products
                  </Badge>
                ) : (
                  <Badge
                    variant={productInCart ? "default" : "outline"}
                    className={`text-[9px] px-1.5 py-0 flex items-center gap-0.5 ${!productInCart ? 'text-muted-foreground' : ''}`}
                  >
                    <Target className="w-2.5 h-2.5" />
                    {productLabel}
                  </Badge>
                )}
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0.5 flex items-center gap-1">
              {getSchemeTypeIcon(scheme.scheme_type)}
              {getSchemeTypeLabel(scheme.scheme_type)}
            </Badge>
          </div>

          <div className="bg-muted/50 rounded p-2 text-xs space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Condition:</span>
              <div className="flex items-center gap-1">
                <span className="font-medium">{getConditionText(scheme)}</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-muted">
                      <Info className="w-3 h-3 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3" side="left">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm flex items-center gap-1.5">
                        {getSchemeTypeIcon(scheme.scheme_type)}
                        {scheme.name}
                      </h4>
                      {scheme.description && (
                        <p className="text-xs text-muted-foreground">{scheme.description}</p>
                      )}
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{scheme.category_id ? 'Category:' : 'Target Product:'}</span>
                          <span className="font-medium">{productLabel}</span>
                        </div>
                        {scheme.scheme_type === 'buy_x_get_y_free' && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Buy Quantity Threshold:</span>
                              <span className="font-medium">
                                {scheme.buy_quantity} {formatUnit(scheme.buy_quantity_unit) || 'units'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Free Product:</span>
                              <span className="font-medium">
                                {scheme.free_product_selection_mode === 'user_choice'
                                  ? (manualSel?.chosenFreeProductName || `Choose 1 of ${(scheme.free_target_product_ids?.length || 0) + (scheme.free_target_other_product_ids?.length || 0)}`)
                                  : ((scheme.free_product_source === 'other' ? scheme.other_free_product_name : scheme.free_product_name) || 'Same product')}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Free Quantity:</span>
                              <span className="font-medium text-green-600">
                                {scheme.free_quantity} {formatUnit(scheme.free_quantity_unit) || 'units'}
                              </span>
                            </div>
                          </>
                        )}
                        {(scheme.scheme_type === 'percentage_discount' || scheme.scheme_type === 'flat_discount') && scheme.condition_quantity && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Min Quantity:</span>
                            <span className="font-medium">
                              {scheme.condition_quantity} {formatUnit(scheme.condition_unit) || 'units'}
                            </span>
                          </div>
                        )}
                        {scheme.discount_percentage && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Discount:</span>
                            <span className="font-medium text-green-600">{scheme.discount_percentage}% off</span>
                          </div>
                        )}
                        {scheme.discount_amount && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Discount:</span>
                            <span className="font-medium text-green-600">₹{scheme.discount_amount} off</span>
                          </div>
                        )}
                        <div className="flex justify-between pt-1 border-t">
                          <span className="text-muted-foreground">Valid:</span>
                          <span className="text-[10px]">
                            {formatDate(scheme.start_date)} - {formatDate(scheme.end_date)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Benefit:</span>
              <span className="font-medium text-primary">
                {isManualPerUnit
                  ? `Up to ${manualValueType === 'percentage' ? `${scheme.max_discount_per_unit}%` : `₹${scheme.max_discount_per_unit}`} / ${manualUnit} (manual)`
                  : getBenefitText(scheme)}
              </span>
            </div>
            {isManualPerUnit && isApplied && manualSel && (
              <div className="flex justify-between text-[11px] pt-1 border-t border-border/40">
                <span className="text-muted-foreground">Applied to:</span>
                <span className="font-medium">
                  {manualLineName || 'item'} ·{' '}
                  {manualValueType === 'percentage'
                    ? `${manualSel.perUnitDiscount}% / ${manualUnit}`
                    : `₹${manualSel.perUnitDiscount} / ${manualUnit}`}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Calendar className="w-3 h-3" />
              <span>{formatDate(scheme.start_date)} - {formatDate(scheme.end_date)}</span>
            </div>
            
            {isApplied ? (
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-600 text-[10px] px-1.5">
                  <Check className="w-2.5 h-2.5 mr-0.5" />
                  Applied
                </Badge>
                {isManualPerUnit && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setPickerScheme(scheme)}
                  >
                    Edit
                  </Button>
                )}
                {isFreeProductChoicePool && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setFreeProductPickerScheme(scheme)}
                  >
                    Change
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleRemove(scheme)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : showConditionStatus ? (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Condition not met
              </Badge>
            ) : !isOrderWide && !productInCart ? (
              canApplyScheme(scheme) ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Add product first</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2.5"
                    onClick={() => handleApply(scheme)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add & Apply
                  </Button>
                </div>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  {!schemePolicies?.allowSchemeStacking ? 'Stacking off' : 'Max offers reached'}
                </Badge>
              )
            ) : canApplyScheme(scheme) ? (
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs px-2.5"
                onClick={() => handleApply(scheme)}
              >
                <Plus className="w-3 h-3 mr-1" />
                Apply
              </Button>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                {!schemePolicies?.allowSchemeStacking ? 'Stacking off' : 'Max offers reached'}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
            Schemes & Offers
            {appliedSchemeIds.length > 0 && (
              <Badge variant="default" className="ml-2 text-[10px]">
                {appliedSchemeIds.length} Applied
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        
        {/* Offline indicator banner */}
        {!isOnline && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md text-amber-700 dark:text-amber-400 text-xs">
            <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Offline - showing cached offers</span>
          </div>
        )}
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search schemes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading offers...</span>
          </div>
        ) : (
          <Tabs defaultValue={applicableSchemes.length > 0 ? "applicable" : "all"} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="applicable" className="text-xs">
                For Your Order ({applicableSchemes.length})
              </TabsTrigger>
              <TabsTrigger value="all" className="text-xs">
                All Offers ({filteredSchemes.length})
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto mt-3">
              <TabsContent value="applicable" className="m-0 space-y-2">
                {applicableSchemes.length > 0 ? (
                  applicableSchemes.map(scheme => (
                    <SchemeCard key={scheme.id} scheme={scheme} />
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Gift className="w-10 h-10 mx-auto text-muted-foreground mb-2 opacity-50" />
                    <p className="text-sm text-muted-foreground">No schemes for your items</p>
                    <p className="text-xs text-muted-foreground mt-1">Add products or check "All Offers"</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="all" className="m-0 space-y-2">
                {filteredSchemes.length > 0 ? (
                  filteredSchemes.map(scheme => (
                    <SchemeCard key={scheme.id} scheme={scheme} showInAllTab={true} />
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Package className="w-10 h-10 mx-auto text-muted-foreground mb-2 opacity-50" />
                    <p className="text-sm text-muted-foreground">
                      {schemes.length === 0 
                        ? (isOnline ? 'No active schemes found' : 'No cached schemes available')
                        : 'No matching schemes'
                      }
                    </p>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>

    <ManualPerUnitApplyDialog
      isOpen={!!pickerScheme}
      onClose={() => setPickerScheme(null)}
      scheme={pickerScheme}
      cartLines={orderRows
        .filter(r => r.product && r.quantity > 0)
        .map(r => ({
          id: r.variant?.id || r.product!.id,
          productId: r.product!.id,
          variantId: r.variant?.id,
          name: r.variant?.variant_name || r.product!.name,
          quantity: r.quantity,
          rate: r.variant?.price ?? r.product!.rate,
          unit: r.product!.unit,
          gstPercent: Number((r.variant as any)?.gst_percentage ?? (r.product as any)?.gst_percentage) || 0,
        }))}
      initialSelection={pickerScheme ? manualSelections[pickerScheme.id] : undefined}
      onConfirm={(selection) => {
        if (!pickerScheme) return;
        onSetManualSelection?.(pickerScheme.id, selection);
        if (!appliedSchemeIds.includes(pickerScheme.id)) {
          onApplyScheme(pickerScheme);
        }
        toast({
          title: 'Offer Applied',
          description: `${pickerScheme.name} applied to ${selection.itemIds?.length || 1} product${(selection.itemIds?.length || 1) > 1 ? 's' : ''}`,
        });
      }}
    />

    <FreeProductChoiceDialog
      isOpen={!!freeProductPickerScheme}
      onClose={() => setFreeProductPickerScheme(null)}
      scheme={freeProductPickerScheme}
      products={products}
      otherFreeProducts={otherFreeProducts}
      initialSelection={freeProductPickerScheme ? manualSelections[freeProductPickerScheme.id] : undefined}
      onConfirm={(selection) => {
        if (!freeProductPickerScheme) return;
        onSetManualSelection?.(freeProductPickerScheme.id, selection);
        if (!appliedSchemeIds.includes(freeProductPickerScheme.id)) {
          onApplyScheme(freeProductPickerScheme);
        }
        toast({
          title: 'Offer Applied',
          description: `${freeProductPickerScheme.name}: ${selection.chosenFreeProductName} added free`,
        });
      }}
    />
    </>
  );
};

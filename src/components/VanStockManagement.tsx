import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

import { Truck, Package, ShoppingCart, TrendingDown, Plus, Eye, Trash2, Check, ChevronsUpDown, Download, Edit, FileText, FileSpreadsheet, Printer, ChevronDown, History, RefreshCw, ClipboardCheck } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from "@/lib/utils";
import { offlineStorage, STORES } from '@/lib/offlineStorage';
// xlsx, jspdf, jspdf-autotable loaded dynamically in handlers
import { syncOrdersToVanStock, recalculateVanStock } from '@/utils/vanStockSync';
import { downloadExcel, downloadPDF } from '@/utils/fileDownloader';
import { computeLineTax } from '@/utils/taxCalc';
import { cacheVanStockForOffline } from '@/utils/localVanStockSync';
import { getOrdersForDate, calculateOrderedQuantitiesByProduct } from '@/utils/ordersForDate';

// Convert number to Indian words
const numberToWords = (num: number): string => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  if (num === 0) return 'Zero Rupees Only';
  
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  
  const convertLessThanThousand = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertLessThanThousand(n % 100) : '');
  };
  
  const convertToIndianWords = (n: number): string => {
    if (n === 0) return '';
    if (n < 1000) return convertLessThanThousand(n);
    if (n < 100000) return convertLessThanThousand(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convertLessThanThousand(n % 1000) : '');
    if (n < 10000000) return convertLessThanThousand(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convertToIndianWords(n % 100000) : '');
    return convertLessThanThousand(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convertToIndianWords(n % 10000000) : '');
  };
  
  let result = convertToIndianWords(rupees) + ' Rupees';
  if (paise > 0) {
    result += ' and ' + convertLessThanThousand(paise) + ' Paise';
  }
  return result + ' Only';
};

// Helper function to group products with their variants together for display
// Base products appear first, followed by their variants, then next product group
const groupProductsWithVariants = (items: any[], products: Product[]): any[] => {
  if (!items || items.length === 0) return [];
  
  // Build a map of variant_id to base_product_id from the products list
  // Products list contains both base products and variants as flat entries
  const variantToBaseMap = new Map<string, string>();
  const baseProductNames = new Map<string, string>();
  
  // First pass: identify base products (they have their own id as product_id)
  products.forEach(p => {
    // Check if this is a variant by looking if there's another product with same name pattern
    // Base products have their id matching the actual product id in the database
    baseProductNames.set(p.id, p.name);
  });
  
  // Group items by their base product ID
  const productGroups = new Map<string, any[]>();
  
  items.forEach(item => {
    // For van_stock_items, product_id could be a base product or variant
    // We need to determine the grouping key
    const productId = item.product_id;
    
    // Check if this product_id is a variant by looking at the product name pattern
    // If it's a variant, find its base product
    let groupKey = productId;
    
    // Find the product in our products list
    const matchingProduct = products.find(p => p.id === productId);
    if (matchingProduct) {
      // Check if there's a base product this might belong to
      // Variants typically have names that are part of a product family
      // For now, use the product_id as the group key
      groupKey = productId;
    }
    
    if (!productGroups.has(groupKey)) {
      productGroups.set(groupKey, []);
    }
    productGroups.get(groupKey)!.push(item);
  });
  
  // Sort groups by product name
  const sortedGroupKeys = Array.from(productGroups.keys()).sort((a, b) => {
    const aItems = productGroups.get(a)!;
    const bItems = productGroups.get(b)!;
    const aName = aItems[0]?.product_name || '';
    const bName = bItems[0]?.product_name || '';
    return aName.localeCompare(bName);
  });
  
  // Flatten groups back into sorted array
  const sortedItems: any[] = [];
  sortedGroupKeys.forEach(key => {
    const group = productGroups.get(key)!;
    // Sort within group by product name (variants will naturally sort alphabetically)
    group.sort((a, b) => {
      const aName = a.product_name || '';
      const bName = b.product_name || '';
      return aName.localeCompare(bName);
    });
    sortedItems.push(...group);
  });
  
  return sortedItems;
};

interface Van {
  id: string;
  registration_number: string;
  make_model: string;
  assigned_user_id?: string;
}

interface Product {
  id: string;
  name: string;
  unit: string;
  rate: number;
  gst_percentage?: number | null;
}

interface StockItem {
  id?: string;
  product_id: string;
  product_name: string;
  unit: string;
  start_qty: number;
  ordered_qty: number;
  returned_qty: number;
  left_qty: number;
}

interface Beat {
  id: string;
  beat_name: string;
}

interface VanStockManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
}

export function VanStockManagement({ open, onOpenChange, selectedDate }: VanStockManagementProps) {
  const [vans, setVans] = useState<Van[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [openProductPopovers, setOpenProductPopovers] = useState<{ [key: number]: boolean }>({});
  const [beats, setBeats] = useState<Beat[]>([]);
  const [selectedVan, setSelectedVan] = useState<string>('');
  const [selectedBeat, setSelectedBeat] = useState<string>('');
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [todayStock, setTodayStock] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPreviousStock, setLoadingPreviousStock] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<'start' | 'ordered' | 'returned' | 'left' | 'inventory' | null>(null);
  const [isMorning, setIsMorning] = useState(true);
  const [startKm, setStartKm] = useState(0);
  const [endKm, setEndKm] = useState(0);
  const [showLoadPreviousConfirm, setShowLoadPreviousConfirm] = useState(false);
  
  // Track original loaded values from previous stock to detect edits
  // edit_source: 'load_previous' = from Load Previous Van Stock, 'manual_edit' = from Edit button
  const [originalLoadedStock, setOriginalLoadedStock] = useState<{product_id: string; product_name: string; qty: number; unit: string; edit_source?: string}[]>([]);
  const [isRecalculating, setIsRecalculating] = useState(false);
  
  // Morning/Closing GRN states
  const [showClosingGRNModal, setShowClosingGRNModal] = useState(false);
  const [closingEndKm, setClosingEndKm] = useState(0);
  const [closingStockVerified, setClosingStockVerified] = useState(false);
  const [savingClosingGRN, setSavingClosingGRN] = useState(false);
  
  // Check if Morning GRN is saved (status contains 'morning_saved' or items exist)
  const isMorningGRNSaved = todayStock?.status === 'morning_saved' || todayStock?.status === 'closing_verified' || (todayStock?.van_stock_items && todayStock.van_stock_items.length > 0);
  
  // Check if Closing GRN is verified
  const isClosingGRNVerified = todayStock?.status === 'closing_verified';

  useEffect(() => {
    if (open) {
      loadVans();
      loadProducts();
      loadBeatForDate();
      checkTime();
      
      // Auto-recalculate van stock when dialog opens to fix any corrupted data
      recalculateVanStock(selectedDate).catch(err => {
        console.error('Error recalculating van stock on open:', err);
      });
    }
  }, [open, selectedDate]);

  // Manual recalculate function
  const handleRecalculateStock = async () => {
    setIsRecalculating(true);
    try {
      const success = await recalculateVanStock(selectedDate);
      if (success) {
        toast.success('Stock quantities recalculated successfully');
        // Reload the stock data to show updated values
        if (selectedVan) {
          loadTodayStock(false);
        }
      } else {
        toast.info('No stock data to recalculate');
      }
    } catch (error) {
      console.error('Error recalculating stock:', error);
      toast.error('Failed to recalculate stock');
    } finally {
      setIsRecalculating(false);
    }
  };

  useEffect(() => {
    if (selectedVan && selectedDate) {
      loadTodayStock(false);
    }
  }, [selectedVan, selectedDate, selectedBeat]);

  // Real-time subscription for order updates
  useEffect(() => {
    if (!selectedDate) return;

    const channel = supabase
      .channel('order-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        () => {
          // Reload stock when orders change - keep entry form as is
          if (selectedVan) {
            loadTodayStock(false);
          }
        }
      )
      .subscribe();

    // Listen for vanStockUpdated events (triggered after order sync)
    const handleVanStockUpdated = (event: CustomEvent) => {
      const { stockDate } = event.detail || {};
      if (stockDate === selectedDate && selectedVan) {
        console.log('🔄 Van stock updated event received, reloading...');
        loadTodayStock(false);
      }
    };
    
    window.addEventListener('vanStockUpdated', handleVanStockUpdated as EventListener);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('vanStockUpdated', handleVanStockUpdated as EventListener);
    };
  }, [selectedVan, selectedBeat, selectedDate]);

  const checkTime = () => {
    const hour = new Date().getHours();
    setIsMorning(hour < 12);
  };

  const loadVans = async () => {
    // Get current user ID
    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id;
    
    const { data, error } = await supabase
      .from('vans')
      .select('id, registration_number, make_model, assigned_user_id')
      .eq('is_active', true);
    
    if (error) {
      console.error('Error loading vans:', error);
    } else {
      setVans(data || []);
      if (data && data.length > 0) {
        // Auto-select the van assigned to the current user, or first van if none assigned
        const assignedVan = data.find(v => v.assigned_user_id === currentUserId);
        if (assignedVan) {
          console.log('🚚 Auto-selecting assigned van for user:', assignedVan.registration_number);
          setSelectedVan(assignedVan.id);
        } else {
          setSelectedVan(data[0].id);
        }
      }
    }
  };

  const loadProducts = async () => {
    try {
      // Try loading from IndexedDB first (offline-first)
      let cachedProducts = await offlineStorage.getAll(STORES.PRODUCTS);
      let cachedVariants = await offlineStorage.getAll(STORES.VARIANTS);
      
      if (cachedProducts && cachedProducts.length > 0) {
        console.log('Loaded products from cache:', cachedProducts.length);
        
        // Enrich products with their variants (only active ones: is_active !== false)
        const enrichedProducts = cachedProducts.map((p: any) => ({
          id: p.id,
          name: p.name,
          unit: p.unit,
          rate: p.rate || 0,
          gst_percentage: p.gst_percentage ?? null,
          variants: (cachedVariants || []).filter((v: any) => v.product_id === p.id && v.is_active !== false)
        }));
        
        // Flatten to include both base products and active variants
        const allProducts: Product[] = [];
        enrichedProducts.forEach((p: any) => {
          // Add base product
          allProducts.push(p);
          // Add active variants as separate entries
          if (p.variants && p.variants.length > 0) {
            p.variants.forEach((v: any) => {
              allProducts.push({
                id: v.id,
                name: v.variant_name,
                unit: p.unit,
                rate: v.price || p.rate,
                gst_percentage: p.gst_percentage ?? null,
              });
            });
          }
        });
        
        setProducts(allProducts);
      }
      
      // Try online fetch to update cache
      try {
        // Fetch all products where is_active is true OR null (treat null as active)
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('id, name, unit, rate, gst_percentage')
          .or('is_active.eq.true,is_active.is.null')
          .order('name');
        
        if (productsError) {
          console.error('Error fetching products:', productsError);
        } else if (productsData) {
          // Fetch all active variants (is_active true or null)
          const { data: variantsData } = await supabase
            .from('product_variants')
            .select('*')
            .or('is_active.eq.true,is_active.is.null');
          
          console.log('Loaded products from database:', productsData.length);
          console.log('Loaded variants from database:', variantsData?.length || 0);
          
          // Enrich products with their variants
          const enrichedProducts = productsData.map((p: any) => ({
            ...p,
            variants: (variantsData || []).filter((v: any) => v.product_id === p.id)
          }));
          
          // Flatten to include both base products and active variants
          const allProducts: Product[] = [];
          enrichedProducts.forEach((p: any) => {
            // Add base product
            allProducts.push({
              id: p.id,
              name: p.name,
              unit: p.unit,
              rate: p.rate,
              gst_percentage: p.gst_percentage ?? null,
            });
            // Add active variants as separate entries
            if (p.variants && p.variants.length > 0) {
              p.variants.forEach((v: any) => {
                allProducts.push({
                  id: v.id,
                  name: v.variant_name,
                  unit: p.unit,
                  rate: v.price || p.rate,
                  gst_percentage: p.gst_percentage ?? null,
                });
              });
            }
          });
          
          setProducts(allProducts);
          
          // Update cache
          for (const product of productsData) {
            await offlineStorage.save(STORES.PRODUCTS, product);
          }
          if (variantsData) {
            for (const variant of variantsData) {
              await offlineStorage.save(STORES.VARIANTS, variant);
            }
          }
        }
      } catch (onlineError) {
        console.log('Online fetch failed, using cached products:', onlineError);
      }
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error('Failed to load products');
    }
  };

  const loadBeatForDate = async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user) return;

    // Fetch all beat plans for the date (user may have multiple beats)
    const { data, error } = await supabase
      .from('beat_plans')
      .select('beat_id, beat_name')
      .eq('user_id', session.session.user.id)
      .eq('plan_date', selectedDate);

    if (error) {
      console.log('Error loading beat plans:', error);
      setBeats([]);
      setSelectedBeat('');
      return;
    }
    
    if (data && data.length > 0) {
      // Map all beats and auto-select the first one
      const beatsList = data.map(b => ({ id: b.beat_id, beat_name: b.beat_name }));
      setBeats(beatsList);
      setSelectedBeat(beatsList[0].id);
    } else {
      console.log('No beat plan found for this date - van stock can still be managed');
      setBeats([]);
      setSelectedBeat('');
    }
  };

  const loadTodayStock = async (clearEntryForm = false) => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user) return;

    const { data, error } = await supabase
      .from('van_stock')
      .select('*, van_stock_items(*)')
      .eq('van_id', selectedVan)
      .eq('stock_date', selectedDate)
      .eq('user_id', session.session.user.id)
      .maybeSingle();
    
    if (error) {
      console.error('Error loading stock:', error);
      setTodayStock(null);
      setStockItems([]);
    } else {
      // Always set todayStock with database data - this is used by modals
      setTodayStock(data);
      
      // Set KM values from database
      setStartKm(data?.start_km || 0);
      setEndKm(data?.end_km || 0);
      
      // Only clear entry form items if requested (after save)
      if (clearEntryForm) {
        setStockItems([]);
      } else if (!data?.van_stock_items || data.van_stock_items.length === 0) {
        setStockItems([]);
      }
      // If not clearEntryForm and there are saved items, don't touch stockItems (keeps entry form as-is)
      
      // CRITICAL: Cache van stock data for offline use
      // This ensures offline orders can calculate local van stock updates
      if (data?.van_stock_items && data.van_stock_items.length > 0 && session.session?.user?.id) {
        cacheVanStockForOffline(data.van_stock_items, session.session.user.id, selectedDate);
      }
    }
  };

  const calculateOrderedQuantities = async () => {
    // Use unified orders source to include offline orders
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) return {};
      
      // Get merged orders from DB + offline + snapshot
      const ordersResult = await getOrdersForDate(session.session.user.id, selectedDate, {
        includeSnapshot: true,
        forceOfflineFirst: false
      });
      
      if (ordersResult.orders.length === 0) return {};
      
      // Filter orders to only include retailers from the selected beat (if beat is selected)
      let relevantOrders = ordersResult.orders;
      
      if (selectedBeat) {
        // Get all retailers in the selected beat
        const { data: retailers } = await supabase
          .from('retailers')
          .select('id')
          .eq('beat_id', selectedBeat);
        
        const retailerIds = new Set(retailers?.map(r => r.id) || []);
        relevantOrders = ordersResult.orders.filter(o => 
          o.retailer_id && retailerIds.has(o.retailer_id)
        );
      }
      
      // Calculate quantities by product using utility function
      const quantities = calculateOrderedQuantitiesByProduct(relevantOrders as any);
      
      console.log('📦 [VanStock] Calculated ordered quantities from', relevantOrders.length, 'orders:', Object.keys(quantities).length, 'products');
      
      return quantities;
    } catch (error) {
      console.error('Error calculating ordered quantities:', error);
      return {};
    }
  };

  const handleLoadPreviousStockConfirm = async () => {
    setShowLoadPreviousConfirm(false);
    
    if (!selectedVan) {
      toast.error('Please select a van first');
      return;
    }

    setLoadingPreviousStock(true);

    try {
      const vanInfo = vans.find(v => v.id === selectedVan);
      console.log('🔄 Loading previous closing stock for van:', vanInfo?.registration_number, 'before date:', selectedDate);
      
      // PRIORITY 1: Load from van_stock_items (left_qty) - this is the primary source
      // Query van_stock for the selected van, most recent date before selectedDate
      const { data: previousStocks, error: stockError } = await supabase
        .from('van_stock')
        .select('*')
        .eq('van_id', selectedVan)
        .lt('stock_date', selectedDate)
        .order('stock_date', { ascending: false })
        .limit(10);

      if (stockError) throw stockError;

      // Find the most recent stock with items that have left_qty > 0
      let loadedFromStock = false;
      if (previousStocks && previousStocks.length > 0) {
        for (const stock of previousStocks) {
          // Fetch items separately since the relationship may not be configured
          const { data: stockItems, error: itemsError } = await supabase
            .from('van_stock_items')
            .select('*')
            .eq('van_stock_id', stock.id);

          if (itemsError) {
            console.error('Error fetching stock items:', itemsError);
            continue;
          }

          const itemsWithStock = (stockItems || []).filter((item: any) => (item.left_qty || 0) > 0);
          
          if (itemsWithStock.length > 0) {
            console.log('📦 Found van_stock from date:', stock.stock_date, 'items with left_qty:', itemsWithStock.length);
            
            const newStockItems: StockItem[] = itemsWithStock.map((item: any) => {
              const storedUnit = (item.unit || '').toLowerCase();
              const leftQty = item.left_qty || 0;
              
              // Convert grams to KG for display - default to KG
              const isGrams = storedUnit === 'grams' || storedUnit === 'gram' || storedUnit === 'g';
              const displayQty = isGrams ? leftQty / 1000 : leftQty;
              const displayUnit = isGrams ? 'kg' : (item.unit || 'kg');
              
              return {
                product_id: item.product_id,
                product_name: item.product_name,
                unit: displayUnit, // Use KG as default unit
                start_qty: displayQty, // Previous left becomes current start (converted to KG)
                ordered_qty: 0,
                returned_qty: 0,
                left_qty: displayQty, // Initially same as start (converted to KG)
              };
            });

            console.log('✅ Loaded from van_stock_items:', newStockItems.length, 'items from:', stock.stock_date);
            setStockItems(newStockItems);
            
            // Store original loaded values to track edits later (source: load_previous)
            const originalValues = newStockItems.map(item => ({
              product_id: item.product_id,
              product_name: item.product_name,
              qty: item.start_qty,
              unit: item.unit,
              edit_source: 'load_previous'
            }));
            setOriginalLoadedStock(originalValues);
            
            // Also load end_km or start_km as reference for current start_km
            if (stock.end_km && stock.end_km > 0) {
              setStartKm(stock.end_km);
            } else if (stock.start_km && stock.start_km > 0) {
              // If end_km not filled, use start_km + some estimate
              setStartKm(stock.start_km);
            }
            
            toast.success(`Loaded ${newStockItems.length} items from ${new Date(stock.stock_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} (Left in Van)`);
            loadedFromStock = true;
            break; // Found valid stock, stop searching
          }
        }
      }

      if (loadedFromStock) {
        setLoadingPreviousStock(false);
        return;
      }

      // PRIORITY 2: Fallback to van_live_inventory (if no van_stock found)
      console.log('📋 No van_stock found, checking van_live_inventory...');
      
      const { data: liveInventory, error: liveError } = await supabase
        .from('van_live_inventory')
        .select(`
          *,
          products(name, unit)
        `)
        .eq('van_id', selectedVan)
        .lt('date', selectedDate)
        .gt('current_stock', 0)
        .order('date', { ascending: false });

      if (liveError) throw liveError;

      if (liveInventory && liveInventory.length > 0) {
        const mostRecentDate = liveInventory[0].date;
        const latestInventory = liveInventory.filter(item => item.date === mostRecentDate);
        
        const newStockItems: StockItem[] = latestInventory
          .filter((item: any) => (item.current_stock || 0) > 0)
          .map((item: any) => {
            const storedUnit = ((item.products as any)?.unit || '').toLowerCase();
            const currentStock = item.current_stock || 0;
            
            // Convert grams to KG for display - default to KG
            const isGrams = storedUnit === 'grams' || storedUnit === 'gram' || storedUnit === 'g';
            const displayQty = isGrams ? currentStock / 1000 : currentStock;
            const displayUnit = isGrams ? 'kg' : ((item.products as any)?.unit || 'kg');
            
            return {
              product_id: item.product_id,
              product_name: (item.products as any)?.name || 'Unknown Product',
              unit: displayUnit,
              start_qty: displayQty,
              ordered_qty: 0,
              returned_qty: 0,
              left_qty: displayQty,
            };
          });

        if (newStockItems.length > 0) {
          console.log('✅ Loaded from live inventory:', newStockItems.length, 'items from:', mostRecentDate);
          setStockItems(newStockItems);
          
          // Store original loaded values to track edits later (source: load_previous)
          const originalValues = newStockItems.map(item => ({
            product_id: item.product_id,
            product_name: item.product_name,
            qty: item.start_qty,
            unit: item.unit,
            edit_source: 'load_previous'
          }));
          setOriginalLoadedStock(originalValues);
          
          toast.success(`Loaded ${newStockItems.length} items from ${new Date(mostRecentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`);
          setLoadingPreviousStock(false);
          return;
        }
      }

      toast.info('No previous closing stock found for this van');
    } catch (error) {
      console.error('Error loading previous stock:', error);
      toast.error('Failed to load previous van stock');
    } finally {
      setLoadingPreviousStock(false);
    }
  };
  
  const handleLoadPreviousStock = () => {
    if (!selectedVan) {
      toast.error('Please select a van first');
      return;
    }
    setShowLoadPreviousConfirm(true);
  };

  const handleAddProduct = () => {
    setStockItems([...stockItems, {
      product_id: '',
      product_name: '',
      unit: 'kg', // Default to KG
      start_qty: 0,
      ordered_qty: 0,
      returned_qty: 0,
      left_qty: 0,
    }]);
  };

  const handleRemoveProduct = (index: number) => {
    setStockItems(stockItems.filter((_, i) => i !== index));
  };

  // Helper to convert quantity between units
  const convertBetweenUnits = (qty: number, fromUnit: string, toUnit: string): number => {
    const from = (fromUnit || '').toLowerCase();
    const to = (toUnit || '').toLowerCase();
    
    if (from === to) return qty;
    
    // kg to grams
    if ((from === 'kg' || from === 'kilogram') && (to === 'grams' || to === 'gram' || to === 'g')) {
      return qty * 1000;
    }
    // grams to kg
    if ((from === 'grams' || from === 'gram' || from === 'g') && (to === 'kg' || to === 'kilogram')) {
      return qty / 1000;
    }
    
    return qty;
  };

  // Get display text showing equivalent in other unit
  const getUnitEquivalent = (qty: number, unit: string): string => {
    const u = (unit || '').toLowerCase();
    if (u === 'kg' || u === 'kilogram') {
      const grams = qty * 1000;
      return `(${grams.toLocaleString()}g)`;
    }
    if (u === 'grams' || u === 'gram' || u === 'g') {
      const kg = qty / 1000;
      return `(${kg.toFixed(2)}kg)`;
    }
    return '';
  };

  const handleProductChange = (index: number, field: keyof StockItem, value: any) => {
    const updated = [...stockItems];
    updated[index] = { ...updated[index], [field]: value };
    
    if (field === 'product_id') {
      const product = products.find(p => p.id === value);
      if (product) {
        updated[index].product_name = product.name;
        // Always default to KG when selecting a product
        updated[index].unit = 'kg';
      }
    }

    // When unit changes, convert quantity to the new unit
    if (field === 'unit') {
      const oldUnit = stockItems[index].unit;
      const newUnit = value;
      if (oldUnit && newUnit && updated[index].start_qty > 0) {
        updated[index].start_qty = convertBetweenUnits(updated[index].start_qty, oldUnit, newUnit);
      }
    }

    // Only auto-calculate left_qty when start_qty or returned_qty changes
    // ordered_qty is now auto-calculated from orders
    if (field === 'start_qty' || field === 'returned_qty' || field === 'unit') {
      updated[index].left_qty = updated[index].start_qty - updated[index].ordered_qty + updated[index].returned_qty;
    }
    
    setStockItems(updated);
  };

  const handleSaveStock = async () => {
    if (!selectedVan) {
      toast.error('Please select a van');
      return;
    }

    if (!startKm || startKm === 0) {
      toast.error('Please enter the Start KM.');
      return;
    }

    if (stockItems.length === 0 || stockItems.some(item => !item.product_id)) {
      toast.error('Please add at least one product with valid details');
      return;
    }

    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user) return;

    try {
      // Upsert van_stock - set status to 'morning_saved' when saving morning GRN
      const { data: vanStock, error: stockError } = await supabase
        .from('van_stock')
        .upsert({
          id: todayStock?.id,
          van_id: selectedVan,
          user_id: session.session.user.id,
          stock_date: selectedDate,
          status: 'morning_saved',
          start_km: startKm,
          end_km: endKm,
        }, {
          onConflict: 'van_id,stock_date,user_id',
        })
        .select()
        .single();

      if (stockError) throw stockError;

      // IMPORTANT: Fetch fresh existing items from DB to avoid duplicate insertions
      const { data: freshExistingItems } = await supabase
        .from('van_stock_items')
        .select('id, product_id')
        .eq('van_stock_id', vanStock.id);
      
      const existingItemsMap = new Map<string, string>();
      (freshExistingItems || []).forEach((e: any) => {
        existingItemsMap.set(e.product_id, e.id);
      });
      
      // Process each stock item - upsert by product_id to prevent duplicates
      for (const item of stockItems) {
        const existingItemId = existingItemsMap.get(item.product_id);
        
        // Convert kg to grams for storage (database stores integers)
        // 2.75 KG = 2750 grams
        const isKgUnit = item.unit?.toLowerCase() === 'kg';
        const conversionFactor = isKgUnit ? 1000 : 1;
        const storageUnit = isKgUnit ? 'Grams' : item.unit;
        
        const convertedStartQty = Math.round(Number(item.start_qty || 0) * conversionFactor);
        const convertedOrderedQty = Math.round(Number(item.ordered_qty || 0) * conversionFactor);
        const convertedReturnedQty = Math.round(Number(item.returned_qty || 0) * conversionFactor);
        const convertedLeftQty = Math.round(Number(item.left_qty || 0) * conversionFactor);
        
        if (existingItemId) {
          // Update existing item
          const { error: updateError } = await supabase
            .from('van_stock_items')
            .update({
              product_name: item.product_name,
              start_qty: convertedStartQty,
              ordered_qty: convertedOrderedQty,
              returned_qty: convertedReturnedQty,
              left_qty: convertedLeftQty,
              unit: storageUnit,
            })
            .eq('id', existingItemId);
          
          if (updateError) throw updateError;
        } else {
          // Insert new item
          const { error: insertError } = await supabase
            .from('van_stock_items')
            .insert({
              van_stock_id: vanStock.id,
              product_id: item.product_id,
              product_name: item.product_name,
              start_qty: convertedStartQty,
              ordered_qty: convertedOrderedQty,
              returned_qty: convertedReturnedQty,
              left_qty: convertedLeftQty,
              unit: storageUnit,
            });
          
          if (insertError) throw insertError;
        }
      }

      // Save opening edits if user loaded previous stock and made modifications
      if (originalLoadedStock.length > 0) {
        const edits: {
          van_stock_id: string;
          user_id: string;
          product_id: string;
          product_name: string;
          previous_qty: number;
          edited_qty: number;
          difference: number;
          unit: string;
          edit_source: string;
        }[] = [];

        for (const item of stockItems) {
          // Find the original loaded value for this product
          const original = originalLoadedStock.find(o => o.product_id === item.product_id);
          
          if (original) {
            // Compare current start_qty with original loaded qty
            const currentQty = Number(item.start_qty || 0);
            const originalQty = Number(original.qty || 0);
            const difference = currentQty - originalQty;
            
            // Only track if there's a difference
            if (difference !== 0) {
              // Convert to grams for storage
              const isKgUnit = item.unit?.toLowerCase() === 'kg';
              const conversionFactor = isKgUnit ? 1000 : 1;
              
              edits.push({
                van_stock_id: vanStock.id,
                user_id: session.session.user.id,
                product_id: item.product_id,
                product_name: item.product_name,
                previous_qty: Math.round(originalQty * conversionFactor),
                edited_qty: Math.round(currentQty * conversionFactor),
                difference: Math.round(difference * conversionFactor),
                unit: isKgUnit ? 'Grams' : item.unit,
                edit_source: original.edit_source || 'load_previous',
              });
            }
          } else {
            // New product added (not from previous stock) - track as addition
            const currentQty = Number(item.start_qty || 0);
            if (currentQty > 0) {
              const isKgUnit = item.unit?.toLowerCase() === 'kg';
              const conversionFactor = isKgUnit ? 1000 : 1;
              
              edits.push({
                van_stock_id: vanStock.id,
                user_id: session.session.user.id,
                product_id: item.product_id,
                product_name: item.product_name,
                previous_qty: 0,
                edited_qty: Math.round(currentQty * conversionFactor),
                difference: Math.round(currentQty * conversionFactor),
                unit: isKgUnit ? 'Grams' : item.unit,
                edit_source: originalLoadedStock[0]?.edit_source || 'load_previous',
              });
            }
          }
        }

        // Check for removed products (in original but not in current)
        for (const original of originalLoadedStock) {
          const stillExists = stockItems.find(s => s.product_id === original.product_id);
          if (!stillExists) {
            const isKgUnit = original.unit?.toLowerCase() === 'kg';
            const conversionFactor = isKgUnit ? 1000 : 1;
            
            edits.push({
              van_stock_id: vanStock.id,
              user_id: session.session.user.id,
              product_id: original.product_id,
              product_name: original.product_name,
              previous_qty: Math.round(original.qty * conversionFactor),
              edited_qty: 0,
              difference: Math.round(-original.qty * conversionFactor),
              unit: isKgUnit ? 'Grams' : original.unit,
              edit_source: original.edit_source || 'load_previous',
            });
          }
        }

        // Append new edits (do NOT delete existing ones to preserve history)
        if (edits.length > 0) {
          // Insert new edits as new entries (appending, not replacing)
          const { error: editError } = await supabase
            .from('van_stock_opening_edits')
            .insert(edits as any); // Cast to any to bypass type checking for edit_source
          
          if (editError) {
            console.error('Error saving opening edits:', editError);
            // Don't throw - still save stock successfully
          } else {
            const editSource = edits[0]?.edit_source || 'unknown';
            console.log('✅ Saved', edits.length, 'opening GRN edits (source:', editSource, ')');
          }
        }
      }

      // Clear original loaded stock after saving
      setOriginalLoadedStock([]);

      toast.success('Morning GRN saved successfully');
      // Clear the entry form after save - items are now in Product Stock in Van
      await loadTodayStock(true);
    } catch (error) {
      console.error('Error saving stock:', error);
      toast.error('Failed to save Morning GRN');
    } finally {
      setLoading(false);
    }
  };

  // Handle Save Closing GRN
  const handleSaveClosingGRN = async () => {
    if (!closingEndKm || closingEndKm <= 0) {
      toast.error('Please enter the End KM');
      return;
    }

    if (closingEndKm <= startKm) {
      toast.error('End KM must be greater than Start KM');
      return;
    }

    if (!closingStockVerified) {
      toast.error('Please verify the Left in Van stock by checking the checkbox');
      return;
    }

    setSavingClosingGRN(true);
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user) return;

    try {
      // Update van_stock with end_km and status = 'closing_verified'
      // Note: total_km is a generated column, so we only update end_km
      const { error: updateError } = await supabase
        .from('van_stock')
        .update({
          end_km: closingEndKm,
          status: 'closing_verified',
        })
        .eq('id', todayStock.id);

      if (updateError) throw updateError;

      toast.success('Closing GRN saved successfully');
      setShowClosingGRNModal(false);
      setClosingStockVerified(false);
      await loadTodayStock(false);
      
      // Dispatch event for End Day functionality
      window.dispatchEvent(new CustomEvent('closingGRNVerified', { detail: { date: selectedDate } }));
    } catch (error) {
      console.error('Error saving closing GRN:', error);
      toast.error('Failed to save Closing GRN');
    } finally {
      setSavingClosingGRN(false);
    }
  };

  // Convert quantity to KG based on unit
  const convertToKg = (quantity: number, unit: string): number => {
    const lowerUnit = (unit || '').toLowerCase();
    if (lowerUnit === 'kg' || lowerUnit === 'kilogram' || lowerUnit === 'kilograms') {
      return quantity;
    } else if (lowerUnit === 'g' || lowerUnit === 'gram' || lowerUnit === 'grams') {
      return quantity / 1000;
    } else if (lowerUnit === 'l' || lowerUnit === 'liter' || lowerUnit === 'liters' || lowerUnit === 'litre' || lowerUnit === 'litres') {
      return quantity; // Treat liters as KG for beverages
    } else if (lowerUnit === 'ml' || lowerUnit === 'milliliter' || lowerUnit === 'milliliters') {
      return quantity / 1000;
    }
    return quantity; // Default: treat as is for pieces etc.
  };

  // Format KG value to "X KG Y g" format
  const formatKgDisplay = (totalKg: number): string => {
    const kg = Math.floor(totalKg);
    const grams = Math.round((totalKg - kg) * 1000);
    if (kg === 0 && grams === 0) {
      return '0 KG';
    }
    if (grams === 0) {
      return `${kg} KG`;
    }
    if (kg === 0) {
      return `${grams} g`;
    }
    return `${kg} KG ${grams} g`;
  };

  const calculateTotals = () => {
    // Combine saved items from database AND unsaved items from entry form
    const savedItems = todayStock?.van_stock_items || [];
    
    // Create a map to avoid double-counting products that exist in both
    const productTotals: { [productId: string]: { start: number; ordered: number; returned: number; left: number; unit: string } } = {};
    
    // First, add saved items
    savedItems.forEach((item: any) => {
      const unit = item.unit || 'piece';
      productTotals[item.product_id] = {
        start: item.start_qty || 0,
        ordered: item.ordered_qty || 0,
        returned: item.returned_qty || 0,
        left: (item.start_qty || 0) - (item.ordered_qty || 0) + (item.returned_qty || 0),
        unit
      };
    });
    
    // Then, add/override with unsaved entry form items (stockItems)
    stockItems.forEach((item) => {
      if (item.product_id) {
        const unit = item.unit || 'piece';
        productTotals[item.product_id] = {
          start: item.start_qty || 0,
          ordered: item.ordered_qty || 0,
          returned: item.returned_qty || 0,
          left: item.left_qty || 0,
          unit
        };
      }
    });
    
    // Calculate totals in KG
    let totalStartKg = 0;
    let totalOrderedKg = 0;
    let totalReturnedKg = 0;
    let totalLeftKg = 0;
    
    Object.values(productTotals).forEach((item) => {
      totalStartKg += convertToKg(item.start, item.unit);
      totalOrderedKg += convertToKg(item.ordered, item.unit);
      totalReturnedKg += convertToKg(item.returned, item.unit);
      totalLeftKg += convertToKg(item.left, item.unit);
    });
    
    return {
      totalStart: formatKgDisplay(totalStartKg),
      totalOrdered: formatKgDisplay(totalOrderedKg),
      totalReturned: formatKgDisplay(totalReturnedKg),
      totalLeft: formatKgDisplay(totalLeftKg),
    };
  };

  const handleExportToExcel = async () => {
    const rawItems = todayStock?.van_stock_items || [];
    if (rawItems.length === 0) {
      toast.error('No stock items to export');
      return;
    }
    
    // Sort items by product group (base products with variants together)
    const savedItems = groupProductsWithVariants(rawItems, products);

    // Fetch company details
    const { data: companyData } = await supabase.from('companies').select('*').limit(1).single();
    const company = companyData as any || {};
    
    // Fetch user's full name
    const { data: { session } } = await supabase.auth.getSession();
    let userName = '';
    if (session?.user?.id) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .single();
      userName = profileData?.full_name || session.user.email || '';
    }
    
    // Get beat name
    const beatName = beats.find(b => b.id === selectedBeat)?.beat_name || '';
    
    const printDateTime = new Date().toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });

    // Calculate totals — per-product GST via computeLineTax (no flat 5%).
    let totalTaxable = 0;
    let cgst = 0;
    let sgst = 0;
    const itemsData = savedItems.map((item: any) => {
      const product = products.find(p => p.id === item.product_id);
      const priceWithGST = product?.rate || 0;
      const gstPct = Number(product?.gst_percentage) || 0;
      const priceWithoutGST = gstPct > 0 ? priceWithGST / (1 + gstPct / 100) : priceWithGST;
      const unit = (item.unit || '').toLowerCase();
      const qty = item.start_qty || 0;
      
      let qtyInKG = qty;
      let qtyDisplay = qty.toString();
      if (unit === 'grams' || unit === 'gram' || unit === 'g') {
        qtyInKG = qty / 1000;
        qtyDisplay = `${qty} (${qtyInKG.toFixed(3)} KG)`;
      }
      
      const totalValue = priceWithoutGST * qtyInKG;
      const lt = computeLineTax({ taxableAmount: totalValue, gstPercentage: gstPct });
      totalTaxable += lt.taxableAmount;
      cgst += lt.cgst;
      sgst += lt.sgst;
      
      return {
        'Product': item.product_name,
        'Rate (Excl. GST)': `₹${priceWithoutGST.toFixed(2)}`,
        'Unit': item.unit,
        'Quantity': qtyDisplay,
        'Amount': `₹${totalValue.toFixed(2)}`
      };
    });

    const grandTotal = totalTaxable + cgst + sgst;

    // Create worksheet with header info
    const headerData = [
      ['DELIVERY CHALLAN'],
      [''],
      ['Company:', company.name || ''],
      ['Address:', company.address || ''],
      ['GSTIN:', company.gstin || ''],
      ['Phone:', company.contact_phone || ''],
      ['Email:', company.email || ''],
      ['State:', company.state || ''],
      [''],
      ['Date & Time:', printDateTime],
      ['Van:', vans.find(v => v.id === selectedVan)?.registration_number || ''],
      ['Salesman:', userName],
      ['Beat:', beatName],
      ['']
    ];

    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet(headerData);
    XLSX.utils.sheet_add_json(ws, itemsData, { origin: 'A15' });
    
    // Add totals at the end
    const lastRow = 15 + itemsData.length + 1;
    XLSX.utils.sheet_add_aoa(ws, [
      [''],
      ['', '', '', 'Taxable Amount:', `₹${totalTaxable.toFixed(2)}`],
      ['', '', '', 'CGST (2.5%):', `₹${cgst.toFixed(2)}`],
      ['', '', '', 'SGST (2.5%):', `₹${sgst.toFixed(2)}`],
      ['', '', '', 'Grand Total:', `₹${grandTotal.toFixed(2)}`],
      [''],
      ['Amount in Words:', numberToWords(grandTotal)],
      [''],
      ['Bank Details:'],
      ['Bank:', company.bank_name || ''],
      ['Account:', company.bank_account || ''],
      ['IFSC:', company.ifsc || ''],
      ['A/c Holder:', company.account_holder_name || ''],
      ['UPI ID:', company.qr_upi || ''],
      [''],
      ['Terms & Conditions:'],
      [company.terms_conditions || '']
    ], { origin: `A${lastRow}` });
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Delivery Challan');
    
    const fileName = `Delivery_Challan_${selectedDate}.xlsx`;
    await downloadExcel(wb, fileName, XLSX);
  };

  const handleExportToPDF = async () => {
    try {
      toast.info('Generating PDF...');
      
      const rawItems = todayStock?.van_stock_items || [];
      if (rawItems.length === 0) {
        toast.error('No stock items to export');
        return;
      }
      
      // Sort items by product group (base products with variants together)
      const savedItems = groupProductsWithVariants(rawItems, products);

      // Fetch company details
      const { data: companyData } = await supabase.from('companies').select('*').limit(1).single();
      const company = companyData as any || {};
      
      // Fetch user's full name
      const { data: { session } } = await supabase.auth.getSession();
      let userName = '';
      if (session?.user?.id) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', session.user.id)
          .single();
        userName = profileData?.full_name || session.user.email || '';
      }
      
      // Get beat name
      const beatName = beats.find(b => b.id === selectedBeat)?.beat_name || '';

      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Draw page border
      doc.setDrawColor(34, 139, 34);
      doc.setLineWidth(1);
      doc.rect(8, 8, pageWidth - 16, pageHeight - 16);
      
      const printDateTime = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });

      let yPos = 14;

      // Company Logo
      if (company.logo_url) {
        try {
          const logoResponse = await fetch(company.logo_url);
          const logoBlob = await logoResponse.blob();
          const logoBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(logoBlob);
          });
          doc.addImage(logoBase64, 'PNG', 14, yPos, 30, 20);
          yPos = 12;
        } catch (e) {
          console.log('Could not load logo:', e);
        }
      }

      // Company Name & Header
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(company.name || 'Company Name', company.logo_url ? 50 : 14, yPos + 4);
      
      // Address split into 2 lines
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const fullAddress = company.address || '';
      const midPoint = Math.floor(fullAddress.length / 2);
      const breakPoint = fullAddress.indexOf(',', midPoint - 15) + 1 || fullAddress.indexOf(' ', midPoint);
      const addressLine1 = fullAddress.substring(0, breakPoint).trim();
      const addressLine2 = fullAddress.substring(breakPoint).trim();
      doc.text(addressLine1, company.logo_url ? 50 : 14, yPos + 10);
      doc.text(addressLine2, company.logo_url ? 50 : 14, yPos + 14);
      
      // Right side - GSTIN, Phone, Email, State
      doc.setFontSize(8);
      const rightX = pageWidth - 14;
      doc.text(`GSTIN: ${company.gstin || ''}`, rightX, yPos + 4, { align: 'right' });
      doc.text(`Phone: ${company.contact_phone || ''}`, rightX, yPos + 9, { align: 'right' });
      doc.text(`Email: ${company.email || ''}`, rightX, yPos + 14, { align: 'right' });
      doc.text(`State: ${company.state || ''}`, rightX, yPos + 19, { align: 'right' });

      yPos = 36;
      
      // Horizontal line
      doc.setDrawColor(34, 139, 34);
      doc.setLineWidth(1);
      doc.line(14, yPos, pageWidth - 14, yPos);
      yPos += 6;

      // DELIVERY CHALLAN heading (no individual border - page has border)
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(34, 139, 34);
      doc.text('DELIVERY CHALLAN', pageWidth / 2, yPos, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      yPos += 8;

      // Date/Time and Van info
      const selectedVanData = vans.find(v => v.id === selectedVan);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Date & Time: ${printDateTime}`, 14, yPos);
      doc.text(`Van: ${selectedVanData?.registration_number || ''} - ${selectedVanData?.make_model || ''}`, rightX, yPos, { align: 'right' });
      yPos += 5;
      
      // Salesman and Beat info
      doc.text(`Salesman: ${userName}`, 14, yPos);
      if (beatName) {
        doc.text(`Beat: ${beatName}`, rightX, yPos, { align: 'right' });
      }
      yPos += 6;

      // Calculate totals — per-product GST via computeLineTax (no flat 5%).
      let totalKGs = 0;
      let totalTaxable = 0;
      let cgst = 0;
      let sgst = 0;
      const tableData = savedItems.map((item: any) => {
        const product = products.find(p => p.id === item.product_id);
        const priceWithGST = product?.rate || 0;
        const gstPct = Number(product?.gst_percentage) || 0;
        const priceWithoutGST = gstPct > 0 ? priceWithGST / (1 + gstPct / 100) : priceWithGST;
        const qty = item.start_qty || 0;
        const unit = (item.unit || '').toLowerCase();
        
        let qtyDisplay = qty.toString();
        let qtyInKG = qty;
        if (unit === 'grams' || unit === 'gram' || unit === 'g') {
          qtyInKG = qty / 1000;
          totalKGs += qtyInKG;
          // Show grams with kg conversion in brackets
          qtyDisplay = `${qty} (${qtyInKG.toFixed(2)} KG)`;
        } else if (unit === 'kg' || unit === 'kgs') {
          totalKGs += qty;
        }
        
        const totalVal = priceWithoutGST * qtyInKG;
        const lt = computeLineTax({ taxableAmount: totalVal, gstPercentage: gstPct });
        totalTaxable += lt.taxableAmount;
        cgst += lt.cgst;
        sgst += lt.sgst;
        
        return [
          item.product_name,
          priceWithoutGST.toFixed(2),
          item.unit || '',
          qtyDisplay,
          totalVal.toFixed(2)
        ];
      });

      // Products table with reduced spacing - 5 columns only, no empty column
      autoTable(doc, {
        startY: yPos,
        head: [['Product', 'Rate (Rs.)', 'Unit', 'Qty', 'Amount (Rs.)']],
        body: tableData,
        styles: { 
          fontSize: 8, 
          cellPadding: 1.5,
          lineColor: [34, 139, 34],
          lineWidth: 0.2,
          font: 'helvetica',
          overflow: 'linebreak'
        },
        headStyles: { 
          fillColor: [34, 139, 34], 
          textColor: 255, 
          fontStyle: 'bold',
          halign: 'center',
          cellPadding: 2,
          valign: 'middle'
        },
        bodyStyles: {
          valign: 'middle'
        },
        alternateRowStyles: { fillColor: [245, 250, 245] },
        columnStyles: {
          0: { cellWidth: 55, halign: 'left' },
          1: { cellWidth: 25, halign: 'right' },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 45, halign: 'center' },
          4: { cellWidth: 'auto', halign: 'right' }
        },
        margin: { left: 14, right: 14 },
        tableLineColor: [34, 139, 34],
        tableLineWidth: 0.2
      });

      let finalY = (doc as any).lastAutoTable.finalY + 5;
      
      // Check if we need new page for totals
      if (finalY > 235) {
        doc.addPage();
        finalY = 20;
      }

      // Tax breakdown box (uses per-line totals computed above)
      const grandTotal = totalTaxable + cgst + sgst;
      
      
      const boxWidth = 75;
      const boxX = pageWidth - boxWidth - 14;
      const boxHeight = 32;
      
      // Draw box with border
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(34, 139, 34);
      doc.setLineWidth(0.5);
      doc.rect(boxX, finalY, boxWidth, boxHeight, 'FD');
      
      // Tax breakdown content - properly aligned
      const labelX = boxX + 4;
      const valueX = boxX + boxWidth - 4;
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Taxable Amount:', labelX, finalY + 6);
      doc.text('Rs. ' + totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), valueX, finalY + 6, { align: 'right' });
      
      doc.text('CGST (2.5%):', labelX, finalY + 12);
      doc.text('Rs. ' + cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), valueX, finalY + 12, { align: 'right' });
      
      doc.text('SGST (2.5%):', labelX, finalY + 18);
      doc.text('Rs. ' + sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), valueX, finalY + 18, { align: 'right' });
      
      // Grand total with separator line
      doc.setDrawColor(34, 139, 34);
      doc.line(boxX + 2, finalY + 22, boxX + boxWidth - 2, finalY + 22);
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Grand Total:', labelX, finalY + 28);
      doc.text('Rs. ' + grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), valueX, finalY + 28, { align: 'right' });

      // Total KGs and Items display - left side
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Total Weight: ' + totalKGs.toFixed(2) + ' KG', 14, finalY + 8);
      doc.text('Total Items: ' + savedItems.length, 14, finalY + 15);

      // Amount in Words
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      const amountInWords = numberToWords(grandTotal);
      const wordsWrapped = doc.splitTextToSize('Amount in Words: ' + amountInWords, 95);
      doc.text(wordsWrapped, 14, finalY + 24);

      finalY += boxHeight + 6;

      // Terms & Conditions - full width at bottom
      if (company.terms_conditions) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text('Terms & Conditions:', 14, finalY + 4);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        const terms = doc.splitTextToSize(company.terms_conditions, pageWidth - 28);
        doc.text(terms.slice(0, 4), 14, finalY + 9);
      }

      toast.info('Saving PDF...');
      const pdfBlob = doc.output('blob');
      const success = await downloadPDF(pdfBlob, `Delivery_Challan_${selectedDate}.pdf`);
      
      if (!success) {
        toast.error('PDF save failed - check app permissions');
      }
    } catch (error: any) {
      console.error('PDF export error:', error);
      toast.error(`PDF Error: ${error.message || 'Unknown error'}`);
    }
  };

  const handlePrint = async () => {
    const rawItems = todayStock?.van_stock_items || [];
    if (rawItems.length === 0) {
      toast.error('No stock items to print');
      return;
    }
    
    // Sort items by product group (base products with variants together)
    const savedItems = groupProductsWithVariants(rawItems, products);

    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();
    const dateStr = new Date(selectedDate).toLocaleDateString('en-IN', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Product Stock in Van', 14, 20);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const selectedVanData = vans.find(v => v.id === selectedVan);
    doc.text(`Date: ${dateStr}`, 14, 28);
    if (selectedVanData) {
      doc.text(`Van: ${selectedVanData.registration_number} - ${selectedVanData.make_model}`, 14, 35);
    }

    // Calculate totals with proper gram to KG conversion
    // Price is per KG, so we need to convert grams to KG for value calculation
    let totalKGs = 0;
    const totalValue = savedItems.reduce((sum: number, item: any) => {
      const product = products.find(p => p.id === item.product_id);
      const priceWithoutGST = (product?.rate || 0) / 1.05; // Price per KG
      const unit = (item.unit || '').toLowerCase();
      const qty = item.start_qty || 0;
      
      // Convert grams to KG for both weight and value calculation
      let qtyInKG = qty;
      if (unit === 'grams' || unit === 'gram' || unit === 'g') {
        qtyInKG = qty / 1000;
        totalKGs += qtyInKG;
      } else if (unit === 'kg' || unit === 'kgs') {
        totalKGs += qty;
      }
      
      // Calculate value using quantity in KG since price is per KG
      return sum + (priceWithoutGST * qtyInKG);
    }, 0);
    
    doc.setFontSize(10);
    doc.text(`Total Items: ${savedItems.length}`, 14, 42);
    doc.text(`Total KGs in Van: ${totalKGs.toFixed(2)} KG`, 14, 48);
    doc.text(`Total Value (Excl. GST): Rs. ${totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, 54);

    const tableData = savedItems.map((item: any) => {
      const product = products.find(p => p.id === item.product_id);
      const priceWithGST = product?.rate || 0;
      const priceWithoutGST = priceWithGST / 1.05;
      const qty = item.start_qty || 0;
      const unit = (item.unit || '').toLowerCase();
      
      let qtyDisplay = qty.toString();
      let unitDisplay = item.unit || '';
      
      // For grams, show both grams and KG equivalent
      let qtyInKG = qty;
      if (unit === 'grams' || unit === 'gram' || unit === 'g') {
        qtyInKG = qty / 1000;
        qtyDisplay = `${qty} (${qtyInKG.toFixed(3)} KG)`;
      }
      
      // Price is per KG, so calculate total using quantity in KG
      const totalVal = priceWithoutGST * qtyInKG;
      
      return [
        item.product_name,
        `Rs. ${priceWithoutGST.toFixed(2)}`,
        unitDisplay,
        qtyDisplay,
        `Rs. ${totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      ];
    });

    autoTable(doc, {
      startY: 60,
      head: [['Product', 'Price (Excl. GST)', 'Unit', 'Quantity', 'Total Value']],
      body: tableData,
      styles: { 
        fontSize: 9, 
        cellPadding: 4,
        lineColor: [200, 200, 200],
        lineWidth: 0.5
      },
      headStyles: { 
        fillColor: [59, 130, 246], 
        textColor: 255, 
        fontStyle: 'bold',
        halign: 'center'
      },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 35, halign: 'right' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 45, halign: 'center' },
        4: { cellWidth: 40, halign: 'right' }
      },
      tableLineColor: [100, 100, 100],
      tableLineWidth: 0.1
    });

    // Add footer with total
    const finalY = (doc as any).lastAutoTable.finalY || 60;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, finalY + 2, 181, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Grand Total: Rs. ${totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${totalKGs.toFixed(2)} KG)`, 14, finalY + 9);

    // Open print dialog
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const printWindow = window.open(pdfUrl);
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  const totals = calculateTotals();
  const totalKm = endKm - startKm;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Truck className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
              <span className="truncate">Van Stock - {new Date(selectedDate).toLocaleDateString('en-IN', { 
                day: 'numeric', 
                month: 'short',
                year: 'numeric' 
              })}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Select Van</Label>
                <Select value={selectedVan} onValueChange={setSelectedVan}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a van" />
                  </SelectTrigger>
                  <SelectContent>
                    {vans.map(van => (
                      <SelectItem key={van.id} value={van.id}>
                        {van.registration_number} - {van.make_model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Beat (Auto-selected from plan)</Label>
                <Select value={selectedBeat} disabled>
                  <SelectTrigger>
                    <SelectValue placeholder={selectedBeat ? undefined : "No beat planned for this date"} />
                  </SelectTrigger>
                  <SelectContent>
                    {beats.length > 0 ? (
                      beats.map(beat => (
                        <SelectItem key={beat.id} value={beat.id}>
                          {beat.beat_name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>No beat planned</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                
                {/* Load Previous Van Stock Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadPreviousStock}
                  disabled={!selectedVan || loadingPreviousStock}
                  className="w-full gap-2 text-xs border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900 text-amber-700 dark:text-amber-300"
                >
                  <History className="h-3.5 w-3.5" />
                  {loadingPreviousStock ? 'Loading...' : 'Load Previous Van Stock'}
                </Button>
              </div>
            </div>

            {selectedVan && selectedBeat && (
              <>
                {/* Summary Cards with Recalculate Button */}
                <div className="bg-blue-50 dark:bg-blue-950 p-2 rounded-lg border border-blue-200 dark:border-blue-800 mb-3 flex items-center justify-between">
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    <strong>Note:</strong> Orders from today's beat are auto-counted here.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRecalculateStock}
                    disabled={isRecalculating}
                    className="text-xs h-7 gap-1 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900"
                  >
                    <RefreshCw className={cn("h-3 w-3", isRecalculating && "animate-spin")} />
                    {isRecalculating ? 'Recalculating...' : 'Recalculate'}
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Card 
                    className="p-2.5 cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => setShowDetailModal('start')}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Package className="h-4 w-4 text-primary" />
                      <Eye className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Product Stock in Van</p>
                    <p className="text-base sm:text-lg font-bold leading-tight">{totals.totalStart}</p>
                  </Card>

                  <Card 
                    className="p-2.5 cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => setShowDetailModal('ordered')}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <ShoppingCart className="h-4 w-4 text-amber-500" />
                      <Eye className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Retailer Ordered Qty</p>
                    <p className="text-base sm:text-lg font-bold leading-tight">{totals.totalOrdered}</p>
                    <Badge variant="secondary" className="mt-1 text-[9px] px-1 py-0">Auto-calculated</Badge>
                  </Card>

                  <Card 
                    className="p-2.5 cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => setShowDetailModal('returned')}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Package className="h-4 w-4 text-blue-600" />
                      <Eye className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Returned Qty</p>
                    <p className="text-base sm:text-lg font-bold leading-tight">{totals.totalReturned}</p>
                  </Card>

                  <Card 
                    className="p-2.5 cursor-pointer hover:bg-accent transition-colors bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                    onClick={() => setShowDetailModal('left')}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <TrendingDown className="h-4 w-4 text-green-600" />
                      <Eye className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <p className="text-[10px] text-green-700 dark:text-green-300 font-medium mb-0.5">Left in the Van</p>
                    <p className="text-base sm:text-lg font-bold leading-tight text-green-700 dark:text-green-300">{totals.totalLeft}</p>
                  </Card>
                </div>

                {/* KM Tracking */}
                <Card className="p-2.5 bg-blue-50 dark:bg-blue-950">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] font-semibold">Start KM</Label>
                      <Input
                        type="number"
                        value={startKm || ''}
                        onChange={(e) => setStartKm(parseFloat(e.target.value) || 0)}
                        onFocus={(e) => e.target.select()}
                        placeholder="Start"
                        className="mt-0.5 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-semibold">End KM</Label>
                      <Input
                        type="number"
                        value={endKm || ''}
                        onChange={(e) => setEndKm(parseFloat(e.target.value) || 0)}
                        onFocus={(e) => e.target.select()}
                        placeholder="End"
                        className="mt-0.5 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-semibold">Total KM</Label>
                      <div className="mt-0.5 h-8 px-2 py-1 bg-primary/10 rounded-md border border-primary/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">
                          {endKm > 0 ? totalKm.toFixed(2) : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Stock Items Management */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm sm:text-lg font-semibold">Add Stock Items</Label>
                    <Button size="sm" onClick={handleAddProduct} className="h-8 text-xs">
                      <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1" /> Add Product
                    </Button>
                  </div>

                  {stockItems.length > 0 && (
                    <div className="space-y-1.5">
                      {/* Sort stock items alphabetically by product name for display */}
                      {[...stockItems]
                        .map((item, originalIndex) => ({ item, originalIndex }))
                        .sort((a, b) => (a.item.product_name || '').localeCompare(b.item.product_name || ''))
                        .map(({ item, originalIndex: index }) => {
                        const selectedProduct = products.find(p => p.id === item.product_id);
                        const pricePerUnit = selectedProduct?.rate || 0;
                        
                        return (
                          <Card key={index} className="p-1.5">
                            <div className="flex items-start gap-1">
                              <div className="flex-1 min-w-0">
                                <Label className="text-[9px] text-muted-foreground mb-0.5 block">Product</Label>
                                <Popover 
                                  open={openProductPopovers[index]} 
                                  onOpenChange={(open) => setOpenProductPopovers(prev => ({ ...prev, [index]: open }))}
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      role="combobox"
                                      aria-expanded={openProductPopovers[index]}
                                      className="w-full justify-between h-8 px-2 font-normal"
                                    >
                                      {selectedProduct ? (
                                        <div className="flex flex-col items-start text-left flex-1 min-w-0">
                                          <span className="truncate text-[11px] leading-tight w-full">{selectedProduct.name}</span>
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground text-[11px]">Select...</span>
                                      )}
                                      <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[280px] p-0 bg-background z-[100]" align="start">
                                    <Command className="bg-background">
                                      <CommandInput placeholder="Search products..." className="h-9 text-xs" />
                                      <CommandList className="bg-background max-h-[250px] overflow-y-auto overscroll-contain">
                                        <CommandEmpty>No product found.</CommandEmpty>
                                        <CommandGroup className="bg-background">
                                          {[...products].sort((a, b) => a.name.localeCompare(b.name)).map((product) => (
                                            <CommandItem
                                              key={product.id}
                                              value={`${product.name} ${product.rate}`}
                                              onSelect={() => {
                                                handleProductChange(index, 'product_id', product.id);
                                                setOpenProductPopovers(prev => ({ ...prev, [index]: false }));
                                              }}
                                              className="text-xs bg-background hover:bg-accent py-1"
                                            >
                                              <Check
                                                className={cn(
                                                  "mr-2 h-3 w-3",
                                                  item.product_id === product.id ? "opacity-100" : "opacity-0"
                                                )}
                                              />
                                              <div className="flex-1 leading-tight">
                                                <div className="font-medium leading-tight">{product.name}</div>
                                                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                                                  ₹{product.rate.toFixed(2)} per {product.unit}
                                                </div>
                                              </div>
                                            </CommandItem>
                                          ))}
                                        </CommandGroup>
                                      </CommandList>
                                    </Command>
                                  </PopoverContent>
                                </Popover>
                                {selectedProduct && (
                                  <span className="text-[9px] text-muted-foreground mt-0.5 block">₹{pricePerUnit.toFixed(2)}/kg</span>
                                )}
                              </div>
                              
                              <div className="w-14 shrink-0">
                                <Label className="text-[9px] text-muted-foreground mb-0.5 block">Unit</Label>
                                <Select
                                  value={item.unit}
                                  onValueChange={(value) => handleProductChange(index, 'unit', value)}
                                >
                                  <SelectTrigger className="h-8 text-[11px] px-1.5">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="z-[100]">
                                    <SelectItem value="kg" className="text-[11px]">KG</SelectItem>
                                    <SelectItem value="grams" className="text-[11px]">g</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              
                              <div className="w-16 shrink-0">
                                <Label className="text-[9px] text-muted-foreground mb-0.5 block">Qty</Label>
                                <Input
                                  type="number"
                                  value={item.start_qty || ''}
                                  onChange={(e) => handleProductChange(index, 'start_qty', parseFloat(e.target.value) || 0)}
                                  onFocus={(e) => e.target.select()}
                                  placeholder="0"
                                  step={item.unit?.toLowerCase() === 'kg' ? '0.1' : '1'}
                                  className="h-8 text-[11px] px-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  min="0"
                                />
                                {item.start_qty > 0 && (
                                  <span className="text-[8px] text-muted-foreground mt-0.5 block">
                                    {getUnitEquivalent(item.start_qty, item.unit)}
                                  </span>
                                )}
                              </div>
                              
                              <div className="shrink-0 pt-4">
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  onClick={() => handleRemoveProduct(index)}
                                  className="h-8 w-8 p-0"
                                  title="Remove product"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Action Buttons - Morning GRN / Closing GRN */}
                <div className="space-y-2 pt-3 border-t">
                  <div className="flex gap-2">
                    {/* Save Morning GRN */}
                    <Button 
                      onClick={handleSaveStock} 
                      disabled={loading || isClosingGRNVerified} 
                      className="flex-1 h-9 text-sm bg-amber-600 hover:bg-amber-700"
                    >
                      {loading ? 'Saving...' : isMorningGRNSaved ? '✓ Morning GRN Saved' : 'Save Morning GRN'}
                    </Button>
                  </div>
                  
                  <div className="flex gap-2">
                    {/* Save Closing GRN - only enabled after Morning GRN is saved */}
                    <Button 
                      onClick={() => {
                        setClosingEndKm(endKm || 0);
                        setShowClosingGRNModal(true);
                      }}
                      disabled={!isMorningGRNSaved || isClosingGRNVerified}
                      variant={isClosingGRNVerified ? "default" : "outline"}
                      className={cn(
                        "flex-1 h-9 text-sm",
                        !isMorningGRNSaved && "opacity-50 cursor-not-allowed",
                        isClosingGRNVerified && "bg-green-600 hover:bg-green-700"
                      )}
                    >
                      {isClosingGRNVerified ? '✓ Closing GRN Verified' : 'Save Closing GRN'}
                    </Button>
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 text-sm">
                      Close
                    </Button>
                  </div>
                  
                  {!isMorningGRNSaved && (
                    <p className="text-[10px] text-muted-foreground text-center">
                      Save Morning GRN first to enable Closing GRN option
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={!!showDetailModal} onOpenChange={() => setShowDetailModal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 w-full">
              {showDetailModal === 'start' && (
                <div className="flex flex-col gap-2 w-full">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    <span>Product Stock in Van</span>
                  </div>
                  <div className="flex gap-1">
                    <Button 
                      size="sm" 
                      onClick={() => {
                        const savedItems = todayStock?.van_stock_items || [];
                        if (savedItems.length === 0) {
                          toast.info('No stock items to edit');
                          return;
                        }
                        
                        // Store original values BEFORE editing for difference tracking (source: manual_edit)
                        const originalValues = savedItems.map((item: any) => {
                          const storedUnit = (item.unit || '').toLowerCase();
                          const isGrams = storedUnit === 'grams' || storedUnit === 'gram' || storedUnit === 'g';
                          const conversionFactor = isGrams ? 1000 : 1;
                          const displayUnit = isGrams ? 'kg' : (item.unit || 'kg');
                          const startQty = (item.start_qty || 0) / conversionFactor;
                          
                          return {
                            product_id: item.product_id,
                            product_name: item.product_name,
                            qty: startQty,
                            unit: displayUnit,
                            edit_source: 'manual_edit'
                          };
                        });
                        setOriginalLoadedStock(originalValues);
                        
                        const itemsToEdit = savedItems.map((item: any) => {
                          const storedUnit = (item.unit || '').toLowerCase();
                          const isGrams = storedUnit === 'grams' || storedUnit === 'gram' || storedUnit === 'g';
                          const conversionFactor = isGrams ? 1000 : 1;
                          const displayUnit = isGrams ? 'kg' : (item.unit || 'kg');
                          
                          const startQty = (item.start_qty || 0) / conversionFactor;
                          const orderedQty = (item.ordered_qty || 0) / conversionFactor;
                          const returnedQty = (item.returned_qty || 0) / conversionFactor;
                          
                          return {
                            id: item.id,
                            product_id: item.product_id,
                            product_name: item.product_name,
                            unit: displayUnit,
                            start_qty: startQty,
                            ordered_qty: orderedQty,
                            returned_qty: returnedQty,
                            left_qty: startQty - orderedQty + returnedQty,
                          };
                        });
                        setStockItems(itemsToEdit);
                        setShowDetailModal(null);
                        toast.info('All items loaded for editing. Modify and click Save Stock.');
                      }}
                      variant="outline" 
                      className="h-6 w-6 p-0"
                      title="Edit All"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="h-6 w-6 p-0" title="Download">
                          <Download className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-background border shadow-lg z-50">
                        <DropdownMenuItem onClick={handleExportToPDF} className="cursor-pointer text-xs">
                          <FileText className="h-3 w-3 mr-2 text-red-500" /> PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleExportToExcel} className="cursor-pointer text-xs">
                          <FileSpreadsheet className="h-3 w-3 mr-2 text-green-600" /> Excel
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button size="sm" onClick={handlePrint} variant="outline" className="h-6 w-6 p-0" title="Print">
                      <Printer className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
              {showDetailModal === 'ordered' && (
                <div className="flex items-center gap-2 w-full">
                  <ShoppingCart className="h-5 w-5 text-amber-500" />
                  <span>Retailer Ordered Qty (Beat: {beats.find(b => b.id === selectedBeat)?.beat_name})</span>
                  <Badge variant="secondary" className="ml-auto">Auto-calculated</Badge>
                </div>
              )}
              {showDetailModal === 'returned' && <><Package className="h-5 w-5 text-blue-600" /> Returned Qty</>}
              {showDetailModal === 'left' && <><TrendingDown className="h-5 w-5 text-green-600" /> Left in the Van</>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {(() => {
              // Combine saved items from database AND unsaved loaded items from stockItems
              const savedItems = todayStock?.van_stock_items || [];
              
              // Create a map of all items to display (prioritize saved, add unsaved)
              const rawDisplayItems: any[] = [];
              const seenProductIds = new Set<string>();
              
              // First add all saved items
              savedItems.forEach((item: any) => {
                rawDisplayItems.push({ ...item, isSaved: true });
                seenProductIds.add(item.product_id);
              });
              
              // Then add unsaved items that aren't in saved (loaded from previous stock)
              stockItems.forEach((item) => {
                if (item.product_id && !seenProductIds.has(item.product_id)) {
                  rawDisplayItems.push({ ...item, isSaved: false });
                  seenProductIds.add(item.product_id);
                }
              });
              
              // Sort items by product group (base products with variants together)
              const displayItems = groupProductsWithVariants(rawDisplayItems, products);
              
              if (displayItems.length === 0) {
                return (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No stock items saved yet</p>
                  </div>
                );
              }
              
              return displayItems.map((item: any, index: number) => {
                const product = products.find(p => p.id === item.product_id);
                const priceWithGST = product?.rate || 0;
                const priceWithoutGST = priceWithGST / 1.05;
                
                return (
                  <Card key={index} className={cn("p-3 hover:bg-accent transition-colors", !item.isSaved && "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20")}>
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{item.product_name}</p>
                          {!item.isSaved && (
                            <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-400">Unsaved</Badge>
                          )}
                        </div>
                        {showDetailModal === 'start' && (
                          <p className="text-xs text-muted-foreground">
                            ₹{priceWithoutGST.toFixed(2)} (excl. GST) • {item.unit}
                          </p>
                        )}
                        {showDetailModal !== 'start' && (
                          <p className="text-xs text-muted-foreground">{item.unit}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-base md:text-2xl font-bold">
                            {(() => {
                              let qty = 0;
                              if (showDetailModal === 'start') qty = item.start_qty || 0;
                              else if (showDetailModal === 'ordered') qty = item.ordered_qty || 0;
                              else if (showDetailModal === 'returned') qty = item.returned_qty || 0;
                              else if (showDetailModal === 'left') qty = (item.start_qty || 0) - (item.ordered_qty || 0) + (item.returned_qty || 0);
                              
                              // Convert to KG and format as "X KG Y g"
                              const qtyInKg = convertToKg(qty, item.unit || 'kg');
                              return formatKgDisplay(qtyInKg);
                            })()}
                          </p>
                        </div>
                        {showDetailModal === 'start' && item.isSaved && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            onClick={async () => {
                              if (!confirm('Delete this item from stock?')) return;
                              // Delete from database
                              if (item.id && todayStock?.id) {
                                await supabase
                                  .from('van_stock_items')
                                  .delete()
                                  .eq('id', item.id);
                                toast.success('Item deleted');
                                await loadTodayStock(false);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              });
            })()}
            
            {(() => {
              // Calculate totals from both saved and unsaved items
              const savedItems = todayStock?.van_stock_items || [];
              const seenProductIds = new Set<string>();
              const allItems: any[] = [];
              
              savedItems.forEach((item: any) => {
                allItems.push(item);
                seenProductIds.add(item.product_id);
              });
              
              stockItems.forEach((item) => {
                if (item.product_id && !seenProductIds.has(item.product_id)) {
                  allItems.push(item);
                  seenProductIds.add(item.product_id);
                }
              });
              
              if (allItems.length === 0) return null;
              
              let totalGrams = 0;
              
              allItems.forEach((item: any) => {
                const unit = (item.unit || '').toLowerCase();
                let qty = 0;
                
                if (showDetailModal === 'start') qty = item.start_qty || 0;
                else if (showDetailModal === 'ordered') qty = item.ordered_qty || 0;
                else if (showDetailModal === 'returned') qty = item.returned_qty || 0;
                else if (showDetailModal === 'left') qty = (item.start_qty || 0) - (item.ordered_qty || 0) + (item.returned_qty || 0);
                
                // Convert everything to grams for accurate calculation
                if (unit === 'kg' || unit === 'kgs') {
                  totalGrams += qty * 1000;
                } else if (unit === 'grams' || unit === 'gram' || unit === 'g') {
                  totalGrams += qty;
                } else {
                  // Default treat as KG
                  totalGrams += qty * 1000;
                }
              });
              
              // Convert to KG and Grams display
              const fullKg = Math.floor(totalGrams / 1000);
              const remainingGrams = Math.round(totalGrams % 1000);
              
              let displayTotal = '';
              if (remainingGrams === 0) {
                displayTotal = `${fullKg} KG`;
              } else if (fullKg === 0) {
                displayTotal = `${remainingGrams} Grams`;
              } else {
                displayTotal = `${fullKg} KG ${remainingGrams} Grams`;
              }
              
              return (
                <Card className="p-4 bg-primary/5 border-primary">
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-sm md:text-lg">Total</p>
                    <p className="text-base md:text-2xl font-bold text-primary">{displayTotal}</p>
                  </div>
                </Card>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Confirmation Dialog for Loading Previous Stock */}
      <AlertDialog open={showLoadPreviousConfirm} onOpenChange={setShowLoadPreviousConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Load Previous Van Stock?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to load the data from Previous Left Stock in Van to Product Stock in Van? This will replace your current unsaved stock entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLoadPreviousStockConfirm}>
              Yes, Load Previous Stock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Closing GRN Modal */}
      <Dialog open={showClosingGRNModal} onOpenChange={setShowClosingGRNModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-green-600" />
              Save Closing GRN
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Summary of Left in Van */}
            <Card className="p-3 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">Left in Van</span>
                </div>
                <span className="text-lg font-bold text-green-700 dark:text-green-300">{totals.totalLeft}</span>
              </div>
            </Card>
            
            {/* KM Input Section */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Start KM</Label>
                  <Input
                    type="number"
                    value={startKm || ''}
                    disabled
                    className="mt-1 h-9 text-sm bg-muted"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">End KM *</Label>
                  <Input
                    type="number"
                    value={closingEndKm || ''}
                    onChange={(e) => setClosingEndKm(parseFloat(e.target.value) || 0)}
                    onFocus={(e) => e.target.select()}
                    placeholder="Enter End KM"
                    className="mt-1 h-9 text-sm"
                  />
                </div>
              </div>
              
              {closingEndKm > startKm && (
                <div className="flex items-center justify-center p-2 bg-primary/10 rounded-md">
                  <span className="text-sm font-medium">Total Distance: <strong className="text-primary">{(closingEndKm - startKm).toFixed(1)} KM</strong></span>
                </div>
              )}
            </div>
            
            {/* Stock Verification Checkbox */}
            <Card className="p-3 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="verify-stock"
                  checked={closingStockVerified}
                  onCheckedChange={(checked) => setClosingStockVerified(checked === true)}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="verify-stock" className="text-sm font-medium cursor-pointer">
                    I verify that the Left in Van stock quantity is correct
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Please verify the physical stock matches the displayed quantity before saving.
                  </p>
                </div>
              </div>
            </Card>
            
            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <Button 
                onClick={handleSaveClosingGRN}
                disabled={savingClosingGRN || !closingStockVerified || !closingEndKm || closingEndKm <= startKm}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {savingClosingGRN ? 'Saving...' : 'Confirm & Save Closing GRN'}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowClosingGRNModal(false);
                  setClosingStockVerified(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

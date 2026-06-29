import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Plus, Target, Package, Store, Trash2, ChevronDown, ChevronRight, X, Calendar, Pencil, MoreVertical, CalendarDays, MapPin, Users, Info, Truck } from "lucide-react";
import { TerritoryTargets } from "./TerritoryTargets";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchAllPaginated } from "@/utils/fetchAllPaginated";
import { useAuth } from "@/hooks/useAuth";
import { useHierarchyTargetAllocation } from "@/hooks/useHierarchyTargetAllocation";

const QUANTITY_UNITS = ['Units', 'Kg', 'Liters', 'Pcs', 'Boxes', 'Cartons', 'Tonnes', 'Quintals'];

// Tab configuration for dynamic rendering
const TAB_CONFIG = [
  { value: 'products', label: 'Products', icon: Package, paramKey: 'product' as const },
  { value: 'retailers', label: 'Retailers', icon: Store, paramKey: 'retailer' as const },
  { value: 'distributors', label: 'Distributors', icon: Truck, paramKey: 'distributor' as const },
  { value: 'months', label: 'Monthly', icon: Calendar, paramKey: 'monthly' as const },
  { value: 'territory', label: 'Territory', icon: MapPin, paramKey: 'territory' as const },
] as const;

interface BusinessPlan {
  id: string;
  year: number;
  revenue_target: number;
  quantity_target: number;
  quantity_unit: string;
  notes: string | null;
  has_no_target: boolean;
}

interface Product {
  id: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  rate: number;
}

interface ProductCategory {
  id: string;
  name: string;
  products: Product[];
}

interface Retailer {
  id: string;
  name: string;
  category: string | null;
}

interface RetailerCategory {
  category: string;
  retailers: Retailer[];
}

interface CategoryTarget {
  categoryId: string;
  categoryName: string;
  quantityTarget: number;
  revenueTarget: number;
  equalDivide: boolean;
  products: ProductTarget[];
}

interface ProductTarget {
  productId: string;
  productName: string;
  percentage: number;
  quantityTarget: number;
  revenueTarget: number;
}

interface RetailerCategoryTarget {
  category: string;
  quantityTarget: number;
  revenueTarget: number;
  equalDivide: boolean;
  retailers: RetailerTargetItem[];
}

interface RetailerTargetItem {
  retailerId: string;
  retailerName: string;
  percentage: number;
  quantityTarget: number;
  revenueTarget: number;
}

interface Distributor {
  id: string;
  name: string;
}

interface DistributorTarget {
  distributorId: string;
  distributorName: string;
  percentage: number;
  quantityTarget: number;
  revenueTarget: number;
}

interface MonthProductTarget {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  percentage: number;
  quantityTarget: number;
  revenueTarget: number;
}

interface MonthTarget {
  monthNumber: number;
  monthName: string;
  percentage: number;
  quantityTarget: number;
  revenueTarget: number;
  useProductPercentages: boolean;
  products: MonthProductTarget[];
  workingDays: number;
}

type MonthBreakdownView = 'products' | 'daily';

const FY_MONTHS = [
  { number: 1, name: 'April', calendarMonth: 3 },   // April is month 3 (0-indexed)
  { number: 2, name: 'May', calendarMonth: 4 },
  { number: 3, name: 'June', calendarMonth: 5 },
  { number: 4, name: 'July', calendarMonth: 6 },
  { number: 5, name: 'August', calendarMonth: 7 },
  { number: 6, name: 'September', calendarMonth: 8 },
  { number: 7, name: 'October', calendarMonth: 9 },
  { number: 8, name: 'November', calendarMonth: 10 },
  { number: 9, name: 'December', calendarMonth: 11 },
  { number: 10, name: 'January', calendarMonth: 0 },
  { number: 11, name: 'February', calendarMonth: 1 },
  { number: 12, name: 'March', calendarMonth: 2 },
];

// Calculate working days for a month (6-day work week, excluding Sundays)
const getWorkingDaysInMonth = (fyMonthNumber: number, fyYear: number): number => {
  const monthInfo = FY_MONTHS.find(m => m.number === fyMonthNumber);
  if (!monthInfo) return 26; // Default to 26 days
  
  // Determine the actual calendar year
  // For FY 2025: April-Dec is 2024, Jan-March is 2025
  const calendarYear = fyMonthNumber <= 9 ? fyYear - 1 : fyYear;
  
  // Get number of days in the month
  const daysInMonth = new Date(calendarYear, monthInfo.calendarMonth + 1, 0).getDate();
  
  // Count Sundays (non-working days)
  let sundays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(calendarYear, monthInfo.calendarMonth, day);
    if (date.getDay() === 0) sundays++; // Sunday = 0
  }
  
  return daysInMonth - sundays;
};

interface UserFYPlanTargetProps {
  targetUserId?: string; // Optional: if provided, manage targets for this user instead of self
  enabledParameters?: {
    product: boolean;
    retailer: boolean;
    beat: boolean;
    distributor: boolean;
    territory: boolean;
    monthly: boolean;
  };
  fyConfig?: {
    quantityTarget: number;
    revenueTarget: number;
    quantityUnit: string;
  };
  preselectedYear?: number;
}

export function UserFYPlanTarget({ 
  targetUserId, 
  enabledParameters,
  fyConfig,
  preselectedYear 
}: UserFYPlanTargetProps = {}) {
  const { user } = useAuth();
  // Use targetUserId if provided, otherwise use current user's id
  const effectiveUserId = targetUserId || user?.id;
  const [plans, setPlans] = useState<BusinessPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<BusinessPlan | null>(null);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [retailerCategories, setRetailerCategories] = useState<RetailerCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Check if target comes from hierarchy
  const currentFY = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    return month >= 3 ? now.getFullYear() + 1 : now.getFullYear();
  }, []);
  
  // Check hierarchy allocation for the selected plan's FY
  const { allocation: hierarchyAllocation, hasHierarchyTarget, isLoading: hierarchyLoading } = useHierarchyTargetAllocation(
    effectiveUserId,
    selectedPlan?.year || currentFY
  );
  
  // Product targets state
  const [categoryTargets, setCategoryTargets] = useState<CategoryTarget[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [productEqualDivide, setProductEqualDivide] = useState(true);
  const [productTotalQuantity, setProductTotalQuantity] = useState(0);
  const [productTotalRevenue, setProductTotalRevenue] = useState(0);
  
  // Retailer targets state
  const [retailerCategoryTargets, setRetailerCategoryTargets] = useState<RetailerCategoryTarget[]>([]);
  const [expandedRetailerCategories, setExpandedRetailerCategories] = useState<Set<string>>(new Set());
  const [retailerEqualDivide, setRetailerEqualDivide] = useState(true);
  const [retailerTotalQuantity, setRetailerTotalQuantity] = useState(0);
  const [retailerTotalRevenue, setRetailerTotalRevenue] = useState(0);

  // Monthly targets state
  const [monthTargets, setMonthTargets] = useState<MonthTarget[]>([]);
  const [monthEqualDivide, setMonthEqualDivide] = useState(true);
  const [monthTotalQuantity, setMonthTotalQuantity] = useState(0);
  const [monthTotalRevenue, setMonthTotalRevenue] = useState(0);
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set());
  const [monthBreakdownView, setMonthBreakdownView] = useState<MonthBreakdownView>('products');

  // Compute which tabs should be visible based on enabledParameters
  const visibleTabs = useMemo(() => {
    // If no enabledParameters provided (self-use mode), show all tabs
    if (!enabledParameters) {
      return TAB_CONFIG;
    }
    
    return TAB_CONFIG.filter(tab => enabledParameters[tab.paramKey]);
  }, [enabledParameters]);

  // Get the default tab value (first enabled tab)
  const defaultTabValue = useMemo(() => {
    return visibleTabs.length > 0 ? visibleTabs[0].value : 'products';
  }, [visibleTabs]);

  // Get grid columns class based on number of visible tabs
  const gridColsClass = useMemo(() => {
    const count = visibleTabs.length;
    switch (count) {
      case 1: return 'grid-cols-1';
      case 2: return 'grid-cols-2';
      case 3: return 'grid-cols-3';
      case 4: return 'grid-cols-4';
      case 5: return 'grid-cols-5';
      default: return 'grid-cols-5';
    }
  }, [visibleTabs]);

  // Distributor targets state
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [distributorTargets, setDistributorTargets] = useState<DistributorTarget[]>([]);
  const [distributorEqualDivide, setDistributorEqualDivide] = useState(true);
  const [distributorTotalQuantity, setDistributorTotalQuantity] = useState(0);
  const [distributorTotalRevenue, setDistributorTotalRevenue] = useState(0);

  const [planForm, setPlanForm] = useState({
    year: new Date().getFullYear() + 1,
    quantity_target: "",
    quantity_unit: "Units",
    revenue_target: "",
    notes: "",
    has_no_target: false,
  });

  // Also check hierarchy for the FY being created (in dialog) - must be after planForm is defined
  const { allocation: dialogHierarchyAllocation, hasHierarchyTarget: hasDialogHierarchyTarget } = useHierarchyTargetAllocation(
    effectiveUserId,
    planForm.year
  );
  
  // Auto-fill dialog form when hierarchy allocation is available for that year
  useEffect(() => {
    if (dialogHierarchyAllocation && hasDialogHierarchyTarget) {
      setPlanForm(prev => ({
        ...prev,
        quantity_target: dialogHierarchyAllocation.quantity_target?.toString() || prev.quantity_target,
        quantity_unit: dialogHierarchyAllocation.hierarchy_target?.quantity_unit || prev.quantity_unit,
        revenue_target: dialogHierarchyAllocation.revenue_target?.toString() || prev.revenue_target,
      }));
    }
  }, [dialogHierarchyAllocation, hasDialogHierarchyTarget]);

  useEffect(() => {
    if (effectiveUserId) {
      loadPlans();
      loadProductsWithCategories();
      loadRetailersWithCategories();
      loadDistributorsViaBeats();
    }
  }, [effectiveUserId]);

  useEffect(() => {
    if (selectedPlan) {
      loadExistingTargets();
    }
  }, [selectedPlan]);

  const loadPlans = async () => {
    if (!effectiveUserId) return;
    try {
      const { data, error } = await supabase
        .from('user_business_plans')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('year', { ascending: false });

      if (error) throw error;
      const plansData = (data || []).map((p: any) => ({
        ...p,
        quantity_target: p.quantity_target || 0,
        quantity_unit: p.quantity_unit || 'Units',
        has_no_target: p.has_no_target || false,
      }));
      setPlans(plansData);
      if (plansData.length > 0) {
        // Prioritize selecting the current FY plan, otherwise select the most recent
        const currentFYPlan = plansData.find((p: BusinessPlan) => p.year === currentFY);
        setSelectedPlan(currentFYPlan || plansData[0]);
      }
    } catch (error: any) {
      toast.error("Failed to load FY plans: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadProductsWithCategories = async () => {
    const products = await fetchAllPaginated<any>((from, to) =>
      supabase
        .from('products')
        .select(`
          id, 
          name, 
          rate,
          category_id,
          product_categories(id, name)
        `)
        .eq('is_active', true)
        .order('name')
        .range(from, to)
    );

    if (products) {
      const categoryMap = new Map<string, ProductCategory>();
      
      products.forEach((p: any) => {
        const catId = p.category_id || 'uncategorized';
        const catName = p.product_categories?.name || 'Uncategorized';
        
        if (!categoryMap.has(catId)) {
          categoryMap.set(catId, {
            id: catId,
            name: catName,
            products: []
          });
        }
        
        categoryMap.get(catId)!.products.push({
          id: p.id,
          name: p.name,
          category_id: p.category_id,
          category_name: catName,
          rate: p.rate || 0
        });
      });
      
      setProductCategories(Array.from(categoryMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
    }
  };

  const loadRetailersWithCategories = async () => {
    if (!effectiveUserId) return;
    const { data: retailers } = await supabase
      .from('retailers')
      .select('id, name, category')
      .eq('user_id', effectiveUserId)
      .order('name');

    if (retailers) {
      const categoryMap = new Map<string, RetailerCategory>();
      
      retailers.forEach((r: any) => {
        const cat = r.category || 'Uncategorized';
        
        if (!categoryMap.has(cat)) {
          categoryMap.set(cat, {
            category: cat,
            retailers: []
          });
        }
        
        categoryMap.get(cat)!.retailers.push({
          id: r.id,
          name: r.name,
          category: r.category
        });
      });
      
      setRetailerCategories(Array.from(categoryMap.values()).sort((a, b) => a.category.localeCompare(b.category)));
    }
  };

  const loadDistributorsViaBeats = async () => {
    if (!effectiveUserId) return;
    
    // Get beats created by the user
    const { data: beats } = await supabase
      .from('beats')
      .select('distributor_id, distributors(id, name)')
      .eq('created_by', effectiveUserId)
      .not('distributor_id', 'is', null);

    if (beats) {
      const distributorMap = new Map<string, Distributor>();
      
      beats.forEach((b: any) => {
        if (b.distributors && b.distributors.id) {
          distributorMap.set(b.distributors.id, {
            id: b.distributors.id,
            name: b.distributors.name
          });
        }
      });
      
      setDistributors(Array.from(distributorMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
    }
  };

  const loadExistingTargets = async () => {
    if (!selectedPlan) return;
    
    // Load product targets
    const { data: productData } = await supabase
      .from('user_business_plan_products')
      .select('*')
      .eq('business_plan_id', selectedPlan.id);

    // Load retailer targets
    const { data: retailerData } = await supabase
      .from('user_business_plan_retailers')
      .select('*')
      .eq('business_plan_id', selectedPlan.id);

    // Load monthly targets
    const { data: monthData } = await supabase
      .from('user_business_plan_months')
      .select('*')
      .eq('business_plan_id', selectedPlan.id);

    // Load monthly product targets
    const { data: monthProductData } = await supabase
      .from('user_business_plan_month_products')
      .select('*')
      .eq('business_plan_id', selectedPlan.id);

    // Check if we have existing product data
    const hasExistingProductData = productData && productData.length > 0;
    const planQty = selectedPlan.quantity_target || 0;
    const planRev = selectedPlan.revenue_target || 0;
    const numCategories = productCategories.length;
    
    // Initialize category targets from product categories
    const newCategoryTargets: CategoryTarget[] = productCategories.map((cat, catIdx) => {
      const equalCatQty = numCategories > 0 ? planQty / numCategories : 0;
      const equalCatRev = numCategories > 0 ? planRev / numCategories : 0;
      
      return {
        categoryId: cat.id,
        categoryName: cat.name,
        quantityTarget: 0,
        revenueTarget: 0,
        equalDivide: true,
        products: cat.products.map(p => {
          const existing = productData?.find(pd => pd.product_id === p.id);
          return {
            productId: p.id,
            productName: p.name,
            percentage: 100 / cat.products.length,
            quantityTarget: existing?.quantity_target || 0,
            revenueTarget: existing?.revenue_target || 0
          };
        })
      };
    });

    // Calculate category totals from existing data or use plan defaults
    const existingProductQtyTotal = newCategoryTargets.reduce((sum, cat) => sum + cat.products.reduce((ps, p) => ps + p.quantityTarget, 0), 0);
    const existingProductRevTotal = newCategoryTargets.reduce((sum, cat) => sum + cat.products.reduce((ps, p) => ps + p.revenueTarget, 0), 0);
    
    if (hasExistingProductData && existingProductRevTotal > 0) {
      // Use existing data
      newCategoryTargets.forEach(cat => {
        const categoryQtyTotal = cat.products.reduce((sum, p) => sum + p.quantityTarget, 0);
        const categoryRevTotal = cat.products.reduce((sum, p) => sum + p.revenueTarget, 0);
        cat.quantityTarget = categoryQtyTotal;
        cat.revenueTarget = categoryRevTotal;
        if (categoryRevTotal > 0) {
          cat.products.forEach(p => {
            p.percentage = (p.revenueTarget / categoryRevTotal) * 100;
          });
        }
      });
      setProductTotalQuantity(existingProductQtyTotal);
      setProductTotalRevenue(existingProductRevTotal);
      setProductEqualDivide(false);
    } else {
      // Auto-populate from plan targets with equal divide
      const numTotalProducts = productCategories.reduce((sum, cat) => sum + cat.products.length, 0);
      const perProductQty = numTotalProducts > 0 ? planQty / numTotalProducts : 0;
      const perProductRev = numTotalProducts > 0 ? planRev / numTotalProducts : 0;
      
      newCategoryTargets.forEach(cat => {
        const catQty = perProductQty * cat.products.length;
        const catRev = perProductRev * cat.products.length;
        cat.quantityTarget = catQty;
        cat.revenueTarget = catRev;
        cat.products.forEach(p => {
          p.quantityTarget = perProductQty;
          p.revenueTarget = perProductRev;
          p.percentage = cat.products.length > 0 ? 100 / cat.products.length : 0;
        });
      });
      setProductTotalQuantity(planQty);
      setProductTotalRevenue(planRev);
      setProductEqualDivide(true);
    }

    setCategoryTargets(newCategoryTargets);

    // Check if we have existing retailer data
    const hasExistingRetailerData = retailerData && retailerData.length > 0;
    const numRetailerCategories = retailerCategories.length;
    
    // Initialize retailer category targets
    const newRetailerCategoryTargets: RetailerCategoryTarget[] = retailerCategories.map(cat => ({
      category: cat.category,
      quantityTarget: 0,
      revenueTarget: 0,
      equalDivide: true,
      retailers: cat.retailers.map(r => {
        const existing = retailerData?.find(rd => rd.retailer_id === r.id);
        return {
          retailerId: r.id,
          retailerName: r.name,
          percentage: 100 / cat.retailers.length,
          quantityTarget: existing?.quantity_target || 0,
          revenueTarget: existing?.target_revenue || 0
        };
      })
    }));

    // Calculate totals from existing data or use plan defaults
    const existingRetailerQtyTotal = newRetailerCategoryTargets.reduce((sum, cat) => sum + cat.retailers.reduce((rs, r) => rs + r.quantityTarget, 0), 0);
    const existingRetailerRevTotal = newRetailerCategoryTargets.reduce((sum, cat) => sum + cat.retailers.reduce((rs, r) => rs + r.revenueTarget, 0), 0);
    
    if (hasExistingRetailerData && existingRetailerRevTotal > 0) {
      // Use existing data
      newRetailerCategoryTargets.forEach(cat => {
        const categoryQtyTotal = cat.retailers.reduce((sum, r) => sum + r.quantityTarget, 0);
        const categoryRevTotal = cat.retailers.reduce((sum, r) => sum + r.revenueTarget, 0);
        cat.quantityTarget = categoryQtyTotal;
        cat.revenueTarget = categoryRevTotal;
        if (categoryRevTotal > 0) {
          cat.retailers.forEach(r => {
            r.percentage = (r.revenueTarget / categoryRevTotal) * 100;
          });
        }
      });
      setRetailerTotalQuantity(existingRetailerQtyTotal);
      setRetailerTotalRevenue(existingRetailerRevTotal);
      setRetailerEqualDivide(false);
    } else {
      // Auto-populate from plan targets with equal divide
      const numTotalRetailers = retailerCategories.reduce((sum, cat) => sum + cat.retailers.length, 0);
      const perRetailerQty = numTotalRetailers > 0 ? planQty / numTotalRetailers : 0;
      const perRetailerRev = numTotalRetailers > 0 ? planRev / numTotalRetailers : 0;
      
      newRetailerCategoryTargets.forEach(cat => {
        const catQty = perRetailerQty * cat.retailers.length;
        const catRev = perRetailerRev * cat.retailers.length;
        cat.quantityTarget = catQty;
        cat.revenueTarget = catRev;
        cat.retailers.forEach(r => {
          r.quantityTarget = perRetailerQty;
          r.revenueTarget = perRetailerRev;
          r.percentage = cat.retailers.length > 0 ? 100 / cat.retailers.length : 0;
        });
      });
      setRetailerTotalQuantity(planQty);
      setRetailerTotalRevenue(planRev);
      setRetailerEqualDivide(true);
    }

    setRetailerCategoryTargets(newRetailerCategoryTargets);

    // Get all products from category targets for monthly breakdown
    const allProducts = productCategories.flatMap(cat => cat.products);
    
    // Calculate global product percentages from the Products tab data
    const totalProductRevenue = productData?.reduce((sum, p) => sum + (p.revenue_target || 0), 0) || 0;
    const productPercentages: Record<string, number> = {};
    if (totalProductRevenue > 0) {
      productData?.forEach(p => {
        productPercentages[p.product_id] = ((p.revenue_target || 0) / totalProductRevenue) * 100;
      });
    } else {
      // Equal divide if no product targets yet
      allProducts.forEach(p => {
        productPercentages[p.id] = allProducts.length > 0 ? 100 / allProducts.length : 0;
      });
    }

    // Initialize monthly targets with product breakdown
    const hasExistingMonthData = monthData && monthData.length > 0;
    const hasExistingMonthProductData = monthProductData && monthProductData.length > 0;
    
    const newMonthTargets: MonthTarget[] = FY_MONTHS.map(m => {
      const existing = monthData?.find(md => md.month_number === m.number);
      const monthQty = existing?.quantity_target || (hasExistingMonthData ? 0 : (selectedPlan.quantity_target || 0) / 12);
      const monthRev = existing?.revenue_target || (hasExistingMonthData ? 0 : (selectedPlan.revenue_target || 0) / 12);
      
      // Get month-specific product targets or use global percentages
      const monthProducts: MonthProductTarget[] = allProducts.map(p => {
        const existingMonthProduct = monthProductData?.find(
          mp => mp.month_number === m.number && mp.product_id === p.id
        );
        
        if (existingMonthProduct) {
          return {
            productId: p.id,
            productName: p.name,
            categoryId: p.category_id || 'uncategorized',
            categoryName: p.category_name || 'Uncategorized',
            percentage: existingMonthProduct.percentage || 0,
            quantityTarget: existingMonthProduct.quantity_target || 0,
            revenueTarget: existingMonthProduct.revenue_target || 0
          };
        }
        
        // Use percentage from Products tab
        const pct = productPercentages[p.id] || 0;
        return {
          productId: p.id,
          productName: p.name,
          categoryId: p.category_id || 'uncategorized',
          categoryName: p.category_name || 'Uncategorized',
          percentage: pct,
          quantityTarget: (pct / 100) * monthQty,
          revenueTarget: (pct / 100) * monthRev
        };
      });
      
      // Use saved working_days if exists, otherwise calculate automatically
      const savedWorkingDays = existing?.working_days;
      const calculatedWorkingDays = getWorkingDaysInMonth(m.number, selectedPlan.year);
      
      return {
        monthNumber: m.number,
        monthName: m.name,
        percentage: 100 / 12,
        quantityTarget: monthQty,
        revenueTarget: monthRev,
        useProductPercentages: !hasExistingMonthProductData,
        products: monthProducts,
        workingDays: savedWorkingDays ?? calculatedWorkingDays
      };
    });

    const totalMonthlyQty = newMonthTargets.reduce((sum, m) => sum + m.quantityTarget, 0);
    const totalMonthlyRev = newMonthTargets.reduce((sum, m) => sum + m.revenueTarget, 0);
    
    if (totalMonthlyRev > 0 && hasExistingMonthData) {
      newMonthTargets.forEach(m => {
        m.percentage = (m.revenueTarget / totalMonthlyRev) * 100;
      });
      setMonthEqualDivide(false);
    } else {
      setMonthEqualDivide(true);
    }
    setMonthTotalQuantity(totalMonthlyQty);
    setMonthTotalRevenue(totalMonthlyRev);
    setMonthTargets(newMonthTargets);

    // Load distributor targets
    const { data: distributorData } = await supabase
      .from('user_business_plan_distributors')
      .select('*')
      .eq('business_plan_id', selectedPlan.id);

    // Initialize distributor targets
    const hasExistingDistributorData = distributorData && distributorData.length > 0;
    
    const newDistributorTargets: DistributorTarget[] = distributors.map(d => {
      const existing = distributorData?.find(dd => dd.distributor_id === d.id);
      return {
        distributorId: d.id,
        distributorName: d.name,
        percentage: distributors.length > 0 ? 100 / distributors.length : 0,
        quantityTarget: existing?.quantity_target || 0,
        revenueTarget: existing?.revenue_target || 0
      };
    });

    const existingDistQtyTotal = newDistributorTargets.reduce((sum, d) => sum + d.quantityTarget, 0);
    const existingDistRevTotal = newDistributorTargets.reduce((sum, d) => sum + d.revenueTarget, 0);

    if (hasExistingDistributorData && existingDistRevTotal > 0) {
      // Use existing data
      if (existingDistRevTotal > 0) {
        newDistributorTargets.forEach(d => {
          d.percentage = (d.revenueTarget / existingDistRevTotal) * 100;
        });
      }
      setDistributorTotalQuantity(existingDistQtyTotal);
      setDistributorTotalRevenue(existingDistRevTotal);
      setDistributorEqualDivide(false);
    } else {
      // Auto-populate from plan targets with equal divide
      const numDistributors = distributors.length;
      const perDistQty = numDistributors > 0 ? planQty / numDistributors : 0;
      const perDistRev = numDistributors > 0 ? planRev / numDistributors : 0;
      
      newDistributorTargets.forEach(d => {
        d.quantityTarget = perDistQty;
        d.revenueTarget = perDistRev;
        d.percentage = numDistributors > 0 ? 100 / numDistributors : 0;
      });
      setDistributorTotalQuantity(planQty);
      setDistributorTotalRevenue(planRev);
      setDistributorEqualDivide(true);
    }

    setDistributorTargets(newDistributorTargets);
  };

  useEffect(() => {
    if (productCategories.length > 0 && selectedPlan) {
      loadExistingTargets();
    }
  }, [productCategories, retailerCategories, distributors, selectedPlan]);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId) return;
    try {
      const { data, error } = await supabase
        .from('user_business_plans')
        .insert({
          user_id: effectiveUserId,
          year: planForm.year,
          quantity_target: planForm.has_no_target ? 0 : (parseFloat(planForm.quantity_target) || 0),
          quantity_unit: planForm.quantity_unit,
          revenue_target: planForm.has_no_target ? 0 : (parseFloat(planForm.revenue_target) || 0),
          notes: planForm.notes || null,
          has_no_target: planForm.has_no_target,
        })
        .select()
        .single();

      if (error) throw error;
      toast.success("FY Plan created");
      setDialogOpen(false);
      setPlanForm({
        year: new Date().getFullYear() + 1,
        quantity_target: "",
        quantity_unit: "Units",
        revenue_target: "",
        notes: "",
        has_no_target: false,
      });
      loadPlans();
      setSelectedPlan({
        ...data,
        quantity_target: data.quantity_target || 0,
        quantity_unit: data.quantity_unit || 'Units',
        has_no_target: data.has_no_target || false,
      });
    } catch (error: any) {
      toast.error("Failed to create plan: " + error.message);
    }
  };

  const handleEditPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    try {
      const { error } = await supabase
        .from('user_business_plans')
        .update({
          year: planForm.year,
          quantity_target: planForm.has_no_target ? 0 : (parseFloat(planForm.quantity_target) || 0),
          quantity_unit: planForm.quantity_unit,
          revenue_target: planForm.has_no_target ? 0 : (parseFloat(planForm.revenue_target) || 0),
          notes: planForm.notes || null,
          has_no_target: planForm.has_no_target,
        })
        .eq('id', selectedPlan.id);

      if (error) throw error;
      toast.success("FY Plan updated");
      setEditDialogOpen(false);
      loadPlans();
    } catch (error: any) {
      toast.error("Failed to update plan: " + error.message);
    }
  };

  const handleDeletePlan = async () => {
    if (!selectedPlan) return;
    try {
      // Delete related data first
      await supabase.from('user_business_plan_products').delete().eq('business_plan_id', selectedPlan.id);
      await supabase.from('user_business_plan_retailers').delete().eq('business_plan_id', selectedPlan.id);
      await supabase.from('user_business_plan_months').delete().eq('business_plan_id', selectedPlan.id);
      await supabase.from('user_business_plan_month_products').delete().eq('business_plan_id', selectedPlan.id);
      
      const { error } = await supabase
        .from('user_business_plans')
        .delete()
        .eq('id', selectedPlan.id);

      if (error) throw error;
      toast.success("FY Plan deleted");
      setDeleteDialogOpen(false);
      setSelectedPlan(null);
      loadPlans();
    } catch (error: any) {
      toast.error("Failed to delete plan: " + error.message);
    }
  };

  const openEditDialog = () => {
    if (selectedPlan) {
      setPlanForm({
        year: selectedPlan.year,
        quantity_target: selectedPlan.quantity_target.toString(),
        quantity_unit: selectedPlan.quantity_unit,
        revenue_target: selectedPlan.revenue_target.toString(),
        notes: selectedPlan.notes || "",
        has_no_target: selectedPlan.has_no_target || false,
      });
      setEditDialogOpen(true);
    }
  };

  const toggleCategoryExpand = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const toggleRetailerCategoryExpand = (category: string) => {
    const newExpanded = new Set(expandedRetailerCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedRetailerCategories(newExpanded);
  };

  // Product handlers with quantity
  const handleProductTotalTargetChange = (quantityValue: number, revenueValue: number) => {
    setProductTotalQuantity(quantityValue);
    setProductTotalRevenue(revenueValue);
    
    const numCategories = categoryTargets.length;
    if (numCategories > 0) {
      const numTotalProducts = categoryTargets.reduce((sum, cat) => sum + cat.products.length, 0);
      const perProductQty = numTotalProducts > 0 ? quantityValue / numTotalProducts : 0;
      const perProductRev = numTotalProducts > 0 ? revenueValue / numTotalProducts : 0;
      
      setCategoryTargets(prev => prev.map(cat => {
        if (productEqualDivide) {
          const catQty = perProductQty * cat.products.length;
          const catRev = perProductRev * cat.products.length;
          return {
            ...cat,
            quantityTarget: catQty,
            revenueTarget: catRev,
            products: cat.products.map(p => ({
              ...p,
              quantityTarget: perProductQty,
              revenueTarget: perProductRev,
              percentage: cat.products.length > 0 ? 100 / cat.products.length : 0
            }))
          };
        } else {
          // Use percentage-based distribution
          const catQty = (cat.quantityTarget / (productTotalQuantity || 1)) * quantityValue;
          const catRev = (cat.revenueTarget / (productTotalRevenue || 1)) * revenueValue;
          return {
            ...cat,
            quantityTarget: catQty,
            revenueTarget: catRev,
            products: cat.products.map(p => ({
              ...p,
              quantityTarget: cat.equalDivide ? catQty / cat.products.length : (p.percentage / 100) * catQty,
              revenueTarget: cat.equalDivide ? catRev / cat.products.length : (p.percentage / 100) * catRev
            }))
          };
        }
      }));
    }
  };

  const handleProductEqualDivideChange = (checked: boolean) => {
    setProductEqualDivide(checked);
    if (checked && categoryTargets.length > 0) {
      const numTotalProducts = categoryTargets.reduce((sum, cat) => sum + cat.products.length, 0);
      const perProductQty = numTotalProducts > 0 ? productTotalQuantity / numTotalProducts : 0;
      const perProductRev = numTotalProducts > 0 ? productTotalRevenue / numTotalProducts : 0;
      
      setCategoryTargets(prev => prev.map(cat => {
        const catQty = perProductQty * cat.products.length;
        const catRev = perProductRev * cat.products.length;
        return {
          ...cat,
          quantityTarget: catQty,
          revenueTarget: catRev,
          equalDivide: true,
          products: cat.products.map(p => ({
            ...p,
            quantityTarget: perProductQty,
            revenueTarget: perProductRev,
            percentage: cat.products.length > 0 ? 100 / cat.products.length : 0
          }))
        };
      }));
    }
  };

  const handleCategoryTargetChange = (categoryId: string, quantityValue: number, revenueValue: number) => {
    setProductEqualDivide(false);
    setCategoryTargets(prev => {
      const newTargets = prev.map(cat => {
        if (cat.categoryId !== categoryId) return cat;
        
        const newProducts = cat.products.map(p => ({
          ...p,
          quantityTarget: cat.equalDivide ? quantityValue / cat.products.length : (p.percentage / 100) * quantityValue,
          revenueTarget: cat.equalDivide ? revenueValue / cat.products.length : (p.percentage / 100) * revenueValue
        }));
        
        return { ...cat, quantityTarget: quantityValue, revenueTarget: revenueValue, products: newProducts };
      });
      
      const newTotalQty = newTargets.reduce((sum, c) => sum + c.quantityTarget, 0);
      const newTotalRev = newTargets.reduce((sum, c) => sum + c.revenueTarget, 0);
      setProductTotalQuantity(newTotalQty);
      setProductTotalRevenue(newTotalRev);
      
      return newTargets;
    });
  };

  const handleEqualDivideChange = (categoryId: string, checked: boolean) => {
    setCategoryTargets(prev => prev.map(cat => {
      if (cat.categoryId !== categoryId) return cat;
      
      const newProducts = cat.products.map(p => ({
        ...p,
        percentage: checked ? 100 / cat.products.length : p.percentage,
        quantityTarget: checked ? cat.quantityTarget / cat.products.length : (p.percentage / 100) * cat.quantityTarget,
        revenueTarget: checked ? cat.revenueTarget / cat.products.length : (p.percentage / 100) * cat.revenueTarget
      }));
      
      return { ...cat, equalDivide: checked, products: newProducts };
    }));
  };

  const handleProductPercentageChange = (categoryId: string, productId: string, percentage: number) => {
    setCategoryTargets(prev => prev.map(cat => {
      if (cat.categoryId !== categoryId) return cat;
      
      const newProducts = cat.products.map(p => {
        if (p.productId !== productId) return p;
        return {
          ...p,
          percentage,
          quantityTarget: (percentage / 100) * cat.quantityTarget,
          revenueTarget: (percentage / 100) * cat.revenueTarget
        };
      });
      
      return { ...cat, equalDivide: false, products: newProducts };
    }));
  };

  const removeCategory = (categoryId: string) => {
    setCategoryTargets(prev => prev.filter(cat => cat.categoryId !== categoryId));
  };

  const removeProduct = (categoryId: string, productId: string) => {
    setCategoryTargets(prev => prev.map(cat => {
      if (cat.categoryId !== categoryId) return cat;
      const newProducts = cat.products.filter(p => p.productId !== productId);
      return { ...cat, products: newProducts };
    }));
  };

  // Retailer handlers with quantity
  const handleRetailerTotalTargetChange = (quantityValue: number, revenueValue: number) => {
    setRetailerTotalQuantity(quantityValue);
    setRetailerTotalRevenue(revenueValue);
    
    const numCategories = retailerCategoryTargets.length;
    if (numCategories > 0) {
      const numTotalRetailers = retailerCategoryTargets.reduce((sum, cat) => sum + cat.retailers.length, 0);
      const perRetailerQty = numTotalRetailers > 0 ? quantityValue / numTotalRetailers : 0;
      const perRetailerRev = numTotalRetailers > 0 ? revenueValue / numTotalRetailers : 0;
      
      setRetailerCategoryTargets(prev => prev.map(cat => {
        if (retailerEqualDivide) {
          const catQty = perRetailerQty * cat.retailers.length;
          const catRev = perRetailerRev * cat.retailers.length;
          return {
            ...cat,
            quantityTarget: catQty,
            revenueTarget: catRev,
            retailers: cat.retailers.map(r => ({
              ...r,
              quantityTarget: perRetailerQty,
              revenueTarget: perRetailerRev,
              percentage: cat.retailers.length > 0 ? 100 / cat.retailers.length : 0
            }))
          };
        } else {
          const catQty = (cat.quantityTarget / (retailerTotalQuantity || 1)) * quantityValue;
          const catRev = (cat.revenueTarget / (retailerTotalRevenue || 1)) * revenueValue;
          return {
            ...cat,
            quantityTarget: catQty,
            revenueTarget: catRev,
            retailers: cat.retailers.map(r => ({
              ...r,
              quantityTarget: cat.equalDivide ? catQty / cat.retailers.length : (r.percentage / 100) * catQty,
              revenueTarget: cat.equalDivide ? catRev / cat.retailers.length : (r.percentage / 100) * catRev
            }))
          };
        }
      }));
    }
  };

  const handleRetailerTotalEqualDivideChange = (checked: boolean) => {
    setRetailerEqualDivide(checked);
    if (checked && retailerCategoryTargets.length > 0) {
      const numTotalRetailers = retailerCategoryTargets.reduce((sum, cat) => sum + cat.retailers.length, 0);
      const perRetailerQty = numTotalRetailers > 0 ? retailerTotalQuantity / numTotalRetailers : 0;
      const perRetailerRev = numTotalRetailers > 0 ? retailerTotalRevenue / numTotalRetailers : 0;
      
      setRetailerCategoryTargets(prev => prev.map(cat => {
        const catQty = perRetailerQty * cat.retailers.length;
        const catRev = perRetailerRev * cat.retailers.length;
        return {
          ...cat,
          quantityTarget: catQty,
          revenueTarget: catRev,
          equalDivide: true,
          retailers: cat.retailers.map(r => ({
            ...r,
            quantityTarget: perRetailerQty,
            revenueTarget: perRetailerRev,
            percentage: cat.retailers.length > 0 ? 100 / cat.retailers.length : 0
          }))
        };
      }));
    }
  };

  const handleRetailerCategoryTargetChange = (category: string, quantityValue: number, revenueValue: number) => {
    setRetailerEqualDivide(false);
    setRetailerCategoryTargets(prev => {
      const newTargets = prev.map(cat => {
        if (cat.category !== category) return cat;
        
        const newRetailers = cat.retailers.map(r => ({
          ...r,
          quantityTarget: cat.equalDivide ? quantityValue / cat.retailers.length : (r.percentage / 100) * quantityValue,
          revenueTarget: cat.equalDivide ? revenueValue / cat.retailers.length : (r.percentage / 100) * revenueValue
        }));
        
        return { ...cat, quantityTarget: quantityValue, revenueTarget: revenueValue, retailers: newRetailers };
      });
      
      const newTotalQty = newTargets.reduce((sum, c) => sum + c.quantityTarget, 0);
      const newTotalRev = newTargets.reduce((sum, c) => sum + c.revenueTarget, 0);
      setRetailerTotalQuantity(newTotalQty);
      setRetailerTotalRevenue(newTotalRev);
      
      return newTargets;
    });
  };

  const handleRetailerEqualDivideChange = (category: string, checked: boolean) => {
    setRetailerCategoryTargets(prev => prev.map(cat => {
      if (cat.category !== category) return cat;
      
      const newRetailers = cat.retailers.map(r => ({
        ...r,
        percentage: checked ? 100 / cat.retailers.length : r.percentage,
        quantityTarget: checked ? cat.quantityTarget / cat.retailers.length : (r.percentage / 100) * cat.quantityTarget,
        revenueTarget: checked ? cat.revenueTarget / cat.retailers.length : (r.percentage / 100) * cat.revenueTarget
      }));
      
      return { ...cat, equalDivide: checked, retailers: newRetailers };
    }));
  };

  const handleRetailerPercentageChange = (category: string, retailerId: string, percentage: number) => {
    setRetailerCategoryTargets(prev => prev.map(cat => {
      if (cat.category !== category) return cat;
      
      const newRetailers = cat.retailers.map(r => {
        if (r.retailerId !== retailerId) return r;
        return {
          ...r,
          percentage,
          quantityTarget: (percentage / 100) * cat.quantityTarget,
          revenueTarget: (percentage / 100) * cat.revenueTarget
        };
      });
      
      return { ...cat, equalDivide: false, retailers: newRetailers };
    }));
  };

  const removeRetailerCategory = (category: string) => {
    setRetailerCategoryTargets(prev => prev.filter(cat => cat.category !== category));
  };

  const removeRetailer = (category: string, retailerId: string) => {
    setRetailerCategoryTargets(prev => prev.map(cat => {
      if (cat.category !== category) return cat;
      const newRetailers = cat.retailers.filter(r => r.retailerId !== retailerId);
      return { ...cat, retailers: newRetailers };
    }));
  };

  // Distributor handlers
  const handleDistributorTotalTargetChange = (quantityValue: number, revenueValue: number) => {
    setDistributorTotalQuantity(quantityValue);
    setDistributorTotalRevenue(revenueValue);
    
    const numDistributors = distributorTargets.length;
    if (numDistributors > 0) {
      if (distributorEqualDivide) {
        const perDistQty = quantityValue / numDistributors;
        const perDistRev = revenueValue / numDistributors;
        setDistributorTargets(prev => prev.map(d => ({
          ...d,
          quantityTarget: perDistQty,
          revenueTarget: perDistRev,
          percentage: 100 / numDistributors
        })));
      } else {
        setDistributorTargets(prev => prev.map(d => ({
          ...d,
          quantityTarget: (d.percentage / 100) * quantityValue,
          revenueTarget: (d.percentage / 100) * revenueValue
        })));
      }
    }
  };

  const handleDistributorEqualDivideChange = (checked: boolean) => {
    setDistributorEqualDivide(checked);
    if (checked && distributorTargets.length > 0) {
      const numDistributors = distributorTargets.length;
      const perDistQty = numDistributors > 0 ? distributorTotalQuantity / numDistributors : 0;
      const perDistRev = numDistributors > 0 ? distributorTotalRevenue / numDistributors : 0;
      
      setDistributorTargets(prev => prev.map(d => ({
        ...d,
        quantityTarget: perDistQty,
        revenueTarget: perDistRev,
        percentage: 100 / numDistributors
      })));
    }
  };

  const handleDistributorTargetChange = (distributorId: string, quantityTarget: number, revenueTarget: number) => {
    setDistributorEqualDivide(false);
    setDistributorTargets(prev => {
      const newTargets = prev.map(d => {
        if (d.distributorId !== distributorId) return d;
        return { ...d, quantityTarget, revenueTarget };
      });
      
      const newTotalQty = newTargets.reduce((sum, d) => sum + d.quantityTarget, 0);
      const newTotalRev = newTargets.reduce((sum, d) => sum + d.revenueTarget, 0);
      setDistributorTotalQuantity(newTotalQty);
      setDistributorTotalRevenue(newTotalRev);
      
      if (newTotalRev > 0) {
        return newTargets.map(d => ({
          ...d,
          percentage: (d.revenueTarget / newTotalRev) * 100
        }));
      }
      return newTargets;
    });
  };

  const handleDistributorPercentageChange = (distributorId: string, percentage: number) => {
    setDistributorEqualDivide(false);
    setDistributorTargets(prev => prev.map(d => {
      if (d.distributorId !== distributorId) return d;
      return {
        ...d,
        percentage,
        quantityTarget: (percentage / 100) * distributorTotalQuantity,
        revenueTarget: (percentage / 100) * distributorTotalRevenue
      };
    }));
  };

  const removeDistributor = (distributorId: string) => {
    setDistributorTargets(prev => prev.filter(d => d.distributorId !== distributorId));
  };

  const saveDistributorTargets = async () => {
    if (!selectedPlan) return;
    
    try {
      // Delete existing
      await supabase
        .from('user_business_plan_distributors')
        .delete()
        .eq('business_plan_id', selectedPlan.id);

      // Insert new
      const distributorsToInsert = distributorTargets.filter(d => d.quantityTarget > 0 || d.revenueTarget > 0).map(d => ({
        business_plan_id: selectedPlan.id,
        distributor_id: d.distributorId,
        distributor_name: d.distributorName,
        quantity_target: Math.round(d.quantityTarget),
        revenue_target: Math.round(d.revenueTarget)
      }));

      if (distributorsToInsert.length > 0) {
        const { error } = await supabase
          .from('user_business_plan_distributors')
          .insert(distributorsToInsert);
        if (error) throw error;
      }

      toast.success("Distributor targets saved");
    } catch (error: any) {
      toast.error("Failed to save: " + error.message);
    }
  };

  const saveProductTargets = async () => {
    if (!selectedPlan) return;
    
    try {
      // Delete existing
      await supabase
        .from('user_business_plan_products')
        .delete()
        .eq('business_plan_id', selectedPlan.id);

      // Insert new
      const productsToInsert = categoryTargets.flatMap(cat => 
        cat.products.filter(p => p.quantityTarget > 0 || p.revenueTarget > 0).map(p => ({
          business_plan_id: selectedPlan.id,
          product_id: p.productId,
          product_name: p.productName,
          quantity_target: Math.round(p.quantityTarget),
          revenue_target: Math.round(p.revenueTarget)
        }))
      );

      if (productsToInsert.length > 0) {
        const { error } = await supabase
          .from('user_business_plan_products')
          .insert(productsToInsert);
        if (error) throw error;
      }

      toast.success("Product targets saved");
    } catch (error: any) {
      toast.error("Failed to save: " + error.message);
    }
  };

  const saveRetailerTargets = async () => {
    if (!selectedPlan) return;
    
    try {
      // Delete existing
      await supabase
        .from('user_business_plan_retailers')
        .delete()
        .eq('business_plan_id', selectedPlan.id);

      // Insert new
      const retailersToInsert = retailerCategoryTargets.flatMap(cat => 
        cat.retailers.filter(r => r.quantityTarget > 0 || r.revenueTarget > 0).map(r => ({
          business_plan_id: selectedPlan.id,
          retailer_id: r.retailerId,
          retailer_name: r.retailerName,
          last_year_revenue: 0,
          quantity_target: Math.round(r.quantityTarget),
          target_revenue: Math.round(r.revenueTarget),
          growth_percent: 0
        }))
      );

      if (retailersToInsert.length > 0) {
        const { error } = await supabase
          .from('user_business_plan_retailers')
          .insert(retailersToInsert);
        if (error) throw error;
      }

      toast.success("Retailer targets saved");
    } catch (error: any) {
      toast.error("Failed to save: " + error.message);
    }
  };

  // Month target handlers with quantity and product breakdown
  const handleMonthTotalTargetChange = (quantityValue: number, revenueValue: number) => {
    setMonthTotalQuantity(quantityValue);
    setMonthTotalRevenue(revenueValue);
    if (monthEqualDivide) {
      setMonthTargets(prev => prev.map(m => {
        const monthQty = quantityValue / 12;
        const monthRev = revenueValue / 12;
        return {
          ...m,
          quantityTarget: monthQty,
          revenueTarget: monthRev,
          percentage: 100 / 12,
          products: m.products.map(p => ({
            ...p,
            quantityTarget: (p.percentage / 100) * monthQty,
            revenueTarget: (p.percentage / 100) * monthRev
          }))
        };
      }));
    } else {
      setMonthTargets(prev => prev.map(m => {
        const monthQty = (m.percentage / 100) * quantityValue;
        const monthRev = (m.percentage / 100) * revenueValue;
        return {
          ...m,
          quantityTarget: monthQty,
          revenueTarget: monthRev,
          products: m.products.map(p => ({
            ...p,
            quantityTarget: (p.percentage / 100) * monthQty,
            revenueTarget: (p.percentage / 100) * monthRev
          }))
        };
      }));
    }
  };

  const handleMonthEqualDivideChange = (checked: boolean) => {
    setMonthEqualDivide(checked);
    if (checked) {
      setMonthTargets(prev => prev.map(m => {
        const monthQty = monthTotalQuantity / 12;
        const monthRev = monthTotalRevenue / 12;
        return {
          ...m,
          percentage: 100 / 12,
          quantityTarget: monthQty,
          revenueTarget: monthRev,
          products: m.products.map(p => ({
            ...p,
            quantityTarget: (p.percentage / 100) * monthQty,
            revenueTarget: (p.percentage / 100) * monthRev
          }))
        };
      }));
    }
  };

  const handleMonthPercentageChange = (monthNumber: number, percentage: number) => {
    setMonthEqualDivide(false);
    setMonthTargets(prev => prev.map(m => {
      if (m.monthNumber !== monthNumber) return m;
      const monthQty = (percentage / 100) * monthTotalQuantity;
      const monthRev = (percentage / 100) * monthTotalRevenue;
      return {
        ...m,
        percentage,
        quantityTarget: monthQty,
        revenueTarget: monthRev,
        products: m.products.map(p => ({
          ...p,
          quantityTarget: (p.percentage / 100) * monthQty,
          revenueTarget: (p.percentage / 100) * monthRev
        }))
      };
    }));
  };

  const handleMonthTargetChange = (monthNumber: number, quantityTarget: number, revenueTarget: number) => {
    setMonthEqualDivide(false);
    setMonthTargets(prev => {
      const newTargets = prev.map(m => {
        if (m.monthNumber !== monthNumber) return m;
        return {
          ...m,
          quantityTarget,
          revenueTarget,
          products: m.products.map(p => ({
            ...p,
            quantityTarget: (p.percentage / 100) * quantityTarget,
            revenueTarget: (p.percentage / 100) * revenueTarget
          }))
        };
      });
      const newTotalQty = newTargets.reduce((sum, m) => sum + m.quantityTarget, 0);
      const newTotalRev = newTargets.reduce((sum, m) => sum + m.revenueTarget, 0);
      setMonthTotalQuantity(newTotalQty);
      setMonthTotalRevenue(newTotalRev);
      return newTargets.map(m => ({
        ...m,
        percentage: newTotalRev > 0 ? (m.revenueTarget / newTotalRev) * 100 : 100 / 12
      }));
    });
  };

  const toggleMonthExpand = (monthNumber: number) => {
    const newExpanded = new Set(expandedMonths);
    if (newExpanded.has(monthNumber)) {
      newExpanded.delete(monthNumber);
    } else {
      newExpanded.add(monthNumber);
    }
    setExpandedMonths(newExpanded);
  };

  const handleMonthProductPercentageChange = (monthNumber: number, productId: string, percentage: number) => {
    setMonthTargets(prev => prev.map(m => {
      if (m.monthNumber !== monthNumber) return m;
      return {
        ...m,
        useProductPercentages: false,
        products: m.products.map(p => {
          if (p.productId !== productId) return p;
          return {
            ...p,
            percentage,
            quantityTarget: (percentage / 100) * m.quantityTarget,
            revenueTarget: (percentage / 100) * m.revenueTarget
          };
        })
      };
    }));
  };

  const handleApplyProductPercentagesFromProductsTab = (monthNumber: number) => {
    // Get percentages from the Products tab
    const productRevenues: Record<string, number> = {};
    categoryTargets.forEach(cat => {
      cat.products.forEach(p => {
        productRevenues[p.productId] = (productRevenues[p.productId] || 0) + p.revenueTarget;
      });
    });
    
    const totalRev = Object.values(productRevenues).reduce((sum, r) => sum + r, 0);
    
    setMonthTargets(prev => prev.map(m => {
      if (m.monthNumber !== monthNumber) return m;
      return {
        ...m,
        useProductPercentages: true,
        products: m.products.map(p => {
          const pct = totalRev > 0 ? ((productRevenues[p.productId] || 0) / totalRev) * 100 : (100 / m.products.length);
          return {
            ...p,
            percentage: pct,
            quantityTarget: (pct / 100) * m.quantityTarget,
            revenueTarget: (pct / 100) * m.revenueTarget
          };
        })
      };
    }));
  };

  const saveMonthTargets = async () => {
    if (!selectedPlan) return;
    
    try {
      // Delete existing month targets
      await supabase
        .from('user_business_plan_months')
        .delete()
        .eq('business_plan_id', selectedPlan.id);

      // Delete existing month product targets
      await supabase
        .from('user_business_plan_month_products')
        .delete()
        .eq('business_plan_id', selectedPlan.id);

      // Insert month targets
      const monthsToInsert = monthTargets.filter(m => m.quantityTarget > 0 || m.revenueTarget > 0).map(m => ({
        business_plan_id: selectedPlan.id,
        month_number: m.monthNumber,
        month_name: m.monthName,
        quantity_target: Math.round(m.quantityTarget),
        revenue_target: Math.round(m.revenueTarget),
        working_days: m.workingDays
      }));

      if (monthsToInsert.length > 0) {
        const { error } = await supabase
          .from('user_business_plan_months')
          .insert(monthsToInsert);
        if (error) throw error;
      }

      // Insert month product targets
      const monthProductsToInsert = monthTargets.flatMap(m => 
        m.products.filter(p => p.quantityTarget > 0 || p.revenueTarget > 0 || p.percentage > 0).map(p => ({
          business_plan_id: selectedPlan.id,
          month_number: m.monthNumber,
          month_name: m.monthName,
          product_id: p.productId,
          product_name: p.productName,
          percentage: p.percentage,
          quantity_target: Math.round(p.quantityTarget),
          revenue_target: Math.round(p.revenueTarget)
        }))
      );

      if (monthProductsToInsert.length > 0) {
        const { error } = await supabase
          .from('user_business_plan_month_products')
          .insert(monthProductsToInsert);
        if (error) throw error;
      }

      toast.success("Monthly targets saved");
    } catch (error: any) {
      toast.error("Failed to save: " + error.message);
    }
  };

  // Computed totals
  const totalProductQuantity = useMemo(() => 
    categoryTargets.reduce((sum, cat) => 
      sum + cat.products.reduce((pSum, p) => pSum + p.quantityTarget, 0), 0), 
    [categoryTargets]
  );

  const totalProductRevenue = useMemo(() => 
    categoryTargets.reduce((sum, cat) => 
      sum + cat.products.reduce((pSum, p) => pSum + p.revenueTarget, 0), 0), 
    [categoryTargets]
  );

  const totalRetailerQuantity = useMemo(() => 
    retailerCategoryTargets.reduce((sum, cat) => 
      sum + cat.retailers.reduce((rSum, r) => rSum + r.quantityTarget, 0), 0), 
    [retailerCategoryTargets]
  );

  const totalRetailerRevenue = useMemo(() => 
    retailerCategoryTargets.reduce((sum, cat) => 
      sum + cat.retailers.reduce((rSum, r) => rSum + r.revenueTarget, 0), 0), 
    [retailerCategoryTargets]
  );

  const totalMonthQuantityComputed = useMemo(() => 
    monthTargets.reduce((sum, m) => sum + m.quantityTarget, 0), 
    [monthTargets]
  );

  const totalMonthRevenueComputed = useMemo(() => 
    monthTargets.reduce((sum, m) => sum + m.revenueTarget, 0), 
    [monthTargets]
  );

  const totalDistributorQuantity = useMemo(() => 
    distributorTargets.reduce((sum, d) => sum + d.quantityTarget, 0), 
    [distributorTargets]
  );

  const totalDistributorRevenue = useMemo(() => 
    distributorTargets.reduce((sum, d) => sum + d.revenueTarget, 0), 
    [distributorTargets]
  );

  const quantityUnit = selectedPlan?.quantity_unit || 'Units';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Target className="h-4 w-4" />
          My FY Target
        </h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1">
              <Plus className="h-3 w-3" />
              New Plan
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create FY Plan</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div>
                <Label>Financial Year</Label>
                <Input
                  type="number"
                  value={planForm.year}
                  onChange={(e) => setPlanForm(prev => ({ ...prev, year: parseInt(e.target.value) }))}
                  min={2020}
                  max={2050}
                />
              </div>
              
              {/* No Target Toggle */}
              <div className="flex items-center gap-3 p-3 rounded-lg border border-muted bg-muted/30">
                <Checkbox
                  id="no-target-create"
                  checked={planForm.has_no_target}
                  onCheckedChange={(checked) => setPlanForm(prev => ({ ...prev, has_no_target: checked as boolean }))}
                />
                <Label htmlFor="no-target-create" className="text-sm cursor-pointer">
                  No Target for this FY
                  <p className="text-xs text-muted-foreground font-normal mt-0.5">
                    Mark this user as having no target assigned
                  </p>
                </Label>
              </div>
              
              {/* Hierarchy allocation hint */}
              {hasDialogHierarchyTarget && dialogHierarchyAllocation && !planForm.has_no_target && (
                <Alert className="border-blue-500/50 bg-blue-500/10">
                  <Info className="h-4 w-4 text-blue-500" />
                  <AlertDescription className="text-xs">
                    Hierarchy target available for FY {planForm.year}: {' '}
                    <span className="font-medium">
                      {Math.round(dialogHierarchyAllocation.quantity_target).toLocaleString()} {dialogHierarchyAllocation.hierarchy_target?.quantity_unit || 'Units'} | 
                      ₹{Math.round(dialogHierarchyAllocation.revenue_target).toLocaleString()}
                    </span>
                    {' '}(auto-filled below)
                  </AlertDescription>
                </Alert>
              )}
              
              {!planForm.has_no_target && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Quantity Target</Label>
                      <Input
                        type="number"
                        value={planForm.quantity_target}
                        onChange={(e) => setPlanForm(prev => ({ ...prev, quantity_target: e.target.value }))}
                        placeholder="Annual quantity"
                      />
                    </div>
                    <div>
                      <Label>Unit of Measure</Label>
                      <Select
                        value={planForm.quantity_unit}
                        onValueChange={(value) => setPlanForm(prev => ({ ...prev, quantity_unit: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {QUANTITY_UNITS.map(unit => (
                            <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Revenue Target (₹)</Label>
                    <Input
                      type="number"
                      value={planForm.revenue_target}
                      onChange={(e) => setPlanForm(prev => ({ ...prev, revenue_target: e.target.value }))}
                      placeholder="Annual revenue target"
                    />
                  </div>
                </>
              )}
              <div>
                <Label>Notes</Label>
                <Input
                  value={planForm.notes}
                  onChange={(e) => setPlanForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional notes"
                />
              </div>
              <Button type="submit" className="w-full">Create Plan</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="h-32 bg-muted animate-pulse rounded" />
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Target className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No FY plans yet</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Year Selector */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {plans.map(plan => (
              <Button
                key={plan.id}
                variant={selectedPlan?.id === plan.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedPlan(plan)}
              >
                FY {plan.year}
              </Button>
            ))}
          </div>

          {selectedPlan && (
            <>
              {/* Hierarchy Target Banner */}
              {hasHierarchyTarget && hierarchyAllocation && (
                <Alert className="border-blue-500/50 bg-blue-500/10">
                  <Info className="h-4 w-4 text-blue-500" />
                  <AlertDescription className="text-xs">
                    <span className="font-medium">Targets set via Hierarchy:</span>{" "}
                    {Math.round(hierarchyAllocation.quantity_target).toLocaleString()} {hierarchyAllocation.hierarchy_target?.quantity_unit || 'Units'} | 
                    ₹{Math.round(hierarchyAllocation.revenue_target).toLocaleString()} 
                    <span className="text-muted-foreground ml-1">
                      ({hierarchyAllocation.allocation_percentage?.toFixed(1)}% allocation)
                    </span>
                  </AlertDescription>
                </Alert>
              )}

              {/* Plan Overview */}
              {selectedPlan.has_no_target ? (
                /* No Target Banner */
                <Card className="border-muted bg-muted/30">
                  <CardContent className="p-6 text-center space-y-3">
                    <div className="flex items-center justify-center gap-2">
                      <Badge variant="outline" className="text-sm py-1.5 px-4 bg-muted border-muted-foreground/20 text-muted-foreground">
                        No Target Assigned
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={openEditDialog}>
                            <Pencil className="h-3.5 w-3.5 mr-2" />
                            Edit Plan
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => setDeleteDialogOpen(true)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Delete Plan
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      This user has been marked as having no target for FY {selectedPlan.year}.
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        // Convert to regular target
                        openEditDialog();
                      }}
                    >
                      Convert to Regular Target
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                /* Regular Plan Overview - Editable */
                <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">FY {selectedPlan.year} Overview</span>
                        {hasHierarchyTarget && (
                          <Badge variant="outline" className="text-xs bg-blue-500/10 border-blue-500/30 text-blue-600">
                            <Users className="h-3 w-3 mr-1" />
                            From Hierarchy
                          </Badge>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => setDeleteDialogOpen(true)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Delete Plan
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                        <Label className="text-xs font-semibold whitespace-nowrap text-primary">Qty Target ({quantityUnit})</Label>
                        <Input
                          type="number"
                          value={selectedPlan.quantity_target || ''}
                          onChange={(e) => {
                            const newQty = parseFloat(e.target.value) || 0;
                            setSelectedPlan(prev => prev ? { ...prev, quantity_target: newQty } : null);
                            handleProductTotalTargetChange(newQty, selectedPlan.revenue_target);
                            handleRetailerTotalTargetChange(newQty, selectedPlan.revenue_target);
                            handleMonthTotalTargetChange(newQty, selectedPlan.revenue_target);
                          }}
                          className="w-28 h-9 text-right font-bold text-lg bg-background border-primary/30 focus:border-primary"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                        <Label className="text-xs font-semibold whitespace-nowrap text-green-600 dark:text-green-400">Revenue Target (₹)</Label>
                        <Input
                          type="number"
                          value={selectedPlan.revenue_target || ''}
                          onChange={(e) => {
                            const newRev = parseFloat(e.target.value) || 0;
                            setSelectedPlan(prev => prev ? { ...prev, revenue_target: newRev } : null);
                            handleProductTotalTargetChange(selectedPlan.quantity_target, newRev);
                            handleRetailerTotalTargetChange(selectedPlan.quantity_target, newRev);
                            handleMonthTotalTargetChange(selectedPlan.quantity_target, newRev);
                          }}
                          className="w-32 h-9 text-right font-bold text-lg bg-background border-green-500/30 focus:border-green-500"
                        />
                      </div>
                    </div>
                    <Button 
                      className="w-full" 
                      onClick={async () => {
                        if (!selectedPlan) return;
                        try {
                          const { error: planError } = await supabase
                            .from('user_business_plans')
                            .update({
                              quantity_target: selectedPlan.quantity_target,
                              revenue_target: selectedPlan.revenue_target,
                            })
                            .eq('id', selectedPlan.id);
                          if (planError) throw planError;

                          await saveProductTargets();
                          await saveRetailerTargets();
                          await saveMonthTargets();
                          await saveDistributorTargets();

                          toast.success("All targets saved successfully");
                          loadPlans();
                        } catch (error: any) {
                          toast.error("Failed to save: " + error.message);
                        }
                      }}
                    >
                      <Target className="h-4 w-4 mr-2" />
                      Save Target
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Edit Plan Dialog */}
              <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit FY Plan</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleEditPlan} className="space-y-4">
                    <div>
                      <Label>Financial Year</Label>
                      <Input
                        type="number"
                        value={planForm.year}
                        onChange={(e) => setPlanForm(prev => ({ ...prev, year: parseInt(e.target.value) }))}
                        min={2020}
                        max={2050}
                      />
                    </div>
                    
                    {/* No Target Toggle */}
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-muted bg-muted/30">
                      <Checkbox
                        id="no-target-edit"
                        checked={planForm.has_no_target}
                        onCheckedChange={(checked) => setPlanForm(prev => ({ ...prev, has_no_target: checked as boolean }))}
                      />
                      <Label htmlFor="no-target-edit" className="text-sm cursor-pointer">
                        No Target for this FY
                        <p className="text-xs text-muted-foreground font-normal mt-0.5">
                          Mark this user as having no target assigned
                        </p>
                      </Label>
                    </div>
                    
                    {!planForm.has_no_target && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Quantity Target</Label>
                            <Input
                              type="number"
                              value={planForm.quantity_target}
                              onChange={(e) => setPlanForm(prev => ({ ...prev, quantity_target: e.target.value }))}
                              placeholder="Annual quantity"
                            />
                          </div>
                          <div>
                            <Label>Unit of Measure</Label>
                            <Select
                              value={planForm.quantity_unit}
                              onValueChange={(value) => setPlanForm(prev => ({ ...prev, quantity_unit: value }))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {QUANTITY_UNITS.map(unit => (
                                  <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label>Revenue Target (₹)</Label>
                          <Input
                            type="number"
                            value={planForm.revenue_target}
                            onChange={(e) => setPlanForm(prev => ({ ...prev, revenue_target: e.target.value }))}
                            placeholder="Annual revenue target"
                          />
                        </div>
                      </>
                    )}
                    <div>
                      <Label>Notes</Label>
                      <Input
                        value={planForm.notes}
                        onChange={(e) => setPlanForm(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Optional notes"
                      />
                    </div>
                    <Button type="submit" className="w-full">Update Plan</Button>
                  </form>
                </DialogContent>
              </Dialog>

              {/* Delete Confirmation Dialog */}
              <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete FY Plan</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete FY {selectedPlan.year} plan? This will also delete all product, retailer, and monthly targets associated with this plan. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeletePlan} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Tabs for Product, Retailer, Month, Territory and Distributor Targets */}
              {selectedPlan.has_no_target ? null : visibleTabs.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">No target parameters are enabled for this plan</p>
                  </CardContent>
                </Card>
              ) : (
              <Tabs defaultValue={defaultTabValue}>
                <TabsList className={`grid ${gridColsClass} w-full`}>
                  {visibleTabs.map(tab => (
                    <TabsTrigger key={tab.value} value={tab.value} className="text-xs gap-1 px-1 sm:px-3">
                      <tab.icon className="h-3 w-3" />
                      <span className="hidden xs:inline">{tab.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* PRODUCT TARGETS TAB - only render if visible */}
                {visibleTabs.some(t => t.value === 'products') && (
                <TabsContent value="products" className="mt-4 space-y-3">
                  {categoryTargets.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <p className="text-sm text-muted-foreground">No product categories available</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      {/* Equal divide checkbox only */}
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border border-muted">
                        <Checkbox
                          id="product-equal-divide-all"
                          checked={productEqualDivide}
                          onCheckedChange={(checked) => handleProductEqualDivideChange(checked as boolean)}
                        />
                        <Label htmlFor="product-equal-divide-all" className="text-xs cursor-pointer">
                          Equally divide across all products
                        </Label>
                      </div>

                      <div className="space-y-2">
                      {categoryTargets.map(cat => (
                        <Card key={cat.categoryId}>
                          <Collapsible
                            open={expandedCategories.has(cat.categoryId)}
                            onOpenChange={() => toggleCategoryExpand(cat.categoryId)}
                          >
                            <CollapsibleTrigger asChild>
                              <CardHeader className="p-3 cursor-pointer hover:bg-muted/50">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {expandedCategories.has(cat.categoryId) ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                    <span className="font-medium text-sm">{cat.categoryName}</span>
                                    <span className="text-xs text-muted-foreground">
                                      ({cat.products.length})
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                    <Input
                                      type="number"
                                      value={cat.quantityTarget || ''}
                                      onChange={(e) => handleCategoryTargetChange(cat.categoryId, parseFloat(e.target.value) || 0, cat.revenueTarget)}
                                      className="w-20 h-8 text-right text-sm"
                                      placeholder="Qty"
                                    />
                                    <Input
                                      type="number"
                                      value={cat.revenueTarget || ''}
                                      onChange={(e) => handleCategoryTargetChange(cat.categoryId, cat.quantityTarget, parseFloat(e.target.value) || 0)}
                                      className="w-24 h-8 text-right text-sm"
                                      placeholder="₹"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-destructive"
                                      onClick={() => removeCategory(cat.categoryId)}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </CardHeader>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <CardContent className="px-3 pb-3 pt-0">
                                <div className="flex items-center gap-2 mb-3 p-2 bg-muted/50 rounded">
                                  <Checkbox
                                    id={`equal-${cat.categoryId}`}
                                    checked={cat.equalDivide}
                                    onCheckedChange={(checked) => handleEqualDivideChange(cat.categoryId, checked as boolean)}
                                  />
                                  <Label htmlFor={`equal-${cat.categoryId}`} className="text-xs cursor-pointer">
                                    Equally divide across products
                                  </Label>
                                </div>
                                <div className="space-y-2">
                                  {cat.products.map(p => (
                                    <div key={p.productId} className="flex items-center justify-between py-2 border-b last:border-0">
                                      <span className="text-sm truncate max-w-[120px]">{p.productName}</span>
                                      <div className="flex items-center gap-2">
                                        {!cat.equalDivide && (
                                          <div className="flex items-center gap-1">
                                            <Input
                                              type="number"
                                              value={p.percentage.toFixed(1)}
                                              onChange={(e) => handleProductPercentageChange(cat.categoryId, p.productId, parseFloat(e.target.value) || 0)}
                                              className="w-14 h-7 text-right text-xs"
                                              min={0}
                                              max={100}
                                            />
                                            <span className="text-xs text-muted-foreground">%</span>
                                          </div>
                                        )}
                                        <span className="text-xs w-16 text-right">
                                          {Math.round(p.quantityTarget).toLocaleString()}
                                        </span>
                                        <span className="text-sm font-medium w-20 text-right">
                                          ₹{Math.round(p.revenueTarget).toLocaleString()}
                                        </span>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 text-destructive"
                                          onClick={() => removeProduct(cat.categoryId, p.productId)}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </CollapsibleContent>
                          </Collapsible>
                        </Card>
                      ))}
                      </div>
                    </>
                  )}

                  {/* Product Total Footer */}
                  <Card className="bg-muted/50">
                    <CardContent className="p-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Total Products Target</span>
                        <div className="text-right">
                          <span className="text-sm font-bold">{Math.round(totalProductQuantity).toLocaleString()} {quantityUnit}</span>
                          <span className="mx-2 text-muted-foreground">|</span>
                          <span className="text-sm font-bold">₹{Math.round(totalProductRevenue).toLocaleString()}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                )}

                {/* RETAILER TARGETS TAB - only render if visible */}
                {visibleTabs.some(t => t.value === 'retailers') && (
                <TabsContent value="retailers" className="mt-4 space-y-3">
                  {retailerCategoryTargets.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <p className="text-sm text-muted-foreground">No retailers mapped to you</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      {/* Equal divide checkbox only */}
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border border-muted">
                        <Checkbox
                          id="retailer-equal-divide-all"
                          checked={retailerEqualDivide}
                          onCheckedChange={(checked) => handleRetailerTotalEqualDivideChange(checked as boolean)}
                        />
                        <Label htmlFor="retailer-equal-divide-all" className="text-xs cursor-pointer">
                          Equally divide across all retailers
                        </Label>
                      </div>

                      <div className="space-y-2">
                        {retailerCategoryTargets.map(cat => (
                          <Card key={cat.category}>
                            <Collapsible
                              open={expandedRetailerCategories.has(cat.category)}
                              onOpenChange={() => toggleRetailerCategoryExpand(cat.category)}
                            >
                              <CollapsibleTrigger asChild>
                                <CardHeader className="p-3 cursor-pointer hover:bg-muted/50">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      {expandedRetailerCategories.has(cat.category) ? (
                                        <ChevronDown className="h-4 w-4" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4" />
                                      )}
                                      <span className="font-medium text-sm">{cat.category}</span>
                                      <span className="text-xs text-muted-foreground">
                                        ({cat.retailers.length})
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                      <Input
                                        type="number"
                                        value={cat.quantityTarget || ''}
                                        onChange={(e) => handleRetailerCategoryTargetChange(cat.category, parseFloat(e.target.value) || 0, cat.revenueTarget)}
                                        className="w-20 h-8 text-right text-sm"
                                        placeholder="Qty"
                                      />
                                      <Input
                                        type="number"
                                        value={cat.revenueTarget || ''}
                                        onChange={(e) => handleRetailerCategoryTargetChange(cat.category, cat.quantityTarget, parseFloat(e.target.value) || 0)}
                                        className="w-24 h-8 text-right text-sm"
                                        placeholder="₹"
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-destructive"
                                        onClick={() => removeRetailerCategory(cat.category)}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                </CardHeader>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <CardContent className="px-3 pb-3 pt-0">
                                  <div className="flex items-center gap-2 mb-3 p-2 bg-muted/50 rounded">
                                    <Checkbox
                                      id={`retailer-equal-${cat.category}`}
                                      checked={cat.equalDivide}
                                      onCheckedChange={(checked) => handleRetailerEqualDivideChange(cat.category, checked as boolean)}
                                    />
                                    <Label htmlFor={`retailer-equal-${cat.category}`} className="text-xs cursor-pointer">
                                      Equally divide across retailers
                                    </Label>
                                  </div>
                                  <div className="space-y-2">
                                    {cat.retailers.map(r => (
                                      <div key={r.retailerId} className="flex items-center justify-between py-2 border-b last:border-0">
                                        <span className="text-sm truncate max-w-[120px]">{r.retailerName}</span>
                                        <div className="flex items-center gap-2">
                                          {!cat.equalDivide && (
                                            <div className="flex items-center gap-1">
                                              <Input
                                                type="number"
                                                value={r.percentage.toFixed(1)}
                                                onChange={(e) => handleRetailerPercentageChange(cat.category, r.retailerId, parseFloat(e.target.value) || 0)}
                                                className="w-14 h-7 text-right text-xs"
                                                min={0}
                                                max={100}
                                              />
                                              <span className="text-xs text-muted-foreground">%</span>
                                            </div>
                                          )}
                                          <span className="text-xs w-16 text-right">
                                            {Math.round(r.quantityTarget).toLocaleString()}
                                          </span>
                                          <span className="text-sm font-medium w-20 text-right">
                                            ₹{Math.round(r.revenueTarget).toLocaleString()}
                                          </span>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-destructive"
                                            onClick={() => removeRetailer(cat.category, r.retailerId)}
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </CardContent>
                              </CollapsibleContent>
                            </Collapsible>
                          </Card>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Retailers Total Footer */}
                  <Card className="bg-muted/50">
                    <CardContent className="p-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Total Retailers Target</span>
                        <div className="text-right">
                          <span className="text-sm font-bold">{Math.round(totalRetailerQuantity).toLocaleString()} {quantityUnit}</span>
                          <span className="mx-2 text-muted-foreground">|</span>
                          <span className="text-sm font-bold">₹{Math.round(totalRetailerRevenue).toLocaleString()}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                )}

                {/* DISTRIBUTOR TARGETS TAB - only render if visible */}
                {visibleTabs.some(t => t.value === 'distributors') && (
                <TabsContent value="distributors" className="mt-4 space-y-3">
                  {distributorTargets.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <Truck className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No distributors mapped to you via beats</p>
                        <p className="text-xs text-muted-foreground mt-1">Distributors are linked through the beats you create</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      {/* Equal divide checkbox */}
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border border-muted">
                        <Checkbox
                          id="distributor-equal-divide-all"
                          checked={distributorEqualDivide}
                          onCheckedChange={(checked) => handleDistributorEqualDivideChange(checked as boolean)}
                        />
                        <Label htmlFor="distributor-equal-divide-all" className="text-xs cursor-pointer">
                          Equally divide across all distributors
                        </Label>
                      </div>

                      <div className="space-y-2">
                        {distributorTargets.map(d => (
                          <Card key={d.distributorId}>
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Truck className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium text-sm truncate max-w-[140px]">{d.distributorName}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {!distributorEqualDivide && (
                                    <div className="flex items-center gap-1">
                                      <Input
                                        type="number"
                                        value={d.percentage.toFixed(1)}
                                        onChange={(e) => handleDistributorPercentageChange(d.distributorId, parseFloat(e.target.value) || 0)}
                                        className="w-14 h-7 text-right text-xs"
                                        min={0}
                                        max={100}
                                      />
                                      <span className="text-xs text-muted-foreground">%</span>
                                    </div>
                                  )}
                                  <Input
                                    type="number"
                                    value={Math.round(d.quantityTarget) || ''}
                                    onChange={(e) => handleDistributorTargetChange(d.distributorId, parseFloat(e.target.value) || 0, d.revenueTarget)}
                                    className="w-20 h-8 text-right text-sm"
                                    placeholder="Qty"
                                  />
                                  <Input
                                    type="number"
                                    value={Math.round(d.revenueTarget) || ''}
                                    onChange={(e) => handleDistributorTargetChange(d.distributorId, d.quantityTarget, parseFloat(e.target.value) || 0)}
                                    className="w-24 h-8 text-right text-sm"
                                    placeholder="₹"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-destructive"
                                    onClick={() => removeDistributor(d.distributorId)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Distributor Total Footer */}
                  <Card className="bg-muted/50">
                    <CardContent className="p-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Total Distributors Target</span>
                        <div className="text-right">
                          <span className="text-sm font-bold">{Math.round(totalDistributorQuantity).toLocaleString()} {quantityUnit}</span>
                          <span className="mx-2 text-muted-foreground">|</span>
                          <span className="text-sm font-bold">₹{Math.round(totalDistributorRevenue).toLocaleString()}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                )}

                {/* MONTHLY TARGETS TAB - only render if visible */}
                {visibleTabs.some(t => t.value === 'months') && (
                <TabsContent value="months" className="mt-4 space-y-3">
                  <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5">
                    <CardContent className="p-3 sm:p-4 space-y-4">
                      {/* Equal divide checkbox only */}
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border border-muted">
                        <Checkbox
                          id="month-equal-divide"
                          checked={monthEqualDivide}
                          onCheckedChange={(checked) => handleMonthEqualDivideChange(checked as boolean)}
                        />
                        <Label htmlFor="month-equal-divide" className="text-xs cursor-pointer">
                          Equally divide across all months
                        </Label>
                      </div>

                      {/* Month-wise targets with collapsible breakdown */}
                      <div className="space-y-2">
                        {monthTargets.map(m => {
                          const avgQtyPerDay = m.workingDays > 0 ? m.quantityTarget / m.workingDays : 0;
                          const avgRevPerDay = m.workingDays > 0 ? m.revenueTarget / m.workingDays : 0;
                          
                          return (
                            <Card key={m.monthNumber} className="overflow-hidden">
                              <Collapsible
                                open={expandedMonths.has(m.monthNumber)}
                                onOpenChange={() => toggleMonthExpand(m.monthNumber)}
                              >
                                <CollapsibleTrigger asChild>
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 cursor-pointer hover:bg-muted/50 gap-2">
                                    <div className="flex items-center gap-2">
                                      {expandedMonths.has(m.monthNumber) ? (
                                        <ChevronDown className="h-4 w-4 flex-shrink-0" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 flex-shrink-0" />
                                      )}
                                      <span className="text-sm font-medium">{m.monthName}</span>
                                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                                        ({m.workingDays} days)
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 ml-6 sm:ml-0" onClick={e => e.stopPropagation()}>
                                      {!monthEqualDivide && (
                                        <div className="flex items-center gap-1">
                                          <Input
                                            type="number"
                                            value={m.percentage.toFixed(1)}
                                            onChange={(e) => handleMonthPercentageChange(m.monthNumber, parseFloat(e.target.value) || 0)}
                                            className="w-12 sm:w-14 h-7 text-right text-xs"
                                            min={0}
                                            max={100}
                                          />
                                          <span className="text-xs text-muted-foreground">%</span>
                                        </div>
                                      )}
                                      <Input
                                        type="number"
                                        value={Math.round(m.quantityTarget) || ''}
                                        onChange={(e) => handleMonthTargetChange(m.monthNumber, parseFloat(e.target.value) || 0, m.revenueTarget)}
                                        className="w-16 sm:w-20 h-7 text-right text-xs sm:text-sm"
                                        placeholder="Qty"
                                      />
                                      <Input
                                        type="number"
                                        value={Math.round(m.revenueTarget) || ''}
                                        onChange={(e) => handleMonthTargetChange(m.monthNumber, m.quantityTarget, parseFloat(e.target.value) || 0)}
                                        className="w-20 sm:w-24 h-7 text-right text-xs sm:text-sm"
                                        placeholder="₹"
                                      />
                                    </div>
                                  </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="px-3 pb-3 pt-0 border-t bg-muted/20">
                                    {/* View selector tabs */}
                                    <div className="flex items-center gap-2 py-2 mb-2 border-b">
                                      <Button
                                        variant={monthBreakdownView === 'products' ? 'default' : 'outline'}
                                        size="sm"
                                        className="h-7 text-xs gap-1"
                                        onClick={() => setMonthBreakdownView('products')}
                                      >
                                        <Package className="h-3 w-3" />
                                        Products
                                      </Button>
                                      <Button
                                        variant={monthBreakdownView === 'daily' ? 'default' : 'outline'}
                                        size="sm"
                                        className="h-7 text-xs gap-1"
                                        onClick={() => setMonthBreakdownView('daily')}
                                      >
                                        <CalendarDays className="h-3 w-3" />
                                        Daily Avg
                                      </Button>
                                    </div>

                                    {/* Daily Average View */}
                                    {monthBreakdownView === 'daily' && (
                                      <div className="space-y-3">
                                        <div className="grid grid-cols-1 gap-3">
                                          <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                                            <div className="flex items-center gap-2">
                                              <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                              <span className="text-sm font-medium"># Working Days</span>
                                            </div>
                                            <Input
                                              type="number"
                                              min={1}
                                              max={31}
                                              value={m.workingDays}
                                              onChange={(e) => {
                                                const newValue = parseInt(e.target.value) || getWorkingDaysInMonth(m.monthNumber, selectedPlan?.year || new Date().getFullYear() + 1);
                                                setMonthTargets(prev => prev.map(mt => 
                                                  mt.monthNumber === m.monthNumber 
                                                    ? { ...mt, workingDays: Math.min(31, Math.max(1, newValue)) }
                                                    : mt
                                                ));
                                              }}
                                              className="w-16 h-8 text-center text-lg font-bold text-primary"
                                            />
                                          </div>
                                          
                                          <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                                            <div>
                                              <span className="text-sm font-medium">Avg Qty / Day</span>
                                              <p className="text-xs text-muted-foreground">
                                                {Math.round(m.quantityTarget).toLocaleString()} ÷ {m.workingDays} days
                                              </p>
                                            </div>
                                            <span className="text-lg font-bold text-primary">
                                              {avgQtyPerDay.toFixed(1)} {quantityUnit}
                                            </span>
                                          </div>
                                          
                                          <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                                            <div>
                                              <span className="text-sm font-medium">Avg Revenue / Day</span>
                                              <p className="text-xs text-muted-foreground">
                                                ₹{Math.round(m.revenueTarget).toLocaleString()} ÷ {m.workingDays} days
                                              </p>
                                            </div>
                                            <span className="text-lg font-bold text-primary">
                                              ₹{Math.round(avgRevPerDay).toLocaleString()}
                                            </span>
                                          </div>
                                        </div>
                                        
                                        <p className="text-xs text-muted-foreground text-center">
                                          Based on 6-day work week (Sundays excluded)
                                        </p>
                                      </div>
                                    )}

                                    {/* Products View */}
                                    {monthBreakdownView === 'products' && (
                                      <>
                                        {/* Apply from Products tab button */}
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                                          <span className="text-xs text-muted-foreground">Product-wise breakdown by category</span>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-6 text-xs w-full sm:w-auto"
                                            onClick={() => handleApplyProductPercentagesFromProductsTab(m.monthNumber)}
                                          >
                                            Apply % from Products Tab
                                          </Button>
                                        </div>
                                        
                                        {/* Product list grouped by category - with horizontal scroll on mobile */}
                                        <div className="space-y-2 max-h-80 overflow-y-auto">
                                          {(() => {
                                            // Group products by category
                                            const categoryGroups = m.products.reduce((acc, p) => {
                                              const catId = p.categoryId || 'uncategorized';
                                              if (!acc[catId]) {
                                                acc[catId] = {
                                                  categoryId: catId,
                                                  categoryName: p.categoryName || 'Uncategorized',
                                                  products: []
                                                };
                                              }
                                              acc[catId].products.push(p);
                                              return acc;
                                            }, {} as Record<string, { categoryId: string; categoryName: string; products: MonthProductTarget[] }>);
                                            
                                            return Object.values(categoryGroups).map(cat => {
                                              const catQty = cat.products.reduce((sum, p) => sum + p.quantityTarget, 0);
                                              const catRev = cat.products.reduce((sum, p) => sum + p.revenueTarget, 0);
                                              const catPct = cat.products.reduce((sum, p) => sum + p.percentage, 0);
                                              
                                              return (
                                                <Collapsible key={cat.categoryId} defaultOpen>
                                                  <CollapsibleTrigger asChild>
                                                    <div className="flex items-center justify-between py-1.5 px-2 bg-muted/50 rounded cursor-pointer hover:bg-muted/70">
                                                      <div className="flex items-center gap-1 min-w-0 flex-1">
                                                        <ChevronDown className="h-3 w-3 flex-shrink-0" />
                                                        <span className="text-xs font-medium truncate">{cat.categoryName}</span>
                                                        <span className="text-xs text-muted-foreground flex-shrink-0">({cat.products.length})</span>
                                                      </div>
                                                      <div className="flex items-center gap-1 sm:gap-2 text-xs flex-shrink-0">
                                                        <span className="w-10 sm:w-14 text-center">{catPct.toFixed(1)}%</span>
                                                        <span className="w-12 sm:w-16 text-right">{Math.round(catQty).toLocaleString()}</span>
                                                        <span className="w-14 sm:w-20 text-right font-medium">₹{Math.round(catRev).toLocaleString()}</span>
                                                      </div>
                                                    </div>
                                                  </CollapsibleTrigger>
                                                  <CollapsibleContent>
                                                    <div className="pl-3 sm:pl-4 border-l ml-2 mt-1 space-y-1">
                                                      {cat.products.map(p => (
                                                        <div key={p.productId} className="flex items-center justify-between py-1 border-b last:border-0 gap-1">
                                                          <span className="text-xs truncate flex-1 min-w-0" title={p.productName}>
                                                            {p.productName}
                                                          </span>
                                                          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                                                            <Input
                                                              type="number"
                                                              value={p.percentage.toFixed(1)}
                                                              onChange={(e) => handleMonthProductPercentageChange(m.monthNumber, p.productId, parseFloat(e.target.value) || 0)}
                                                              className="w-12 sm:w-14 h-6 text-right text-xs"
                                                              min={0}
                                                              max={100}
                                                            />
                                                            <span className="text-xs w-12 sm:w-16 text-right">
                                                              {Math.round(p.quantityTarget).toLocaleString()}
                                                            </span>
                                                            <span className="text-xs font-medium w-14 sm:w-20 text-right">
                                                              ₹{Math.round(p.revenueTarget).toLocaleString()}
                                                            </span>
                                                          </div>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </CollapsibleContent>
                                                </Collapsible>
                                              );
                                            });
                                          })()}
                                        </div>
                                        
                                        {/* Month product total */}
                                        <div className="flex justify-between items-center pt-2 mt-2 border-t text-xs">
                                          <span className="font-medium">Month Total</span>
                                          <div className="flex items-center gap-1 sm:gap-2">
                                            <span className="w-10 sm:w-14 text-center">{m.products.reduce((s, p) => s + p.percentage, 0).toFixed(1)}%</span>
                                            <span className="w-12 sm:w-16 text-right">{Math.round(m.products.reduce((s, p) => s + p.quantityTarget, 0)).toLocaleString()}</span>
                                            <span className="w-14 sm:w-20 text-right font-medium">₹{Math.round(m.products.reduce((s, p) => s + p.revenueTarget, 0)).toLocaleString()}</span>
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            </Card>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Monthly Total Footer */}
                  <Card className="bg-muted/50">
                    <CardContent className="p-3">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <span className="text-sm font-medium">Total Monthly Target</span>
                        <div className="text-right">
                          <span className="text-sm font-bold">{Math.round(totalMonthQuantityComputed).toLocaleString()} {quantityUnit}</span>
                          <span className="mx-2 text-muted-foreground">|</span>
                          <span className="text-sm font-bold">₹{Math.round(totalMonthRevenueComputed).toLocaleString()}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                )}

                {/* TERRITORY TARGETS TAB - only render if visible */}
                {visibleTabs.some(t => t.value === 'territory') && (
                <TabsContent value="territory" className="mt-4">
                  <TerritoryTargets
                    selectedPlanId={selectedPlan?.id || null}
                    userId={user?.id || null}
                    quantityUnit={quantityUnit}
                  />
                </TabsContent>
                )}
              </Tabs>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

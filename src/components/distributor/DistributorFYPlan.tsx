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
import { Plus, Target, Package, Store, Trash2, ChevronDown, ChevronRight, X, Calendar, Pencil, MoreVertical, Info, Users, CalendarDays } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

const QUANTITY_UNITS = ['Units', 'Kg', 'Liters', 'Pcs', 'Boxes', 'Cartons', 'Tonnes', 'Quintals'];

interface BusinessPlan {
  id: string;
  year: number;
  revenue_target: number;
  quantity_target: number;
  quantity_unit: string;
  coverage_target: string | null;
  territory_target: string | null;
  notes: string | null;
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

const FY_MONTHS = [
  { number: 1, name: 'April' },
  { number: 2, name: 'May' },
  { number: 3, name: 'June' },
  { number: 4, name: 'July' },
  { number: 5, name: 'August' },
  { number: 6, name: 'September' },
  { number: 7, name: 'October' },
  { number: 8, name: 'November' },
  { number: 9, name: 'December' },
  { number: 10, name: 'January' },
  { number: 11, name: 'February' },
  { number: 12, name: 'March' },
];

// Helper function to get working days in a month (excluding Sundays)
const getWorkingDaysInMonth = (fyMonthNumber: number, fyYear: number): number => {
  // Convert FY month to calendar month and year
  let calendarYear = fyYear - 1;
  let calendarMonth = fyMonthNumber + 3; // April is month 4
  if (calendarMonth > 12) {
    calendarMonth -= 12;
    calendarYear += 1;
  }
  
  const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();
  let workingDays = 0;
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(calendarYear, calendarMonth - 1, day);
    if (date.getDay() !== 0) { // 0 = Sunday
      workingDays++;
    }
  }
  
  return workingDays;
};

interface Props {
  distributorId: string;
}

export function DistributorFYPlan({ distributorId }: Props) {
  const [plans, setPlans] = useState<BusinessPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<BusinessPlan | null>(null);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [retailerCategories, setRetailerCategories] = useState<RetailerCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Product targets state
  const [categoryTargets, setCategoryTargets] = useState<CategoryTarget[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  // Retailer targets state
  const [retailerCategoryTargets, setRetailerCategoryTargets] = useState<RetailerCategoryTarget[]>([]);
  const [expandedRetailerCategories, setExpandedRetailerCategories] = useState<Set<string>>(new Set());

  // Monthly targets state
  const [monthTargets, setMonthTargets] = useState<MonthTarget[]>([]);
  const [monthEqualDivide, setMonthEqualDivide] = useState(true);
  const [monthTotalQuantity, setMonthTotalQuantity] = useState(0);
  const [monthTotalRevenue, setMonthTotalRevenue] = useState(0);
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set());
  const [monthBreakdownView, setMonthBreakdownView] = useState<'products' | 'daily'>('products');

  // User allocation state - targets set via My Target
  const [userAllocation, setUserAllocation] = useState<{
    quantity_target: number;
    revenue_target: number;
    quantity_unit: string;
    user_name: string;
  } | null>(null);

  const [planForm, setPlanForm] = useState({
    year: new Date().getFullYear() + 1,
    quantity_target: "",
    quantity_unit: "Units",
    revenue_target: "",
    coverage_target: "",
    territory_target: "",
    notes: "",
  });

  // Current FY calculation
  const currentFY = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    return month >= 3 ? now.getFullYear() + 1 : now.getFullYear();
  }, []);

  // Load user allocation for this distributor
  const loadUserAllocation = async (fyYear: number) => {
    try {
      const { data, error } = await supabase
        .from('user_business_plan_distributors')
        .select(`
          quantity_target,
          revenue_target,
          distributor_name,
          business_plan_id
        `)
        .eq('distributor_id', distributorId);

      if (error) throw error;
      
      if (!data || data.length === 0) {
        setUserAllocation(null);
        return;
      }

      // Get the business plan details for the matching year
      const businessPlanIds = data.map(d => d.business_plan_id);
      const { data: plansData } = await supabase
        .from('user_business_plans')
        .select('id, year, quantity_unit, user_id')
        .in('id', businessPlanIds)
        .eq('year', fyYear);

      if (plansData && plansData.length > 0) {
        const matchingPlan = plansData[0];
        const allocation = data.find(d => d.business_plan_id === matchingPlan.id);
        
        if (allocation) {
          // Get user name
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', matchingPlan.user_id)
            .single();

          setUserAllocation({
            quantity_target: allocation.quantity_target || 0,
            revenue_target: allocation.revenue_target || 0,
            quantity_unit: matchingPlan.quantity_unit || 'Units',
            user_name: profile?.full_name || 'Sales Rep'
          });
          return;
        }
      }
      
      setUserAllocation(null);
    } catch (error) {
      console.error('Error loading user allocation:', error);
      setUserAllocation(null);
    }
  };

  useEffect(() => {
    loadPlans();
    loadProductsWithCategories();
    loadRetailersWithCategories();
  }, [distributorId]);

  useEffect(() => {
    if (selectedPlan) {
      loadExistingTargets();
      loadUserAllocation(selectedPlan.year);
    }
  }, [selectedPlan]);

  // Also load allocation when dialog form year changes
  useEffect(() => {
    if (dialogOpen && planForm.year) {
      loadUserAllocationForDialog(planForm.year);
    }
  }, [dialogOpen, planForm.year]);

  const loadUserAllocationForDialog = async (fyYear: number) => {
    try {
      const { data } = await supabase
        .from('user_business_plan_distributors')
        .select(`
          quantity_target,
          revenue_target,
          business_plan:user_business_plans!user_business_plan_distributors_business_plan_id_fkey(
            year,
            quantity_unit
          )
        `)
        .eq('distributor_id', distributorId);

      const fyAllocation = data?.find((d: any) => d.business_plan?.year === fyYear);
      
      if (fyAllocation && fyAllocation.business_plan) {
        setPlanForm(prev => ({
          ...prev,
          quantity_target: fyAllocation.quantity_target?.toString() || prev.quantity_target,
          quantity_unit: (fyAllocation.business_plan as any)?.quantity_unit || prev.quantity_unit,
          revenue_target: fyAllocation.revenue_target?.toString() || prev.revenue_target,
        }));
      }
    } catch (error) {
      console.error('Error loading allocation for dialog:', error);
    }
  };

  const loadPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('distributor_business_plans')
        .select('*')
        .eq('distributor_id', distributorId)
        .order('year', { ascending: false });

      if (error) throw error;
      const plansData = (data || []).map((p: any) => ({
        ...p,
        quantity_target: p.quantity_target || 0,
        quantity_unit: p.quantity_unit || 'Units'
      }));
      setPlans(plansData);
      if (plansData.length > 0) {
        setSelectedPlan(plansData[0]);
      }
    } catch (error: any) {
      toast.error("Failed to load distributor targets: " + error.message);
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
    const { data: retailers } = await supabase
      .from('retailers')
      .select('id, name, category')
      .eq('distributor_id', distributorId)
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

  const loadExistingTargets = async () => {
    if (!selectedPlan) return;
    
    // Load product targets
    const { data: productData } = await supabase
      .from('distributor_business_plan_products')
      .select('*')
      .eq('business_plan_id', selectedPlan.id);

    // Load retailer targets
    const { data: retailerData } = await supabase
      .from('distributor_business_plan_retailers')
      .select('*')
      .eq('business_plan_id', selectedPlan.id);

    // Load monthly targets
    const { data: monthData } = await supabase
      .from('distributor_business_plan_months')
      .select('*')
      .eq('business_plan_id', selectedPlan.id);

    // Load monthly product targets
    const { data: monthProductData } = await supabase
      .from('distributor_business_plan_month_products')
      .select('*')
      .eq('business_plan_id', selectedPlan.id);

    // Initialize category targets from product categories
    const newCategoryTargets: CategoryTarget[] = productCategories.map(cat => ({
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
    }));

    // Calculate category totals from existing data
    newCategoryTargets.forEach(cat => {
      const categoryQtyTotal = cat.products.reduce((sum, p) => sum + p.quantityTarget, 0);
      const categoryRevTotal = cat.products.reduce((sum, p) => sum + p.revenueTarget, 0);
      cat.quantityTarget = categoryQtyTotal;
      cat.revenueTarget = categoryRevTotal;
      if (categoryRevTotal > 0) {
        cat.products.forEach(p => {
          p.percentage = categoryRevTotal > 0 ? (p.revenueTarget / categoryRevTotal) * 100 : 100 / cat.products.length;
        });
      }
    });

    setCategoryTargets(newCategoryTargets);

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

    // Calculate category totals from existing retailer data
    newRetailerCategoryTargets.forEach(cat => {
      const categoryQtyTotal = cat.retailers.reduce((sum, r) => sum + r.quantityTarget, 0);
      const categoryRevTotal = cat.retailers.reduce((sum, r) => sum + r.revenueTarget, 0);
      cat.quantityTarget = categoryQtyTotal;
      cat.revenueTarget = categoryRevTotal;
      if (categoryRevTotal > 0) {
        cat.retailers.forEach(r => {
          r.percentage = categoryRevTotal > 0 ? (r.revenueTarget / categoryRevTotal) * 100 : 100 / cat.retailers.length;
        });
      }
    });

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
      const monthRev = existing?.target_revenue || (hasExistingMonthData ? 0 : (selectedPlan.revenue_target || 0) / 12);
      
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
      
      return {
        monthNumber: m.number,
        monthName: m.name,
        percentage: 100 / 12,
        quantityTarget: monthQty,
        revenueTarget: monthRev,
        useProductPercentages: !hasExistingMonthProductData,
        products: monthProducts,
        workingDays: getWorkingDaysInMonth(m.number, selectedPlan.year)
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
  };

  useEffect(() => {
    if (productCategories.length > 0 && selectedPlan) {
      loadExistingTargets();
    }
  }, [productCategories, retailerCategories, selectedPlan]);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase
        .from('distributor_business_plans')
        .insert({
          distributor_id: distributorId,
          year: planForm.year,
          quantity_target: parseFloat(planForm.quantity_target) || 0,
          quantity_unit: planForm.quantity_unit,
          revenue_target: parseFloat(planForm.revenue_target) || 0,
          coverage_target: planForm.coverage_target || null,
          territory_target: planForm.territory_target || null,
          notes: planForm.notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      toast.success("Distributor Target created");
      setDialogOpen(false);
      setPlanForm({
        year: new Date().getFullYear() + 1,
        quantity_target: "",
        quantity_unit: "Units",
        revenue_target: "",
        coverage_target: "",
        territory_target: "",
        notes: "",
      });
      loadPlans();
      setSelectedPlan({
        ...data,
        quantity_target: data.quantity_target || 0,
        quantity_unit: data.quantity_unit || 'Units'
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
        .from('distributor_business_plans')
        .update({
          year: planForm.year,
          quantity_target: parseFloat(planForm.quantity_target) || 0,
          quantity_unit: planForm.quantity_unit,
          revenue_target: parseFloat(planForm.revenue_target) || 0,
          coverage_target: planForm.coverage_target || null,
          territory_target: planForm.territory_target || null,
          notes: planForm.notes || null,
        })
        .eq('id', selectedPlan.id);

      if (error) throw error;
      toast.success("Distributor Target updated");
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
      await supabase.from('distributor_business_plan_products').delete().eq('business_plan_id', selectedPlan.id);
      await supabase.from('distributor_business_plan_retailers').delete().eq('business_plan_id', selectedPlan.id);
      await supabase.from('distributor_business_plan_months').delete().eq('business_plan_id', selectedPlan.id);
      
      const { error } = await supabase
        .from('distributor_business_plans')
        .delete()
        .eq('id', selectedPlan.id);

      if (error) throw error;
      toast.success("Distributor Target deleted");
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
        coverage_target: selectedPlan.coverage_target || "",
        territory_target: selectedPlan.territory_target || "",
        notes: selectedPlan.notes || "",
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
  const handleCategoryTargetChange = (categoryId: string, quantityValue: number, revenueValue: number) => {
    setCategoryTargets(prev => prev.map(cat => {
      if (cat.categoryId !== categoryId) return cat;
      
      const newProducts = cat.products.map(p => ({
        ...p,
        quantityTarget: cat.equalDivide ? quantityValue / cat.products.length : (p.percentage / 100) * quantityValue,
        revenueTarget: cat.equalDivide ? revenueValue / cat.products.length : (p.percentage / 100) * revenueValue
      }));
      
      return { ...cat, quantityTarget: quantityValue, revenueTarget: revenueValue, products: newProducts };
    }));
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
  const handleRetailerCategoryTargetChange = (category: string, quantityValue: number, revenueValue: number) => {
    setRetailerCategoryTargets(prev => prev.map(cat => {
      if (cat.category !== category) return cat;
      
      const newRetailers = cat.retailers.map(r => ({
        ...r,
        quantityTarget: cat.equalDivide ? quantityValue / cat.retailers.length : (r.percentage / 100) * quantityValue,
        revenueTarget: cat.equalDivide ? revenueValue / cat.retailers.length : (r.percentage / 100) * revenueValue
      }));
      
      return { ...cat, quantityTarget: quantityValue, revenueTarget: revenueValue, retailers: newRetailers };
    }));
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

  const saveProductTargets = async () => {
    if (!selectedPlan) return;
    
    try {
      // Delete existing
      await supabase
        .from('distributor_business_plan_products')
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
          .from('distributor_business_plan_products')
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
        .from('distributor_business_plan_retailers')
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
          .from('distributor_business_plan_retailers')
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
        .from('distributor_business_plan_months')
        .delete()
        .eq('business_plan_id', selectedPlan.id);

      // Delete existing month product targets
      await supabase
        .from('distributor_business_plan_month_products')
        .delete()
        .eq('business_plan_id', selectedPlan.id);

      // Insert month targets
      const monthsToInsert = monthTargets.filter(m => m.quantityTarget > 0 || m.revenueTarget > 0).map(m => ({
        business_plan_id: selectedPlan.id,
        month_number: m.monthNumber,
        month_name: m.monthName,
        quantity_target: Math.round(m.quantityTarget),
        target_revenue: Math.round(m.revenueTarget)
      }));

      if (monthsToInsert.length > 0) {
        const { error } = await supabase
          .from('distributor_business_plan_months')
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
          .from('distributor_business_plan_month_products')
          .insert(monthProductsToInsert);
        if (error) throw error;
      }

      toast.success("Monthly targets saved");
    } catch (error: any) {
      toast.error("Failed to save: " + error.message);
    }
  };

  // Computed totals - sum of individual line items (not category totals)
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

  const quantityUnit = selectedPlan?.quantity_unit || 'Units';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Target className="h-4 w-4" />
          Distributor Target
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
              <DialogTitle>Create Distributor Target</DialogTitle>
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
              <div>
                <Label>Coverage Target</Label>
                <Input
                  value={planForm.coverage_target}
                  onChange={(e) => setPlanForm(prev => ({ ...prev, coverage_target: e.target.value }))}
                  placeholder="e.g., 50 new retailers"
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
            <p className="text-sm text-muted-foreground">No targets yet</p>
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
              {/* User Allocation Banner */}
              {userAllocation && (
                <Alert className="border-blue-500/50 bg-blue-500/10">
                  <Info className="h-4 w-4 text-blue-500" />
                  <AlertDescription className="text-xs">
                    <span className="font-medium">Target from {userAllocation.user_name}'s My Target:</span>{" "}
                    {Math.round(userAllocation.quantity_target).toLocaleString()} {userAllocation.quantity_unit} | 
                    ₹{Math.round(userAllocation.revenue_target).toLocaleString()}
                  </AlertDescription>
                </Alert>
              )}

              {/* Plan Overview */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">FY {selectedPlan.year} Overview</span>
                      {userAllocation && (
                        <Badge variant="outline" className="text-xs bg-blue-500/10 border-blue-500/30 text-blue-600">
                          <Users className="h-3 w-3 mr-1" />
                          From My Target
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
                        {userAllocation && (
                          selectedPlan.quantity_target !== userAllocation.quantity_target ||
                          selectedPlan.revenue_target !== userAllocation.revenue_target
                        ) && (
                          <DropdownMenuItem onClick={async () => {
                            if (!selectedPlan || !userAllocation) return;
                            try {
                              // Update main plan
                              const { error } = await supabase
                                .from('distributor_business_plans')
                                .update({
                                  quantity_target: userAllocation.quantity_target,
                                  quantity_unit: userAllocation.quantity_unit,
                                  revenue_target: userAllocation.revenue_target,
                                })
                                .eq('id', selectedPlan.id);
                              if (error) throw error;

                              // Calculate scale factor for proportional distribution
                              const oldQty = selectedPlan.quantity_target || 1;
                              const oldRev = selectedPlan.revenue_target || 1;
                              const qtyScale = userAllocation.quantity_target / oldQty;
                              const revScale = userAllocation.revenue_target / oldRev;

                              // Auto-calculate Products - distribute proportionally to all products
                              if (productCategories.length > 0) {
                                // Delete existing product targets
                                await supabase
                                  .from('distributor_business_plan_products')
                                  .delete()
                                  .eq('business_plan_id', selectedPlan.id);

                                // Get total products count for equal distribution
                                const allProducts = productCategories.flatMap(cat => cat.products);
                                if (allProducts.length > 0) {
                                  const qtyPerProduct = userAllocation.quantity_target / allProducts.length;
                                  const revPerProduct = userAllocation.revenue_target / allProducts.length;

                                  const productsToInsert = allProducts.map(p => ({
                                    business_plan_id: selectedPlan.id,
                                    product_id: p.id,
                                    product_name: p.name,
                                    quantity_target: Math.round(qtyPerProduct),
                                    revenue_target: Math.round(revPerProduct)
                                  }));

                                  await supabase
                                    .from('distributor_business_plan_products')
                                    .insert(productsToInsert);
                                }
                              }

                              // Auto-calculate Retailers - distribute proportionally to all retailers
                              if (retailerCategories.length > 0) {
                                // Delete existing retailer targets
                                await supabase
                                  .from('distributor_business_plan_retailers')
                                  .delete()
                                  .eq('business_plan_id', selectedPlan.id);

                                // Get total retailers count for equal distribution
                                const allRetailers = retailerCategories.flatMap(cat => cat.retailers);
                                if (allRetailers.length > 0) {
                                  const qtyPerRetailer = userAllocation.quantity_target / allRetailers.length;
                                  const revPerRetailer = userAllocation.revenue_target / allRetailers.length;

                                  const retailersToInsert = allRetailers.map(r => ({
                                    business_plan_id: selectedPlan.id,
                                    retailer_id: r.id,
                                    retailer_name: r.name,
                                    quantity_target: Math.round(qtyPerRetailer),
                                    target_revenue: Math.round(revPerRetailer)
                                  }));

                                  await supabase
                                    .from('distributor_business_plan_retailers')
                                    .insert(retailersToInsert);
                                }
                              }

                              toast.success("Synced targets from My Target (including Products & Retailers)");
                              loadPlans();
                              // Reload existing targets to refresh the UI
                              setTimeout(() => loadExistingTargets(), 500);
                            } catch (error: any) {
                              toast.error("Failed to sync: " + error.message);
                            }
                          }}>
                            <Users className="h-3.5 w-3.5 mr-2" />
                            Sync from My Target
                          </DropdownMenuItem>
                        )}
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
                  
                  {/* Show mismatch warning */}
                  {userAllocation && (
                    selectedPlan.quantity_target !== userAllocation.quantity_target ||
                    selectedPlan.revenue_target !== userAllocation.revenue_target
                  ) && (
                    <Alert className="mb-3 border-amber-500/50 bg-amber-500/10">
                      <Info className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-xs text-amber-700">
                        Current targets differ from My Target allocation. Use the menu to sync.
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Quantity Target</p>
                      <p className="text-lg font-bold">{selectedPlan.quantity_target.toLocaleString()} {quantityUnit}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Revenue Target</p>
                      <p className="text-lg font-bold">₹{selectedPlan.revenue_target.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Edit Plan Dialog */}
              <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Distributor Target</DialogTitle>
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
                    <div>
                      <Label>Coverage Target</Label>
                      <Input
                        value={planForm.coverage_target}
                        onChange={(e) => setPlanForm(prev => ({ ...prev, coverage_target: e.target.value }))}
                        placeholder="e.g., 50 new retailers"
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
                    <AlertDialogTitle>Delete Distributor Target</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete FY {selectedPlan.year} target? This will also delete all product, retailer, and monthly targets associated with this plan. This action cannot be undone.
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

              {/* Tabs for Product, Retailer and Month Targets */}
              <Tabs defaultValue="products">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="products" className="text-xs gap-1">
                    <Package className="h-3 w-3" />
                    Products
                  </TabsTrigger>
                  <TabsTrigger value="retailers" className="text-xs gap-1">
                    <Store className="h-3 w-3" />
                    Retailers
                  </TabsTrigger>
                  <TabsTrigger value="months" className="text-xs gap-1">
                    <Calendar className="h-3 w-3" />
                    Monthly
                  </TabsTrigger>
                </TabsList>

                {/* PRODUCT TARGETS TAB */}
                <TabsContent value="products" className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-medium">Qty: {Math.round(totalProductQuantity).toLocaleString()} {quantityUnit}</span>
                      <span className="mx-2 text-muted-foreground">|</span>
                      <span className="font-medium">₹{Math.round(totalProductRevenue).toLocaleString()}</span>
                    </div>
                    <Button size="sm" onClick={saveProductTargets}>
                      Save Targets
                    </Button>
                  </div>

                  {categoryTargets.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <p className="text-sm text-muted-foreground">No product categories available</p>
                      </CardContent>
                    </Card>
                  ) : (
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
                  )}

                  {/* Products Total Footer */}
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

                {/* RETAILER TARGETS TAB */}
                <TabsContent value="retailers" className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-medium">Qty: {Math.round(totalRetailerQuantity).toLocaleString()} {quantityUnit}</span>
                      <span className="mx-2 text-muted-foreground">|</span>
                      <span className="font-medium">₹{Math.round(totalRetailerRevenue).toLocaleString()}</span>
                    </div>
                    <Button size="sm" onClick={saveRetailerTargets}>
                      Save Targets
                    </Button>
                  </div>

                  {retailerCategoryTargets.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <p className="text-sm text-muted-foreground">No retailers mapped to this distributor</p>
                      </CardContent>
                    </Card>
                  ) : (
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

                {/* MONTHLY TARGETS TAB */}
                <TabsContent value="months" className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-medium">Qty: {Math.round(totalMonthQuantityComputed).toLocaleString()} {quantityUnit}</span>
                      <span className="mx-2 text-muted-foreground">|</span>
                      <span className="font-medium">₹{Math.round(totalMonthRevenueComputed).toLocaleString()}</span>
                    </div>
                    <Button size="sm" onClick={saveMonthTargets}>
                      Save Targets
                    </Button>
                  </div>

                  <Card>
                    <CardContent className="p-4 space-y-4">
                      {/* Total target inputs */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-xs font-medium">Annual Qty ({quantityUnit})</Label>
                          <Input
                            type="number"
                            value={monthTotalQuantity || ''}
                            onChange={(e) => handleMonthTotalTargetChange(parseFloat(e.target.value) || 0, monthTotalRevenue)}
                            className="w-28 h-8 text-right"
                            placeholder="Quantity"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-xs font-medium">Annual Revenue (₹)</Label>
                          <Input
                            type="number"
                            value={monthTotalRevenue || ''}
                            onChange={(e) => handleMonthTotalTargetChange(monthTotalQuantity, parseFloat(e.target.value) || 0)}
                            className="w-28 h-8 text-right"
                            placeholder="Revenue"
                          />
                        </div>
                      </div>

                      {/* Equal divide checkbox */}
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                        <Checkbox
                          id="month-equal-divide"
                          checked={monthEqualDivide}
                          onCheckedChange={(checked) => handleMonthEqualDivideChange(checked as boolean)}
                        />
                        <Label htmlFor="month-equal-divide" className="text-xs cursor-pointer">
                          Equally divide across all months
                        </Label>
                      </div>

                      {/* Month-wise targets with collapsible products */}
                      <div className="space-y-2">
                        {monthTargets.map(m => (
                          <Card key={m.monthNumber} className="overflow-hidden">
                            <Collapsible
                              open={expandedMonths.has(m.monthNumber)}
                              onOpenChange={() => toggleMonthExpand(m.monthNumber)}
                            >
                              <CollapsibleTrigger asChild>
                                <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50">
                                  <div className="flex items-center gap-2">
                                    {expandedMonths.has(m.monthNumber) ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                    <span className="text-sm font-medium">{m.monthName}</span>
                                    <span className="text-xs text-muted-foreground">
                                      ({m.products.filter(p => p.percentage > 0).length} products)
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                    {!monthEqualDivide && (
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          value={m.percentage.toFixed(1)}
                                          onChange={(e) => handleMonthPercentageChange(m.monthNumber, parseFloat(e.target.value) || 0)}
                                          className="w-14 h-7 text-right text-xs"
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
                                      className="w-20 h-7 text-right text-sm"
                                      placeholder="Qty"
                                    />
                                    <Input
                                      type="number"
                                      value={Math.round(m.revenueTarget) || ''}
                                      onChange={(e) => handleMonthTargetChange(m.monthNumber, m.quantityTarget, parseFloat(e.target.value) || 0)}
                                      className="w-24 h-7 text-right text-sm"
                                      placeholder="₹"
                                    />
                                  </div>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="px-3 pb-3 pt-0 border-t bg-muted/20">
                                  {/* View toggle: Products / Daily Avg */}
                                  <div className="flex items-center justify-between py-2 mb-2">
                                    <div className="flex gap-1">
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
                                  </div>

                                  {/* Daily Average View */}
                                  {monthBreakdownView === 'daily' && (() => {
                                    const avgQtyPerDay = m.workingDays > 0 ? m.quantityTarget / m.workingDays : 0;
                                    const avgRevPerDay = m.workingDays > 0 ? m.revenueTarget / m.workingDays : 0;
                                    
                                    return (
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
                                    );
                                  })()}

                                  {/* Products View */}
                                  {monthBreakdownView === 'products' && (
                                    <>
                                      {/* Apply from Products tab button */}
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs text-muted-foreground">Product-wise breakdown by category</span>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-6 text-xs"
                                          onClick={() => handleApplyProductPercentagesFromProductsTab(m.monthNumber)}
                                        >
                                          Apply % from Products Tab
                                        </Button>
                                      </div>
                                  
                                  {/* Product list grouped by category */}
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
                                                <div className="flex items-center gap-1">
                                                  <ChevronDown className="h-3 w-3" />
                                                  <span className="text-xs font-medium">{cat.categoryName}</span>
                                                  <span className="text-xs text-muted-foreground">({cat.products.length})</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                  <span className="w-14 text-center">{catPct.toFixed(1)}%</span>
                                                  <span className="w-16 text-right">{Math.round(catQty).toLocaleString()}</span>
                                                  <span className="w-20 text-right font-medium">₹{Math.round(catRev).toLocaleString()}</span>
                                                </div>
                                              </div>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent>
                                              <div className="pl-4 border-l ml-2 mt-1 space-y-1">
                                                {cat.products.map(p => (
                                                  <div key={p.productId} className="flex items-center justify-between py-1 border-b last:border-0">
                                                    <span className="text-xs truncate max-w-[90px]" title={p.productName}>
                                                      {p.productName}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                      <Input
                                                        type="number"
                                                        value={p.percentage.toFixed(1)}
                                                        onChange={(e) => handleMonthProductPercentageChange(m.monthNumber, p.productId, parseFloat(e.target.value) || 0)}
                                                        className="w-14 h-6 text-right text-xs"
                                                        min={0}
                                                        max={100}
                                                      />
                                                      <span className="text-xs w-16 text-right">
                                                        {Math.round(p.quantityTarget).toLocaleString()}
                                                      </span>
                                                      <span className="text-xs font-medium w-20 text-right">
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
                                  <div className="flex items-center justify-between pt-2 mt-2 border-t font-medium text-xs">
                                    <span>Total</span>
                                    <div className="flex items-center gap-2">
                                      <span className="w-14 text-center">
                                        {m.products.reduce((sum, p) => sum + p.percentage, 0).toFixed(1)}%
                                      </span>
                                      <span className="w-16 text-right">
                                        {Math.round(m.products.reduce((sum, p) => sum + p.quantityTarget, 0)).toLocaleString()}
                                      </span>
                                      <span className="w-20 text-right">
                                        ₹{Math.round(m.products.reduce((sum, p) => sum + p.revenueTarget, 0)).toLocaleString()}
                                      </span>
                                    </div>
                                    </div>
                                    </>
                                  )}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Monthly Total Footer */}
                  <Card className="bg-muted/50">
                    <CardContent className="p-3">
                      <div className="flex justify-between items-center">
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
              </Tabs>
            </>
          )}
        </>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  ArrowLeft, 
  Target,
  Calendar,
  TrendingUp,
  Save,
  Plus,
  Package,
  Store,
  ChevronDown,
  ChevronRight,
  Trash2,
  MoreVertical,
  Pencil
} from 'lucide-react';
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
import { toast } from 'sonner';
import { fetchAllPaginated } from '@/utils/fetchAllPaginated';

const QUANTITY_UNITS = ['Units', 'Kg', 'Liters', 'Pcs', 'Boxes', 'Cartons', 'Tonnes', 'Quintals'];

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

interface MonthTarget {
  monthNumber: number;
  monthName: string;
  percentage: number;
  quantityTarget: number;
  revenueTarget: number;
}

interface Retailer {
  id: string;
  name: string;
}

interface RetailerTarget {
  id: string;
  retailer_id: string;
  retailer_name: string;
  last_year_revenue: number;
  target_revenue: number;
  growth_percent: number;
}

const DistributorFYPlanPage = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<BusinessPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<BusinessPlan | null>(null);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [distributorId, setDistributorId] = useState<string | null>(null);
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Product targets state
  const [categoryTargets, setCategoryTargets] = useState<CategoryTarget[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  // Monthly targets state
  const [monthTargets, setMonthTargets] = useState<MonthTarget[]>([]);
  const [monthEqualDivide, setMonthEqualDivide] = useState(true);
  
  // Retailer targets state
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [retailerTargets, setRetailerTargets] = useState<RetailerTarget[]>([]);
  const [retailerDialogOpen, setRetailerDialogOpen] = useState(false);
  const [retailerForm, setRetailerForm] = useState({
    retailer_id: "",
    last_year_revenue: "",
    target_revenue: "",
  });
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set());

  const [planForm, setPlanForm] = useState({
    year: new Date().getFullYear() + 1,
    quantity_target: "",
    quantity_unit: "Units",
    revenue_target: "",
    coverage_target: "",
    territory_target: "",
    notes: "",
  });

  useEffect(() => {
    const storedUser = localStorage.getItem('distributor_user');
    if (!storedUser) {
      navigate('/distributor-portal/login');
      return;
    }
    const user = JSON.parse(storedUser);
    setDistributorId(user.distributor_id);
    loadPlans(user.distributor_id);
    loadProductsWithCategories();
    loadRetailers(user.distributor_id);
  }, [navigate]);

  useEffect(() => {
    if (selectedPlan && productCategories.length > 0) {
      loadExistingTargets();
    }
  }, [selectedPlan, productCategories]);

  useEffect(() => {
    if (selectedPlan) {
      loadRetailerTargets();
    }
  }, [selectedPlan]);

  const loadPlans = async (distId: string) => {
    try {
      const { data, error } = await supabase
        .from('distributor_business_plans')
        .select('*')
        .eq('distributor_id', distId)
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

  const loadRetailers = async (distId: string) => {
    // Get retailer IDs from multiple sources (same logic as secondary sales)
    const retailerIdSet = new Set<string>();
    
    // Get distributor name for matching
    const { data: distData } = await supabase
      .from('distributors')
      .select('id, name')
      .eq('id', distId)
      .single();
    
    const distributorName = distData?.name || '';
    
    // From distributor_retailer_mappings
    const { data: mappedRetailers } = await supabase
      .from('distributor_retailer_mappings')
      .select('retailer_id')
      .eq('distributor_id', distId);
    
    mappedRetailers?.forEach(r => retailerIdSet.add(r.retailer_id));
    
    // From retailers table (direct link or parent_name match)
    const { data: linkedRetailers } = await supabase
      .from('retailers')
      .select('id, name')
      .or(`distributor_id.eq.${distId}${distributorName ? `,parent_name.ilike.${distributorName}` : ''}`);
    
    linkedRetailers?.forEach(r => retailerIdSet.add(r.id));
    
    // Fetch all retailer details
    const retailerIds = Array.from(retailerIdSet);
    if (retailerIds.length > 0) {
      const { data } = await supabase
        .from('retailers')
        .select('id, name')
        .in('id', retailerIds)
        .order('name');
      setRetailers(data || []);
    } else {
      setRetailers([]);
    }
  };

  const loadRetailerTargets = async () => {
    if (!selectedPlan) return;
    const { data } = await supabase
      .from('distributor_business_plan_retailers')
      .select('*')
      .eq('business_plan_id', selectedPlan.id);
    setRetailerTargets(data || []);
  };

  const loadExistingTargets = async () => {
    if (!selectedPlan) return;
    
    // Load product targets
    const { data: productData } = await supabase
      .from('distributor_business_plan_products')
      .select('*')
      .eq('business_plan_id', selectedPlan.id);

    // Load monthly targets
    const { data: monthData } = await supabase
      .from('distributor_business_plan_months')
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

    // Initialize monthly targets
    const hasExistingMonthData = monthData && monthData.length > 0;
    
    const newMonthTargets: MonthTarget[] = FY_MONTHS.map(m => {
      const existing = monthData?.find(md => md.month_number === m.number);
      const monthQty = existing?.quantity_target || (hasExistingMonthData ? 0 : (selectedPlan.quantity_target || 0) / 12);
      const monthRev = existing?.target_revenue || (hasExistingMonthData ? 0 : (selectedPlan.revenue_target || 0) / 12);
      
      return {
        monthNumber: m.number,
        monthName: m.name,
        percentage: 100 / 12,
        quantityTarget: monthQty,
        revenueTarget: monthRev
      };
    });

    const totalMonthlyRev = newMonthTargets.reduce((sum, m) => sum + m.revenueTarget, 0);
    
    if (totalMonthlyRev > 0 && hasExistingMonthData) {
      newMonthTargets.forEach(m => {
        m.percentage = (m.revenueTarget / totalMonthlyRev) * 100;
      });
      setMonthEqualDivide(false);
    } else {
      setMonthEqualDivide(true);
    }
    setMonthTargets(newMonthTargets);
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!distributorId) return;
    
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
      toast.success("FY Plan created");
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
      loadPlans(distributorId);
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
    if (!selectedPlan || !distributorId) return;
    
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
      toast.success("FY Plan updated");
      setEditDialogOpen(false);
      loadPlans(distributorId);
    } catch (error: any) {
      toast.error("Failed to update plan: " + error.message);
    }
  };

  const handleDeletePlan = async () => {
    if (!selectedPlan || !distributorId) return;
    
    try {
      // Delete related data first
      await supabase.from('distributor_business_plan_products').delete().eq('business_plan_id', selectedPlan.id);
      await supabase.from('distributor_business_plan_retailers').delete().eq('business_plan_id', selectedPlan.id);
      await supabase.from('distributor_business_plan_months').delete().eq('business_plan_id', selectedPlan.id);
      await supabase.from('distributor_business_plan_month_products').delete().eq('business_plan_id', selectedPlan.id);
      
      const { error } = await supabase
        .from('distributor_business_plans')
        .delete()
        .eq('id', selectedPlan.id);

      if (error) throw error;
      toast.success("FY Plan deleted");
      setDeleteDialogOpen(false);
      setSelectedPlan(null);
      loadPlans(distributorId);
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

  // Product handlers
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

  // Monthly handlers
  const handleMonthEqualDivideChange = (checked: boolean) => {
    if (!selectedPlan) return;
    setMonthEqualDivide(checked);
    
    if (checked) {
      const monthlyQty = selectedPlan.quantity_target / 12;
      const monthlyRev = selectedPlan.revenue_target / 12;
      setMonthTargets(prev => prev.map(m => ({
        ...m,
        percentage: 100 / 12,
        quantityTarget: monthlyQty,
        revenueTarget: monthlyRev
      })));
    }
  };

  const handleMonthTargetChange = (monthNumber: number, quantityValue: number, revenueValue: number) => {
    setMonthTargets(prev => {
      const updated = prev.map(m => 
        m.monthNumber === monthNumber 
          ? { ...m, quantityTarget: quantityValue, revenueTarget: revenueValue }
          : m
      );
      
      // Recalculate percentages
      const totalRev = updated.reduce((sum, m) => sum + m.revenueTarget, 0);
      if (totalRev > 0) {
        updated.forEach(m => {
          m.percentage = (m.revenueTarget / totalRev) * 100;
        });
      }
      
      return updated;
    });
    setMonthEqualDivide(false);
  };

  // Retailer handlers
  const handleAddRetailerTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || !retailerForm.retailer_id) return;

    const retailer = retailers.find(r => r.id === retailerForm.retailer_id);
    if (!retailer) return;

    const lastYear = parseFloat(retailerForm.last_year_revenue) || 0;
    const target = parseFloat(retailerForm.target_revenue) || 0;
    const growth = lastYear > 0 ? ((target - lastYear) / lastYear) * 100 : 0;

    try {
      const { error } = await supabase
        .from('distributor_business_plan_retailers')
        .insert({
          business_plan_id: selectedPlan.id,
          retailer_id: retailerForm.retailer_id,
          retailer_name: retailer.name,
          last_year_revenue: lastYear,
          target_revenue: target,
          growth_percent: growth,
        });

      if (error) throw error;
      toast.success("Retailer target added");
      setRetailerDialogOpen(false);
      setRetailerForm({ retailer_id: "", last_year_revenue: "", target_revenue: "" });
      loadRetailerTargets();
    } catch (error: any) {
      toast.error("Failed to add retailer: " + error.message);
    }
  };

  const handleDeleteRetailerTarget = async (id: string) => {
    const { error } = await supabase
      .from('distributor_business_plan_retailers')
      .delete()
      .eq('id', id);
    if (error) toast.error("Failed to delete");
    else loadRetailerTargets();
  };

  const saveAllTargets = async () => {
    if (!selectedPlan || !distributorId) return;
    setSaving(true);

    try {
      // Save product targets
      await supabase.from('distributor_business_plan_products').delete().eq('business_plan_id', selectedPlan.id);
      
      const productInserts = categoryTargets.flatMap(cat => 
        cat.products.filter(p => p.quantityTarget > 0 || p.revenueTarget > 0).map(p => ({
          business_plan_id: selectedPlan.id,
          product_id: p.productId,
          product_name: p.productName,
          quantity_target: p.quantityTarget,
          revenue_target: p.revenueTarget
        }))
      );
      
      if (productInserts.length > 0) {
        await supabase.from('distributor_business_plan_products').insert(productInserts);
      }

      // Save monthly targets
      await supabase.from('distributor_business_plan_months').delete().eq('business_plan_id', selectedPlan.id);
      
      const monthInserts = monthTargets.filter(m => m.quantityTarget > 0 || m.revenueTarget > 0).map(m => ({
        business_plan_id: selectedPlan.id,
        month_number: m.monthNumber,
        month_name: m.monthName,
        quantity_target: m.quantityTarget,
        target_revenue: m.revenueTarget
      }));
      
      if (monthInserts.length > 0) {
        await supabase.from('distributor_business_plan_months').insert(monthInserts);
      }

      toast.success('All targets saved successfully!');
    } catch (error: any) {
      toast.error('Failed to save targets: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Calculations
  const totalProductQty = categoryTargets.reduce((sum, cat) => sum + cat.quantityTarget, 0);
  const totalProductRev = categoryTargets.reduce((sum, cat) => sum + cat.revenueTarget, 0);
  const totalMonthQty = monthTargets.reduce((sum, m) => sum + m.quantityTarget, 0);
  const totalMonthRev = monthTargets.reduce((sum, m) => sum + m.revenueTarget, 0);
  const totalRetailerRev = retailerTargets.reduce((sum, r) => sum + r.target_revenue, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background standalone-page">
      {/* Header */}
      <header className="sticky-header-safe z-50 bg-card border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/distributor-portal/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="font-semibold text-foreground">FY Plan</h1>
              <p className="text-xs text-muted-foreground">Annual business targets</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedPlan && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={openEditDialog}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit Plan
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setDeleteDialogOpen(true)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Plan
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button onClick={saveAllTargets} disabled={saving || !selectedPlan}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save All'}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Plan Selector */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <span className="font-medium">Financial Year</span>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={selectedPlan?.id || ''}
                  onValueChange={(value) => {
                    const plan = plans.find(p => p.id === value);
                    setSelectedPlan(plan || null);
                  }}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select FY Plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map(plan => (
                      <SelectItem key={plan.id} value={plan.id}>
                        FY {plan.year}-{(plan.year + 1).toString().slice(-2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedPlan ? (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="retailers">Retailers</TabsTrigger>
              <TabsTrigger value="months">Months</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Plan Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-primary/10">
                      <p className="text-sm text-muted-foreground">Quantity Target</p>
                      <p className="text-2xl font-bold">
                        {selectedPlan.quantity_target.toLocaleString('en-IN')} {selectedPlan.quantity_unit}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-green-500/10">
                      <p className="text-sm text-muted-foreground">Revenue Target</p>
                      <p className="text-2xl font-bold">
                        ₹{selectedPlan.revenue_target.toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                  
                  {selectedPlan.territory_target && (
                    <div>
                      <Label className="text-muted-foreground">Territory Target</Label>
                      <p className="text-sm">{selectedPlan.territory_target}</p>
                    </div>
                  )}
                  
                  {selectedPlan.coverage_target && (
                    <div>
                      <Label className="text-muted-foreground">Coverage Target</Label>
                      <p className="text-sm">{selectedPlan.coverage_target}</p>
                    </div>
                  )}
                  
                  {selectedPlan.notes && (
                    <div>
                      <Label className="text-muted-foreground">Notes</Label>
                      <p className="text-sm">{selectedPlan.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Allocation Summary */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Allocation Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm">Product Allocation</span>
                      <div className="text-right">
                        <p className="font-medium">{totalProductQty.toLocaleString('en-IN')} {selectedPlan.quantity_unit}</p>
                        <p className="text-xs text-muted-foreground">₹{totalProductRev.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm">Retailer Allocation</span>
                      <div className="text-right">
                        <p className="font-medium">{retailerTargets.length} retailers</p>
                        <p className="text-xs text-muted-foreground">₹{totalRetailerRev.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm">Monthly Allocation</span>
                      <div className="text-right">
                        <p className="font-medium">{totalMonthQty.toLocaleString('en-IN')} {selectedPlan.quantity_unit}</p>
                        <p className="text-xs text-muted-foreground">₹{totalMonthRev.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Products Tab */}
            <TabsContent value="products" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Product Category Targets
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {categoryTargets.map(cat => (
                    <Collapsible 
                      key={cat.categoryId}
                      open={expandedCategories.has(cat.categoryId)}
                      onOpenChange={() => toggleCategoryExpand(cat.categoryId)}
                    >
                      <div className="border rounded-lg">
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50">
                            <div className="flex items-center gap-2">
                              {expandedCategories.has(cat.categoryId) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              <span className="font-medium text-sm">{cat.categoryName}</span>
                              <Badge variant="secondary" className="text-xs">{cat.products.length} products</Badge>
                            </div>
                            <div className="text-right text-sm">
                              <span className="font-medium">{cat.quantityTarget.toLocaleString('en-IN')}</span>
                              <span className="text-muted-foreground ml-2">₹{cat.revenueTarget.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="p-3 pt-0 space-y-3 border-t">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-xs">Quantity Target</Label>
                                <Input
                                  type="number"
                                  value={cat.quantityTarget || ''}
                                  onChange={(e) => handleCategoryTargetChange(
                                    cat.categoryId, 
                                    parseFloat(e.target.value) || 0,
                                    cat.revenueTarget
                                  )}
                                  placeholder="0"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Revenue Target (₹)</Label>
                                <Input
                                  type="number"
                                  value={cat.revenueTarget || ''}
                                  onChange={(e) => handleCategoryTargetChange(
                                    cat.categoryId,
                                    cat.quantityTarget,
                                    parseFloat(e.target.value) || 0
                                  )}
                                  placeholder="0"
                                />
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={cat.equalDivide}
                                onCheckedChange={(checked) => handleEqualDivideChange(cat.categoryId, !!checked)}
                              />
                              <span className="text-xs text-muted-foreground">Divide equally among products</span>
                            </div>

                            <div className="space-y-2">
                              {cat.products.map(product => (
                                <div key={product.productId} className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm">
                                  <span className="truncate flex-1">{product.productName}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                      {product.quantityTarget.toFixed(0)} units
                                    </span>
                                    <span className="text-xs">
                                      ₹{product.revenueTarget.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ))}

                  {/* Summary */}
                  <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg font-medium">
                    <span>Total</span>
                    <div>
                      <span>{totalProductQty.toLocaleString('en-IN')} {selectedPlan.quantity_unit}</span>
                      <span className="ml-3">₹{totalProductRev.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Months Tab */}
            <TabsContent value="months" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Monthly Breakdown
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={monthEqualDivide}
                        onCheckedChange={(checked) => handleMonthEqualDivideChange(!!checked)}
                      />
                      <span className="text-xs text-muted-foreground">Divide equally</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {monthTargets.map(month => (
                    <div key={month.monthNumber} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{month.monthName}</span>
                        <Badge variant="outline" className="text-xs">
                          {month.percentage.toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Quantity</Label>
                          <Input
                            type="number"
                            value={month.quantityTarget || ''}
                            onChange={(e) => handleMonthTargetChange(
                              month.monthNumber,
                              parseFloat(e.target.value) || 0,
                              month.revenueTarget
                            )}
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Revenue (₹)</Label>
                          <Input
                            type="number"
                            value={month.revenueTarget || ''}
                            onChange={(e) => handleMonthTargetChange(
                              month.monthNumber,
                              month.quantityTarget,
                              parseFloat(e.target.value) || 0
                            )}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Summary */}
                  <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg font-medium">
                    <span>Total</span>
                    <div>
                      <span>{totalMonthQty.toLocaleString('en-IN')} {selectedPlan.quantity_unit}</span>
                      <span className="ml-3">₹{totalMonthRev.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Retailers Tab */}
            <TabsContent value="retailers" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Store className="h-4 w-4" />
                      Retailer Growth Targets
                    </CardTitle>
                    <Dialog open={retailerDialogOpen} onOpenChange={setRetailerDialogOpen}>
                      <Button size="sm" variant="outline" className="gap-1 h-7" onClick={() => setRetailerDialogOpen(true)}>
                        <Plus className="h-3 w-3" />
                        Add
                      </Button>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Retailer Target</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleAddRetailerTarget} className="space-y-4">
                          <div>
                            <Label>Retailer</Label>
                            <Select
                              value={retailerForm.retailer_id}
                              onValueChange={(v) => setRetailerForm(prev => ({ ...prev, retailer_id: v }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select retailer" />
                              </SelectTrigger>
                              <SelectContent>
                                {retailers.map(r => (
                                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Last Year Revenue (₹)</Label>
                            <Input
                              type="number"
                              value={retailerForm.last_year_revenue}
                              onChange={(e) => setRetailerForm(prev => ({ ...prev, last_year_revenue: e.target.value }))}
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <Label>Target Revenue (₹)</Label>
                            <Input
                              type="number"
                              value={retailerForm.target_revenue}
                              onChange={(e) => setRetailerForm(prev => ({ ...prev, target_revenue: e.target.value }))}
                              placeholder="0"
                            />
                          </div>
                          <DialogFooter>
                            <Button type="submit" className="w-full">Add Retailer</Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {retailerTargets.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No retailer targets added</p>
                  ) : (
                    <div className="space-y-2">
                      {retailerTargets.map(rt => (
                        <div key={rt.id} className="flex items-center justify-between border rounded p-3">
                          <div>
                            <p className="text-sm font-medium">{rt.retailer_name}</p>
                            <p className="text-xs text-muted-foreground">
                              Last Year: ₹{rt.last_year_revenue.toLocaleString('en-IN')} → Target: ₹{rt.target_revenue.toLocaleString('en-IN')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={rt.growth_percent >= 0 ? "default" : "destructive"} className="text-xs">
                              {rt.growth_percent >= 0 ? '+' : ''}{rt.growth_percent.toFixed(1)}%
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={() => handleDeleteRetailerTarget(rt.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <div className="border-t pt-2 mt-2">
                        <p className="text-sm font-medium text-right">
                          Total Target: ₹{totalRetailerRev.toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          <Card className="p-8 text-center">
            <Target className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground mb-4">No FY plan selected</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create FY Plan
            </Button>
          </Card>
        )}
      </main>

      {/* Create Plan Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New FY Plan</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreatePlan} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Financial Year</Label>
                <Select
                  value={planForm.year.toString()}
                  onValueChange={(value) => setPlanForm({ ...planForm, year: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i).map(year => (
                      <SelectItem key={year} value={year.toString()}>
                        FY {year}-{(year + 1).toString().slice(-2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantity Unit</Label>
                <Select
                  value={planForm.quantity_unit}
                  onValueChange={(value) => setPlanForm({ ...planForm, quantity_unit: value })}
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
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity Target</Label>
                <Input
                  type="number"
                  value={planForm.quantity_target}
                  onChange={(e) => setPlanForm({ ...planForm, quantity_target: e.target.value })}
                  placeholder="Enter quantity"
                />
              </div>
              <div>
                <Label>Revenue Target (₹)</Label>
                <Input
                  type="number"
                  value={planForm.revenue_target}
                  onChange={(e) => setPlanForm({ ...planForm, revenue_target: e.target.value })}
                  placeholder="Enter revenue"
                />
              </div>
            </div>

            <div>
              <Label>Territory Target</Label>
              <Textarea
                value={planForm.territory_target}
                onChange={(e) => setPlanForm({ ...planForm, territory_target: e.target.value })}
                placeholder="Territory expansion plans..."
                rows={2}
              />
            </div>

            <div>
              <Label>Coverage Target</Label>
              <Textarea
                value={planForm.coverage_target}
                onChange={(e) => setPlanForm({ ...planForm, coverage_target: e.target.value })}
                placeholder="Coverage improvement goals..."
                rows={2}
              />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={planForm.notes}
                onChange={(e) => setPlanForm({ ...planForm, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create Plan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Plan Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit FY Plan</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditPlan} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity Target</Label>
                <Input
                  type="number"
                  value={planForm.quantity_target}
                  onChange={(e) => setPlanForm({ ...planForm, quantity_target: e.target.value })}
                  placeholder="Enter quantity"
                />
              </div>
              <div>
                <Label>Quantity Unit</Label>
                <Select
                  value={planForm.quantity_unit}
                  onValueChange={(value) => setPlanForm({ ...planForm, quantity_unit: value })}
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
                onChange={(e) => setPlanForm({ ...planForm, revenue_target: e.target.value })}
                placeholder="Enter revenue"
              />
            </div>

            <div>
              <Label>Territory Target</Label>
              <Textarea
                value={planForm.territory_target}
                onChange={(e) => setPlanForm({ ...planForm, territory_target: e.target.value })}
                placeholder="Territory expansion plans..."
                rows={2}
              />
            </div>

            <div>
              <Label>Coverage Target</Label>
              <Textarea
                value={planForm.coverage_target}
                onChange={(e) => setPlanForm({ ...planForm, coverage_target: e.target.value })}
                placeholder="Coverage improvement goals..."
                rows={2}
              />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={planForm.notes}
                onChange={(e) => setPlanForm({ ...planForm, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Update Plan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete FY Plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the FY {selectedPlan?.year} plan and all associated product, retailer, and monthly targets. This action cannot be undone.
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
    </div>
  );
};

export default DistributorFYPlanPage;

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Target, TrendingUp, Package, Store, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchAllPaginated } from "@/utils/fetchAllPaginated";

interface BusinessPlan {
  id: string;
  year: number;
  revenue_target: number;
  coverage_target: string | null;
  territory_target: string | null;
  notes: string | null;
}

interface ProductTarget {
  id: string;
  product_id: string;
  product_name: string;
  quantity_target: number;
  revenue_target: number;
}

interface RetailerTarget {
  id: string;
  retailer_id: string;
  retailer_name: string;
  last_year_revenue: number;
  target_revenue: number;
  growth_percent: number;
}

interface Product {
  id: string;
  name: string;
}

interface Retailer {
  id: string;
  name: string;
}

interface Props {
  distributorId: string;
}

export function DistributorBusinessPlan({ distributorId }: Props) {
  const [plans, setPlans] = useState<BusinessPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<BusinessPlan | null>(null);
  const [productTargets, setProductTargets] = useState<ProductTarget[]>([]);
  const [retailerTargets, setRetailerTargets] = useState<RetailerTarget[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [retailerDialogOpen, setRetailerDialogOpen] = useState(false);

  const [planForm, setPlanForm] = useState({
    year: new Date().getFullYear() + 1,
    revenue_target: "",
    coverage_target: "",
    territory_target: "",
    notes: "",
  });

  const [productForm, setProductForm] = useState({
    product_id: "",
    quantity_target: "",
    revenue_target: "",
  });

  const [retailerForm, setRetailerForm] = useState({
    retailer_id: "",
    last_year_revenue: "",
    target_revenue: "",
  });

  useEffect(() => {
    loadPlans();
    loadProducts();
    loadRetailers();
  }, [distributorId]);

  useEffect(() => {
    if (selectedPlan) {
      loadProductTargets();
      loadRetailerTargets();
    }
  }, [selectedPlan]);

  const loadPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('distributor_business_plans')
        .select('*')
        .eq('distributor_id', distributorId)
        .order('year', { ascending: false });

      if (error) throw error;
      setPlans(data || []);
      if (data && data.length > 0) {
        setSelectedPlan(data[0]);
      }
    } catch (error: any) {
      toast.error("Failed to load business plans: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    const data = await fetchAllPaginated<any>((from, to) =>
      supabase
        .from('products')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
        .range(from, to)
    );
    setProducts(data || []);
  };

  const loadRetailers = async () => {
    const { data } = await supabase
      .from('retailers')
      .select('id, name')
      .eq('distributor_id', distributorId)
      .order('name');
    setRetailers(data || []);
  };

  const loadProductTargets = async () => {
    if (!selectedPlan) return;
    const { data } = await supabase
      .from('distributor_business_plan_products')
      .select('*')
      .eq('business_plan_id', selectedPlan.id);
    setProductTargets(data || []);
  };

  const loadRetailerTargets = async () => {
    if (!selectedPlan) return;
    const { data } = await supabase
      .from('distributor_business_plan_retailers')
      .select('*')
      .eq('business_plan_id', selectedPlan.id);
    setRetailerTargets(data || []);
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase
        .from('distributor_business_plans')
        .insert({
          distributor_id: distributorId,
          year: planForm.year,
          revenue_target: parseFloat(planForm.revenue_target) || 0,
          coverage_target: planForm.coverage_target || null,
          territory_target: planForm.territory_target || null,
          notes: planForm.notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      toast.success("Business plan created");
      setDialogOpen(false);
      loadPlans();
      setSelectedPlan(data);
    } catch (error: any) {
      toast.error("Failed to create plan: " + error.message);
    }
  };

  const handleAddProductTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || !productForm.product_id) return;

    const product = products.find(p => p.id === productForm.product_id);
    if (!product) return;

    try {
      const { error } = await supabase
        .from('distributor_business_plan_products')
        .insert({
          business_plan_id: selectedPlan.id,
          product_id: productForm.product_id,
          product_name: product.name,
          quantity_target: parseInt(productForm.quantity_target) || 0,
          revenue_target: parseFloat(productForm.revenue_target) || 0,
        });

      if (error) throw error;
      toast.success("Product target added");
      setProductDialogOpen(false);
      setProductForm({ product_id: "", quantity_target: "", revenue_target: "" });
      loadProductTargets();
    } catch (error: any) {
      toast.error("Failed to add product: " + error.message);
    }
  };

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

  const handleDeleteProductTarget = async (id: string) => {
    const { error } = await supabase
      .from('distributor_business_plan_products')
      .delete()
      .eq('id', id);
    if (error) toast.error("Failed to delete");
    else loadProductTargets();
  };

  const handleDeleteRetailerTarget = async (id: string) => {
    const { error } = await supabase
      .from('distributor_business_plan_retailers')
      .delete()
      .eq('id', id);
    if (error) toast.error("Failed to delete");
    else loadRetailerTargets();
  };

  const totalProductRevenue = productTargets.reduce((sum, p) => sum + p.revenue_target, 0);
  const totalRetailerRevenue = retailerTargets.reduce((sum, r) => sum + r.target_revenue, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Target className="h-4 w-4" />
          Business Plans
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
              <DialogTitle>Create Business Plan</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div>
                <Label>Year</Label>
                <Input
                  type="number"
                  value={planForm.year}
                  onChange={(e) => setPlanForm(prev => ({ ...prev, year: parseInt(e.target.value) }))}
                  min={2020}
                  max={2050}
                />
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
              <div>
                <Label>Territory Target</Label>
                <Input
                  value={planForm.territory_target}
                  onChange={(e) => setPlanForm(prev => ({ ...prev, territory_target: e.target.value }))}
                  placeholder="e.g., Expand to 3 new districts"
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
            <p className="text-sm text-muted-foreground">No business plans yet</p>
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
                {plan.year}
              </Button>
            ))}
          </div>

          {selectedPlan && (
            <>
              {/* Plan Overview */}
              <Card>
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Revenue Target</p>
                      <p className="text-lg font-bold">₹{selectedPlan.revenue_target.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Coverage</p>
                      <p className="text-sm">{selectedPlan.coverage_target || '-'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tabs for Product and Retailer Targets */}
              <Tabs defaultValue="products">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="products" className="text-xs gap-1">
                    <Package className="h-3 w-3" />
                    Products
                  </TabsTrigger>
                  <TabsTrigger value="retailers" className="text-xs gap-1">
                    <Store className="h-3 w-3" />
                    Retailers
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="products" className="mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">Product Targets</CardTitle>
                        <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1 h-7">
                              <Plus className="h-3 w-3" />
                              Add
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add Product Target</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleAddProductTarget} className="space-y-4">
                              <div>
                                <Label>Product</Label>
                                <Select
                                  value={productForm.product_id}
                                  onValueChange={(v) => setProductForm(prev => ({ ...prev, product_id: v }))}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select product" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {products.map(p => (
                                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label>Quantity Target</Label>
                                <Input
                                  type="number"
                                  value={productForm.quantity_target}
                                  onChange={(e) => setProductForm(prev => ({ ...prev, quantity_target: e.target.value }))}
                                />
                              </div>
                              <div>
                                <Label>Revenue Target (₹)</Label>
                                <Input
                                  type="number"
                                  value={productForm.revenue_target}
                                  onChange={(e) => setProductForm(prev => ({ ...prev, revenue_target: e.target.value }))}
                                />
                              </div>
                              <Button type="submit" className="w-full">Add Product</Button>
                            </form>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {productTargets.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No product targets</p>
                      ) : (
                        <div className="space-y-2">
                          {productTargets.map(pt => (
                            <div key={pt.id} className="flex items-center justify-between border rounded p-2">
                              <div>
                                <p className="text-sm font-medium">{pt.product_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  Qty: {pt.quantity_target} | ₹{pt.revenue_target.toLocaleString()}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive"
                                onClick={() => handleDeleteProductTarget(pt.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          <div className="border-t pt-2 mt-2">
                            <p className="text-sm font-medium text-right">
                              Total: ₹{totalProductRevenue.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="retailers" className="mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">Retailer Growth Targets</CardTitle>
                        <Dialog open={retailerDialogOpen} onOpenChange={setRetailerDialogOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1 h-7">
                              <Plus className="h-3 w-3" />
                              Add
                            </Button>
                          </DialogTrigger>
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
                                />
                              </div>
                              <div>
                                <Label>Target Revenue (₹)</Label>
                                <Input
                                  type="number"
                                  value={retailerForm.target_revenue}
                                  onChange={(e) => setRetailerForm(prev => ({ ...prev, target_revenue: e.target.value }))}
                                />
                              </div>
                              <Button type="submit" className="w-full">Add Retailer</Button>
                            </form>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {retailerTargets.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No retailer targets</p>
                      ) : (
                        <div className="space-y-2">
                          {retailerTargets.map(rt => (
                            <div key={rt.id} className="flex items-center justify-between border rounded p-2">
                              <div>
                                <p className="text-sm font-medium">{rt.retailer_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  Last: ₹{rt.last_year_revenue.toLocaleString()} → Target: ₹{rt.target_revenue.toLocaleString()}
                                </p>
                                <span className={`text-xs ${rt.growth_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  <TrendingUp className="h-3 w-3 inline mr-1" />
                                  {rt.growth_percent.toFixed(1)}% growth
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive"
                                onClick={() => handleDeleteRetailerTarget(rt.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          <div className="border-t pt-2 mt-2">
                            <p className="text-sm font-medium text-right">
                              Total: ₹{totalRetailerRevenue.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      )}
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

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Gift, Edit2, Trash2, PackagePlus, History, AlertTriangle } from "lucide-react";

const UNIT_OPTIONS = [
  { value: 'kg', label: 'KG' },
  { value: 'grams', label: 'Grams' },
  { value: 'pieces', label: 'Pieces' },
  { value: 'liters', label: 'Liters' },
  { value: 'ml', label: 'ML' },
  { value: 'units', label: 'Units' },
];

interface SchemeFreeProduct {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  hsn_code: string | null;
  image_url: string | null;
  is_active: boolean;
  stock_quantity: number;
  low_stock_threshold: number | null;
}

interface StockMovement {
  id: string;
  movement_type: 'stock_in' | 'order_consumption' | 'reversal' | 'adjustment';
  quantity: number;
  running_balance: number;
  notes: string | null;
  created_at: string;
}

const MOVEMENT_LABELS: Record<StockMovement['movement_type'], string> = {
  stock_in: 'Stock in',
  order_consumption: 'Order (free item given)',
  reversal: 'Order cancelled (reversed)',
  adjustment: 'Manual adjustment',
};

export function OtherFreeProductsManagement() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<SchemeFreeProduct | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [stockProduct, setStockProduct] = useState<SchemeFreeProduct | null>(null);
  const [historyProduct, setHistoryProduct] = useState<SchemeFreeProduct | null>(null);
  const queryClient = useQueryClient();

  const { data: otherFreeProducts, isLoading } = useQuery({
    queryKey: ["scheme-free-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheme_free_products")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as SchemeFreeProduct[];
    },
  });

  // Net quantity given away per product (order_consumption movements minus any
  // reversals from cancelled orders), keyed by scheme_free_product_id.
  const { data: soldQuantities } = useQuery({
    queryKey: ["scheme-free-products-sold"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheme_free_product_stock_movements")
        .select("scheme_free_product_id, quantity")
        .in("movement_type", ["order_consumption", "reversal"]);
      if (error) throw error;
      const totals: Record<string, number> = {};
      for (const row of data || []) {
        totals[row.scheme_free_product_id] = (totals[row.scheme_free_product_id] || 0) - row.quantity;
      }
      return totals;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["scheme-free-products"] });
    queryClient.invalidateQueries({ queryKey: ["scheme-free-products-sold"] });
  };

  const createMutation = useMutation({
    mutationFn: async (product: Partial<SchemeFreeProduct>) => {
      const { error } = await supabase.from("scheme_free_products").insert([product] as any);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Free product created");
      setIsCreateOpen(false);
    },
    onError: () => toast.error("Failed to create free product"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<SchemeFreeProduct> }) => {
      const { error } = await supabase.from("scheme_free_products").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Free product updated");
      setIsEditOpen(false);
      setEditingProduct(null);
    },
    onError: () => toast.error("Failed to update free product"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("scheme_free_products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Free product deleted");
      setDeleteId(null);
    },
    onError: () => toast.error("Failed to delete free product"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("scheme_free_products").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Status updated");
    },
  });

  const stockInMutation = useMutation({
    mutationFn: async ({ id, quantity, notes }: { id: string; quantity: number; notes: string | null }) => {
      const { error } = await supabase.rpc("adjust_scheme_free_product_stock", {
        p_id: id,
        p_quantity: quantity,
        p_notes: notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Stock added");
      setStockProduct(null);
    },
    onError: (error: Error) => toast.error(error?.message || "Failed to add stock"),
  });

  const { data: stockMovements, isLoading: isMovementsLoading } = useQuery({
    queryKey: ["scheme-free-product-stock-movements", historyProduct?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheme_free_product_stock_movements")
        .select("id, movement_type, quantity, running_balance, notes, created_at")
        .eq("scheme_free_product_id", historyProduct!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as StockMovement[];
    },
    enabled: !!historyProduct,
  });

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const lowStockRaw = formData.get("low_stock_threshold") as string;
    createMutation.mutate({
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      unit: (formData.get("unit") as string) || "kg",
      hsn_code: (formData.get("hsn_code") as string) || null,
      image_url: (formData.get("image_url") as string) || null,
      low_stock_threshold: lowStockRaw ? Number(lowStockRaw) : null,
      is_active: true,
    });
  };

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProduct) return;
    const formData = new FormData(e.currentTarget);
    const lowStockRaw = formData.get("low_stock_threshold") as string;
    updateMutation.mutate({
      id: editingProduct.id,
      updates: {
        name: formData.get("name") as string,
        description: (formData.get("description") as string) || null,
        unit: (formData.get("unit") as string) || "kg",
        hsn_code: (formData.get("hsn_code") as string) || null,
        image_url: (formData.get("image_url") as string) || null,
        low_stock_threshold: lowStockRaw ? Number(lowStockRaw) : null,
      },
    });
  };

  const renderFormFields = (defaults?: SchemeFreeProduct) => (
    <>
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" placeholder="e.g., Rice 1kg pack" defaultValue={defaults?.name} required />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" placeholder="Optional notes for other admins" defaultValue={defaults?.description || ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="unit">Unit</Label>
          <Select name="unit" defaultValue={defaults?.unit || "kg"}>
            <SelectTrigger>
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              {UNIT_OPTIONS.map((unit) => (
                <SelectItem key={unit.value} value={unit.value}>{unit.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="hsn_code">HSN Code (optional)</Label>
          <Input id="hsn_code" name="hsn_code" placeholder="For invoicing" defaultValue={defaults?.hsn_code || ""} />
        </div>
      </div>
      <div>
        <Label htmlFor="image_url">Image URL (optional)</Label>
        <Input id="image_url" name="image_url" placeholder="https://..." defaultValue={defaults?.image_url || ""} />
      </div>
      <div>
        <Label htmlFor="low_stock_threshold">Low stock alert threshold (optional)</Label>
        <Input
          id="low_stock_threshold"
          name="low_stock_threshold"
          type="number"
          step="any"
          placeholder="e.g., 10"
          defaultValue={defaults?.low_stock_threshold ?? ""}
        />
        <p className="text-xs text-muted-foreground mt-1">Shows a Low Stock badge once stock falls to or below this number.</p>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5" />
                Other Free Products
              </CardTitle>
              <CardDescription>
                Items like rice or sugar that are free-product options for Buy X, Get Y Free schemes but aren't part of the Product Management catalogue.
              </CardDescription>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Free Product
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Other Free Product</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateSubmit} className="space-y-4">
                  {renderFormFields()}
                  <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Creating..." : "Create"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">Loading...</div>
          ) : !otherFreeProducts || otherFreeProducts.length === 0 ? (
            <div className="py-12 text-center">
              <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No other free products yet. Add rice, sugar, or any non-catalogue item you want to offer as a scheme freebie.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>HSN Code</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Sold</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {otherFreeProducts.map((product) => (
                  <TableRow key={product.id} className={product.is_active ? "" : "opacity-60"}>
                    <TableCell>
                      <div className="font-medium">{product.name}</div>
                      {product.description && (
                        <div className="text-xs text-muted-foreground line-clamp-1">{product.description}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{UNIT_OPTIONS.find((u) => u.value === product.unit)?.label || product.unit}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{product.hsn_code || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{product.stock_quantity}</span>
                        {product.low_stock_threshold != null && product.stock_quantity <= product.low_stock_threshold && (
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-300">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Low stock
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {soldQuantities?.[product.id] || 0}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={product.is_active}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: product.id, is_active: checked })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setStockProduct(product)} title="Stock in">
                          <PackagePlus className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setHistoryProduct(product)} title="Stock history">
                          <History className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingProduct(product);
                            setIsEditOpen(true);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setDeleteId(product.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Other Free Product</DialogTitle>
          </DialogHeader>
          {editingProduct && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              {renderFormFields(editingProduct)}
              <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete free product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this item. Any Buy X, Get Y Free scheme currently pointing at it will lose its free-product reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!stockProduct} onOpenChange={(open) => !open && setStockProduct(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Stock in — {stockProduct?.name}</DialogTitle>
          </DialogHeader>
          {stockProduct && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const quantity = Number(formData.get("quantity"));
                if (!quantity || quantity <= 0) {
                  toast.error("Enter a quantity greater than 0");
                  return;
                }
                stockInMutation.mutate({
                  id: stockProduct.id,
                  quantity,
                  notes: (formData.get("notes") as string) || null,
                });
              }}
              className="space-y-4"
            >
              <p className="text-sm text-muted-foreground">
                Current stock: <span className="font-medium text-foreground">{stockProduct.stock_quantity} {stockProduct.unit}</span>
              </p>
              <div>
                <Label htmlFor="quantity">Quantity to add</Label>
                <Input id="quantity" name="quantity" type="number" step="any" min="0" placeholder="e.g., 50" required />
              </div>
              <div>
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea id="notes" name="notes" placeholder="e.g., Purchased from supplier X" />
              </div>
              <Button type="submit" className="w-full" disabled={stockInMutation.isPending}>
                {stockInMutation.isPending ? "Adding..." : "Add Stock"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyProduct} onOpenChange={(open) => !open && setHistoryProduct(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Stock history — {historyProduct?.name}</DialogTitle>
          </DialogHeader>
          {isMovementsLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : !stockMovements || stockMovements.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No stock movements yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockMovements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="text-sm">{MOVEMENT_LABELS[m.movement_type]}</div>
                      {m.notes && <div className="text-xs text-muted-foreground line-clamp-1">{m.notes}</div>}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${m.quantity >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {m.quantity >= 0 ? `+${m.quantity}` : m.quantity}
                    </TableCell>
                    <TableCell className="text-right">{m.running_balance}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

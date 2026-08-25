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
import { Plus, Gift, Edit2, Trash2 } from "lucide-react";

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
}

export function OtherFreeProductsManagement() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<SchemeFreeProduct | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["scheme-free-products"] });

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

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      unit: (formData.get("unit") as string) || "kg",
      hsn_code: (formData.get("hsn_code") as string) || null,
      image_url: (formData.get("image_url") as string) || null,
      is_active: true,
    });
  };

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProduct) return;
    const formData = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: editingProduct.id,
      updates: {
        name: formData.get("name") as string,
        description: (formData.get("description") as string) || null,
        unit: (formData.get("unit") as string) || "kg",
        hsn_code: (formData.get("hsn_code") as string) || null,
        image_url: (formData.get("image_url") as string) || null,
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
                      <Switch
                        checked={product.is_active}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: product.id, is_active: checked })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
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
    </div>
  );
}

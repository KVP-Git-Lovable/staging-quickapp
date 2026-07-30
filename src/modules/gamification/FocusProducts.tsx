import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Star, ArrowLeft, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function FocusProducts() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["focus-products", debounced],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, name, sku, is_focused, is_active")
        .eq("is_active", true)
        .order("name")
        .limit(200);
      if (debounced.trim()) q = q.ilike("name", `%${debounced.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const focusedCount = products.filter((p: any) => p.is_focused).length;

  const toggle = async (id: string, value: boolean) => {
    setSaving(id);
    const { error } = await supabase.from("products").update({ is_focused: value }).eq("id", id);
    setSaving(null);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["focus-products"] });
    qc.invalidateQueries({ queryKey: ["gam-focused-count"] });
  };

  const markAllShown = async (value: boolean) => {
    setBulk(true);
    const ids = products.map((p: any) => p.id);
    const { error } = await supabase.from("products").update({ is_focused: value }).in("id", ids);
    setBulk(false);
    if (error) return toast.error(error.message);
    toast.success(value ? "Marked as focused" : "Focus removed");
    qc.invalidateQueries({ queryKey: ["focus-products"] });
    qc.invalidateQueries({ queryKey: ["gam-focused-count"] });
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500" /> Focus products
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {focusedCount} of {products.length} shown products are flagged focused
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={bulk || !products.length} onClick={() => markAllShown(true)}>
              Mark shown as focused
            </Button>
            <Button variant="outline" size="sm" disabled={bulk || !products.length} onClick={() => markAllShown(false)}>
              Clear shown
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
          {isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="divide-y rounded-lg border">
              {products.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.sku}</p>
                  </div>
                  <Switch
                    checked={!!p.is_focused}
                    disabled={saving === p.id}
                    onCheckedChange={(v) => toggle(p.id, v)}
                  />
                </div>
              ))}
              {!products.length && <p className="p-4 text-sm text-muted-foreground">No products found</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

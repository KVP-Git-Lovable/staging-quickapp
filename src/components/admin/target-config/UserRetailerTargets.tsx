import React, { useState, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Store, Save, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { EnabledBasis } from './HierarchyUserTargetNode';

interface Retailer {
  id: string;
  name: string;
  category: string | null;
}

interface RetailerCategory {
  category: string;
  retailers: Retailer[];
  expanded: boolean;
}

interface RetailerTarget {
  retailerId: string;
  retailerName: string;
  category: string;
  quantityTarget: number;
  revenueTarget: number;
}

interface UserRetailerTargetsProps {
  userId: string;
  fyYear: number;
  totalQuantity: number;
  totalRevenue: number;
  quantityUnit: string;
  selectedTargetType: 'quantity' | 'revenue' | 'visits';
  enabledBasis: EnabledBasis;
}

export function UserRetailerTargets({
  userId,
  fyYear,
  totalQuantity,
  totalRevenue,
  quantityUnit,
  selectedTargetType,
  enabledBasis,
}: UserRetailerTargetsProps) {
  const [equalDivide, setEqualDivide] = useState(true);
  const [retailerTargets, setRetailerTargets] = useState<RetailerTarget[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Fetch retailers for the user
  const { data: retailers, isLoading: retailersLoading } = useQuery({
    queryKey: ['user-retailers-for-targets', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('retailers')
        .select('id, name, category')
        .eq('user_id', userId)
        .order('name');

      if (error) throw error;
      return (data || []) as Retailer[];
    },
    enabled: !!userId,
  });

  // Fetch user's business plan
  const { data: businessPlan } = useQuery({
    queryKey: ['user-business-plan', userId, fyYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_business_plans')
        .select('id')
        .eq('user_id', userId)
        .eq('year', fyYear)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  // Fetch existing retailer targets
  const { data: existingTargets } = useQuery({
    queryKey: ['user-retailer-targets', userId, fyYear, businessPlan?.id],
    queryFn: async () => {
      if (!businessPlan?.id) return [];
      const { data, error } = await supabase
        .from('user_business_plan_retailers')
        .select('*')
        .eq('business_plan_id', businessPlan.id)
        .eq('is_active', true);

      if (error) throw error;
      return data || [];
    },
    enabled: !!businessPlan?.id,
  });

  // Group retailers by category
  const retailerCategories = useMemo(() => {
    if (!retailers?.length) return [];

    const categoryMap = new Map<string, Retailer[]>();
    retailers.forEach((r) => {
      const cat = r.category || 'Uncategorized';
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, []);
      }
      categoryMap.get(cat)!.push(r);
    });

    return Array.from(categoryMap.entries())
      .map(([category, retailers]) => ({ category, retailers }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [retailers]);

  // Initialize retailer targets when retailers are loaded
  useEffect(() => {
    if (!retailers?.length) return;

    const numRetailers = retailers.length;
    const equalQty = numRetailers > 0 ? totalQuantity / numRetailers : 0;
    const equalRev = numRetailers > 0 ? totalRevenue / numRetailers : 0;

    const newTargets = retailers.map((r) => {
      const existing = existingTargets?.find((t: any) => t.retailer_id === r.id);
      return {
      retailerId: r.id,
        retailerName: r.name,
        category: r.category || 'Uncategorized',
        quantityTarget: (existing as any)?.quantity_target ?? (equalDivide ? equalQty : 0),
        revenueTarget: existing?.target_revenue ?? (equalDivide ? equalRev : 0),
      };
    });

    setRetailerTargets(newTargets);
  }, [retailers, existingTargets, totalQuantity, totalRevenue, equalDivide]);

  // Apply equal divide
  useEffect(() => {
    if (!equalDivide || !retailers?.length) return;

    const numRetailers = retailers.length;
    const equalQty = numRetailers > 0 ? totalQuantity / numRetailers : 0;
    const equalRev = numRetailers > 0 ? totalRevenue / numRetailers : 0;

    setRetailerTargets((prev) =>
      prev.map((t) => ({
        ...t,
        quantityTarget: equalQty,
        revenueTarget: equalRev,
      }))
    );
  }, [equalDivide, totalQuantity, totalRevenue, retailers?.length]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!businessPlan?.id) {
        throw new Error('No business plan found for this user and FY');
      }

      // Deactivate the current set rather than deleting it, so past targets
      // stay queryable as history instead of being silently overwritten.
      await supabase
        .from('user_business_plan_retailers')
        .update({ is_active: false, deactivated_at: new Date().toISOString() })
        .eq('business_plan_id', businessPlan.id)
        .eq('is_active', true);

      const upsertData = retailerTargets.map((rt) => ({
        business_plan_id: businessPlan.id,
        retailer_id: rt.retailerId,
        retailer_name: rt.retailerName,
        quantity_target: rt.quantityTarget,
        target_revenue: rt.revenueTarget,
      }));

      const { error } = await supabase.from('user_business_plan_retailers').insert(upsertData);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Retailer targets saved');
      queryClient.invalidateQueries({ queryKey: ['user-retailer-targets', userId, fyYear] });
    },
    onError: (error: any) => {
      toast.error('Failed to save: ' + error.message);
    },
  });

  const handleTargetChange = (retailerId: string, field: 'quantityTarget' | 'revenueTarget', value: number) => {
    setEqualDivide(false);
    setRetailerTargets((prev) =>
      prev.map((t) => (t.retailerId === retailerId ? { ...t, [field]: value } : t))
    );
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const formatNumber = (num: number) => new Intl.NumberFormat('en-IN').format(Math.round(num));

  // Calculate totals
  const totals = useMemo(() => {
    return retailerTargets.reduce(
      (acc, t) => ({
        quantity: acc.quantity + t.quantityTarget,
        revenue: acc.revenue + t.revenueTarget,
      }),
      { quantity: 0, revenue: 0 }
    );
  }, [retailerTargets]);

  if (retailersLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!retailers?.length) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Store className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No retailers assigned to this user</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Equal Divide Option */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`equal-divide-retailer-${userId}`}
            checked={equalDivide}
            onCheckedChange={(checked) => setEqualDivide(!!checked)}
          />
          <Label htmlFor={`equal-divide-retailer-${userId}`} className="text-sm cursor-pointer">
            Equally divide across all retailers
          </Label>
        </div>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !businessPlan}
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save
        </Button>
      </div>

      {/* Category-grouped Retailers */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
        {retailerCategories.map((cat) => {
          const categoryRetailers = retailerTargets.filter((rt) => rt.category === cat.category);
          const isExpanded = expandedCategories.has(cat.category);

          return (
            <Collapsible key={cat.category} open={isExpanded} onOpenChange={() => toggleCategory(cat.category)}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 bg-muted/50 rounded-lg hover:bg-muted">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span className="font-medium text-sm">{cat.category}</span>
                <Badge variant="secondary" className="ml-auto">
                  {cat.retailers.length}
                </Badge>
              </CollapsibleTrigger>

              <CollapsibleContent className="pl-6 pt-2 space-y-1">
                {categoryRetailers.map((rt) => (
                  <div
                    key={rt.retailerId}
                    className="flex items-center gap-3 p-2 bg-background rounded border"
                  >
                    <Store className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 text-xs font-medium truncate">{rt.retailerName}</span>

                    {enabledBasis.quantity && (
                      <Input
                        type="number"
                        min="0"
                        value={rt.quantityTarget || ''}
                        onChange={(e) =>
                          handleTargetChange(rt.retailerId, 'quantityTarget', parseFloat(e.target.value) || 0)
                        }
                        className="w-20 h-7 text-xs"
                        disabled={equalDivide}
                        placeholder={quantityUnit}
                      />
                    )}

                    {enabledBasis.revenue && (
                      <Input
                        type="number"
                        min="0"
                        value={rt.revenueTarget || ''}
                        onChange={(e) =>
                          handleTargetChange(rt.retailerId, 'revenueTarget', parseFloat(e.target.value) || 0)
                        }
                        className="w-24 h-7 text-xs"
                        disabled={equalDivide}
                        placeholder="₹"
                      />
                    )}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      {/* Totals */}
      <div className="flex items-center justify-between pt-2 border-t text-sm">
        <span className="text-muted-foreground">Total Allocated:</span>
        <div className="flex items-center gap-3">
          {enabledBasis.quantity && (
            <Badge variant={Math.abs(totals.quantity - totalQuantity) < 1 ? 'default' : 'secondary'}>
              {formatNumber(totals.quantity)} / {formatNumber(totalQuantity)} {quantityUnit}
            </Badge>
          )}
          {enabledBasis.revenue && (
            <Badge variant={Math.abs(totals.revenue - totalRevenue) < 1 ? 'default' : 'secondary'}>
              ₹{formatNumber(totals.revenue)} / ₹{formatNumber(totalRevenue)}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

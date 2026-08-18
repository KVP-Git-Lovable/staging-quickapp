import React, { useState, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Save, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { EnabledBasis } from './HierarchyUserTargetNode';

const FY_MONTHS = [
  { number: 1, name: 'Apr', fullName: 'April' },
  { number: 2, name: 'May', fullName: 'May' },
  { number: 3, name: 'Jun', fullName: 'June' },
  { number: 4, name: 'Jul', fullName: 'July' },
  { number: 5, name: 'Aug', fullName: 'August' },
  { number: 6, name: 'Sep', fullName: 'September' },
  { number: 7, name: 'Oct', fullName: 'October' },
  { number: 8, name: 'Nov', fullName: 'November' },
  { number: 9, name: 'Dec', fullName: 'December' },
  { number: 10, name: 'Jan', fullName: 'January' },
  { number: 11, name: 'Feb', fullName: 'February' },
  { number: 12, name: 'Mar', fullName: 'March' },
];

interface MonthTarget {
  monthNumber: number;
  monthName: string;
  quantityTarget: number;
  revenueTarget: number;
  visitsTarget: number;
}

interface UserMonthlyTargetsProps {
  userId: string;
  fyYear: number;
  totalQuantity: number;
  totalRevenue: number;
  totalVisits: number;
  quantityUnit: string;
  selectedTargetType: 'quantity' | 'revenue' | 'visits';
  enabledBasis: EnabledBasis;
  targetStartMonth?: number;
  targetEndMonth?: number;
}

export function UserMonthlyTargets({
  userId,
  fyYear,
  totalQuantity,
  totalRevenue,
  totalVisits,
  quantityUnit,
  selectedTargetType,
  enabledBasis,
  targetStartMonth = 1,
  targetEndMonth = 12,
}: UserMonthlyTargetsProps) {
  const [equalDivide, setEqualDivide] = useState(true);
  const [monthTargets, setMonthTargets] = useState<MonthTarget[]>([]);
  const queryClient = useQueryClient();

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

  // Fetch existing monthly targets
  const { data: existingTargets } = useQuery({
    queryKey: ['user-monthly-targets', userId, fyYear, businessPlan?.id],
    queryFn: async () => {
      if (!businessPlan?.id) return [];
      const { data, error } = await supabase
        .from('user_business_plan_months')
        .select('*')
        .eq('business_plan_id', businessPlan.id)
        .eq('is_active', true);

      if (error) throw error;
      return data || [];
    },
    enabled: !!businessPlan?.id,
  });

  // Filter months based on target duration
  const activeFYMonths = useMemo(() => 
    FY_MONTHS.filter(m => m.number >= targetStartMonth && m.number <= targetEndMonth),
    [targetStartMonth, targetEndMonth]
  );

  const activeMonthCount = activeFYMonths.length;

  // Initialize monthly targets
  useEffect(() => {
    const equalQty = activeMonthCount > 0 ? totalQuantity / activeMonthCount : 0;
    const equalRev = activeMonthCount > 0 ? totalRevenue / activeMonthCount : 0;
    const equalVisits = activeMonthCount > 0 ? totalVisits / activeMonthCount : 0;

    const newTargets = activeFYMonths.map((month) => {
      const existing = existingTargets?.find((t: any) => t.month_number === month.number);
      return {
        monthNumber: month.number,
        monthName: month.fullName,
        quantityTarget: existing?.quantity_target ?? (equalDivide ? equalQty : 0),
        revenueTarget: existing?.revenue_target ?? (equalDivide ? equalRev : 0),
        visitsTarget: equalDivide ? equalVisits : 0,
      };
    });

    setMonthTargets(newTargets);
  }, [existingTargets, totalQuantity, totalRevenue, totalVisits, equalDivide, activeFYMonths, activeMonthCount]);

  // Apply equal divide
  useEffect(() => {
    if (!equalDivide) return;

    const equalQty = activeMonthCount > 0 ? totalQuantity / activeMonthCount : 0;
    const equalRev = activeMonthCount > 0 ? totalRevenue / activeMonthCount : 0;
    const equalVisits = activeMonthCount > 0 ? totalVisits / activeMonthCount : 0;

    setMonthTargets((prev) =>
      prev.map((t) => ({
        ...t,
        quantityTarget: equalQty,
        revenueTarget: equalRev,
        visitsTarget: equalVisits,
      }))
    );
  }, [equalDivide, totalQuantity, totalRevenue, totalVisits, activeMonthCount]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!businessPlan?.id) {
        throw new Error('No business plan found for this user and FY');
      }

      // Deactivate the current set rather than deleting it, so past targets
      // stay queryable as history instead of being silently overwritten.
      await supabase
        .from('user_business_plan_months')
        .update({ is_active: false, deactivated_at: new Date().toISOString() })
        .eq('business_plan_id', businessPlan.id)
        .eq('is_active', true);

      const upsertData = monthTargets.map((mt) => ({
        business_plan_id: businessPlan.id,
        month_number: mt.monthNumber,
        month_name: mt.monthName,
        quantity_target: mt.quantityTarget,
        revenue_target: mt.revenueTarget,
      }));

      const { error } = await supabase.from('user_business_plan_months').insert(upsertData);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Monthly targets saved');
      queryClient.invalidateQueries({ queryKey: ['user-monthly-targets', userId, fyYear] });
    },
    onError: (error: any) => {
      toast.error('Failed to save: ' + error.message);
    },
  });

  const handleTargetChange = (
    monthNumber: number,
    field: 'quantityTarget' | 'revenueTarget' | 'visitsTarget',
    value: number
  ) => {
    setEqualDivide(false);
    setMonthTargets((prev) =>
      prev.map((t) => (t.monthNumber === monthNumber ? { ...t, [field]: value } : t))
    );
  };

  const formatNumber = (num: number) => new Intl.NumberFormat('en-IN').format(Math.round(num));

  // Calculate totals
  const totals = useMemo(() => {
    return monthTargets.reduce(
      (acc, t) => ({
        quantity: acc.quantity + t.quantityTarget,
        revenue: acc.revenue + t.revenueTarget,
        visits: acc.visits + t.visitsTarget,
      }),
      { quantity: 0, revenue: 0, visits: 0 }
    );
  }, [monthTargets]);

  return (
    <div className="space-y-4">
      {/* Equal Divide Option */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`equal-divide-month-${userId}`}
            checked={equalDivide}
            onCheckedChange={(checked) => setEqualDivide(!!checked)}
          />
          <Label htmlFor={`equal-divide-month-${userId}`} className="text-sm cursor-pointer">
            Equally divide across all months
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

      {/* Monthly Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-2">
        {monthTargets.map((mt) => (
          <div
            key={mt.monthNumber}
            className="p-3 bg-background rounded-lg border space-y-2"
          >
            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium">{mt.monthName}</span>
            </div>

            {enabledBasis.quantity && (
              <div>
                <Label className="text-[10px] text-muted-foreground">{quantityUnit}</Label>
                <Input
                  type="number"
                  min="0"
                  value={mt.quantityTarget || ''}
                  onChange={(e) =>
                    handleTargetChange(mt.monthNumber, 'quantityTarget', parseFloat(e.target.value) || 0)
                  }
                  className="h-7 text-xs"
                  disabled={equalDivide}
                />
              </div>
            )}

            {enabledBasis.revenue && (
              <div>
                <Label className="text-[10px] text-muted-foreground">Revenue (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  value={mt.revenueTarget || ''}
                  onChange={(e) =>
                    handleTargetChange(mt.monthNumber, 'revenueTarget', parseFloat(e.target.value) || 0)
                  }
                  className="h-7 text-xs"
                  disabled={equalDivide}
                />
              </div>
            )}

            {enabledBasis.visits && (
              <div>
                <Label className="text-[10px] text-muted-foreground">Visits</Label>
                <Input
                  type="number"
                  min="0"
                  value={mt.visitsTarget || ''}
                  onChange={(e) =>
                    handleTargetChange(mt.monthNumber, 'visitsTarget', parseFloat(e.target.value) || 0)
                  }
                  className="h-7 text-xs"
                  disabled={equalDivide}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="flex items-center justify-between pt-2 border-t text-sm">
        <span className="text-muted-foreground">Total Allocated:</span>
        <div className="flex items-center gap-2 flex-wrap justify-end">
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
          {enabledBasis.visits && (
            <Badge variant={Math.abs(totals.visits - totalVisits) < 1 ? 'default' : 'secondary'}>
              {formatNumber(totals.visits)} / {formatNumber(totalVisits)} Visits
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

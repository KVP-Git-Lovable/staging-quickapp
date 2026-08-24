import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, FileText, AlertTriangle } from 'lucide-react';
import { DistributionSummaryHeader } from './DistributionSummaryHeader';
import { AllocationTable } from './AllocationTable';
import { type PlanStatus } from '@/hooks/useFYTargetPlans';

interface EnabledParameters {
  product: boolean;
  retailer: boolean;
  beat: boolean;
  distributor: boolean;
  territory: boolean;
  monthly: boolean;
}

interface TargetConfig {
  id?: string;
  target_plan_name?: string;
  enable_quantity: boolean;
  enable_revenue: boolean;
  enable_visits: boolean;
  quantity_unit: string;
  enabled_parameters: EnabledParameters;
  total_quantity_target: number;
  total_revenue_target: number;
  total_visits_target: number;
  is_locked?: boolean;
  plan_status?: PlanStatus;
}

interface HierarchyAllocationTabProps {
  fyYear: number;
  selectedPlanId?: string;
}

/** What the allocation below reports up for the header to display. */
interface AllocationProgress {
  distributed: { quantity: number; revenue: number; visits: number };
  currentStep: number;
  steps: { id: number; title: string }[];
  isBalanced: boolean;
}

export function HierarchyAllocationTab({ fyYear, selectedPlanId }: HierarchyAllocationTabProps) {
  const { user } = useAuth();
  const [selectedNode, setSelectedNode] = useState<{
    userId: string;
    fullName: string;
    level: number;
  } | null>(null);

  // The allocation totals live inside the table that computes them; the header
  // shows them, so they are reported up rather than recalculated here.
  const [progress, setProgress] = useState<AllocationProgress | null>(null);

  // What's actually been assigned across the whole org for this FY, regardless
  // of which subtree is currently open — this is what a "derived" or "not set
  // yet" annual figure follows, so it can't depend on which root is selected.
  const { data: assignedSummary } = useQuery({
    queryKey: ['fy-assigned-summary', fyYear],
    queryFn: async () => {
      const [plansRes, employeesRes] = await Promise.all([
        supabase.from('user_business_plans').select('quantity_target, revenue_target, visits_target').eq('year', fyYear),
        supabase.from('employees').select('user_id', { count: 'exact', head: true }),
      ]);
      if (plansRes.error) throw plansRes.error;
      if (employeesRes.error) throw employeesRes.error;
      const rows = plansRes.data || [];
      return {
        totalPeople: employeesRes.count || 0,
        assignedPeople: rows.length,
        quantity: rows.reduce((sum, r) => sum + (Number(r.quantity_target) || 0), 0),
        revenue: rows.reduce((sum, r) => sum + (Number(r.revenue_target) || 0), 0),
        visits: rows.reduce((sum, r) => sum + (Number(r.visits_target) || 0), 0),
      };
    },
    enabled: !!user,
  });

  // Fetch config for the FY
  const { data: config, isLoading } = useQuery({
    queryKey: ['fy-target-config', fyYear, selectedPlanId],
    queryFn: async () => {
      if (selectedPlanId) {
        const { data, error } = await supabase
          .from('fy_target_config')
          .select('*')
          .eq('id', selectedPlanId)
          .maybeSingle();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('fy_target_config')
        .select('*')
        .eq('fy_year', fyYear)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  /**
   * Land on the top of the organisation, not on the logged-in admin's own
   * branch.
   *
   * An admin setting up targets is very often not themselves the org's root —
   * they might be a regional or branch head — so defaulting to their own id
   * opened this tab on a narrow slice of the company: their own subtree, not
   * the manager structure the plan was just built for. The employee (or
   * employees) nobody reports to is the actual top; picking one of those as
   * the default root is what makes arriving here — straight from Save, or by
   * clicking the tab directly — show the whole hierarchy the plan applies to.
   *
   * get_org_root_managers is SECURITY DEFINER, the same pattern
   * get_all_subordinates already uses to answer "who is below this person" —
   * this is that question turned upside down: RLS on `employees` only lets a
   * caller read their own row or their own subordinates, so a plain client
   * query for "whoever has no manager" would come back empty for anyone who
   * is not themselves a system admin.
   *
   * Falls back to the logged-in user on any empty result or error, which is
   * exactly today's behaviour and is always a safe answer — everyone is
   * eligible to view their own subtree at minimum.
   */
  useEffect(() => {
    if (!user?.id || selectedNode) return;

    let cancelled = false;

    supabase
      .rpc('get_org_root_managers')
      .then(({ data, error }: { data: { user_id: string; full_name: string }[] | null; error: unknown }) => {
        if (cancelled) return;

        const root = !error && data && data.length > 0 ? data[0] : null;
        if (root?.user_id && root.full_name) {
          setSelectedNode({ userId: root.user_id, fullName: root.full_name, level: 0 });
          return;
        }

        // No org root this caller can see — fall back to their own view.
        supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()
          .then(({ data: profile }) => {
            if (cancelled) return;
            setSelectedNode({ userId: user.id, fullName: profile?.full_name || 'You', level: 0 });
          });
      });

    return () => { cancelled = true; };
  }, [user?.id, selectedNode]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Target Configuration</h3>
          <p className="text-muted-foreground">
            Please create a target configuration in the "Targets" tab first.
          </p>
        </CardContent>
      </Card>
    );
  }

  const planStatus = ((config as any).plan_status as PlanStatus) || 'draft';

  if (planStatus === 'draft') {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Plan is in Draft</h3>
          <p className="text-muted-foreground">
            Please activate the target plan in the "Targets" tab before allocating to users.
          </p>
        </CardContent>
      </Card>
    );
  }

  const rawParams = config.enabled_parameters as unknown;
  const enabledParams: EnabledParameters = (rawParams && typeof rawParams === 'object') 
    ? {
        product: Boolean((rawParams as Record<string, unknown>).product),
        retailer: Boolean((rawParams as Record<string, unknown>).retailer),
        beat: Boolean((rawParams as Record<string, unknown>).beat),
        distributor: Boolean((rawParams as Record<string, unknown>).distributor),
        territory: Boolean((rawParams as Record<string, unknown>).territory),
        monthly: Boolean((rawParams as Record<string, unknown>).monthly),
      }
    : {
        product: false,
        retailer: false,
        beat: false,
        distributor: false,
        territory: false,
        monthly: false,
      };

  // A 'direct' metric shows exactly what was typed on the Targets tab, same as
  // always. 'derived' and 'unset' both follow whatever's actually been
  // assigned across the org so far — null (rendered as "Not set yet") until
  // that figure has loaded or anyone has anything assigned.
  const quantityBasis = ((config.quantity_basis as string | null) || 'direct') as 'direct' | 'derived' | 'unset';
  const revenueBasis = ((config.revenue_basis as string | null) || 'direct') as 'direct' | 'derived' | 'unset';
  const visitsBasis = ((config.visits_basis as string | null) || 'direct') as 'direct' | 'derived' | 'unset';

  const effectiveTotal = (basis: 'direct' | 'derived' | 'unset', direct: number | null, derived: number | undefined) =>
    basis === 'direct' ? direct : (derived ?? null);

  const effectiveQuantity = effectiveTotal(quantityBasis, config.total_quantity_target, assignedSummary?.quantity);
  const effectiveRevenue = effectiveTotal(revenueBasis, config.total_revenue_target, assignedSummary?.revenue);
  const effectiveVisits = effectiveTotal(visitsBasis, config.total_visits_target, assignedSummary?.visits);

  return (
    <div className="space-y-4">
      {/* Distribution Summary Header */}
      <DistributionSummaryHeader
        targetPlanName={config.target_plan_name || 'FY Sales Plan'}
        fyYear={fyYear}
        planStatus={planStatus}
        enabledMetrics={{
          quantity: config.enable_quantity,
          revenue: config.enable_revenue,
          visits: config.enable_visits,
        }}
        quantityUnit={config.quantity_unit}
        totalQuantity={effectiveQuantity}
        totalRevenue={effectiveRevenue}
        totalVisits={effectiveVisits}
        quantityBasis={quantityBasis}
        revenueBasis={revenueBasis}
        visitsBasis={visitsBasis}
        assignedCoverage={assignedSummary ? { count: assignedSummary.assignedPeople, total: assignedSummary.totalPeople } : undefined}
        allocatedQuantity={progress?.distributed.quantity ?? 0}
        allocatedRevenue={progress?.distributed.revenue ?? 0}
        allocatedVisits={progress?.distributed.visits ?? 0}
        selectedUserName={selectedNode?.fullName}
        currentStep={progress?.currentStep}
        steps={progress?.steps}
        isBalanced={progress?.isBalanced ?? true}
      />

      {/* Allocation Table */}
      {selectedNode && (
        <AllocationTable
          parentUserId={selectedNode.userId}
          totalQuantity={effectiveQuantity ?? 0}
          totalRevenue={effectiveRevenue ?? 0}
          totalVisits={effectiveVisits ?? 0}
          quantityUnit={config.quantity_unit}
          enabledMetrics={{
            quantity: config.enable_quantity,
            revenue: config.enable_revenue,
            visits: config.enable_visits,
          }}
          enabledParameters={enabledParams}
          fyYear={fyYear}
          targetStartMonth={config.target_start_month || 1}
          targetEndMonth={config.target_end_month || 12}
          onProgressChange={setProgress}
        />
      )}
    </div>
  );
}

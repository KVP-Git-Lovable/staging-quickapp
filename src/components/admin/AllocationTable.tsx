import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save, AlertCircle, Loader2, ArrowRight, ArrowLeft, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { TargetStrategy, SplitMethod } from './TargetStrategySelector';
import { TargetSplitDialog } from './TargetSplitDialog';
import { WizardProgress } from './target-config/WizardProgress';
import { StrategyExplanationPanel } from './allocation/StrategyExplanationPanel';
import { StepAssignManagers } from './allocation/StepAssignManagers';
import { StepPreview } from './allocation/StepPreview';
import { StepReviewSave } from './allocation/StepReviewSave';

interface EnabledParameters {
  product: boolean;
  retailer: boolean;
  beat: boolean;
  distributor: boolean;
  territory: boolean;
  monthly: boolean;
}

interface SubordinateAllocation {
  userId: string;
  fullName: string;
  profilePictureUrl: string | null;
  designation?: string;
  quantityTarget: number;
  revenueTarget: number;
  visitsTarget: number;
  personalQuantityTarget: number;
  personalRevenueTarget: number;
  personalVisitsTarget: number;
  percentage: number;
  existingPlanId?: string;
  level: number;
  subordinateCount: number;
  children: SubordinateAllocation[];
  targetStrategy: TargetStrategy;
}

interface TeamHierarchyNode {
  userId: string;
  fullName: string;
  subordinateCount: number;
  children: TeamHierarchyNode[];
  quantityTarget?: number;
  revenueTarget?: number;
  visitsTarget?: number;
  personalQuantityTarget?: number;
  personalRevenueTarget?: number;
  personalVisitsTarget?: number;
  targetStrategy?: TargetStrategy;
}

interface AllocationTableProps {
  parentUserId: string;
  totalQuantity: number;
  totalRevenue: number;
  totalVisits: number;
  quantityUnit: string;
  enabledMetrics: {
    quantity: boolean;
    revenue: boolean;
    visits: boolean;
  };
  enabledParameters: EnabledParameters;
  fyYear: number;
  targetStartMonth?: number;
  targetEndMonth?: number;
}

const formatNumber = (num: number) => new Intl.NumberFormat('en-IN').format(num);
const formatCurrency = (num: number) => {
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`;
  return `₹${formatNumber(num)}`;
};

const WIZARD_STEPS = [
  { id: 1, title: 'Assign Managers', description: 'Set targets for L1 managers' },
  { id: 2, title: 'Preview', description: 'Auto-calculate & review' },
  { id: 3, title: 'Save', description: 'Fine-tune & save' },
];

/**
 * Split a target across users by weight while preserving total after rounding.
 */
const splitByWeights = (
  total: number,
  entries: Array<{ userId: string; weight: number }>,
): Map<string, number> => {
  const result = new Map<string, number>();
  if (!entries.length) return result;

  const normalized = entries.map((entry) => ({
    userId: entry.userId,
    weight: Math.max(1, entry.weight || 1),
  }));
  const safeTotal = Math.max(0, Math.round(total || 0));
  const totalWeight = normalized.reduce((sum, entry) => sum + entry.weight, 0);

  const withFractions = normalized.map((entry) => {
    const raw = totalWeight > 0 ? (safeTotal * entry.weight) / totalWeight : 0;
    const base = Math.floor(raw);
    return { userId: entry.userId, base, fraction: raw - base };
  });

  let remainder = safeTotal - withFractions.reduce((sum, entry) => sum + entry.base, 0);
  withFractions
    .sort((a, b) => b.fraction - a.fraction)
    .forEach((entry, index) => {
      const bonus = remainder > index ? 1 : 0;
      result.set(entry.userId, entry.base + bonus);
    });

  return result;
};

/**
 * Count effective contributors in a branch:
 * - Individual contributor (no children): 1
 * - Pure manager: sum(children)
 * - Player-manager (independent): 1 + sum(children)
 */
const getContributorCountForNode = (
  node: SubordinateAllocation,
  allocations: Map<string, SubordinateAllocation>,
  cache: Map<string, number>,
): number => {
  const cached = cache.get(node.userId);
  if (cached !== undefined) return cached;

  const currentAlloc = allocations.get(node.userId) || node;
  
  // No target users contribute 0
  if (currentAlloc.targetStrategy === 'no_target') {
    cache.set(node.userId, 0);
    return 0;
  }

  if (node.children.length === 0) {
    cache.set(node.userId, 1);
    return 1;
  }

  const childContributors = node.children.reduce(
    (sum, child) => sum + getContributorCountForNode(child, allocations, cache),
    0,
  );

  const includeSelf = currentAlloc.targetStrategy === 'independent';
  const total = Math.max(1, childContributors + (includeSelf ? 1 : 0));
  cache.set(node.userId, total);
  return total;
};

const getEffectiveQuantity = (alloc: SubordinateAllocation) =>
  alloc.quantityTarget + (alloc.targetStrategy === 'independent' && alloc.children.length > 0 ? alloc.personalQuantityTarget : 0);

const getEffectiveRevenue = (alloc: SubordinateAllocation) =>
  alloc.revenueTarget + (alloc.targetStrategy === 'independent' && alloc.children.length > 0 ? alloc.personalRevenueTarget : 0);

const getEffectiveVisits = (alloc: SubordinateAllocation) =>
  alloc.visitsTarget + (alloc.targetStrategy === 'independent' && alloc.children.length > 0 ? alloc.personalVisitsTarget : 0);

/**
 * Recursively auto-distribute targets based on per-user strategies and contributor count.
 */
function autoDistributeTargets(
  nodes: SubordinateAllocation[],
  _parentTarget: { quantity: number; revenue: number; visits: number },
  allocations: Map<string, SubordinateAllocation>,
  enabledMetrics: { quantity: boolean; revenue: boolean; visits: boolean },
): Map<string, SubordinateAllocation> {
  const contributorCache = new Map<string, number>();
  const getContributors = (node: SubordinateAllocation) => getContributorCountForNode(node, allocations, contributorCache);

  const distributeNode = (node: SubordinateAllocation) => {
    const managerAlloc = allocations.get(node.userId);
    if (!managerAlloc || node.children.length === 0 || managerAlloc.targetStrategy === 'no_target') return;

    const strategy = managerAlloc.targetStrategy || 'roll_down';
    const children = node.children
      .map((child) => ({ childNode: child, childAlloc: allocations.get(child.userId) }))
      .filter((entry): entry is { childNode: SubordinateAllocation; childAlloc: SubordinateAllocation } => Boolean(entry.childAlloc));

    if (!children.length) return;

    if (strategy === 'roll_up') {
      children.forEach(({ childNode }) => distributeNode(childNode));

      let sumQ = 0;
      let sumR = 0;
      let sumV = 0;
      children.forEach(({ childAlloc }) => {
        const latest = allocations.get(childAlloc.userId);
        if (!latest) return;
        sumQ += getEffectiveQuantity(latest);
        sumR += getEffectiveRevenue(latest);
        sumV += getEffectiveVisits(latest);
      });

      allocations.set(node.userId, {
        ...managerAlloc,
        quantityTarget: enabledMetrics.quantity ? sumQ : managerAlloc.quantityTarget,
        revenueTarget: enabledMetrics.revenue ? sumR : managerAlloc.revenueTarget,
        visitsTarget: enabledMetrics.visits ? sumV : managerAlloc.visitsTarget,
      });
      return;
    }

    const weightedEntries = children
      .filter(({ childAlloc }) => childAlloc.targetStrategy !== 'no_target')
      .map(({ childNode, childAlloc }) => ({
        userId: childAlloc.userId,
        weight: Math.max(1, getContributors(childNode)),
      }));

    // Zero out no_target children
    children.forEach(({ childNode, childAlloc }) => {
      if (childAlloc.targetStrategy === 'no_target') {
        allocations.set(childNode.userId, {
          ...childAlloc,
          quantityTarget: 0,
          revenueTarget: 0,
          visitsTarget: 0,
          personalQuantityTarget: 0,
          personalRevenueTarget: 0,
          personalVisitsTarget: 0,
        });
      }
    });

    const quantitySplit = enabledMetrics.quantity ? splitByWeights(managerAlloc.quantityTarget, weightedEntries) : new Map<string, number>();
    const revenueSplit = enabledMetrics.revenue ? splitByWeights(managerAlloc.revenueTarget, weightedEntries) : new Map<string, number>();
    const visitsSplit = enabledMetrics.visits ? splitByWeights(managerAlloc.visitsTarget, weightedEntries) : new Map<string, number>();

    children.forEach(({ childNode, childAlloc }) => {
      const assignedQty = enabledMetrics.quantity ? (quantitySplit.get(childNode.userId) || 0) : childAlloc.quantityTarget;
      const assignedRev = enabledMetrics.revenue ? (revenueSplit.get(childNode.userId) || 0) : childAlloc.revenueTarget;
      const assignedVis = enabledMetrics.visits ? (visitsSplit.get(childNode.userId) || 0) : childAlloc.visitsTarget;

      const isPlayerManager = childNode.children.length > 0 && childAlloc.targetStrategy === 'independent';

      if (isPlayerManager) {
        const contributorCount = Math.max(getContributors(childNode), 1);
        const personalQty = enabledMetrics.quantity ? Math.round(assignedQty / contributorCount) : childAlloc.personalQuantityTarget;
        const personalRev = enabledMetrics.revenue ? Math.round(assignedRev / contributorCount) : childAlloc.personalRevenueTarget;
        const personalVis = enabledMetrics.visits ? Math.round(assignedVis / contributorCount) : childAlloc.personalVisitsTarget;

        allocations.set(childNode.userId, {
          ...childAlloc,
          quantityTarget: enabledMetrics.quantity ? Math.max(assignedQty - personalQty, 0) : childAlloc.quantityTarget,
          revenueTarget: enabledMetrics.revenue ? Math.max(assignedRev - personalRev, 0) : childAlloc.revenueTarget,
          visitsTarget: enabledMetrics.visits ? Math.max(assignedVis - personalVis, 0) : childAlloc.visitsTarget,
          personalQuantityTarget: enabledMetrics.quantity ? personalQty : childAlloc.personalQuantityTarget,
          personalRevenueTarget: enabledMetrics.revenue ? personalRev : childAlloc.personalRevenueTarget,
          personalVisitsTarget: enabledMetrics.visits ? personalVis : childAlloc.personalVisitsTarget,
        });
      } else {
        allocations.set(childNode.userId, {
          ...childAlloc,
          quantityTarget: enabledMetrics.quantity ? assignedQty : childAlloc.quantityTarget,
          revenueTarget: enabledMetrics.revenue ? assignedRev : childAlloc.revenueTarget,
          visitsTarget: enabledMetrics.visits ? assignedVis : childAlloc.visitsTarget,
          personalQuantityTarget: enabledMetrics.quantity ? 0 : childAlloc.personalQuantityTarget,
          personalRevenueTarget: enabledMetrics.revenue ? 0 : childAlloc.personalRevenueTarget,
          personalVisitsTarget: enabledMetrics.visits ? 0 : childAlloc.personalVisitsTarget,
        });
      }

      distributeNode(childNode);
    });
  };

  nodes.forEach(distributeNode);
  return allocations;
}

export function AllocationTable({
  parentUserId,
  totalQuantity,
  totalRevenue,
  totalVisits,
  quantityUnit,
  enabledMetrics,
  enabledParameters,
  fyYear,
  targetStartMonth = 1,
  targetEndMonth = 12,
}: AllocationTableProps) {
  const queryClient = useQueryClient();
  const [allocations, setAllocations] = useState<Map<string, SubordinateAllocation>>(new Map());
  const [currentStep, setCurrentStep] = useState(1);

  // Split dialog state
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitDialogManagerId, setSplitDialogManagerId] = useState<string | null>(null);

  // Fetch hierarchy recursively
  const { data: hierarchyData, isLoading } = useQuery({
    queryKey: ['hierarchy-allocations', parentUserId, fyYear],
    queryFn: async () => {
      const { data: subordinatesData, error: subError } = await supabase.rpc('get_all_subordinates', {
        manager_user_id: parentUserId,
      });
      if (subError) throw subError;

      const subordinatesOnly = (subordinatesData || []).filter(
        (s: { subordinate_user_id: string; level: number }) => s.level > 0
      );
      if (!subordinatesOnly.length) return { roots: [] as SubordinateAllocation[] };

      const userIds = subordinatesOnly.map((s: { subordinate_user_id: string }) => s.subordinate_user_id);

      const [profilesRes, plansRes, employeesRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, profile_picture_url, designation').in('id', userIds),
        supabase.from('user_business_plans').select('*').in('user_id', userIds).eq('year', fyYear),
        supabase.from('employees').select('manager_id, user_id'),
      ]);

      const subordinateCounts = new Map<string, number>();
      employeesRes.data?.forEach(emp => {
        if (emp.manager_id) {
          subordinateCounts.set(emp.manager_id, (subordinateCounts.get(emp.manager_id) || 0) + 1);
        }
      });

      const profileMap = new Map(profilesRes.data?.map(p => [p.id, p]) || []);
      const planMap = new Map(plansRes.data?.map(p => [p.user_id, p]) || []);
      const managerMap = new Map<string, string>();
      employeesRes.data?.forEach(emp => {
        if (emp.manager_id) managerMap.set(emp.user_id, emp.manager_id);
      });

      const nodeMap = new Map<string, SubordinateAllocation>();

      subordinatesOnly.forEach((sub: { subordinate_user_id: string; level: number }) => {
        const profile = profileMap.get(sub.subordinate_user_id);
        const existingPlan = planMap.get(sub.subordinate_user_id);
        const savedStrategy = (existingPlan?.target_strategy as TargetStrategy) || 'roll_down';

        nodeMap.set(sub.subordinate_user_id, {
          userId: sub.subordinate_user_id,
          fullName: profile?.full_name || 'Unknown',
          profilePictureUrl: profile?.profile_picture_url || null,
          designation: profile?.designation || undefined,
          quantityTarget: existingPlan?.quantity_target || 0,
          revenueTarget: existingPlan?.revenue_target || 0,
          visitsTarget: 0,
          personalQuantityTarget: (existingPlan as any)?.personal_quantity_target || 0,
          personalRevenueTarget: (existingPlan as any)?.personal_revenue_target || 0,
          personalVisitsTarget: (existingPlan as any)?.personal_visits_target || 0,
          percentage: 0,
          existingPlanId: existingPlan?.id,
          level: sub.level,
          subordinateCount: subordinateCounts.get(sub.subordinate_user_id) || 0,
          children: [],
          targetStrategy: savedStrategy,
        });
      });

      const roots: SubordinateAllocation[] = [];
      nodeMap.forEach((node, userId) => {
        const managerId = managerMap.get(userId);
        if (managerId && nodeMap.has(managerId)) {
          nodeMap.get(managerId)!.children.push(node);
        } else if (managerId === parentUserId || node.level === 1) {
          roots.push(node);
        }
      });

      // Recursively compute total subordinate count (all descendants, not just direct)
      const computeSubordinateCount = (node: SubordinateAllocation): number => {
        let count = node.children.length;
        node.children.forEach(child => {
          count += computeSubordinateCount(child);
        });
        node.subordinateCount = count;
        return count;
      };
      roots.forEach(r => computeSubordinateCount(r));

      return { roots };
    },
    enabled: !!parentUserId,
  });

  // Initialize allocations from hierarchy data
  useEffect(() => {
    if (hierarchyData?.roots) {
      const newAllocations = new Map<string, SubordinateAllocation>();
      const flatten = (nodes: SubordinateAllocation[]) => {
        nodes.forEach(node => {
          newAllocations.set(node.userId, node);
          if (node.children.length > 0) flatten(node.children);
        });
      };
      flatten(hierarchyData.roots);
      setAllocations(newAllocations);
    }
  }, [hierarchyData]);

  const directReports = useMemo(() => hierarchyData?.roots || [], [hierarchyData]);

  const hierarchyRelations = useMemo(() => {
    const parentByChild = new Map<string, string>();
    const childrenByParent = new Map<string, string[]>();

    const traverse = (nodes: SubordinateAllocation[], parentId?: string) => {
      nodes.forEach((node) => {
        if (parentId) {
          parentByChild.set(node.userId, parentId);
          const currentChildren = childrenByParent.get(parentId) || [];
          childrenByParent.set(parentId, [...currentChildren, node.userId]);
        }
        if (node.children.length > 0) {
          traverse(node.children, node.userId);
        }
      });
    };

    traverse(directReports);
    return { parentByChild, childrenByParent };
  }, [directReports]);

  const recomputeRollUpManager = useCallback((managerId: string, next: Map<string, SubordinateAllocation>) => {
    const managerAlloc = next.get(managerId);
    if (!managerAlloc) return;

    const childIds = hierarchyRelations.childrenByParent.get(managerId) || [];
    if (!childIds.length) return;

    let quantityTotal = 0;
    let revenueTotal = 0;
    let visitsTotal = 0;

    childIds.forEach((childId) => {
      const childAlloc = next.get(childId);
      if (!childAlloc) return;

      quantityTotal += getEffectiveQuantity(childAlloc);
      revenueTotal += getEffectiveRevenue(childAlloc);
      visitsTotal += getEffectiveVisits(childAlloc);
    });

    next.set(managerId, {
      ...managerAlloc,
      quantityTarget: enabledMetrics.quantity ? quantityTotal : managerAlloc.quantityTarget,
      revenueTarget: enabledMetrics.revenue ? revenueTotal : managerAlloc.revenueTarget,
      visitsTarget: enabledMetrics.visits ? visitsTotal : managerAlloc.visitsTarget,
    });
  }, [hierarchyRelations.childrenByParent, enabledMetrics]);

  const cascadeRollUpToAncestors = useCallback((userId: string, next: Map<string, SubordinateAllocation>) => {
    let currentParent = hierarchyRelations.parentByChild.get(userId);

    while (currentParent) {
      const parentAlloc = next.get(currentParent);
      if (parentAlloc?.targetStrategy === 'roll_up') {
        recomputeRollUpManager(currentParent, next);
      }
      currentParent = hierarchyRelations.parentByChild.get(currentParent);
    }
  }, [hierarchyRelations.parentByChild, recomputeRollUpManager]);

  // Handlers
  const handleTargetChange = useCallback((userId: string, field: string, value: number) => {
    setAllocations(prev => {
      const next = new Map(prev);
      const current = next.get(userId);
      if (current) {
        next.set(userId, { ...current, [field]: value });
        cascadeRollUpToAncestors(userId, next);
      }
      return next;
    });
  }, [cascadeRollUpToAncestors]);

  const handleStrategyChange = useCallback((userId: string, strategy: TargetStrategy) => {
    setAllocations(prev => {
      const next = new Map(prev);
      const current = next.get(userId);

      if (current) {
        // When switching to no_target, zero out all targets
        if (strategy === 'no_target') {
          next.set(userId, {
            ...current,
            targetStrategy: strategy,
            quantityTarget: 0,
            revenueTarget: 0,
            visitsTarget: 0,
            personalQuantityTarget: 0,
            personalRevenueTarget: 0,
            personalVisitsTarget: 0,
          });
        } else {
          next.set(userId, { ...current, targetStrategy: strategy });
        }

        if (strategy === 'roll_up') {
          recomputeRollUpManager(userId, next);
        }

        cascadeRollUpToAncestors(userId, next);
      }

      return next;
    });
  }, [recomputeRollUpManager, cascadeRollUpToAncestors]);

  const handleEqualSplit = useCallback(() => {
    if (!directReports.length) return;

    const contributorCache = new Map<string, number>();
    const weightedEntries = directReports
      .filter(dr => (allocations.get(dr.userId)?.targetStrategy || 'roll_down') !== 'no_target')
      .map((dr) => ({
        userId: dr.userId,
        weight: Math.max(getContributorCountForNode(dr, allocations, contributorCache), 1),
      }));

    const quantitySplit = enabledMetrics.quantity ? splitByWeights(totalQuantity, weightedEntries) : new Map<string, number>();
    const revenueSplit = enabledMetrics.revenue ? splitByWeights(totalRevenue, weightedEntries) : new Map<string, number>();
    const visitsSplit = enabledMetrics.visits ? splitByWeights(totalVisits, weightedEntries) : new Map<string, number>();

    setAllocations((prev) => {
      const next = new Map(prev);
      const branchCache = new Map<string, number>();

      directReports.forEach((dr) => {
        const current = next.get(dr.userId);
        if (!current) return;

        const assignedQty = enabledMetrics.quantity ? (quantitySplit.get(dr.userId) || 0) : current.quantityTarget;
        const assignedRev = enabledMetrics.revenue ? (revenueSplit.get(dr.userId) || 0) : current.revenueTarget;
        const assignedVis = enabledMetrics.visits ? (visitsSplit.get(dr.userId) || 0) : current.visitsTarget;

        const isPlayerManager = current.targetStrategy === 'independent' && dr.children.length > 0;
        const contributors = isPlayerManager ? Math.max(getContributorCountForNode(dr, next, branchCache), 1) : 1;

        const personalQty = enabledMetrics.quantity && isPlayerManager ? Math.round(assignedQty / contributors) : 0;
        const personalRev = enabledMetrics.revenue && isPlayerManager ? Math.round(assignedRev / contributors) : 0;
        const personalVis = enabledMetrics.visits && isPlayerManager ? Math.round(assignedVis / contributors) : 0;

        next.set(dr.userId, {
          ...current,
          quantityTarget: enabledMetrics.quantity ? (isPlayerManager ? Math.max(assignedQty - personalQty, 0) : assignedQty) : current.quantityTarget,
          revenueTarget: enabledMetrics.revenue ? (isPlayerManager ? Math.max(assignedRev - personalRev, 0) : assignedRev) : current.revenueTarget,
          visitsTarget: enabledMetrics.visits ? (isPlayerManager ? Math.max(assignedVis - personalVis, 0) : assignedVis) : current.visitsTarget,
          personalQuantityTarget: enabledMetrics.quantity ? (isPlayerManager ? personalQty : 0) : current.personalQuantityTarget,
          personalRevenueTarget: enabledMetrics.revenue ? (isPlayerManager ? personalRev : 0) : current.personalRevenueTarget,
          personalVisitsTarget: enabledMetrics.visits ? (isPlayerManager ? personalVis : 0) : current.personalVisitsTarget,
        });
      });

      // Now recursively distribute down the entire tree (L2, L3, etc.)
      autoDistributeTargets(
        directReports,
        { quantity: totalQuantity, revenue: totalRevenue, visits: totalVisits },
        next,
        enabledMetrics,
      );

      return next;
    });

    toast.success('Targets distributed by contributor count');
  }, [directReports, allocations, totalQuantity, totalRevenue, totalVisits, enabledMetrics]);

  // Auto-calculate when entering Step 2
  const handleAutoCalculate = useCallback(() => {
    if (!directReports.length) return;
    const newAllocations = new Map(allocations);
    autoDistributeTargets(
      directReports,
      { quantity: totalQuantity, revenue: totalRevenue, visits: totalVisits },
      newAllocations,
      enabledMetrics,
    );
    setAllocations(newAllocations);
    toast.success('Targets auto-calculated! Review the distribution below.');
  }, [directReports, allocations, totalQuantity, totalRevenue, totalVisits, enabledMetrics]);

  // Split dialog
  const openSplitDialog = useCallback((userId: string) => {
    setSplitDialogManagerId(userId);
    setSplitDialogOpen(true);
  }, []);

  const splitDialogManager = useMemo(() => {
    if (!splitDialogManagerId) return null;
    // Find the node in the tree
    const findNode = (nodes: SubordinateAllocation[]): SubordinateAllocation | null => {
      for (const n of nodes) {
        if (n.userId === splitDialogManagerId) return n;
        const found = findNode(n.children);
        if (found) return found;
      }
      return null;
    };
    return findNode(directReports);
  }, [splitDialogManagerId, directReports]);

  const handleSplitApply = useCallback((updatedChildren: Array<{
    userId: string; quantityTarget: number; revenueTarget: number; visitsTarget: number; percentage: number;
  }>) => {
    setAllocations(prev => {
      const next = new Map(prev);
      updatedChildren.forEach(child => {
        const current = next.get(child.userId);
        if (current) {
          next.set(child.userId, {
            ...current,
            quantityTarget: child.quantityTarget,
            revenueTarget: child.revenueTarget,
            visitsTarget: child.visitsTarget,
            percentage: child.percentage,
          });
          cascadeRollUpToAncestors(child.userId, next);
        }
      });
      return next;
    });
    toast.success('Split applied successfully');
  }, [cascadeRollUpToAncestors]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const upserts = Array.from(allocations.values()).map(alloc => ({
        id: alloc.existingPlanId || undefined,
        user_id: alloc.userId,
        year: fyYear,
        fiscal_year: `${fyYear}-${fyYear + 1}`,
        year_start: fyYear,
        year_end: fyYear + 1,
        quantity_target: alloc.quantityTarget,
        revenue_target: alloc.revenueTarget,
        quantity_unit: quantityUnit,
        target_strategy: alloc.targetStrategy || 'roll_down',
        personal_quantity_target: alloc.personalQuantityTarget || 0,
        personal_revenue_target: alloc.personalRevenueTarget || 0,
        personal_visits_target: alloc.personalVisitsTarget || 0,
        has_no_target: alloc.targetStrategy === 'no_target',
      }));

      const { error } = await supabase
        .from('user_business_plans')
        .upsert(upserts as any, { onConflict: 'user_id,year' });
      if (error) throw error;

      // Save parent manager's plan
      const { error: managerError } = await supabase
        .from('user_business_plans')
        .upsert({
          user_id: parentUserId,
          year: fyYear,
          target_strategy: 'roll_down',
          quantity_unit: quantityUnit,
          quantity_target: 0,
          revenue_target: 0,
        } as any, { onConflict: 'user_id,year' });
      if (managerError) throw managerError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hierarchy-allocations', parentUserId] });
      queryClient.invalidateQueries({ queryKey: ['parent-business-plan', parentUserId, fyYear] });
      toast.success('All allocations saved successfully!');
    },
    onError: (error: Error) => {
      toast.error('Failed to save: ' + error.message);
    },
  });

  // Navigation
  const goToStep = (step: number) => {
    if (step === 2) {
      // Auto-calculate when entering preview
      handleAutoCalculate();
    }
    setCurrentStep(step);
  };

  // Computed values
  const allocatedQuantity = directReports.reduce((sum, u) => sum + (allocations.get(u.userId)?.quantityTarget || 0), 0);
  const allocatedRevenue = directReports.reduce((sum, u) => sum + (allocations.get(u.userId)?.revenueTarget || 0), 0);
  const remainingQuantity = totalQuantity - allocatedQuantity;
  const remainingRevenue = totalRevenue - allocatedRevenue;

  // Prepare manager rows for Step 1
  const managerRows = useMemo(() => {
    const toTeamNode = (node: SubordinateAllocation): TeamHierarchyNode => {
      const childAlloc = allocations.get(node.userId);
      return {
        userId: node.userId,
        fullName: node.fullName,
        subordinateCount: node.subordinateCount,
        children: node.children.map(toTeamNode),
        quantityTarget: childAlloc?.quantityTarget ?? 0,
        revenueTarget: childAlloc?.revenueTarget ?? 0,
        visitsTarget: childAlloc?.visitsTarget ?? 0,
        personalQuantityTarget: childAlloc?.personalQuantityTarget ?? 0,
        personalRevenueTarget: childAlloc?.personalRevenueTarget ?? 0,
        personalVisitsTarget: childAlloc?.personalVisitsTarget ?? 0,
        targetStrategy: (childAlloc?.targetStrategy ?? 'roll_down') as TargetStrategy,
      };
    };

    return directReports.map(dr => {
      const alloc = allocations.get(dr.userId);
      return {
        userId: dr.userId,
        fullName: dr.fullName,
        profilePictureUrl: dr.profilePictureUrl,
        designation: dr.designation,
        subordinateCount: dr.subordinateCount,
        quantityTarget: alloc?.quantityTarget ?? 0,
        revenueTarget: alloc?.revenueTarget ?? 0,
        visitsTarget: alloc?.visitsTarget ?? 0,
        targetStrategy: (alloc?.targetStrategy ?? 'roll_down') as TargetStrategy,
        children: dr.children.map(toTeamNode),
      };
    });
  }, [directReports, allocations]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!directReports.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <p>No direct reports found for this user.</p>
          <p className="text-sm mt-1">Select a different user from the hierarchy.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <span className="border-b-2 border-primary/30 pb-0.5">Target Allocation</span>
          <Badge variant="secondary">{allocations.size} members</Badge>
        </CardTitle>

        {/* Strategy Explanation */}
        <StrategyExplanationPanel />

        {/* Wizard Progress */}
        <WizardProgress currentStep={currentStep} steps={WIZARD_STEPS} />

        {/* Total target summary */}
        <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/30 rounded-lg border mt-2">
          <span className="text-sm font-medium text-muted-foreground">Annual Target:</span>
          {enabledMetrics.quantity && (
            <Badge variant="outline" className="font-mono text-sm">
              {formatNumber(totalQuantity)} {quantityUnit}
            </Badge>
          )}
          {enabledMetrics.revenue && (
            <Badge variant="outline" className="font-mono text-sm">
              {formatCurrency(totalRevenue)}
            </Badge>
          )}
          {enabledMetrics.visits && (
            <Badge variant="outline" className="font-mono text-sm">
              {formatNumber(totalVisits)} visits
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Step 1: Assign Manager Targets */}
        {currentStep === 1 && (
          <StepAssignManagers
            managers={managerRows}
            totalQuantity={totalQuantity}
            totalRevenue={totalRevenue}
            totalVisits={totalVisits}
            quantityUnit={quantityUnit}
            enabledMetrics={enabledMetrics}
            onTargetChange={handleTargetChange}
            onStrategyChange={handleStrategyChange}
            onEqualSplit={handleEqualSplit}
          />
        )}

        {/* Step 2: Auto-Calculate & Preview */}
        {currentStep === 2 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                Targets have been auto-distributed based on each manager's strategy. Review the full hierarchy below.
              </p>
            </div>
            <StepPreview
              roots={directReports}
              quantityUnit={quantityUnit}
              enabledMetrics={enabledMetrics}
              allocations={allocations as any}
              onTargetChange={handleTargetChange}
            />
          </div>
        )}

        {/* Step 3: Review & Save */}
        {currentStep === 3 && (
          <StepReviewSave
            roots={directReports}
            quantityUnit={quantityUnit}
            enabledMetrics={enabledMetrics}
            allocations={allocations as any}
            onTargetChange={handleTargetChange}
            onStrategyChange={handleStrategyChange}
            onSplitManager={openSplitDialog}
            fyYear={fyYear}
            targetStartMonth={targetStartMonth}
            targetEndMonth={targetEndMonth}
          />
        )}

        {/* Over-allocation warning */}
        {currentStep === 3 && (enabledMetrics.quantity && remainingQuantity < 0 || enabledMetrics.revenue && remainingRevenue < 0) && (
          <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-sm">Total L1 allocations exceed the target. Please adjust.</span>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(prev => prev - 1)}
            disabled={currentStep === 1}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>

          <div className="flex items-center gap-2">
            {currentStep < 3 && (
              <Button
                onClick={() => goToStep(currentStep + 1)}
                className="gap-2"
              >
                {currentStep === 1 ? 'Auto-Calculate & Preview' : 'Fine-tune & Save'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}

            {currentStep === 3 && (
              <Button
                size="lg"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="min-w-[200px] gap-2"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save All Allocations
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      {/* Split Dialog */}
      {splitDialogManager && (
        <TargetSplitDialog
          open={splitDialogOpen}
          onOpenChange={setSplitDialogOpen}
          managerName={splitDialogManager.fullName}
          managerQuantityTarget={allocations.get(splitDialogManager.userId)?.quantityTarget || 0}
          managerRevenueTarget={allocations.get(splitDialogManager.userId)?.revenueTarget || 0}
          managerVisitsTarget={allocations.get(splitDialogManager.userId)?.visitsTarget || 0}
          quantityUnit={quantityUnit}
          enabledMetrics={enabledMetrics}
          children={splitDialogManager.children.map(c => ({
            userId: c.userId,
            fullName: c.fullName,
            profilePictureUrl: c.profilePictureUrl,
            quantityTarget: allocations.get(c.userId)?.quantityTarget || 0,
            revenueTarget: allocations.get(c.userId)?.revenueTarget || 0,
            visitsTarget: allocations.get(c.userId)?.visitsTarget || 0,
            percentage: allocations.get(c.userId)?.percentage || 0,
          }))}
          onApply={handleSplitApply}
        />
      )}
    </Card>
  );
}

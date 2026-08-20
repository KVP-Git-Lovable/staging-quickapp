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
  designation?: string;
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
  /**
   * Report what has actually been handed out, and where the wizard is, so the
   * page header above can show the live figures rather than a placeholder.
   */
  onProgressChange?: (progress: {
    distributed: { quantity: number; revenue: number; visits: number };
    currentStep: number;
    steps: { id: number; title: string }[];
    isBalanced: boolean;
  }) => void;
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
 * Count the people in a branch who can actually carry a target:
 * - Individual contributor: 1
 * - Pure manager (Roll Down / Roll Up): sum(children)
 * - Player-manager (Independent): 1 + sum(children)
 * - Excluded individual: 0 — they drop out of the allocation entirely
 * - Excluded manager: sum(children) — the manager holds nothing themselves,
 *   but their share passes straight through to the people under them
 *
 * A branch counting 0 has nobody left to take a share, so it is left out of
 * every split rather than being forced to a minimum of one.
 */
const getContributorCountForNode = (
  node: SubordinateAllocation,
  allocations: Map<string, SubordinateAllocation>,
  cache: Map<string, number>,
): number => {
  const cached = cache.get(node.userId);
  if (cached !== undefined) return cached;

  const currentAlloc = allocations.get(node.userId) || node;
  const excluded = currentAlloc.targetStrategy === 'no_target';

  if (node.children.length === 0) {
    const own = excluded ? 0 : 1;
    cache.set(node.userId, own);
    return own;
  }

  const childContributors = node.children.reduce(
    (sum, child) => sum + getContributorCountForNode(child, allocations, cache),
    0,
  );

  const includeSelf = !excluded && currentAlloc.targetStrategy === 'independent';
  const total = childContributors + (includeSelf ? 1 : 0);
  cache.set(node.userId, total);
  return total;
};

/**
 * What a whole branch is responsible for, as seen from one level up.
 *
 * The team figure is what the branch below carries; an Independent manager
 * holds a target of their own *beside* it, so their branch is worth both added
 * together — personal 30,000 with a team on 100,000 is a branch of 130,000.
 * An excluded individual is worth nothing; an excluded manager is worth what
 * their team carries, since their share passes through untouched.
 */
const branchValue = (
  alloc: SubordinateAllocation,
  teamKey: 'quantityTarget' | 'revenueTarget' | 'visitsTarget',
  personalKey: 'personalQuantityTarget' | 'personalRevenueTarget' | 'personalVisitsTarget',
): number => {
  const team = alloc[teamKey] || 0;
  const hasTeam = alloc.children.length > 0;

  if (alloc.targetStrategy === 'no_target') return hasTeam ? team : 0;
  if (alloc.targetStrategy === 'independent' && hasTeam) return team + (alloc[personalKey] || 0);
  return team;
};

const getEffectiveQuantity = (alloc: SubordinateAllocation) =>
  branchValue(alloc, 'quantityTarget', 'personalQuantityTarget');

const getEffectiveRevenue = (alloc: SubordinateAllocation) =>
  branchValue(alloc, 'revenueTarget', 'personalRevenueTarget');

const getEffectiveVisits = (alloc: SubordinateAllocation) =>
  branchValue(alloc, 'visitsTarget', 'personalVisitsTarget');

/** How a total is shared out among the branches below it. */
type SplitMode =
  /** One equal share per direct report, whatever size their branch is. */
  | 'equal'
  /** Shares proportional to head count, so every individual ends up equal. */
  | 'byTeamSize';

/**
 * The branches eligible for a share, and how much weight each carries.
 *
 * A branch with nobody left to carry a target is left out rather than given a
 * forced minimum share, which would strand part of the total on a row that
 * cannot pass it anywhere.
 */
const splitEntriesFor = (
  children: SubordinateAllocation[],
  allocations: Map<string, SubordinateAllocation>,
  mode: SplitMode,
  cache: Map<string, number> = new Map(),
): Array<{ userId: string; weight: number }> =>
  children
    .map((child) => ({ child, count: getContributorCountForNode(child, allocations, cache) }))
    .filter(({ count }) => count > 0)
    .map(({ child, count }) => ({
      userId: child.userId,
      weight: mode === 'equal' ? 1 : count,
    }));

/**
 * Hand a manager's total down to their team, all the way to the bottom.
 *
 * A manager who has been given a share of the annual target has to see that
 * share reach the people under them, or the two disagree — and a Roll Up
 * manager, whose figure is read back from the team, would then be overwritten
 * with an unrelated number and the distributed total would drift away from the
 * annual target.
 *
 * Independent managers hand down only the team's portion; the slice they hold
 * themselves stays on their own row. An excluded manager hands down the whole
 * figure — they keep none of it, so it passes through to their team intact.
 */
const pushTargetsDown = (
  userId: string,
  next: Map<string, SubordinateAllocation>,
  nodeById: Map<string, SubordinateAllocation>,
  enabledMetrics: { quantity: boolean; revenue: boolean; visits: boolean },
  mode: SplitMode = 'equal',
): void => {
  const alloc = next.get(userId);
  const node = nodeById.get(userId);
  if (!alloc || !node || node.children.length === 0) return;

  const entries = splitEntriesFor(node.children, next, mode);
  if (!entries.length) return;
  const receiving = new Set(entries.map((entry) => entry.userId));

  const quantitySplit = enabledMetrics.quantity ? splitByWeights(alloc.quantityTarget, entries) : new Map<string, number>();
  const revenueSplit = enabledMetrics.revenue ? splitByWeights(alloc.revenueTarget, entries) : new Map<string, number>();
  const visitsSplit = enabledMetrics.visits ? splitByWeights(alloc.visitsTarget, entries) : new Map<string, number>();

  node.children.forEach((child) => {
    const currentChild = next.get(child.userId);
    if (!currentChild || !receiving.has(child.userId)) return;
    next.set(child.userId, {
      ...currentChild,
      quantityTarget: enabledMetrics.quantity ? (quantitySplit.get(child.userId) || 0) : currentChild.quantityTarget,
      revenueTarget: enabledMetrics.revenue ? (revenueSplit.get(child.userId) || 0) : currentChild.revenueTarget,
      visitsTarget: enabledMetrics.visits ? (visitsSplit.get(child.userId) || 0) : currentChild.visitsTarget,
    });
    pushTargetsDown(child.userId, next, nodeById, enabledMetrics, mode);
  });
};

const CLEARED_TARGETS = {
  quantityTarget: 0,
  revenueTarget: 0,
  visitsTarget: 0,
  personalQuantityTarget: 0,
  personalRevenueTarget: 0,
  personalVisitsTarget: 0,
} as const;

/**
 * Hand each branch's amount down through the whole tree.
 *
 * Every node arrives holding what its *branch* is responsible for. Splitting
 * that among the branches below is the same operation at every level, and the
 * target type only decides two things: whether the manager keeps a share for
 * themselves, and whether their own figure is read back from the team.
 *
 * - Independent joins their own team's split as one more contributor, so their
 *   personal target comes out of the branch alongside the team's — 30,000 of
 *   their own plus a team on 100,000 is a branch of 130,000.
 * - Roll Up reads the manager's figure back once the team is settled. The share
 *   is handed down first, so reading it back returns the same number instead of
 *   losing it.
 * - No Target keeps nothing: the branch's amount passes straight through to the
 *   people below.
 * - A branch with nobody left to carry a target is cleared and skipped.
 */
function autoDistributeTargets(
  nodes: SubordinateAllocation[],
  allocations: Map<string, SubordinateAllocation>,
  enabledMetrics: { quantity: boolean; revenue: boolean; visits: boolean },
  mode: SplitMode = 'equal',
): Map<string, SubordinateAllocation> {
  const contributorCache = new Map<string, number>();

  const distributeNode = (node: SubordinateAllocation) => {
    const alloc = allocations.get(node.userId);
    if (!alloc || node.children.length === 0) return;

    const childEntries = splitEntriesFor(node.children, allocations, mode, contributorCache);
    const receiving = new Set(childEntries.map((entry) => entry.userId));

    node.children.forEach((child) => {
      if (receiving.has(child.userId)) return;
      const childAlloc = allocations.get(child.userId);
      if (childAlloc) allocations.set(child.userId, { ...childAlloc, ...CLEARED_TARGETS });
    });

    if (!childEntries.length) return;

    const holdsOwnShare = alloc.targetStrategy === 'independent';
    const entries = holdsOwnShare
      ? [{ userId: node.userId, weight: 1 }, ...childEntries]
      : childEntries;

    const branch = {
      quantity: getEffectiveQuantity(alloc),
      revenue: getEffectiveRevenue(alloc),
      visits: getEffectiveVisits(alloc),
    };

    const quantitySplit = enabledMetrics.quantity ? splitByWeights(branch.quantity, entries) : new Map<string, number>();
    const revenueSplit = enabledMetrics.revenue ? splitByWeights(branch.revenue, entries) : new Map<string, number>();
    const visitsSplit = enabledMetrics.visits ? splitByWeights(branch.visits, entries) : new Map<string, number>();

    const ownQuantity = holdsOwnShare ? (quantitySplit.get(node.userId) || 0) : 0;
    const ownRevenue = holdsOwnShare ? (revenueSplit.get(node.userId) || 0) : 0;
    const ownVisits = holdsOwnShare ? (visitsSplit.get(node.userId) || 0) : 0;

    allocations.set(node.userId, {
      ...alloc,
      quantityTarget: enabledMetrics.quantity ? branch.quantity - ownQuantity : alloc.quantityTarget,
      revenueTarget: enabledMetrics.revenue ? branch.revenue - ownRevenue : alloc.revenueTarget,
      visitsTarget: enabledMetrics.visits ? branch.visits - ownVisits : alloc.visitsTarget,
      personalQuantityTarget: enabledMetrics.quantity ? ownQuantity : alloc.personalQuantityTarget,
      personalRevenueTarget: enabledMetrics.revenue ? ownRevenue : alloc.personalRevenueTarget,
      personalVisitsTarget: enabledMetrics.visits ? ownVisits : alloc.personalVisitsTarget,
    });

    node.children.forEach((child) => {
      const childAlloc = allocations.get(child.userId);
      if (!childAlloc || !receiving.has(child.userId)) return;

      // The child receives what their whole branch is worth. Their own slice of
      // it, if they take one, is carved out when the recursion reaches them —
      // so any earlier slice is cleared first rather than counted twice.
      allocations.set(child.userId, {
        ...childAlloc,
        quantityTarget: enabledMetrics.quantity ? (quantitySplit.get(child.userId) || 0) : childAlloc.quantityTarget,
        revenueTarget: enabledMetrics.revenue ? (revenueSplit.get(child.userId) || 0) : childAlloc.revenueTarget,
        visitsTarget: enabledMetrics.visits ? (visitsSplit.get(child.userId) || 0) : childAlloc.visitsTarget,
        personalQuantityTarget: enabledMetrics.quantity ? 0 : childAlloc.personalQuantityTarget,
        personalRevenueTarget: enabledMetrics.revenue ? 0 : childAlloc.personalRevenueTarget,
        personalVisitsTarget: enabledMetrics.visits ? 0 : childAlloc.personalVisitsTarget,
      });

      distributeNode(child);
    });

    if (alloc.targetStrategy === 'roll_up') {
      const settled = allocations.get(node.userId);
      if (!settled) return;

      let sumQuantity = 0;
      let sumRevenue = 0;
      let sumVisits = 0;
      node.children.forEach((child) => {
        const latest = allocations.get(child.userId);
        if (!latest) return;
        sumQuantity += getEffectiveQuantity(latest);
        sumRevenue += getEffectiveRevenue(latest);
        sumVisits += getEffectiveVisits(latest);
      });

      allocations.set(node.userId, {
        ...settled,
        quantityTarget: enabledMetrics.quantity ? sumQuantity : settled.quantityTarget,
        revenueTarget: enabledMetrics.revenue ? sumRevenue : settled.revenueTarget,
        visitsTarget: enabledMetrics.visits ? sumVisits : settled.visitsTarget,
      });
    }
  };

  nodes.forEach(distributeNode);
  return allocations;
}

/**
 * Managers whose stated figure no longer matches what their team adds up to.
 *
 * Typed figures are left exactly as entered, so the two can disagree — this is
 * what says where, rather than quietly moving numbers to cover it up. A manager
 * whose team is still empty-handed is not a mismatch: nothing has been given
 * out there yet.
 */
interface ReconciliationIssue {
  userId: string;
  fullName: string;
  stated: number;
  team: number;
}

const findReconciliationIssues = (
  nodes: SubordinateAllocation[],
  allocations: Map<string, SubordinateAllocation>,
  enabledMetrics: { quantity: boolean; revenue: boolean; visits: boolean },
): ReconciliationIssue[] => {
  const issues: ReconciliationIssue[] = [];

  const visit = (node: SubordinateAllocation) => {
    const alloc = allocations.get(node.userId);
    if (!alloc) return;

    // Someone excluded takes no part in any of this. They carry no target of
    // their own, so there is nothing of theirs to hold their team against —
    // whatever figure passes through them belongs to the team, not to them.
    // Their team is still checked, one level down, on its own rows.
    const excluded = alloc.targetStrategy === 'no_target';

    if (!excluded && node.children.length > 0) {
      const stated =
        (enabledMetrics.quantity ? alloc.quantityTarget : 0) +
        (enabledMetrics.revenue ? alloc.revenueTarget : 0) +
        (enabledMetrics.visits ? alloc.visitsTarget : 0);

      const team = node.children.reduce((sum, child) => {
        const childAlloc = allocations.get(child.userId);
        if (!childAlloc) return sum;
        return (
          sum +
          (enabledMetrics.quantity ? getEffectiveQuantity(childAlloc) : 0) +
          (enabledMetrics.revenue ? getEffectiveRevenue(childAlloc) : 0) +
          (enabledMetrics.visits ? getEffectiveVisits(childAlloc) : 0)
        );
      }, 0);

      if (stated > 0 && team > 0 && stated !== team) {
        issues.push({ userId: node.userId, fullName: node.fullName, stated, team });
      }
    }

    node.children.forEach(visit);
  };

  nodes.forEach(visit);
  return issues;
};

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
  onProgressChange,
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
        const rawStrategy = (existingPlan?.target_strategy as TargetStrategy) || 'roll_down';
        const subCount = subordinateCounts.get(sub.subordinate_user_id) || 0;
        // Roll Down and Roll Up describe how a target moves between a manager and
        // their team, so neither means anything for someone with no subordinates.
        // Such an employee simply carries their own target — Independent — unless
        // they have been explicitly excluded.
        const savedStrategy: TargetStrategy =
          subCount === 0 && rawStrategy !== 'no_target' ? 'independent' : rawStrategy;

        nodeMap.set(sub.subordinate_user_id, {
          userId: sub.subordinate_user_id,
          fullName: profile?.full_name || 'Unknown',
          profilePictureUrl: profile?.profile_picture_url || null,
          designation: profile?.designation || undefined,
          // Amounts are not carried over from a previously saved plan. The
          // annual target on the current plan is the only source for what gets
          // handed out, so a figure saved against an older, larger annual
          // target cannot reappear here and read as over-allocated.
          // The saved target type is kept, since that is a per-person setting
          // rather than an amount.
          quantityTarget: 0,
          revenueTarget: 0,
          visitsTarget: 0,
          personalQuantityTarget: 0,
          personalRevenueTarget: 0,
          personalVisitsTarget: 0,
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

  /** Every person in the tree by id, for weight lookups. */
  const nodeById = useMemo(() => {
    const map = new Map<string, SubordinateAllocation>();
    const collect = (nodes: SubordinateAllocation[]) => {
      nodes.forEach((node) => {
        map.set(node.userId, node);
        if (node.children.length) collect(node.children);
      });
    };
    collect(directReports);
    return map;
  }, [directReports]);

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

  /**
   * Re-share a fixed manager total across whoever is still active.
   *
   * Called when someone crosses into or out of No Target. The manager's total
   * is unchanged — an excluded person drops out of the allocation and their
   * share goes to the remaining active people; bringing someone back re-splits
   * the same total to include them again.
   *
   * Only someone with nobody under them actually leaves. An excluded *manager*
   * still holds a place in the split, because the people below them keep their
   * targets and the branch's share passes through untouched.
   */
  const redistributeAmongSiblings = useCallback((userId: string, next: Map<string, SubordinateAllocation>) => {
    const parentId = hierarchyRelations.parentByChild.get(userId);

    // Which people share the pot, and how big is it.
    const siblingIds = parentId
      ? hierarchyRelations.childrenByParent.get(parentId) || []
      : directReports.map((dr) => dr.userId);
    if (siblingIds.length === 0) return;

    const parentAlloc = parentId ? next.get(parentId) : undefined;

    const pot = parentAlloc
      ? {
          quantity: parentAlloc.quantityTarget,
          revenue: parentAlloc.revenueTarget,
          visits: parentAlloc.visitsTarget,
        }
      : { quantity: totalQuantity, revenue: totalRevenue, visits: totalVisits };

    // Nothing has been handed out at this level yet — leave it undistributed
    // rather than filling targets in off the back of a dropdown change.
    const alreadyAllocated = siblingIds.reduce((sum, id) => {
      const alloc = next.get(id);
      if (!alloc) return sum;
      return sum + alloc.quantityTarget + alloc.revenueTarget + alloc.visitsTarget;
    }, 0);
    if (alreadyAllocated === 0) return;

    const siblingNodes = siblingIds
      .map((id) => nodeById.get(id))
      .filter((node): node is SubordinateAllocation => Boolean(node));

    const weightedEntries = splitEntriesFor(siblingNodes, next, 'equal');

    // Everyone in this group is excluded — nothing left to share the pot.
    if (!weightedEntries.length) return;
    const receiving = new Set(weightedEntries.map((entry) => entry.userId));

    const quantitySplit = enabledMetrics.quantity ? splitByWeights(pot.quantity, weightedEntries) : new Map<string, number>();
    const revenueSplit = enabledMetrics.revenue ? splitByWeights(pot.revenue, weightedEntries) : new Map<string, number>();
    const visitsSplit = enabledMetrics.visits ? splitByWeights(pot.visits, weightedEntries) : new Map<string, number>();

    siblingIds.forEach((id) => {
      const current = next.get(id);
      if (!current) return;

      if (!receiving.has(id)) {
        next.set(id, { ...current, ...CLEARED_TARGETS });
        return;
      }

      next.set(id, {
        ...current,
        quantityTarget: enabledMetrics.quantity ? (quantitySplit.get(id) || 0) : current.quantityTarget,
        revenueTarget: enabledMetrics.revenue ? (revenueSplit.get(id) || 0) : current.revenueTarget,
        visitsTarget: enabledMetrics.visits ? (visitsSplit.get(id) || 0) : current.visitsTarget,
        personalQuantityTarget: enabledMetrics.quantity ? 0 : current.personalQuantityTarget,
        personalRevenueTarget: enabledMetrics.revenue ? 0 : current.personalRevenueTarget,
        personalVisitsTarget: enabledMetrics.visits ? 0 : current.personalVisitsTarget,
      });

      const node = nodeById.get(id);
      if (node) autoDistributeTargets([node], next, enabledMetrics);
    });
  }, [
    hierarchyRelations.parentByChild,
    hierarchyRelations.childrenByParent,
    directReports,
    nodeById,
    totalQuantity,
    totalRevenue,
    totalVisits,
    enabledMetrics,
  ]);

  /**
   * Keep every derived figure above a change in step with the team below it.
   *
   * Roll Up derives the manager's figure from the team by definition, so it is
   * recomputed rather than typed.
   *
   * An excluded manager is recomputed too. The figure on their row is not a
   * target of theirs — they hold nothing — it is only what passes through them
   * to their team, so it follows the team rather than standing against it. That
   * keeps a branch's contribution to the annual target truthful without ever
   * treating an excluded person as though they had a target.
   *
   * Roll Down and Independent are left exactly as entered. A Roll Down
   * manager's figure is the source their team is split from, not a mirror of it
   * — if a hand-edit below leaves the two disagreeing, that is reported as a
   * mismatch instead of being papered over by moving the manager to match.
   */
  const cascadeRollUpToAncestors = useCallback((userId: string, next: Map<string, SubordinateAllocation>) => {
    let currentParent = hierarchyRelations.parentByChild.get(userId);

    while (currentParent) {
      const strategy = next.get(currentParent)?.targetStrategy;
      if (strategy === 'roll_up' || strategy === 'no_target') {
        recomputeRollUpManager(currentParent, next);
      }
      currentParent = hierarchyRelations.parentByChild.get(currentParent);
    }
  }, [hierarchyRelations.parentByChild, recomputeRollUpManager]);

  // Handlers
  /**
   * Take a hand-typed figure exactly as entered.
   *
   * Nothing beside the edited row is adjusted to make the totals come out: a
   * number the user typed is never quietly replaced. Only the two derived
   * relationships follow — a Roll Down manager's team is re-split from their new
   * total, and a Roll Up manager above is re-read from their team. Anything left
   * out of balance is reported, not corrected.
   */
  const handleTargetChange = useCallback((userId: string, field: string, value: number) => {
    setAllocations(prev => {
      const next = new Map(prev);
      const current = next.get(userId);
      if (!current) return next;

      next.set(userId, { ...current, [field]: value });

      // An Independent manager's own target sits beside their team's, so
      // changing it leaves the team untouched. A Roll Up manager reads their
      // figure back from the team, so nothing is handed down from there either.
      const editedTeamFigure = field !== 'personalQuantityTarget'
        && field !== 'personalRevenueTarget'
        && field !== 'personalVisitsTarget';
      if (editedTeamFigure && current.targetStrategy !== 'roll_up') {
        pushTargetsDown(userId, next, nodeById, enabledMetrics);
      }

      cascadeRollUpToAncestors(userId, next);
      return next;
    });
  }, [cascadeRollUpToAncestors, nodeById, enabledMetrics]);

  const handleStrategyChange = useCallback((userId: string, strategy: TargetStrategy) => {
    setAllocations(prev => {
      const next = new Map(prev);
      const current = next.get(userId);

      if (current) {
        const wasExcluded = current.targetStrategy === 'no_target';
        const isExcluded = strategy === 'no_target';

        // Someone excluded carries nothing of their own. A manager keeps the
        // branch figure, though — they hold none of it themselves, but it is
        // still what their team is being handed, so it passes through rather
        // than taking their team's targets down with it.
        const node = nodeById.get(userId);
        const hasTeam = (node?.children.length ?? 0) > 0;

        if (isExcluded && !hasTeam) {
          next.set(userId, { ...current, targetStrategy: strategy, ...CLEARED_TARGETS });
        } else if (isExcluded) {
          // The slice this manager was holding for themselves goes back into
          // the branch, so the branch is worth the same as a moment ago and
          // all of it now reaches the team.
          next.set(userId, {
            ...current,
            targetStrategy: strategy,
            quantityTarget: getEffectiveQuantity(current),
            revenueTarget: getEffectiveRevenue(current),
            visitsTarget: getEffectiveVisits(current),
            personalQuantityTarget: 0,
            personalRevenueTarget: 0,
            personalVisitsTarget: 0,
          });
        } else {
          next.set(userId, { ...current, targetStrategy: strategy });
        }

        // Only crossing into or out of No Target changes who shares the
        // manager's total. Switching between Roll Down, Roll Up and
        // Independent leaves the same people active, so nothing is re-split.
        if (wasExcluded !== isExcluded) {
          redistributeAmongSiblings(userId, next);
        }

        // The branch is worth what it was worth before; only the rule for
        // dividing it has changed. Re-run that division so the new type takes
        // effect — an Independent manager carves out their own share, a Roll Up
        // manager reads their figure back from the team, and an excluded
        // manager passes the whole thing through.
        if (node) {
          autoDistributeTargets([node], next, enabledMetrics);
        }

        cascadeRollUpToAncestors(userId, next);
      }

      return next;
    });
  }, [cascadeRollUpToAncestors, redistributeAmongSiblings, nodeById, enabledMetrics]);

  /**
   * Hand the annual target out across the top level, then all the way down.
   *
   * `equal` gives every direct report's branch the same slice, whatever size it
   * is; `byTeamSize` weights the slices by head count, so it is the individuals
   * at the bottom who come out equal rather than the branches. Either way the
   * same rule is then applied at every level below.
   */
  const distributeFromAnnualTarget = useCallback((mode: SplitMode) => {
    if (!directReports.length) return;

    setAllocations((prev) => {
      const next = new Map(prev);
      const entries = splitEntriesFor(directReports, next, mode);
      const receiving = new Set(entries.map((entry) => entry.userId));

      const quantitySplit = enabledMetrics.quantity ? splitByWeights(totalQuantity, entries) : new Map<string, number>();
      const revenueSplit = enabledMetrics.revenue ? splitByWeights(totalRevenue, entries) : new Map<string, number>();
      const visitsSplit = enabledMetrics.visits ? splitByWeights(totalVisits, entries) : new Map<string, number>();

      directReports.forEach((dr) => {
        const current = next.get(dr.userId);
        if (!current) return;

        if (!receiving.has(dr.userId)) {
          next.set(dr.userId, { ...current, ...CLEARED_TARGETS });
          return;
        }

        // Each branch receives what it is worth in total. Whatever the manager
        // keeps for themselves is carved out of it on the way down.
        next.set(dr.userId, {
          ...current,
          quantityTarget: enabledMetrics.quantity ? (quantitySplit.get(dr.userId) || 0) : current.quantityTarget,
          revenueTarget: enabledMetrics.revenue ? (revenueSplit.get(dr.userId) || 0) : current.revenueTarget,
          visitsTarget: enabledMetrics.visits ? (visitsSplit.get(dr.userId) || 0) : current.visitsTarget,
          personalQuantityTarget: enabledMetrics.quantity ? 0 : current.personalQuantityTarget,
          personalRevenueTarget: enabledMetrics.revenue ? 0 : current.personalRevenueTarget,
          personalVisitsTarget: enabledMetrics.visits ? 0 : current.personalVisitsTarget,
        });
      });

      autoDistributeTargets(directReports, next, enabledMetrics, mode);
      return next;
    });
  }, [directReports, totalQuantity, totalRevenue, totalVisits, enabledMetrics]);

  const handleSplitEqually = useCallback(() => {
    distributeFromAnnualTarget('equal');
    toast.success('Annual target split equally across teams');
  }, [distributeFromAnnualTarget]);

  const handleEqualSplit = useCallback(() => {
    distributeFromAnnualTarget('byTeamSize');
    toast.success('Annual target split by team size — every person gets the same');
  }, [distributeFromAnnualTarget]);

  // Re-apply each person's target type down the tree when entering Step 2.
  // Figures already entered are the starting point, so this settles the
  // hierarchy rather than handing the annual target out again.
  const handleAutoCalculate = useCallback(() => {
    if (!directReports.length) return;
    setAllocations((prev) => {
      const next = new Map(prev);
      autoDistributeTargets(directReports, next, enabledMetrics);
      return next;
    });
    toast.success('Targets auto-calculated! Review the distribution below.');
  }, [directReports, enabledMetrics]);

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
        // An excluded manager may still be holding the figure their team is
        // being handed, but none of it is theirs — they are saved carrying
        // nothing, and their team's own rows carry the targets.
        quantity_target: alloc.targetStrategy === 'no_target' ? 0 : alloc.quantityTarget,
        revenue_target: alloc.targetStrategy === 'no_target' ? 0 : alloc.revenueTarget,
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

  /**
   * What the top level actually accounts for.
   *
   * Each direct report is counted for their whole branch, not just the figure
   * on their own row — an Independent manager's own target and their team's
   * both come out of the annual target, and an excluded manager's branch still
   * carries the share passing through them.
   */
  const distributed = useMemo(() => {
    const sum = { quantity: 0, revenue: 0, visits: 0 };
    directReports.forEach((dr) => {
      const alloc = allocations.get(dr.userId);
      if (!alloc) return;
      sum.quantity += getEffectiveQuantity(alloc);
      sum.revenue += getEffectiveRevenue(alloc);
      sum.visits += getEffectiveVisits(alloc);
    });
    return sum;
  }, [directReports, allocations]);

  /** Levels below the top where a manager and their team no longer agree. */
  const reconciliationIssues = useMemo(
    () => findReconciliationIssues(directReports, allocations, enabledMetrics),
    [directReports, allocations, enabledMetrics],
  );

  /** Metrics whose top-level total misses the annual target. */
  const annualMismatches = useMemo(() => {
    const checks: Array<{ label: string; distributed: number; total: number }> = [];
    if (enabledMetrics.quantity) checks.push({ label: `Quantity (${quantityUnit})`, distributed: distributed.quantity, total: totalQuantity });
    if (enabledMetrics.revenue) checks.push({ label: 'Revenue', distributed: distributed.revenue, total: totalRevenue });
    if (enabledMetrics.visits) checks.push({ label: 'Visits', distributed: distributed.visits, total: totalVisits });
    // A metric nobody has touched yet is not a mismatch — it is simply not
    // distributed, and the step reports it that way.
    return checks.filter((check) => check.distributed > 0 && check.distributed !== check.total);
  }, [enabledMetrics, quantityUnit, distributed, totalQuantity, totalRevenue, totalVisits]);

  const isBalanced = annualMismatches.length === 0 && reconciliationIssues.length === 0;

  const nothingDistributed =
    (!enabledMetrics.quantity || distributed.quantity === 0) &&
    (!enabledMetrics.revenue || distributed.revenue === 0) &&
    (!enabledMetrics.visits || distributed.visits === 0);

  // Hand the live figures to the page header, which owns the summary but has
  // no way of its own to know what the hierarchy below adds up to.
  useEffect(() => {
    onProgressChange?.({ distributed, currentStep, steps: WIZARD_STEPS, isBalanced });
  }, [onProgressChange, distributed, currentStep, isBalanced]);

  // Prepare manager rows for Step 1
  const managerRows = useMemo(() => {
    const toTeamNode = (node: SubordinateAllocation): TeamHierarchyNode => {
      const childAlloc = allocations.get(node.userId);
      return {
        userId: node.userId,
        fullName: node.fullName,
        designation: node.designation,
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
        personalQuantityTarget: alloc?.personalQuantityTarget ?? 0,
        personalRevenueTarget: alloc?.personalRevenueTarget ?? 0,
        personalVisitsTarget: alloc?.personalVisitsTarget ?? 0,
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
            onSplitEqually={handleSplitEqually}
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
              fyYear={fyYear}
              targetStartMonth={targetStartMonth}
              targetEndMonth={targetEndMonth}
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

        {/* What does not add up yet. Figures are taken exactly as typed, so
            this is where a disagreement is reported instead of corrected. */}
        {!nothingDistributed && !isBalanced && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 space-y-2">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-semibold">
                Targets don't add up yet — adjust before continuing
              </span>
            </div>

            <ul className="space-y-1 pl-6 text-sm text-destructive/90">
              {annualMismatches.map((mismatch) => (
                <li key={mismatch.label}>
                  <span className="font-medium">{mismatch.label}:</span>{' '}
                  {formatNumber(mismatch.distributed)} distributed against an annual target of{' '}
                  {formatNumber(mismatch.total)}
                  {' — '}
                  {mismatch.distributed > mismatch.total
                    ? `over by ${formatNumber(mismatch.distributed - mismatch.total)}`
                    : `${formatNumber(mismatch.total - mismatch.distributed)} short`}
                </li>
              ))}

              {reconciliationIssues.map((issue) => (
                <li key={issue.userId}>
                  <span className="font-medium">{issue.fullName}</span> is set to{' '}
                  {formatNumber(issue.stated)} but their team adds up to {formatNumber(issue.team)}
                  {' — '}
                  {issue.team > issue.stated
                    ? `over by ${formatNumber(issue.team - issue.stated)}`
                    : `${formatNumber(issue.stated - issue.team)} short`}
                </li>
              ))}
            </ul>
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
                disabled={!isBalanced}
                title={isBalanced ? undefined : 'Targets must add up to the annual target first'}
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
                disabled={saveMutation.isPending || !isBalanced}
                title={isBalanced ? undefined : 'Targets must add up to the annual target first'}
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

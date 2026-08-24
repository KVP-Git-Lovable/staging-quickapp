import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronDown, ChevronRight, Users, AlertTriangle, Split, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NumericTargetInput } from '../NumericTargetInput';
import { InlineStrategySelector, StrategyBadge } from '../TargetStrategySelector';
import type { TargetStrategy } from '../TargetStrategySelector';
import { MonthlyTargetGrid } from './MonthlyTargetGrid';

const formatNumber = (num: number) => new Intl.NumberFormat('en-IN').format(num);
const formatCurrency = (num: number) => {
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`;
  return `₹${formatNumber(num)}`;
};
const parseNum = (value: string) => {
  const num = parseFloat(value.replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
};
const getInitials = (name: string) =>
  name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const getLevelBackground = (level: number) => {
  switch (level) {
    case 0: return 'bg-background border-border';
    case 1: return 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800';
    case 2: return 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800';
    case 3: return 'bg-yellow-50/50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800';
    default: return 'bg-muted/30 border-border';
  }
};

export interface ReviewNode {
  userId: string;
  fullName: string;
  profilePictureUrl: string | null;
  designation?: string;
  level: number;
  subordinateCount: number;
  children: ReviewNode[];
}

interface StepReviewSaveProps {
  roots: ReviewNode[];
  quantityUnit: string;
  enabledMetrics: { quantity: boolean; revenue: boolean; visits: boolean };
  allocations: Map<string, { quantityTarget: number; revenueTarget: number; visitsTarget: number; targetStrategy: TargetStrategy }>;
  onTargetChange: (userId: string, field: string, value: number) => void;
  onStrategyChange: (userId: string, strategy: TargetStrategy) => void;
  onSplitManager: (userId: string) => void;
  fyYear: number;
  targetStartMonth?: number;
  targetEndMonth?: number;
  /** The Split dialog is itself an automatic-split tool, so it is hidden while
   *  Manual Allocation is on rather than left sitting beside a claim that
   *  nothing here recalculates automatically. */
  manualAllocationMode?: boolean;
}

export function StepReviewSave({
  roots,
  quantityUnit,
  enabledMetrics,
  allocations,
  onTargetChange,
  onStrategyChange,
  onSplitManager,
  fyYear,
  targetStartMonth = 1,
  targetEndMonth = 12,
  manualAllocationMode = false,
}: StepReviewSaveProps) {
  // Which employees currently have their month-wise breakdown open.
  const [monthsOpen, setMonthsOpen] = useState<Set<string>>(new Set());

  const toggleMonths = (id: string) => {
    setMonthsOpen(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const all = new Set<string>();
    const collect = (nodes: ReviewNode[]) => {
      nodes.forEach(n => { all.add(n.userId); if (n.children.length) collect(n.children); });
    };
    collect(roots);
    return all;
  });

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderNode = (node: ReviewNode, depth: number = 0) => {
    const isExp = expanded.has(node.userId);
    const hasChildren = node.children.length > 0;
    const isManager = node.subordinateCount > 0;
    const alloc = allocations.get(node.userId);
    const qty = alloc?.quantityTarget ?? 0;
    const rev = alloc?.revenueTarget ?? 0;
    const vis = alloc?.visitsTarget ?? 0;
    const strategy = alloc?.targetStrategy ?? 'roll_down';
    const isNoTarget = strategy === 'no_target';
    const isMonthsOpen = monthsOpen.has(node.userId);

    // Compute child sum for distribution warning (skip no_target children)
    let childSum = 0;
    if (hasChildren && enabledMetrics.quantity && !isNoTarget) {
      node.children.forEach(c => {
        const ca = allocations.get(c.userId);
        const childStrategy = ca?.targetStrategy ?? 'roll_down';
        if (childStrategy !== 'no_target') {
          childSum += ca?.quantityTarget ?? 0;
        }
      });
    }
    const overUnder = hasChildren && !isNoTarget ? qty - childSum : 0;

    return (
      <div key={node.userId} style={{ marginLeft: `${depth * 20}px` }}>
        <div className={cn('flex flex-col gap-1.5 p-3 rounded-lg border mb-1.5 transition-all', isNoTarget ? 'opacity-50 bg-muted/30 border-border' : getLevelBackground(node.level))}>
          <div className="flex items-center gap-2.5">
            {hasChildren ? (
              <button onClick={() => toggle(node.userId)} className="p-0.5 hover:bg-muted/50 rounded shrink-0">
                {isExp ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            ) : <div className="w-5" />}

            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={node.profilePictureUrl || undefined} alt={node.fullName} />
              <AvatarFallback className="text-[10px] font-medium bg-primary/10 text-primary">{getInitials(node.fullName)}</AvatarFallback>
            </Avatar>

            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-sm font-medium truncate">{node.fullName}</span>
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">L{node.level}</Badge>
              {isManager && (
                <Badge variant="secondary" className="text-[9px] gap-0.5 px-1 py-0 h-4">
                  <Users className="h-2.5 w-2.5" />{node.subordinateCount}
                </Badge>
              )}
              <InlineStrategySelector
                value={strategy}
                onChange={(s) => onStrategyChange(node.userId, s)}
                hasSubordinates={isManager}
              />
            </div>

            {/* Editable target inputs — hidden for no_target */}
            {isNoTarget ? (
              <span className="text-xs text-muted-foreground italic">No target assigned</span>
            ) : (
            <div className="flex items-center gap-2">
              {isManager && !manualAllocationMode && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => onSplitManager(node.userId)}>
                  <Split className="h-3 w-3" /> Split
                </Button>
              )}
              {enabledMetrics.quantity && (
                <div className="flex items-center gap-1">
                  <NumericTargetInput
                    value={qty}
                    onValueChange={(v) => onTargetChange(node.userId, 'quantityTarget', v)}
                    format={formatNumber}
                    parse={parseNum}
                    placeholder="0"
                    aria-label={`Quantity target for ${node.fullName}`}
                    className="h-8 w-20 text-right text-sm"
                  />
                  <span className="text-xs text-muted-foreground">{quantityUnit}</span>
                </div>
              )}
              {enabledMetrics.revenue && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">₹</span>
                  <NumericTargetInput
                    value={rev}
                    onValueChange={(v) => onTargetChange(node.userId, 'revenueTarget', v)}
                    format={formatNumber}
                    parse={parseNum}
                    placeholder="0"
                    aria-label={`Revenue target for ${node.fullName}`}
                    className="h-8 w-24 text-right text-sm"
                  />
                </div>
              )}
              {enabledMetrics.visits && (
                <div className="flex items-center gap-1">
                  <NumericTargetInput
                    value={vis}
                    onValueChange={(v) => onTargetChange(node.userId, 'visitsTarget', v)}
                    format={formatNumber}
                    parse={parseNum}
                    transform={Math.round}
                    placeholder="0"
                    aria-label={`Visits target for ${node.fullName}`}
                    className="h-8 w-16 text-right text-sm"
                  />
                  <span className="text-xs text-muted-foreground">vis</span>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => toggleMonths(node.userId)}
                aria-expanded={isMonthsOpen}
              >
                <CalendarDays className="h-3 w-3" />
                {isMonthsOpen ? 'Hide months' : 'Months'}
              </Button>
            </div>
            )}
          </div>

          {/* Distribution warning */}
          {hasChildren && enabledMetrics.quantity && overUnder !== 0 && (
            <div className={cn(
              'flex items-center gap-1.5 text-[11px] px-2 py-1 rounded ml-8',
              overUnder < 0 ? 'text-destructive bg-destructive/10' : 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30'
            )}>
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {overUnder > 0 ? `${formatNumber(overUnder)} ${quantityUnit} not distributed` : `Over by ${formatNumber(Math.abs(overUnder))} ${quantityUnit}`}
            </div>
          )}
        </div>

        {/* Month-wise targets, working days and auto-calculated daily average */}
        {isMonthsOpen && !isNoTarget && (
          <MonthlyTargetGrid
            userId={node.userId}
            userName={node.fullName}
            fyYear={fyYear}
            quantityUnit={quantityUnit}
            enabledMetrics={enabledMetrics}
            annualQuantity={qty}
            annualRevenue={rev}
            annualVisits={vis}
            targetStartMonth={targetStartMonth}
            targetEndMonth={targetEndMonth}
          />
        )}

        {isExp && hasChildren && node.children.map(c => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {roots.map(r => renderNode(r))}
    </div>
  );
}

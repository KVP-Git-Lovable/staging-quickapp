import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Users, AlertTriangle, Pencil, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StrategyBadge } from '../TargetStrategySelector';
import type { TargetStrategy } from '../TargetStrategySelector';
import { MonthlyTargetGrid } from './MonthlyTargetGrid';

const formatNumber = (num: number) => new Intl.NumberFormat('en-IN').format(num);
const formatCurrency = (num: number) => {
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`;
  return `₹${formatNumber(num)}`;
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

export interface PreviewNode {
  userId: string;
  fullName: string;
  profilePictureUrl: string | null;
  designation?: string;
  level: number;
  subordinateCount: number;
  quantityTarget: number;
  revenueTarget: number;
  visitsTarget: number;
  personalQuantityTarget?: number;
  personalRevenueTarget?: number;
  personalVisitsTarget?: number;
  targetStrategy: TargetStrategy;
  children: PreviewNode[];
}

interface StepPreviewProps {
  roots: PreviewNode[];
  quantityUnit: string;
  enabledMetrics: { quantity: boolean; revenue: boolean; visits: boolean };
  allocations: Map<string, { quantityTarget: number; revenueTarget: number; visitsTarget: number; personalQuantityTarget?: number; personalRevenueTarget?: number; personalVisitsTarget?: number; targetStrategy: TargetStrategy }>;
  onTargetChange?: (userId: string, field: string, value: number) => void;
  fyYear: number;
  targetStartMonth?: number;
  targetEndMonth?: number;
}

const parseNum = (value: string) => {
  const num = parseFloat(value.replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
};

export function StepPreview({
  roots,
  quantityUnit,
  enabledMetrics,
  allocations,
  onTargetChange,
  fyYear,
  targetStartMonth = 1,
  targetEndMonth = 12,
}: StepPreviewProps) {
  const [editingUser, setEditingUser] = useState<string | null>(null);

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
    const collect = (nodes: PreviewNode[]) => {
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

  const renderNode = (node: PreviewNode, depth: number = 0) => {
    const isExp = expanded.has(node.userId);
    const hasChildren = node.children.length > 0;
    const isManager = node.subordinateCount > 0;
    const alloc = allocations.get(node.userId);
    const qty = alloc?.quantityTarget ?? node.quantityTarget;
    const rev = alloc?.revenueTarget ?? node.revenueTarget;
    const vis = alloc?.visitsTarget ?? node.visitsTarget;
    const personalQty = alloc?.personalQuantityTarget ?? node.personalQuantityTarget ?? 0;
    const personalRev = alloc?.personalRevenueTarget ?? node.personalRevenueTarget ?? 0;
    const personalVis = alloc?.personalVisitsTarget ?? node.personalVisitsTarget ?? 0;
    const strategy = alloc?.targetStrategy ?? node.targetStrategy;
    const isIndependent = strategy === 'independent';
    const isNoTarget = strategy === 'no_target';
    const isEditing = editingUser === node.userId;

    // Compute child sum for managers (skip for independent/no_target)
    let childSum = 0;
    if (hasChildren && enabledMetrics.quantity && !isIndependent && !isNoTarget) {
      node.children.forEach(c => {
        const ca = allocations.get(c.userId);
        const childStrategy = ca?.targetStrategy ?? c.targetStrategy;
        if (childStrategy !== 'no_target') {
          childSum += ca?.quantityTarget ?? c.quantityTarget;
        }
      });
    }
    const overUnder = hasChildren && !isIndependent && !isNoTarget ? qty - childSum : 0;

    return (
      <div key={node.userId} style={{ marginLeft: `${depth * 20}px` }}>
        <div className={cn('flex items-center gap-2.5 px-3 py-2.5 rounded-lg border mb-1.5 transition-all', isNoTarget ? 'opacity-50 bg-muted/30 border-border' : getLevelBackground(node.level))}>
          {hasChildren ? (
            <button onClick={() => toggle(node.userId)} className="p-0.5 hover:bg-muted/50 rounded shrink-0">
              {isExp ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          ) : <div className="w-5" />}

          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={node.profilePictureUrl || undefined} alt={node.fullName} />
            <AvatarFallback className="text-[10px] font-medium bg-primary/10 text-primary">{getInitials(node.fullName)}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{node.fullName}</span>
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">L{node.level}</Badge>
              {isManager && (
                <Badge variant="secondary" className="text-[9px] gap-0.5 px-1 py-0 h-4">
                  <Users className="h-2.5 w-2.5" />{node.subordinateCount}
                </Badge>
              )}
              {isManager && <StrategyBadge strategy={strategy} />}
              {isNoTarget && !isManager && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-muted-foreground">No Target</Badge>}
            </div>
            {node.designation && <p className="text-[10px] text-muted-foreground">{node.designation}</p>}
          </div>

          {!isNoTarget && <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => toggleMonths(node.userId)}
              aria-expanded={monthsOpen.has(node.userId)}
            >
              <CalendarDays className="h-3 w-3" />
              {monthsOpen.has(node.userId) ? 'Hide months' : 'Months'}
            </Button>
            {onTargetChange && !isManager && (
              <button
                onClick={() => setEditingUser(isEditing ? null : node.userId)}
                className="p-1 hover:bg-muted/50 rounded text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {isEditing && onTargetChange && !isManager ? (
              <>
                {enabledMetrics.quantity && (
                  <div className="flex items-center gap-1">
                    <Input
                      type="text"
                      value={qty > 0 ? formatNumber(qty) : ''}
                      onChange={(e) => onTargetChange(node.userId, 'quantityTarget', parseNum(e.target.value))}
                      placeholder="0"
                      className="h-7 w-20 text-right text-sm"
                      autoFocus
                    />
                    <span className="text-[10px] text-muted-foreground">{quantityUnit}</span>
                  </div>
                )}
                {enabledMetrics.revenue && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">₹</span>
                    <Input
                      type="text"
                      value={rev > 0 ? formatNumber(rev) : ''}
                      onChange={(e) => onTargetChange(node.userId, 'revenueTarget', parseNum(e.target.value))}
                      placeholder="0"
                      className="h-7 w-24 text-right text-sm"
                    />
                  </div>
                )}
                {enabledMetrics.visits && (
                  <div className="flex items-center gap-1">
                    <Input
                      type="text"
                      value={vis > 0 ? formatNumber(vis) : ''}
                      onChange={(e) => onTargetChange(node.userId, 'visitsTarget', Math.round(parseNum(e.target.value)))}
                      placeholder="0"
                      className="h-7 w-16 text-right text-sm"
                    />
                    <span className="text-[10px] text-muted-foreground">vis</span>
                  </div>
                )}
              </>
            ) : isIndependent && isManager ? (
              <>
                {enabledMetrics.quantity && personalQty > 0 && (
                  <span className="text-sm font-mono font-semibold text-blue-600 dark:text-blue-400">
                    {formatNumber(personalQty)} <span className="text-[10px] text-muted-foreground font-normal">personal</span>
                  </span>
                )}
                {enabledMetrics.quantity && (
                  <span className="text-sm font-mono font-semibold">
                    {formatNumber(qty)} <span className="text-[10px] text-muted-foreground font-normal">team {quantityUnit}</span>
                  </span>
                )}
                {enabledMetrics.revenue && personalRev > 0 && (
                  <span className="text-sm font-mono font-semibold text-blue-600 dark:text-blue-400">
                    {formatCurrency(personalRev)} <span className="text-[10px] text-muted-foreground font-normal">personal</span>
                  </span>
                )}
                {enabledMetrics.revenue && (
                  <span className="text-sm font-mono font-semibold">{formatCurrency(rev)} <span className="text-[10px] text-muted-foreground font-normal">team</span></span>
                )}
              </>
            ) : (
              <>
                {enabledMetrics.quantity && (
                  <span className="text-sm font-mono font-semibold">
                    {formatNumber(qty)} <span className="text-xs text-muted-foreground font-normal">{quantityUnit}</span>
                  </span>
                )}
                {enabledMetrics.revenue && (
                  <span className="text-sm font-mono font-semibold">{formatCurrency(rev)}</span>
                )}
                {enabledMetrics.visits && (
                  <span className="text-sm font-mono font-semibold">{formatNumber(vis)} <span className="text-xs text-muted-foreground font-normal">visits</span></span>
                )}
              </>
            )}
          </div>}
          {isNoTarget && (
            <span className="text-xs text-muted-foreground italic">No target assigned</span>
          )}
        </div>

        {/* Over/under warning — hidden for independent strategy */}
        {hasChildren && !isIndependent && enabledMetrics.quantity && overUnder !== 0 && (
          <div className={cn(
            'flex items-center gap-1.5 text-[11px] px-3 py-1 rounded mb-1',
            overUnder < 0 ? 'text-destructive bg-destructive/10' : 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30'
          )} style={{ marginLeft: `${depth * 20 + 20}px` }}>
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {overUnder > 0 ? `${formatNumber(overUnder)} ${quantityUnit} not yet distributed to subordinates` : `Over-allocated by ${formatNumber(Math.abs(overUnder))} ${quantityUnit}`}
          </div>
        )}

        {/* Month-wise targets, working days and auto-calculated daily average */}
        {monthsOpen.has(node.userId) && !isNoTarget && (
          <MonthlyTargetGrid
            userId={node.userId}
            userName={node.fullName}
            fyYear={fyYear}
            quantityUnit={quantityUnit}
            enabledMetrics={enabledMetrics}
            annualQuantity={qty}
            annualRevenue={rev}
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

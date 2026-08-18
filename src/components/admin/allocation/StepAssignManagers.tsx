import React from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Users, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InlineStrategySelector } from '../TargetStrategySelector';
import type { TargetStrategy } from '../TargetStrategySelector';

const formatNumber = (num: number) => new Intl.NumberFormat('en-IN').format(num);
const formatCurrency = (num: number) => {
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`;
  return `₹${formatNumber(num)}`;
};
const parseNumber = (value: string) => {
  const num = parseFloat(value.replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
};
const getInitials = (name: string) =>
  name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const strategyDescriptions: Record<TargetStrategy, string> = {
  roll_down: 'Target will be distributed to subordinates',
  roll_up: 'Target = sum of subordinate targets',
  independent: 'Personal + team target; team target can be distributed to subordinates',
  no_target: 'No target assigned — excluded from distribution',
};

interface TeamNode {
  userId: string;
  fullName: string;
  subordinateCount: number;
  children: TeamNode[];
  quantityTarget?: number;
  revenueTarget?: number;
  visitsTarget?: number;
  personalQuantityTarget?: number;
  personalRevenueTarget?: number;
  personalVisitsTarget?: number;
  targetStrategy?: TargetStrategy;
}

interface ManagerRow {
  userId: string;
  fullName: string;
  profilePictureUrl: string | null;
  designation?: string;
  subordinateCount: number;
  quantityTarget: number;
  revenueTarget: number;
  visitsTarget: number;
  targetStrategy: TargetStrategy;
  children: TeamNode[];
}

interface StepAssignManagersProps {
  managers: ManagerRow[];
  totalQuantity: number;
  totalRevenue: number;
  totalVisits: number;
  quantityUnit: string;
  enabledMetrics: { quantity: boolean; revenue: boolean; visits: boolean };
  onTargetChange: (userId: string, field: string, value: number) => void;
  onStrategyChange: (userId: string, strategy: TargetStrategy) => void;
  onEqualSplit: () => void;
}

export function StepAssignManagers({
  managers,
  totalQuantity,
  totalRevenue,
  totalVisits,
  quantityUnit,
  enabledMetrics,
  onTargetChange,
  onStrategyChange,
  onEqualSplit,
}: StepAssignManagersProps) {
  const [expandedManagers, setExpandedManagers] = React.useState<Set<string>>(() => {
    return new Set(managers.map((manager) => manager.userId));
  });

  const allocatedQty = managers.reduce((s, m) => s + m.quantityTarget, 0);
  const allocatedRev = managers.reduce((s, m) => s + m.revenueTarget, 0);
  const allocatedVis = managers.reduce((s, m) => s + m.visitsTarget, 0);

  const qtyPct = totalQuantity > 0 ? Math.min(100, (allocatedQty / totalQuantity) * 100) : 0;
  const revPct = totalRevenue > 0 ? Math.min(100, (allocatedRev / totalRevenue) * 100) : 0;
  const visPct = totalVisits > 0 ? Math.min(100, (allocatedVis / totalVisits) * 100) : 0;

  const toggleManager = (userId: string) => {
    setExpandedManagers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const renderDirectReports = (nodes: TeamNode[]): React.ReactNode => {
    return nodes.map((node) => {
      const isSubManager = node.subordinateCount > 0;
      const nodeStrategy = node.targetStrategy || 'roll_down';

      // No Target users — show badge, no inputs
      if (nodeStrategy === 'no_target') {
        return (
          <div key={node.userId} className="flex items-center gap-2 py-1.5 opacity-60">
            <span className="text-xs text-muted-foreground">↳</span>
            <span className="text-xs font-medium text-muted-foreground line-through">{node.fullName}</span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-muted-foreground">No Target</Badge>
            {isSubManager && (
              <InlineStrategySelector
                value={nodeStrategy}
                onChange={(s) => onStrategyChange(node.userId, s)}
              />
            )}
          </div>
        );
      }

      if (!isSubManager) {
        // Simple name row for regular users
        return (
          <div key={node.userId} className="flex items-center gap-2 py-1.5">
            <span className="text-xs text-muted-foreground">↳</span>
            <span className="text-xs font-medium text-foreground">{node.fullName}</span>
          </div>
        );
      }

      // Mini target card for sub-managers
      return (
        <div key={node.userId} className="space-y-1 py-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">↳</span>
            <span className="text-xs font-medium text-foreground">{node.fullName}</span>
            <Badge variant="secondary" className="text-[9px] gap-0.5 px-1 py-0 h-4">
              <Users className="h-2.5 w-2.5" />
              {node.subordinateCount}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              Manages {node.subordinateCount} member{node.subordinateCount > 1 ? 's' : ''}
            </span>
          </div>
          {/* Mini nested target box */}
          <div className="ml-5 rounded-md border border-border/60 bg-muted/30 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <InlineStrategySelector
                value={nodeStrategy}
                onChange={(s) => onStrategyChange(node.userId, s)}
              />
            </div>
            <p className="text-[10px] text-muted-foreground italic">
              {strategyDescriptions[nodeStrategy]}
            </p>

            {/* For Independent strategy, show Personal + Team Target separately */}
            {nodeStrategy === 'independent' ? (
              <div className="space-y-2">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Personal Target</p>
                <div className="flex flex-wrap items-center gap-2">
                  {enabledMetrics.quantity && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">Qty</span>
                      <Input
                        type="text"
                        value={(node.personalQuantityTarget || 0) > 0 ? formatNumber(node.personalQuantityTarget!) : ''}
                        onChange={(e) => onTargetChange(node.userId, 'personalQuantityTarget', parseNumber(e.target.value))}
                        placeholder="0"
                        className="h-7 w-20 text-right text-xs"
                      />
                      <span className="text-[10px] text-muted-foreground">{quantityUnit}</span>
                    </div>
                  )}
                  {enabledMetrics.revenue && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">₹</span>
                      <Input
                        type="text"
                        value={(node.personalRevenueTarget || 0) > 0 ? formatNumber(node.personalRevenueTarget!) : ''}
                        onChange={(e) => onTargetChange(node.userId, 'personalRevenueTarget', parseNumber(e.target.value))}
                        placeholder="0"
                        className="h-7 w-24 text-right text-xs"
                      />
                    </div>
                  )}
                  {enabledMetrics.visits && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">Visits</span>
                      <Input
                        type="text"
                        value={(node.personalVisitsTarget || 0) > 0 ? formatNumber(node.personalVisitsTarget!) : ''}
                        onChange={(e) => onTargetChange(node.userId, 'personalVisitsTarget', Math.round(parseNumber(e.target.value)))}
                        placeholder="0"
                        className="h-7 w-16 text-right text-xs"
                      />
                    </div>
                  )}
                </div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Team Target</p>
                <div className="flex flex-wrap items-center gap-2">
                  {enabledMetrics.quantity && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">Qty</span>
                      <Input
                        type="text"
                        value={(node.quantityTarget || 0) > 0 ? formatNumber(node.quantityTarget!) : ''}
                        onChange={(e) => onTargetChange(node.userId, 'quantityTarget', parseNumber(e.target.value))}
                        placeholder="0"
                        className="h-7 w-20 text-right text-xs"
                      />
                      <span className="text-[10px] text-muted-foreground">{quantityUnit}</span>
                    </div>
                  )}
                  {enabledMetrics.revenue && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">₹</span>
                      <Input
                        type="text"
                        value={(node.revenueTarget || 0) > 0 ? formatNumber(node.revenueTarget!) : ''}
                        onChange={(e) => onTargetChange(node.userId, 'revenueTarget', parseNumber(e.target.value))}
                        placeholder="0"
                        className="h-7 w-24 text-right text-xs"
                      />
                    </div>
                  )}
                  {enabledMetrics.visits && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">Visits</span>
                      <Input
                        type="text"
                        value={(node.visitsTarget || 0) > 0 ? formatNumber(node.visitsTarget!) : ''}
                        onChange={(e) => onTargetChange(node.userId, 'visitsTarget', Math.round(parseNumber(e.target.value)))}
                        placeholder="0"
                        className="h-7 w-16 text-right text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {enabledMetrics.quantity && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">Qty</span>
                    <Input
                      type="text"
                      value={(node.quantityTarget || 0) > 0 ? formatNumber(node.quantityTarget!) : ''}
                      onChange={(e) => onTargetChange(node.userId, 'quantityTarget', parseNumber(e.target.value))}
                      placeholder="0"
                      className="h-7 w-20 text-right text-xs"
                    />
                    <span className="text-[10px] text-muted-foreground">{quantityUnit}</span>
                  </div>
                )}
                {enabledMetrics.revenue && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">₹</span>
                    <Input
                      type="text"
                      value={(node.revenueTarget || 0) > 0 ? formatNumber(node.revenueTarget!) : ''}
                      onChange={(e) => onTargetChange(node.userId, 'revenueTarget', parseNumber(e.target.value))}
                      placeholder="0"
                      className="h-7 w-24 text-right text-xs"
                    />
                  </div>
                )}
                {enabledMetrics.visits && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">Visits</span>
                    <Input
                      type="text"
                      value={(node.visitsTarget || 0) > 0 ? formatNumber(node.visitsTarget!) : ''}
                      onChange={(e) => onTargetChange(node.userId, 'visitsTarget', Math.round(parseNumber(e.target.value)))}
                      placeholder="0"
                      className="h-7 w-16 text-right text-xs"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="space-y-4">
      {/* Remaining to allocate bar */}
      <div className="p-4 bg-muted/30 rounded-lg border space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Total Target to Distribute</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={onEqualSplit}>
              <Users className="h-3 w-3" /> Split by Team Size
            </Button>
          </div>
        </div>

        {enabledMetrics.quantity && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Qty: {formatNumber(allocatedQty)} / {formatNumber(totalQuantity)} {quantityUnit}</span>
              <span className={cn('font-medium', allocatedQty > totalQuantity ? 'text-destructive' : allocatedQty === totalQuantity ? 'text-emerald-600' : 'text-muted-foreground')}>
                {totalQuantity - allocatedQty > 0 ? `${formatNumber(totalQuantity - allocatedQty)} remaining` : allocatedQty === totalQuantity ? '✓ Fully allocated' : `Over by ${formatNumber(allocatedQty - totalQuantity)}`}
              </span>
            </div>
            <Progress value={qtyPct} className="h-2" />
          </div>
        )}
        {enabledMetrics.revenue && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Revenue: {formatCurrency(allocatedRev)} / {formatCurrency(totalRevenue)}</span>
              <span className={cn('font-medium', allocatedRev > totalRevenue ? 'text-destructive' : allocatedRev === totalRevenue ? 'text-emerald-600' : 'text-muted-foreground')}>
                {totalRevenue - allocatedRev > 0 ? `${formatCurrency(totalRevenue - allocatedRev)} remaining` : allocatedRev === totalRevenue ? '✓ Fully allocated' : `Over by ${formatCurrency(allocatedRev - totalRevenue)}`}
              </span>
            </div>
            <Progress value={revPct} className="h-2" />
          </div>
        )}
        {enabledMetrics.visits && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Visits: {formatNumber(allocatedVis)} / {formatNumber(totalVisits)}</span>
              <span className={cn('font-medium', allocatedVis > totalVisits ? 'text-destructive' : allocatedVis === totalVisits ? 'text-emerald-600' : 'text-muted-foreground')}>
                {totalVisits - allocatedVis > 0 ? `${formatNumber(totalVisits - allocatedVis)} remaining` : allocatedVis === totalVisits ? '✓ Fully allocated' : `Over by ${formatNumber(allocatedVis - totalVisits)}`}
              </span>
            </div>
            <Progress value={visPct} className="h-2" />
          </div>
        )}
      </div>

      {/* Manager cards */}
      <div className="space-y-3">
        {managers.map((mgr) => {
          const isExpanded = expandedManagers.has(mgr.userId);

          return (
            <div key={mgr.userId} className="p-4 rounded-lg border bg-card space-y-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={mgr.profilePictureUrl || undefined} alt={mgr.fullName} />
                  <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">{getInitials(mgr.fullName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{mgr.fullName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {mgr.designation && <span className="text-xs text-muted-foreground">{mgr.designation}</span>}
                    <Badge variant="secondary" className="text-[10px] gap-0.5 px-1.5 py-0 h-4">
                      <Users className="h-2.5 w-2.5" />{mgr.subordinateCount}
                    </Badge>
                  </div>
                </div>
                <InlineStrategySelector
                  value={mgr.targetStrategy}
                  onChange={(s) => onStrategyChange(mgr.userId, s)}
                />
              </div>

              {/* Strategy description */}
              <p className="text-[11px] text-muted-foreground italic pl-[52px]">
                {strategyDescriptions[mgr.targetStrategy]}
              </p>

              {/* Team structure preview */}
              {mgr.children.length > 0 && (
                <div className="pl-[52px] space-y-2">
                  <button
                    type="button"
                    onClick={() => toggleManager(mgr.userId)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <span>Reporting structure ({mgr.children.length} direct)</span>
                  </button>

                  {isExpanded && (
                     <div className="rounded-md border bg-muted/20 p-2 space-y-0.5">
                       {renderDirectReports(mgr.children)}
                     </div>
                  )}
                </div>
              )}

              {/* Target inputs — hide for no_target */}
              {mgr.targetStrategy !== 'no_target' && (
              <div className="flex flex-wrap items-center gap-3 pl-[52px]">
                {enabledMetrics.quantity && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Qty</span>
                    <Input
                      type="text"
                      value={mgr.quantityTarget > 0 ? formatNumber(mgr.quantityTarget) : ''}
                      onChange={(e) => onTargetChange(mgr.userId, 'quantityTarget', parseNumber(e.target.value))}
                      placeholder="0"
                      className="h-9 w-24 text-right text-sm"
                    />
                    <span className="text-xs text-muted-foreground">{quantityUnit}</span>
                  </div>
                )}
                {enabledMetrics.revenue && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">₹</span>
                    <Input
                      type="text"
                      value={mgr.revenueTarget > 0 ? formatNumber(mgr.revenueTarget) : ''}
                      onChange={(e) => onTargetChange(mgr.userId, 'revenueTarget', parseNumber(e.target.value))}
                      placeholder="0"
                      className="h-9 w-28 text-right text-sm"
                    />
                  </div>
                )}
                {enabledMetrics.visits && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Visits</span>
                    <Input
                      type="text"
                      value={mgr.visitsTarget > 0 ? formatNumber(mgr.visitsTarget) : ''}
                      onChange={(e) => onTargetChange(mgr.userId, 'visitsTarget', Math.round(parseNumber(e.target.value)))}
                      placeholder="0"
                      className="h-9 w-20 text-right text-sm"
                    />
                  </div>
                )}
              </div>
              )}
              {mgr.targetStrategy === 'no_target' && (
                <div className="pl-[52px]">
                  <Badge variant="outline" className="text-xs text-muted-foreground">No Target — excluded from allocation</Badge>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

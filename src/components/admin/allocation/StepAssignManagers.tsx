import React from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Users, ChevronRight } from 'lucide-react';
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
  personalQuantityTarget?: number;
  personalRevenueTarget?: number;
  personalVisitsTarget?: number;
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

/** The metric field keys written by this step. */
const FIELD_KEYS = {
  quantity: 'quantityTarget',
  revenue: 'revenueTarget',
  visits: 'visitsTarget',
} as const;

/**
 * An Independent manager holds a target of their own beside their team's, kept
 * on the personal keys. Their single visible field edits that, so the manager's
 * figure plus their team's adds up to the annual target rather than counting
 * the team's share twice.
 */
const PERSONAL_KEYS = {
  quantity: 'personalQuantityTarget',
  revenue: 'personalRevenueTarget',
  visits: 'personalVisitsTarget',
} as const;

/** Whether this person's own target lives on the personal keys. */
const holdsPersonalTarget = (strategy: TargetStrategy | undefined, hasTeam: boolean) =>
  strategy === 'independent' && hasTeam;

interface TargetFieldsProps {
  userId: string;
  values: { quantity: number; revenue: number; visits: number };
  keys: { quantity: string; revenue: string; visits: string };
  quantityUnit: string;
  enabledMetrics: { quantity: boolean; revenue: boolean; visits: boolean };
  onTargetChange: (userId: string, field: string, value: number) => void;
  /** Slightly tighter sizing for rows nested under a manager. */
  compact?: boolean;
}

/**
 * Labelled target inputs. One treatment used everywhere a target is entered, so
 * a nested row reads the same as a top-level card rather than shrinking.
 */
function TargetFields({
  userId,
  values,
  keys,
  quantityUnit,
  enabledMetrics,
  onTargetChange,
  compact,
}: TargetFieldsProps) {
  const label = 'block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5';
  const box = cn(
    'text-right font-semibold tabular-nums',
    compact ? 'h-8 w-[104px] text-sm' : 'h-10 w-[132px] text-[15px]',
  );
  return (
    <div className={cn('flex flex-wrap', compact ? 'gap-3' : 'gap-4')}>
      {enabledMetrics.quantity && (
        <div>
          <label className={label} htmlFor={`${userId}-${keys.quantity}`}>Quantity</label>
          <div className="flex items-center gap-2">
            <Input
                id={`${userId}-${keys.quantity}`}
                type="text"
                value={values.quantity > 0 ? formatNumber(values.quantity) : ''}
                onChange={(e) => onTargetChange(userId, keys.quantity, parseNumber(e.target.value))}
                placeholder="0"
              className={box}
            />
            <span className="text-xs font-medium text-muted-foreground">{quantityUnit}</span>
          </div>
        </div>
      )}

      {enabledMetrics.revenue && (
        <div>
          <label className={label} htmlFor={`${userId}-${keys.revenue}`}>Revenue (₹)</label>
          <Input
              id={`${userId}-${keys.revenue}`}
              type="text"
              value={values.revenue > 0 ? formatNumber(values.revenue) : ''}
              onChange={(e) => onTargetChange(userId, keys.revenue, parseNumber(e.target.value))}
              placeholder="0"
            className={cn(box, compact ? 'w-[120px]' : 'w-[148px]')}
          />
        </div>
      )}

      {enabledMetrics.visits && (
        <div>
          <label className={label} htmlFor={`${userId}-${keys.visits}`}>Visits</label>
          <Input
              id={`${userId}-${keys.visits}`}
              type="text"
              value={values.visits > 0 ? formatNumber(values.visits) : ''}
              onChange={(e) => onTargetChange(userId, keys.visits, Math.round(parseNumber(e.target.value)))}
              placeholder="0"
            className={cn(box, compact ? 'w-[84px]' : 'w-[104px]')}
          />
        </div>
      )}
    </div>
  );
}

/**
 * One metric row of the allocation summary.
 *
 * Until anything has been given out, this leads with the annual target itself
 * and says plainly that nothing has been distributed, rather than presenting a
 * zero against the total as though a distribution had been attempted.
 */
function AllocationMetric({
  name,
  allocated,
  total,
  format,
}: {
  name: string;
  allocated: number;
  total: number;
  format: (n: number) => string;
}) {
  const pct = total > 0 ? Math.min(100, (allocated / total) * 100) : 0;
  const over = allocated > total;
  const complete = allocated === total;
  const untouched = allocated === 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {name}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {untouched ? (
            <span className="text-[15px] font-bold text-foreground">{format(total)}</span>
          ) : (
            <>
              <span className="text-[15px] font-bold text-foreground">{format(allocated)}</span>
              {' '}of {format(total)}
            </>
          )}
        </span>
      </div>

      <Progress value={untouched ? 0 : pct} className="h-1.5" />

      <div className="flex justify-end mt-1.5">
        <span
          className={cn(
            'text-xs font-semibold tabular-nums',
            over
              ? 'text-destructive'
              : complete
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-muted-foreground',
          )}
        >
          {untouched
            ? 'Not yet distributed'
            : over
              ? `Over by ${format(allocated - total)}`
              : complete
                ? '✓ Fully allocated'
                : `${format(total - allocated)} remaining`}
        </span>
      </div>
    </div>
  );
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

  // Nothing has been given out yet for any enabled metric.
  const nothingDistributed =
    (!enabledMetrics.quantity || allocatedQty === 0) &&
    (!enabledMetrics.revenue || allocatedRev === 0) &&
    (!enabledMetrics.visits || allocatedVis === 0);

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

  /**
   * One row format for every person under a manager: identity on the left, the
   * target type picker right-aligned so the pickers line up down the column,
   * and a single target field beneath at a fixed indent. Excluded people keep
   * the row and the picker but drop the field.
   */
  const renderDirectReports = (nodes: TeamNode[]): React.ReactNode => {
    return nodes.map((node) => {
      const isSubManager = node.subordinateCount > 0;
      const nodeStrategy = node.targetStrategy || 'roll_down';
      const isExcluded = nodeStrategy === 'no_target';

      return (
        <div
          key={node.userId}
          className={cn('py-3 border-b last:border-b-0', isExcluded && 'opacity-60')}
        >
          <div className="flex items-center gap-2.5">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarFallback
                className={cn(
                  'text-[9px] font-medium',
                  isExcluded ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
                )}
              >
                {getInitials(node.fullName)}
              </AvatarFallback>
            </Avatar>

            <span
              className={cn(
                'text-sm font-medium truncate',
                isExcluded && 'text-muted-foreground line-through',
              )}
            >
              {node.fullName}
            </span>

            {isSubManager && (
              <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5 py-0 h-4 shrink-0">
                <Users className="h-2.5 w-2.5" />
                {node.subordinateCount}
              </Badge>
            )}

            <span className="ml-auto shrink-0">
              <InlineStrategySelector
                value={nodeStrategy}
                onChange={(s) => onStrategyChange(node.userId, s)}
                hasSubordinates={isSubManager}
              />
            </span>
          </div>

          {!isExcluded && (
            <div className="mt-3 pl-[38px]">
              <TargetFields
                compact
                userId={node.userId}
                keys={holdsPersonalTarget(nodeStrategy, isSubManager) ? PERSONAL_KEYS : FIELD_KEYS}
                values={
                  holdsPersonalTarget(nodeStrategy, isSubManager)
                    ? {
                        quantity: node.personalQuantityTarget || 0,
                        revenue: node.personalRevenueTarget || 0,
                        visits: node.personalVisitsTarget || 0,
                      }
                    : {
                        quantity: node.quantityTarget || 0,
                        revenue: node.revenueTarget || 0,
                        visits: node.visitsTarget || 0,
                      }
                }
                quantityUnit={quantityUnit}
                enabledMetrics={enabledMetrics}
                onTargetChange={onTargetChange}
              />
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="space-y-4">
      {/* Allocation summary */}
      <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <span className="text-sm font-semibold">Total target to distribute</span>
            {nothingDistributed && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Enter a target for each manager, or split the total by team size.
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={onEqualSplit}>
            <Users className="h-3.5 w-3.5" /> Split by Team Size
          </Button>
        </div>

        {enabledMetrics.quantity && (
          <AllocationMetric
            name={`Quantity (${quantityUnit})`}
            allocated={allocatedQty}
            total={totalQuantity}
            format={formatNumber}
          />
        )}
        {enabledMetrics.revenue && (
          <AllocationMetric
            name="Revenue"
            allocated={allocatedRev}
            total={totalRevenue}
            format={formatCurrency}
          />
        )}
        {enabledMetrics.visits && (
          <AllocationMetric
            name="Visits"
            allocated={allocatedVis}
            total={totalVisits}
            format={formatNumber}
          />
        )}
      </div>

      {/* Manager cards */}
      <div className="space-y-2.5">
        {managers.map((mgr) => {
          const isExpanded = expandedManagers.has(mgr.userId);
          const isExcluded = mgr.targetStrategy === 'no_target';

          return (
            <div
              key={mgr.userId}
              className="rounded-xl border bg-card overflow-hidden transition-colors"
            >
              <div className={cn('flex items-center gap-3 p-4', isExcluded && 'opacity-60')}>
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={mgr.profilePictureUrl || undefined} alt={mgr.fullName} />
                  <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                    {getInitials(mgr.fullName)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold truncate leading-tight">{mgr.fullName}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {mgr.designation && (
                      <span className="text-xs text-muted-foreground">{mgr.designation}</span>
                    )}
                    <Badge variant="secondary" className="text-[10px] gap-0.5 px-1.5 py-0 h-4">
                      <Users className="h-2.5 w-2.5" />{mgr.subordinateCount}
                    </Badge>
                  </div>
                </div>

                <InlineStrategySelector
                  value={mgr.targetStrategy}
                  onChange={(s) => onStrategyChange(mgr.userId, s)}
                  hasSubordinates={mgr.subordinateCount > 0}
                />
              </div>

              {/* Target inputs — hidden for no_target */}
              {isExcluded ? (
                <div className="px-4 pb-4 pl-[68px]">
                  <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                    No Target — excluded from allocation
                  </div>
                </div>
              ) : (
                <div className="px-4 pb-4 pl-[68px]">
                  <TargetFields
                    userId={mgr.userId}
                    keys={
                      holdsPersonalTarget(mgr.targetStrategy, mgr.subordinateCount > 0)
                        ? PERSONAL_KEYS
                        : FIELD_KEYS
                    }
                    values={
                      holdsPersonalTarget(mgr.targetStrategy, mgr.subordinateCount > 0)
                        ? {
                            quantity: mgr.personalQuantityTarget || 0,
                            revenue: mgr.personalRevenueTarget || 0,
                            visits: mgr.personalVisitsTarget || 0,
                          }
                        : {
                            quantity: mgr.quantityTarget,
                            revenue: mgr.revenueTarget,
                            visits: mgr.visitsTarget,
                          }
                    }
                    quantityUnit={quantityUnit}
                    enabledMetrics={enabledMetrics}
                    onTargetChange={onTargetChange}
                  />
                </div>
              )}

              {/* Reporting structure */}
              {mgr.children.length > 0 && (
                <div className="px-4 pb-4 pl-[68px]">
                  <button
                    type="button"
                    onClick={() => toggleManager(mgr.userId)}
                    aria-expanded={isExpanded}
                    className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <ChevronRight
                      className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')}
                    />
                    <span>Reporting structure ({mgr.children.length} direct)</span>
                  </button>

                  {isExpanded && (
                    <div className="mt-1 ml-1.5 border-l-2 pl-4">
                      {renderDirectReports(mgr.children)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

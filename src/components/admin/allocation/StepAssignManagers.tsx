import React from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Users, ChevronRight, Scale } from 'lucide-react';
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
  /** One equal slice per team, whatever size each team is. */
  onSplitEqually: () => void;
  /** Slices weighted by head count, so every individual ends up equal. */
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
 * on the personal keys. Both are shown and both are editable: the two added
 * together are what that manager's branch is responsible for.
 */
const PERSONAL_KEYS = {
  quantity: 'personalQuantityTarget',
  revenue: 'personalRevenueTarget',
  visits: 'personalVisitsTarget',
} as const;

/** Whether this person carries a target of their own beside their team's. */
const holdsPersonalTarget = (strategy: TargetStrategy | undefined, hasTeam: boolean) =>
  strategy === 'independent' && hasTeam;

interface MetricValues {
  quantity: number;
  revenue: number;
  visits: number;
}

/**
 * What a whole branch is responsible for — the same rule the allocation uses.
 *
 * An Independent manager's own target sits beside their team's, so the branch
 * is worth both added together. An excluded individual is worth nothing, while
 * an excluded manager is worth what their team carries, since their share
 * passes straight through to them.
 */
const branchValues = (row: {
  targetStrategy?: TargetStrategy;
  quantityTarget?: number;
  revenueTarget?: number;
  visitsTarget?: number;
  personalQuantityTarget?: number;
  personalRevenueTarget?: number;
  personalVisitsTarget?: number;
  children?: TeamNode[];
  subordinateCount?: number;
}): MetricValues => {
  const hasTeam = (row.children?.length ?? row.subordinateCount ?? 0) > 0;
  const team = {
    quantity: row.quantityTarget || 0,
    revenue: row.revenueTarget || 0,
    visits: row.visitsTarget || 0,
  };

  if (row.targetStrategy === 'no_target') {
    return hasTeam ? team : { quantity: 0, revenue: 0, visits: 0 };
  }
  if (holdsPersonalTarget(row.targetStrategy, hasTeam)) {
    return {
      quantity: team.quantity + (row.personalQuantityTarget || 0),
      revenue: team.revenue + (row.personalRevenueTarget || 0),
      visits: team.visits + (row.personalVisitsTarget || 0),
    };
  }
  return team;
};

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

interface PersonTargetsProps {
  userId: string;
  row: {
    targetStrategy?: TargetStrategy;
    quantityTarget?: number;
    revenueTarget?: number;
    visitsTarget?: number;
    personalQuantityTarget?: number;
    personalRevenueTarget?: number;
    personalVisitsTarget?: number;
  };
  hasTeam: boolean;
  quantityUnit: string;
  enabledMetrics: { quantity: boolean; revenue: boolean; visits: boolean };
  onTargetChange: (userId: string, field: string, value: number) => void;
  compact?: boolean;
}

/**
 * The target fields for one person.
 *
 * Most people carry a single figure. An Independent manager carries two — one
 * of their own and one for their team — and what they are answerable for is the
 * two added together, so both are shown side by side with that total spelled
 * out rather than left for the reader to work out.
 */
function PersonTargets({
  userId,
  row,
  hasTeam,
  quantityUnit,
  enabledMetrics,
  onTargetChange,
  compact,
}: PersonTargetsProps) {
  const teamValues = {
    quantity: row.quantityTarget || 0,
    revenue: row.revenueTarget || 0,
    visits: row.visitsTarget || 0,
  };

  if (!holdsPersonalTarget(row.targetStrategy, hasTeam)) {
    return (
      <TargetFields
        compact={compact}
        userId={userId}
        keys={FIELD_KEYS}
        values={teamValues}
        quantityUnit={quantityUnit}
        enabledMetrics={enabledMetrics}
        onTargetChange={onTargetChange}
      />
    );
  }

  const ownValues = {
    quantity: row.personalQuantityTarget || 0,
    revenue: row.personalRevenueTarget || 0,
    visits: row.personalVisitsTarget || 0,
  };
  const total = {
    quantity: teamValues.quantity + ownValues.quantity,
    revenue: teamValues.revenue + ownValues.revenue,
    visits: teamValues.visits + ownValues.visits,
  };

  const caption = 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80';

  return (
    <div className="space-y-3">
      <div>
        <p className={cn(caption, 'mb-1.5')}>Own target</p>
        <TargetFields
          compact={compact}
          userId={userId}
          keys={PERSONAL_KEYS}
          values={ownValues}
          quantityUnit={quantityUnit}
          enabledMetrics={enabledMetrics}
          onTargetChange={onTargetChange}
        />
      </div>

      <div>
        <p className={cn(caption, 'mb-1.5')}>Team target</p>
        <TargetFields
          compact={compact}
          userId={userId}
          keys={FIELD_KEYS}
          values={teamValues}
          quantityUnit={quantityUnit}
          enabledMetrics={enabledMetrics}
          onTargetChange={onTargetChange}
        />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md bg-muted/50 px-2.5 py-1.5">
        <span className={caption}>Total responsibility</span>
        {enabledMetrics.quantity && (
          <span className="text-xs font-semibold tabular-nums">
            {formatNumber(total.quantity)} {quantityUnit}
          </span>
        )}
        {enabledMetrics.revenue && (
          <span className="text-xs font-semibold tabular-nums">{formatCurrency(total.revenue)}</span>
        )}
        {enabledMetrics.visits && (
          <span className="text-xs font-semibold tabular-nums">{formatNumber(total.visits)} visits</span>
        )}
      </div>
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
  onSplitEqually,
  onEqualSplit,
}: StepAssignManagersProps) {
  // Collapsed rather than expanded, so every team is open by default however
  // long the hierarchy takes to arrive.
  const [collapsedManagers, setCollapsedManagers] = React.useState<Set<string>>(new Set());

  // Each manager counts for their whole branch, not just the figure on their
  // own row — otherwise an Independent manager's own target, and the share
  // passing through an excluded one, would both go missing from the total.
  const allocated = managers.reduce(
    (sum, manager) => {
      const branch = branchValues(manager);
      return {
        quantity: sum.quantity + branch.quantity,
        revenue: sum.revenue + branch.revenue,
        visits: sum.visits + branch.visits,
      };
    },
    { quantity: 0, revenue: 0, visits: 0 },
  );
  const { quantity: allocatedQty, revenue: allocatedRev, visits: allocatedVis } = allocated;

  // Nothing has been given out yet for any enabled metric.
  const nothingDistributed =
    (!enabledMetrics.quantity || allocatedQty === 0) &&
    (!enabledMetrics.revenue || allocatedRev === 0) &&
    (!enabledMetrics.visits || allocatedVis === 0);

  const toggleManager = (userId: string) => {
    setCollapsedManagers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  /** The disclosure for one person's own team, at any depth. */
  const renderTeamToggle = (userId: string, directCount: number, body: React.ReactNode) => {
    const isExpanded = !collapsedManagers.has(userId);
    return (
      <>
        <button
          type="button"
          onClick={() => toggleManager(userId)}
          aria-expanded={isExpanded}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')} />
          <span>Reporting structure ({directCount} direct)</span>
        </button>

        {isExpanded && <div className="mt-1 ml-1.5 border-l-2 pl-4">{body}</div>}
      </>
    );
  };

  /**
   * One row format for every person under a manager: identity on the left, the
   * target type picker right-aligned so the pickers line up down the column,
   * and a single target field beneath at a fixed indent. Excluded people keep
   * the row and the picker but drop the field.
   *
   * Anyone who manages others gets their own team nested beneath them, however
   * deep the hierarchy runs — the whole tree carries targets, so the whole tree
   * is shown rather than stopping a level below each top-level manager.
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

          {isExcluded && isSubManager && (
            <div className="mt-2 pl-[38px] text-xs text-muted-foreground">
              No Target — their share passes through to their team
            </div>
          )}

          {!isExcluded && (
            <div className="mt-3 pl-[38px]">
              <PersonTargets
                compact
                userId={node.userId}
                row={{ ...node, targetStrategy: nodeStrategy }}
                hasTeam={isSubManager}
                quantityUnit={quantityUnit}
                enabledMetrics={enabledMetrics}
                onTargetChange={onTargetChange}
              />
            </div>
          )}

          {node.children.length > 0 && (
            <div className="mt-2 pl-[38px]">
              {renderTeamToggle(node.userId, node.children.length, renderDirectReports(node.children))}
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
                Enter a target for each manager, or split the total automatically.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={onSplitEqually}
              title="Every team gets the same amount, whatever size it is"
            >
              <Scale className="h-3.5 w-3.5" /> Split Equally
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={onEqualSplit}
              title="Bigger teams get more, so every person ends up with the same"
            >
              <Users className="h-3.5 w-3.5" /> Split by Team Size
            </Button>
          </div>
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
                    {mgr.subordinateCount > 0
                      ? 'No Target — holds nothing; their share passes through to their team'
                      : 'No Target — excluded from allocation'}
                  </div>
                </div>
              ) : (
                <div className="px-4 pb-4 pl-[68px]">
                  <PersonTargets
                    userId={mgr.userId}
                    row={mgr}
                    hasTeam={mgr.subordinateCount > 0}
                    quantityUnit={quantityUnit}
                    enabledMetrics={enabledMetrics}
                    onTargetChange={onTargetChange}
                  />
                </div>
              )}

              {/* Reporting structure */}
              {mgr.children.length > 0 && (
                <div className="px-4 pb-4 pl-[68px]">
                  {renderTeamToggle(mgr.userId, mgr.children.length, renderDirectReports(mgr.children))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

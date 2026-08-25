import React from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, ChevronRight, Scale, Maximize2, Minimize2, Ban, PencilLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NumericTargetInput } from '../NumericTargetInput';
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
  designation?: string;
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
  quantityUnit: string;
  enabledMetrics: { quantity: boolean; revenue: boolean; visits: boolean };
  onTargetChange: (userId: string, field: string, value: number) => void;
  onStrategyChange: (userId: string, strategy: TargetStrategy) => void;
  /** One equal slice per team, whatever size each team is. */
  onSplitEqually: () => void;
  /** Slices weighted by head count, so every individual ends up equal. */
  onEqualSplit: () => void;
  /** On: every field below is typed by hand and stands exactly as entered — no
   *  auto-split, no cascade in either direction. Off: today's behaviour. */
  manualAllocationMode: boolean;
  onToggleManualAllocation: () => void;
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
 * The rail down the left edge of a manager's card, coloured by target type, so
 * the card says how it distributes before a word of it is read.
 */
const TYPE_RAIL: Record<TargetStrategy, string> = {
  roll_down: 'bg-blue-500 dark:bg-blue-400',
  roll_up: 'bg-emerald-500 dark:bg-emerald-400',
  independent: 'bg-amber-500 dark:bg-amber-400',
  no_target: 'bg-muted-foreground/25',
};

/** One treatment for every small-caps label on the step. */
const MICRO = 'text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground';

/* ────────────────────────────────────────────────────────────── */

interface TargetInputProps {
  id: string;
  label: string;
  value: number;
  suffix?: string;
  compact?: boolean;
  width?: string;
  onChange: (value: number) => void;
}

/**
 * A labelled target field.
 *
 * The unit is joined to the input rather than floating beside it, so the
 * control reads as one object and the numbers in a column line up.
 */
function TargetInput({ id, label, value, suffix, compact, width, onChange }: TargetInputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={cn(MICRO, 'ml-0.5')} htmlFor={id}>{label}</label>
      <div
        className={cn(
          'flex items-stretch overflow-hidden rounded-lg border border-input bg-background',
          'transition-colors focus-within:border-amber-500 focus-within:ring-[3px] focus-within:ring-amber-500/15',
        )}
      >
        <NumericTargetInput
          id={id}
          value={value}
          onValueChange={onChange}
          format={formatNumber}
          parse={parseNumber}
          placeholder="0"
          className={cn(
            'rounded-none border-0 bg-transparent text-right font-bold tabular-nums shadow-none',
            'focus-visible:ring-0 focus-visible:ring-offset-0',
            compact ? 'h-8 text-sm' : 'h-9 text-[15px]',
            width || (compact ? 'w-[104px]' : 'w-[128px]'),
          )}
        />
        {suffix && (
          <span className="flex items-center border-l border-input bg-muted/60 px-2.5 text-[11px] font-bold text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

interface TargetFieldsProps {
  userId: string;
  values: MetricValues;
  keys: { quantity: string; revenue: string; visits: string };
  labels?: { quantity: string; revenue: string; visits: string };
  quantityUnit: string;
  enabledMetrics: { quantity: boolean; revenue: boolean; visits: boolean };
  onTargetChange: (userId: string, field: string, value: number) => void;
  compact?: boolean;
}

/** Every enabled metric, as joined input groups. */
function TargetFields({
  userId,
  values,
  keys,
  labels,
  quantityUnit,
  enabledMetrics,
  onTargetChange,
  compact,
}: TargetFieldsProps) {
  return (
    <div className={cn('flex flex-wrap items-end', compact ? 'gap-3' : 'gap-4')}>
      {enabledMetrics.quantity && (
        <TargetInput
          id={`${userId}-${keys.quantity}`}
          label={labels?.quantity ?? 'Quantity target'}
          value={values.quantity}
          suffix={quantityUnit}
          compact={compact}
          onChange={(v) => onTargetChange(userId, keys.quantity, v)}
        />
      )}

      {enabledMetrics.revenue && (
        <TargetInput
          id={`${userId}-${keys.revenue}`}
          label={labels?.revenue ?? 'Revenue target'}
          value={values.revenue}
          suffix="₹"
          compact={compact}
          width={compact ? 'w-[120px]' : 'w-[144px]'}
          onChange={(v) => onTargetChange(userId, keys.revenue, v)}
        />
      )}

      {enabledMetrics.visits && (
        <TargetInput
          id={`${userId}-${keys.visits}`}
          label={labels?.visits ?? 'Visits target'}
          value={values.visits}
          compact={compact}
          width={compact ? 'w-[84px]' : 'w-[100px]'}
          onChange={(v) => onTargetChange(userId, keys.visits, Math.round(v))}
        />
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
 * two added together, so the row is laid out as that sum rather than leaving
 * the reader to do the arithmetic.
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
  const teamValues: MetricValues = {
    quantity: row.quantityTarget || 0,
    revenue: row.revenueTarget || 0,
    visits: row.visitsTarget || 0,
  };

  if (row.targetStrategy === 'no_target') {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
        <Ban className="h-3.5 w-3.5 shrink-0" />
        {hasTeam
          ? 'No target of their own — their share passes through to the team'
          : 'Excluded from the allocation'}
      </div>
    );
  }

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

  const ownValues: MetricValues = {
    quantity: row.personalQuantityTarget || 0,
    revenue: row.personalRevenueTarget || 0,
    visits: row.personalVisitsTarget || 0,
  };
  const total: MetricValues = {
    quantity: teamValues.quantity + ownValues.quantity,
    revenue: teamValues.revenue + ownValues.revenue,
    visits: teamValues.visits + ownValues.visits,
  };

  const operator = 'self-center pb-[9px] text-[15px] font-bold text-muted-foreground';

  return (
    <div className={cn('flex flex-wrap items-end', compact ? 'gap-2.5' : 'gap-3')}>
      <TargetFields
        compact={compact}
        userId={userId}
        keys={PERSONAL_KEYS}
        labels={{ quantity: 'Own target', revenue: 'Own revenue', visits: 'Own visits' }}
        values={ownValues}
        quantityUnit={quantityUnit}
        enabledMetrics={enabledMetrics}
        onTargetChange={onTargetChange}
      />

      <span className={operator} aria-hidden="true">+</span>

      <TargetFields
        compact={compact}
        userId={userId}
        keys={FIELD_KEYS}
        labels={{ quantity: 'Team target', revenue: 'Team revenue', visits: 'Team visits' }}
        values={teamValues}
        quantityUnit={quantityUnit}
        enabledMetrics={enabledMetrics}
        onTargetChange={onTargetChange}
      />

      <span className={operator} aria-hidden="true">=</span>

      <div className="flex flex-col gap-1.5">
        <span className={cn(MICRO, 'ml-0.5')}>Total responsibility</span>
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-lg border border-amber-300/70 bg-amber-50 px-3 font-extrabold tabular-nums tracking-tight text-amber-800',
            'dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300',
            compact ? 'h-8 text-sm' : 'h-9 text-[17px]',
          )}
        >
          {enabledMetrics.quantity && <span>{formatNumber(total.quantity)} {quantityUnit}</span>}
          {enabledMetrics.revenue && <span>{formatCurrency(total.revenue)}</span>}
          {enabledMetrics.visits && <span>{formatNumber(total.visits)} visits</span>}
        </div>
      </div>
    </div>
  );
}

interface PersonIdentityProps {
  fullName: string;
  designation?: string;
  profilePictureUrl?: string | null;
  teamSize: number;
  /** 0 = top-level manager card, 1 = a sub-manager, 2 = an individual. */
  scale: 0 | 1 | 2;
  excluded?: boolean;
}

/**
 * Who this row is: avatar, name, designation and team size on one line.
 *
 * Weight follows the person's place in the tree — a top-level manager is the
 * heaviest thing on the card, an individual contributor the lightest — so depth
 * is legible without reading the indentation.
 */
function PersonIdentity({
  fullName,
  designation,
  profilePictureUrl,
  teamSize,
  scale,
  excluded,
}: PersonIdentityProps) {
  const avatar = ['h-[42px] w-[42px] rounded-xl text-[13px]', 'h-8 w-8 rounded-[10px] text-[10.5px]', 'h-7 w-7 rounded-[9px] text-[9.5px]'][scale];
  const name = [
    'font-heading text-base font-semibold tracking-tight',
    'text-sm font-bold',
    'text-sm font-medium',
  ][scale];

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Avatar className={cn(avatar, 'shrink-0 border')}>
        {profilePictureUrl && <AvatarImage src={profilePictureUrl} alt={fullName} />}
        <AvatarFallback
          className={cn(
            'rounded-[inherit] font-extrabold',
            teamSize > 0
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {getInitials(fullName)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0">
        <p className={cn(name, 'truncate leading-tight', excluded && 'text-muted-foreground line-through')}>
          {fullName}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {designation && (
            <span className={cn('text-muted-foreground', scale === 0 ? 'text-xs' : 'text-[11.5px]')}>
              {designation}
            </span>
          )}
          {designation && teamSize > 0 && <span className="h-[3px] w-[3px] rounded-full bg-border" />}
          {teamSize > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-muted/60 px-1.5 py-[1px] text-[10.5px] font-bold text-muted-foreground">
              <Users className="h-2.5 w-2.5" />
              {teamSize}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function StepAssignManagers({
  managers,
  quantityUnit,
  enabledMetrics,
  onTargetChange,
  onStrategyChange,
  onSplitEqually,
  onEqualSplit,
  manualAllocationMode,
  onToggleManualAllocation,
}: StepAssignManagersProps) {
  // Collapsed rather than expanded, so every team is open by default however
  // long the hierarchy takes to arrive.
  const [collapsedManagers, setCollapsedManagers] = React.useState<Set<string>>(new Set());

  const memberCount = React.useMemo(() => {
    const countNodes = (nodes: TeamNode[]): number =>
      nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0);
    return managers.reduce((sum, m) => sum + 1 + countNodes(m.children), 0);
  }, [managers]);

  const toggleManager = (userId: string) => {
    setCollapsedManagers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const setAllCollapsed = (collapsed: boolean) => {
    if (!collapsed) {
      setCollapsedManagers(new Set());
      return;
    }
    const ids = new Set<string>();
    const walk = (nodes: TeamNode[]) => {
      nodes.forEach((node) => {
        if (node.children.length) ids.add(node.userId);
        walk(node.children);
      });
    };
    managers.forEach((manager) => {
      if (manager.children.length) ids.add(manager.userId);
      walk(manager.children);
    });
    setCollapsedManagers(ids);
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
          className={cn(
            'flex w-full items-center gap-2 py-2 text-[11.5px] font-bold uppercase tracking-[0.05em]',
            'text-muted-foreground transition-colors hover:text-foreground',
          )}
        >
          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')} />
          <span>Reporting structure · {directCount} direct</span>
          <span className="ml-1 h-px flex-1 bg-border" />
        </button>

        {isExpanded && <div className="pt-1.5">{body}</div>}
      </>
    );
  };

  /**
   * A person nested under a manager.
   *
   * Each one draws its own elbow into the spine, and the spine stops at the
   * last child, so the tree reads as a reporting line rather than a flat indent.
   */
  const renderDirectReports = (nodes: TeamNode[]): React.ReactNode =>
    nodes.map((node) => {
      const isSubManager = node.children.length > 0 || node.subordinateCount > 0;
      const nodeStrategy = node.targetStrategy || 'roll_down';
      const isExcluded = nodeStrategy === 'no_target';

      return (
        <div
          key={node.userId}
          className={cn(
            'relative pl-[30px] [&+&]:mt-2',
            // The elbow: down the spine, then a rounded turn into the card.
            'before:absolute before:left-2 before:top-0 before:h-[29px] before:w-[17px]',
            'before:rounded-bl-[9px] before:border-b-2 before:border-l-2 before:border-border before:content-[""]',
            // The spine continuing to the next sibling — absent on the last.
            'after:absolute after:left-2 after:top-[29px] after:-bottom-2 after:w-0.5 after:bg-border after:content-[""]',
            'last:after:hidden',
          )}
        >
          <div
            className={cn(
              'rounded-xl border p-3 transition-colors',
              isSubManager ? 'bg-card shadow-sm' : 'bg-muted/30 hover:bg-card',
              isExcluded && 'opacity-60',
            )}
          >
            <div className="flex flex-wrap items-center gap-3">
              <PersonIdentity
                fullName={node.fullName}
                designation={node.designation}
                teamSize={node.children.length || node.subordinateCount}
                scale={isSubManager ? 1 : 2}
                excluded={isExcluded}
              />
              <InlineStrategySelector
                value={nodeStrategy}
                onChange={(s) => onStrategyChange(node.userId, s)}
                hasSubordinates={isSubManager}
              />
            </div>

            <div className="mt-2.5 pl-[44px]">
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

            {node.children.length > 0 && (
              <div className="mt-1 pl-[44px]">
                {renderTeamToggle(node.userId, node.children.length, renderDirectReports(node.children))}
              </div>
            )}
          </div>
        </div>
      );
    });

  return (
    <div className="space-y-3">
      {/* The total-to-distribute summary that used to live here now shows only
          in the navy plan header above — same figures, one place. Its "nothing
          distributed yet" guidance is covered by that header's own caption. */}

      {manualAllocationMode && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5">
          <PencilLine className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs font-medium text-foreground">
            Manual Allocation is on — type each person's target directly below. Nothing splits or recalculates
            automatically; the figures entered here are the final allocation.
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3.5 py-2.5 shadow-sm">
        <span className="font-heading text-sm font-semibold">Reporting hierarchy</span>
        <span className="text-xs font-semibold text-muted-foreground">{memberCount} members</span>

        <span className="flex-1" />

        <Button
          variant={manualAllocationMode ? 'default' : 'outline'}
          size="sm"
          onClick={onToggleManualAllocation}
          aria-pressed={manualAllocationMode}
          title={
            manualAllocationMode
              ? 'Turn off to return to automatic splitting'
              : 'Type every target yourself — turns off automatic splitting for this hierarchy'
          }
          className={cn(
            'h-8 gap-1.5 text-xs font-bold',
            !manualAllocationMode && 'border-primary/40 text-primary hover:bg-primary/5 hover:text-primary',
          )}
        >
          <PencilLine className="h-3.5 w-3.5" />
          Manual Allocation{manualAllocationMode ? ': On' : ''}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onSplitEqually}
          disabled={manualAllocationMode}
          title={
            manualAllocationMode
              ? 'Not available while Manual Allocation is on'
              : 'Every team gets the same amount, whatever size it is'
          }
          className="h-8 gap-1.5 border-amber-300/70 bg-amber-50 text-xs font-bold text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/70 disabled:opacity-40 disabled:hover:bg-amber-50 dark:disabled:hover:bg-amber-950/40"
        >
          <Scale className="h-3.5 w-3.5" /> Split Equally
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onEqualSplit}
          disabled={manualAllocationMode}
          title={
            manualAllocationMode
              ? 'Not available while Manual Allocation is on'
              : 'Bigger teams get more, so every person ends up with the same'
          }
          className="h-8 gap-1.5 border-amber-300/70 bg-amber-50 text-xs font-bold text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/70 disabled:opacity-40 disabled:hover:bg-amber-50 dark:disabled:hover:bg-amber-950/40"
        >
          <Users className="h-3.5 w-3.5" /> Split by Team Size
        </Button>

        <Button variant="outline" size="sm" onClick={() => setAllCollapsed(false)} title="Expand all" className="h-8 w-8 p-0">
          <Maximize2 className="h-3.5 w-3.5" />
          <span className="sr-only">Expand all</span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAllCollapsed(true)} title="Collapse all" className="h-8 w-8 p-0">
          <Minimize2 className="h-3.5 w-3.5" />
          <span className="sr-only">Collapse all</span>
        </Button>
      </div>

      {/* Manager cards */}
      <div className="space-y-3">
        {managers.map((mgr) => {
          const isExcluded = mgr.targetStrategy === 'no_target';
          const hasTeam = mgr.subordinateCount > 0;

          return (
            <div
              key={mgr.userId}
              className="relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md"
            >
              {/* Target-type rail */}
              <span
                aria-hidden="true"
                className={cn('absolute inset-y-0 left-0 w-[3px]', TYPE_RAIL[mgr.targetStrategy] ?? TYPE_RAIL.roll_down)}
              />

              <div className={cn('flex flex-wrap items-center gap-3 px-[18px] py-4 pl-[21px]', isExcluded && 'opacity-60')}>
                <PersonIdentity
                  fullName={mgr.fullName}
                  designation={mgr.designation}
                  profilePictureUrl={mgr.profilePictureUrl}
                  teamSize={mgr.subordinateCount}
                  scale={0}
                  excluded={isExcluded}
                />
                <InlineStrategySelector
                  value={mgr.targetStrategy}
                  onChange={(s) => onStrategyChange(mgr.userId, s)}
                  hasSubordinates={hasTeam}
                />
              </div>

              <div className="px-[18px] pb-4 pl-[21px]">
                <PersonTargets
                  userId={mgr.userId}
                  row={mgr}
                  hasTeam={hasTeam}
                  quantityUnit={quantityUnit}
                  enabledMetrics={enabledMetrics}
                  onTargetChange={onTargetChange}
                />
              </div>

              {mgr.children.length > 0 && (
                <div className="px-[18px] pb-4 pl-[21px]">
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

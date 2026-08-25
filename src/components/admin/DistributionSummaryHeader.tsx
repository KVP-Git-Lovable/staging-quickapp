import React from 'react';
import { Card } from '@/components/ui/card';
import { Package, IndianRupee, Users, CheckCircle2, FileText, Archive, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type PlanStatus } from '@/hooks/useFYTargetPlans';

/** A metric's annual figure is either typed at plan level, following whatever
 *  is assigned to people so far, or nothing has been chosen yet — the last two
 *  render identically (there's no fixed number to show either way) until
 *  something is actually assigned. */
type TargetBasis = 'direct' | 'derived' | 'unset';

interface DistributionSummaryHeaderProps {
  targetPlanName: string;
  fyYear: number;
  isLocked?: boolean;
  planStatus?: PlanStatus;
  enabledMetrics: {
    quantity: boolean;
    revenue: boolean;
    visits: boolean;
  };
  quantityUnit: string;
  /** null = no annual figure exists for this metric yet. */
  totalQuantity: number | null;
  totalRevenue: number | null;
  totalVisits: number | null;
  quantityBasis?: TargetBasis;
  revenueBasis?: TargetBasis;
  visitsBasis?: TargetBasis;
  /** How many people already have something assigned, out of the org's whole
   *  headcount — shown while the annual figure is still following them rather
   *  than fixed. */
  assignedCoverage?: { count: number; total: number };
  allocatedQuantity: number;
  allocatedRevenue: number;
  allocatedVisits: number;
  selectedUserName?: string;
  /** The allocation wizard's position, shown as the strip along the bottom. */
  currentStep?: number;
  steps?: { id: number; title: string }[];
  /** False while a manager and their team disagree somewhere in the tree. */
  isBalanced?: boolean;
}

const formatNumber = (num: number) => new Intl.NumberFormat('en-IN').format(num);

const formatCurrency = (num: number) => {
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`;
  return `₹${formatNumber(num)}`;
};

const STATUS_CHIP: Record<string, { label: string; icon: React.ElementType; tone: string }> = {
  draft: { label: 'Draft', icon: FileText, tone: 'text-slate-300 border-white/15 bg-white/5' },
  active: { label: 'Active', icon: CheckCircle2, tone: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10' },
  closed: { label: 'Closed', icon: Archive, tone: 'text-slate-400 border-white/10 bg-white/5' },
};

/** The brand navy, stated outright: `--primary` flips to gold in dark mode. */
const NAVY = 'bg-[hsl(220_39%_11%)] dark:bg-[hsl(220_33%_13%)]';

const CHIP = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold';
const MICRO = 'text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400';

/**
 * Grid-column count for the per-metric strip, keyed by how many metrics are
 * actually enabled.
 *
 * Tailwind classes have to exist as literal strings for the build to keep
 * them, so the column count can't be interpolated (`sm:grid-cols-${n}`) —
 * this lookup is the dynamic equivalent. A grid fixed at 3 columns while only
 * 2 metrics are enabled left a blank third cell's worth of space in the row;
 * matching the column count to what is actually enabled is what removes it.
 */
const METRIC_GRID_COLS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
};

export function DistributionSummaryHeader({
  targetPlanName,
  fyYear,
  isLocked,
  planStatus,
  enabledMetrics,
  quantityUnit,
  totalQuantity,
  totalRevenue,
  totalVisits,
  quantityBasis = 'direct',
  revenueBasis = 'direct',
  visitsBasis = 'direct',
  assignedCoverage,
  allocatedQuantity,
  allocatedRevenue,
  allocatedVisits,
  selectedUserName,
  currentStep,
  steps,
  isBalanced = true,
}: DistributionSummaryHeaderProps) {
  const metrics = [
    {
      enabled: enabledMetrics.quantity,
      label: 'Quantity',
      icon: Package,
      total: totalQuantity,
      basis: quantityBasis,
      allocated: allocatedQuantity,
      unit: quantityUnit,
      format: formatNumber,
    },
    {
      enabled: enabledMetrics.revenue,
      label: 'Revenue',
      icon: IndianRupee,
      total: totalRevenue,
      basis: revenueBasis,
      allocated: allocatedRevenue,
      unit: '',
      format: formatCurrency,
    },
    {
      enabled: enabledMetrics.visits,
      label: 'Visits',
      icon: Users,
      total: totalVisits,
      basis: visitsBasis,
      allocated: allocatedVisits,
      unit: 'visits',
      format: formatNumber,
    },
  ].filter(m => m.enabled);

  // The headline follows the first enabled metric; the strip below carries the
  // rest when more than one is in play.
  const lead = metrics[0];
  const notSet = !!lead && lead.total === null;
  const distributionPercent = lead && lead.total !== null && lead.total > 0
    ? Math.min(100, Math.round((lead.allocated / lead.total) * 100))
    : 0;

  const untouched = metrics.every(m => m.allocated === 0);
  const complete = metrics.every(m => m.total !== null && m.allocated === m.total) && !untouched && isBalanced;
  const over = metrics.some(m => m.total !== null && m.allocated > m.total);

  const tone = notSet
    ? { fig: 'text-slate-400', bar: 'bg-white/10', cap: 'text-slate-400' }
    : untouched
      ? { fig: 'text-slate-100', bar: 'bg-[hsl(35_65%_55%)]', cap: 'text-slate-400' }
      : complete
        ? { fig: 'text-emerald-300', bar: 'bg-emerald-400', cap: 'text-emerald-300' }
        : { fig: 'text-rose-300', bar: 'bg-rose-400', cap: 'text-rose-300' };

  const caption = (() => {
    if (notSet) {
      return assignedCoverage && assignedCoverage.count > 0
        ? `Following ${assignedCoverage.count} of ${assignedCoverage.total} people assigned so far`
        : 'Not set yet — start assigning below, nothing here blocks you';
    }
    if (untouched) return 'Nothing distributed yet';
    if (complete) return '100% allocated · every level reconciled';
    if (over && lead && lead.total !== null) return `Over the annual target by ${lead.format(lead.allocated - lead.total)}`;
    if (lead && lead.total !== null && lead.allocated < lead.total) return `${lead.format(lead.total - lead.allocated)} still to allocate`;
    return 'Totals match, but a manager and their team disagree below';
  })();

  const effectiveStatus = planStatus || (isLocked ? 'active' : 'draft');
  const statusChip = STATUS_CHIP[effectiveStatus] || STATUS_CHIP.draft;
  const StatusIcon = statusChip.icon;

  return (
    <Card className={cn('overflow-hidden border-0 shadow-lg', NAVY)}>
      {/* A gold rule across the top, fading out — the plan's own accent. */}
      <div className="h-[3px] bg-gradient-to-r from-[hsl(35_65%_55%)] via-[hsl(35_65%_55%)]/25 to-transparent" />

      {/* Plan identity */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pb-3 pt-4">
        <h3 className="font-heading text-[17px] font-semibold tracking-tight text-slate-50">
          {targetPlanName || 'FY Sales Plan'}
        </h3>

        <span className={cn(CHIP, statusChip.tone)}>
          <StatusIcon className="h-3 w-3" />
          {statusChip.label}
        </span>

        <span className={cn(CHIP, 'border-white/10 bg-white/5 text-slate-300')}>
          FY {fyYear - 1}-{String(fyYear).slice(-2)}
        </span>

        {selectedUserName && (
          <>
            <span className="h-4 w-px bg-white/15" />
            <span className="text-[13px] text-slate-400">
              Allocating for <span className="font-bold text-slate-100">{selectedUserName}</span>
            </span>
          </>
        )}

        <span className="flex-1" />

        {enabledMetrics.quantity && (
          <span className={cn(CHIP, 'border-white/10 bg-white/5 text-slate-300')}>
            Quantity · {quantityUnit}
          </span>
        )}
      </div>

      {/* Headline figures */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 px-5 pb-4">
        {lead && (
          <>
            {/* The one place this figure is shown — StepAssignManagers used to
                carry its own "Total target to distribute" summary alongside this. */}
            <div className="flex flex-col gap-0.5">
              <span className={MICRO}>
                Total target to distribute
                {!notSet && lead.basis === 'derived' && (
                  <span className="ml-1.5 inline-flex items-center rounded-full border border-[hsl(35_65%_55%)]/30 bg-[hsl(35_65%_55%)]/10 px-1.5 py-0 text-[9px] font-bold normal-case tracking-normal text-[hsl(35_65%_65%)]">
                    derived
                  </span>
                )}
              </span>
              {notSet ? (
                <span className="text-[17px] font-bold italic leading-tight text-slate-400">Not set yet</span>
              ) : (
                <span className="text-[23px] font-extrabold leading-tight tracking-tight tabular-nums text-slate-50">
                  {lead.format(lead.total as number)}
                  {lead.unit && <span className="ml-1 text-[12.5px] font-bold text-slate-400">{lead.unit}</span>}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-0.5">
              <span className={MICRO}>Distributed</span>
              <span className={cn('text-[23px] font-extrabold leading-tight tracking-tight tabular-nums', tone.fig)}>
                {lead.format(lead.allocated)}
                {lead.unit && <span className="ml-1 text-[12.5px] font-bold text-slate-400">{lead.unit}</span>}
              </span>
            </div>
          </>
        )}

        <div className="flex min-w-[190px] flex-1 flex-col gap-1.5 pb-1">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn('h-full rounded-full transition-[width] duration-500', tone.bar)}
              style={{ width: `${untouched ? 0 : distributionPercent}%` }}
            />
          </div>
          <span className={cn('text-[11.5px] font-semibold', tone.cap)}>{caption}</span>
        </div>
      </div>

      {/* Per-metric breakdown, when more than one metric is in play. The column
          count tracks exactly how many metrics are enabled, so a 2-metric plan
          gets a 2-column row rather than 2 cards in a 3-column grid with a
          blank third cell. */}
      {metrics.length > 1 && (
        <div
          className={cn(
            'grid grid-cols-1 gap-px border-t border-white/10 bg-white/10',
            METRIC_GRID_COLS[metrics.length] ?? METRIC_GRID_COLS[3],
          )}
        >
          {metrics.map(metric => {
            const MetricIcon = metric.icon;
            const metricNotSet = metric.total === null;
            const remaining = metricNotSet ? 0 : (metric.total as number) - metric.allocated;
            const isOver = !metricNotSet && remaining < 0;
            const pct = !metricNotSet && (metric.total as number) > 0
              ? Math.round((metric.allocated / (metric.total as number)) * 100)
              : 0;

            return (
              <div key={metric.label} className={cn('px-5 py-3', NAVY)}>
                <div className="flex items-center gap-2">
                  <MetricIcon className="h-3.5 w-3.5 text-slate-400" />
                  <span className={MICRO}>{metric.label}</span>
                  <span className="ml-auto text-[11px] font-bold tabular-nums text-slate-400">
                    {metricNotSet ? '—' : `${pct}%`}
                  </span>
                </div>
                <p className="mt-1 text-[15px] font-extrabold tabular-nums text-slate-100">
                  {metric.format(metric.allocated)}
                  <span className="ml-1 text-[11.5px] font-semibold text-slate-500">
                    {metricNotSet ? 'assigned so far' : `of ${metric.format(metric.total as number)}`}
                  </span>
                </p>
                <p
                  className={cn(
                    'mt-0.5 text-[11px] font-bold',
                    metricNotSet
                      ? 'text-slate-500'
                      : isOver ? 'text-rose-300' : remaining === 0 ? 'text-emerald-300' : 'text-slate-400',
                  )}
                >
                  {metricNotSet
                    ? (metric.basis === 'derived' ? 'Derived — following what\'s assigned' : 'Target not set')
                    : isOver
                      ? `Over by ${metric.format(Math.abs(remaining))}`
                      : remaining === 0
                        ? 'Fully allocated'
                        : `${metric.format(remaining)} left`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Wizard steps */}
      {steps && steps.length > 0 && (
        <div className="flex border-t border-white/10 bg-black/20">
          {steps.map(step => {
            const done = currentStep !== undefined && currentStep > step.id;
            const here = currentStep === step.id;

            return (
              <div
                key={step.id}
                className={cn(
                  'flex flex-1 items-center gap-2.5 border-r border-white/10 px-5 py-2.5 last:border-r-0',
                  here && 'bg-[hsl(35_65%_55%)]/[0.14]',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold',
                    here
                      ? 'bg-[hsl(35_65%_55%)] text-[hsl(220_39%_11%)]'
                      : done
                        ? 'bg-emerald-400/15 text-emerald-300'
                        : 'bg-white/10 text-slate-400',
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : step.id}
                </span>
                <span
                  className={cn(
                    'truncate text-[12.5px] font-bold',
                    here ? 'text-slate-50' : done ? 'text-slate-300' : 'text-slate-400',
                  )}
                >
                  {step.title}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

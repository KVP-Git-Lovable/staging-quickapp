import React from 'react';
import { cn } from '@/lib/utils';
import { ArrowUpCircle, ArrowDownCircle, Minus, Users, AlertTriangle, Ban, ChevronDown, Check } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

export type TargetStrategy = 'roll_down' | 'roll_up' | 'independent' | 'no_target';
export type SplitMethod = 'equal' | 'percentage' | 'manual';

interface TargetStrategySelectorProps {
  value: TargetStrategy;
  onChange: (strategy: TargetStrategy) => void;
  managerName?: string;
}

interface InlineStrategySelectorProps {
  value: TargetStrategy;
  onChange: (strategy: TargetStrategy) => void;
  disabled?: boolean;
  /**
   * Whether this employee has anyone reporting to them. When false, Roll Down
   * and Roll Up are hidden: both describe how a target moves between a manager
   * and their team, so neither applies to someone without one.
   */
  hasSubordinates?: boolean;
}

export interface LevelInfo {
  level: number;
  userCount: number;
  managerCount: number;
  users?: Array<{ fullName: string; designation?: string }>;
}

interface LevelStrategyConfigProps {
  levels: LevelInfo[];
  levelStrategies: Map<number, TargetStrategy>;
  onLevelStrategyChange: (level: number, strategy: TargetStrategy) => void;
  splitMethod: SplitMethod;
  onSplitMethodChange: (method: SplitMethod) => void;
  onAutoCalculate: () => void;
  isCalculating?: boolean;
}

const strategies: { value: TargetStrategy; label: string; description: string; icon: React.ElementType }[] = [
  {
    value: 'roll_down',
    label: 'Roll Down',
    description: "Manager's target is distributed to subordinates. Subordinate targets are derived from the manager's total.",
    icon: ArrowDownCircle,
  },
  {
    value: 'roll_up',
    label: 'Roll Up',
    description: "Manager's target is auto-calculated as the sum of subordinate targets. Subordinates set their own targets.",
    icon: ArrowUpCircle,
  },
  {
    value: 'independent',
    label: 'Independent',
    description: "Manager has their own separate target. Subordinate targets are set independently and don't affect the manager's target.",
    icon: Minus,
  },
  {
    value: 'no_target',
    label: 'No Target',
    description: "This user has no target assigned. They are excluded from target distribution calculations.",
    icon: Ban,
  },
];

const strategyIcons: Record<TargetStrategy, React.ElementType> = {
  roll_down: ArrowDownCircle,
  roll_up: ArrowUpCircle,
  independent: Minus,
  no_target: Ban,
};

const strategyLabels: Record<TargetStrategy, string> = {
  roll_down: 'Roll Down',
  roll_up: 'Roll Up',
  independent: 'Independent',
  no_target: 'No Target',
};

const strategyColors: Record<TargetStrategy, string> = {
  roll_down: 'text-blue-600 dark:text-blue-400',
  roll_up: 'text-emerald-600 dark:text-emerald-400',
  independent: 'text-amber-600 dark:text-amber-400',
  no_target: 'text-muted-foreground',
};

/**
 * The trigger reads as a status as much as a control: each target type carries
 * its own tint and border, so a row's type is legible at a glance down a long
 * hierarchy rather than only on inspection.
 */
const strategyPills: Record<TargetStrategy, string> = {
  roll_down:
    'text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100 dark:text-blue-300 dark:border-blue-500/30 dark:bg-blue-950/40 dark:hover:bg-blue-950/70',
  roll_up:
    'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-300 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/70',
  independent:
    'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-500/30 dark:bg-amber-950/40 dark:hover:bg-amber-950/70',
  no_target:
    'text-muted-foreground border-border bg-muted/60 hover:bg-muted',
};

/**
 * Short, plain-language explanations shown next to each option in the picker.
 * Independent reads differently for someone with a team than for someone
 * without one, so it carries both wordings.
 */
const shortDescriptions: Record<TargetStrategy, string> = {
  roll_down: "Split this person's target among their team.",
  roll_up: "Add up the team's targets to get this person's.",
  independent: 'Has their own target, separate from the team.',
  no_target: 'No target assigned. Left out of all distribution.',
};

const soloIndependentDescription = 'Carries their own target.';

/** The options offered for an employee, given whether they have a team. */
const strategyOptionsFor = (hasSubordinates: boolean): TargetStrategy[] =>
  hasSubordinates
    ? ['roll_down', 'roll_up', 'independent', 'no_target']
    : ['independent', 'no_target'];

// Full card-based selector for top-level usage
export function TargetStrategySelector({ value, onChange, managerName }: TargetStrategySelectorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Target Strategy</span>
        {managerName && (
          <span className="text-xs text-muted-foreground">for {managerName}</span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {strategies.map((strategy) => {
          const Icon = strategy.icon;
          const isSelected = value === strategy.value;
          return (
            <button
              key={strategy.value}
              onClick={() => onChange(strategy.value)}
              className={cn(
                'flex flex-col items-start gap-1.5 p-3 rounded-lg border text-left transition-all',
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border hover:border-primary/40 hover:bg-muted/50'
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className={cn(
                  'h-4 w-4',
                  isSelected ? 'text-primary' : 'text-muted-foreground'
                )} />
                <span className={cn(
                  'text-sm font-medium',
                  isSelected ? 'text-primary' : 'text-foreground'
                )}>
                  {strategy.label}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {strategy.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Per-employee target assignment picker.
 *
 * Shows the current choice as a compact pill; clicking opens a short list of
 * options, each with a one-line explanation. Employees with no subordinates are
 * offered only Independent and No Target — Roll Down and Roll Up never appear
 * for them, since both describe moving a target between a manager and a team.
 */
export function InlineStrategySelector({
  value,
  onChange,
  disabled,
  hasSubordinates = true,
}: InlineStrategySelectorProps) {
  const [open, setOpen] = React.useState(false);
  const options = strategyOptionsFor(hasSubordinates);

  // A stored Roll Down/Roll Up on someone who no longer has a team reads as
  // Independent rather than showing an option that is not on offer.
  const effective: TargetStrategy =
    options.includes(value) ? value : 'independent';
  const Icon = strategyIcons[effective];

  const describe = (strategy: TargetStrategy) =>
    strategy === 'independent' && !hasSubordinates
      ? soloIndependentDescription
      : shortDescriptions[strategy];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Target assignment: ${strategyLabels[effective]}`}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold',
            'transition-colors hover:shadow-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            strategyPills[effective],
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span>{strategyLabels[effective]}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[276px] p-1.5">
        <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Target assignment
        </p>

        {options.map((strategy) => {
          const OptionIcon = strategyIcons[strategy];
          const isSelected = strategy === effective;
          return (
            <button
              key={strategy}
              type="button"
              onClick={() => {
                onChange(strategy);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-start gap-2 px-2 py-2 rounded-md text-left transition-colors',
                isSelected ? 'bg-muted' : 'hover:bg-muted/60',
              )}
            >
              <OptionIcon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', strategyColors[strategy])} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">{strategyLabels[strategy]}</span>
                  {isSelected && <Check className="h-3 w-3 text-primary shrink-0" />}
                </span>
                <span className="block text-[11px] text-muted-foreground leading-snug mt-0.5">
                  {describe(strategy)}
                </span>
              </span>
            </button>
          );
        })}

        {!hasSubordinates && (
          <p className="px-2 pt-1.5 pb-1 text-[10px] text-muted-foreground leading-snug border-t mt-1">
            No one reports to this employee, so Roll Down and Roll Up do not apply.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Strategy badge for displaying in org tree
export function StrategyBadge({ strategy }: { strategy: TargetStrategy }) {
  const Icon = strategyIcons[strategy];
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(
            'inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full border',
            strategy === 'roll_up' && 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400',
            strategy === 'roll_down' && 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400',
            strategy === 'independent' && 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400',
            strategy === 'no_target' && 'bg-muted/50 border-border text-muted-foreground',
          )}>
            <Icon className="h-2.5 w-2.5" />
            {strategyLabels[strategy]}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <p className="text-xs">
            {strategies.find(s => s.value === strategy)?.description}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// NEW: Level-wise strategy configuration panel
export function LevelStrategyConfig({
  levels,
  levelStrategies,
  onLevelStrategyChange,
  splitMethod,
  onSplitMethodChange,
  onAutoCalculate,
  isCalculating,
}: LevelStrategyConfigProps) {
  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Configure Target Distribution</span>
      </div>

      {/* Level-wise strategy */}
      <div className="space-y-3">
        {levels.map((lvl) => {
          const strategy = levelStrategies.get(lvl.level) || 'roll_down';
          const Icon = strategyIcons[strategy];
          return (
            <div key={lvl.level} className="space-y-1.5">
              <div className="flex items-center gap-3 py-1.5">
                <Badge variant="outline" className="text-xs min-w-[40px] justify-center">
                  L{lvl.level}
                </Badge>
                <span className="text-sm text-muted-foreground min-w-[80px]">
                  {lvl.userCount} user{lvl.userCount !== 1 ? 's' : ''}
                  {lvl.managerCount > 0 && (
                    <span className="text-[10px]"> ({lvl.managerCount} mgr{lvl.managerCount !== 1 ? 's' : ''})</span>
                  )}
                </span>
                <Select
                  value={strategy}
                  onValueChange={(v) => onLevelStrategyChange(lvl.level, v as TargetStrategy)}
                >
                  <SelectTrigger className={cn(
                    "h-8 w-[140px] text-xs gap-1.5",
                    strategyColors[strategy]
                  )}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {strategies.map((s) => {
                      const SIcon = s.icon;
                      return (
                        <SelectItem key={s.value} value={s.value} className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <SIcon className={cn('h-3.5 w-3.5', strategyColors[s.value])} />
                            <span>{s.label}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              {/* User names chips */}
              {lvl.users && lvl.users.length > 0 && (
                <div className="flex flex-wrap gap-1 ml-[52px]">
                  {lvl.users.map((u, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground"
                    >
                      {u.fullName}
                      {u.designation && (
                        <span className="text-[9px] opacity-70">· {u.designation}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Root user info note */}
      <div className="flex items-start gap-2 p-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
        <AlertTriangle className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-snug">
          The root user distributes targets but does not hold a personal target.
        </p>
      </div>

      {/* Split method */}
      <div className="flex items-center gap-3 pt-2 border-t">
        <span className="text-sm text-muted-foreground">Split Method:</span>
        <div className="flex gap-1">
          {([
            { value: 'equal' as SplitMethod, label: 'Equal Split', desc: 'Divide equally among children' },
            { value: 'percentage' as SplitMethod, label: 'Percentage', desc: 'Distribute by percentage' },
            { value: 'manual' as SplitMethod, label: 'Manual', desc: 'Enter values manually' },
          ]).map((m) => (
            <button
              key={m.value}
              onClick={() => onSplitMethodChange(m.value)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-all border',
                splitMethod === m.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border hover:border-primary/40 text-muted-foreground hover:text-foreground'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Auto-calculate button */}
      <button
        onClick={onAutoCalculate}
        disabled={isCalculating}
        className={cn(
          'w-full py-2.5 rounded-lg text-sm font-semibold transition-all',
          'bg-primary text-primary-foreground hover:bg-primary/90',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {isCalculating ? 'Calculating…' : '⚡ Auto-Calculate & Preview'}
      </button>
    </div>
  );
}

import React from 'react';
import { startOfDay, subDays, subMonths } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type RangePreset = 'all' | 'day' | 'week' | 'month' | 'custom';

export interface CustomRange {
  from: string;
  to: string;
}

export function getRangeStart(preset: RangePreset): Date | null {
  const now = new Date();
  switch (preset) {
    case 'day':
      return startOfDay(now);
    case 'week':
      return subDays(now, 7);
    case 'month':
      return subMonths(now, 1);
    default:
      return null;
  }
}

export function isWithinRange(
  dateStr: string,
  preset: RangePreset,
  custom: CustomRange
): boolean {
  if (preset === 'all') return true;
  const d = new Date(dateStr);
  if (preset === 'custom') {
    if (custom.from && d < new Date(`${custom.from}T00:00:00`)) return false;
    if (custom.to && d > new Date(`${custom.to}T23:59:59`)) return false;
    return true;
  }
  const start = getRangeStart(preset);
  return !start || d >= start;
}

interface Props {
  preset: RangePreset;
  onPresetChange: (p: RangePreset) => void;
  custom: CustomRange;
  onCustomChange: (c: CustomRange) => void;
}

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'custom', label: 'Custom' },
];

export const NotificationDateFilter: React.FC<Props> = ({
  preset,
  onPresetChange,
  custom,
  onCustomChange,
}) => (
  <div className="flex items-center gap-2 flex-wrap">
    <div className="flex gap-1">
      {PRESETS.map(p => (
        <Button
          key={p.key}
          size="sm"
          variant={preset === p.key ? 'default' : 'outline'}
          onClick={() => onPresetChange(p.key)}
        >
          {p.label}
        </Button>
      ))}
    </div>
    {preset === 'custom' && (
      <div className="flex items-center gap-1">
        <Input
          type="date"
          value={custom.from}
          onChange={(e) => onCustomChange({ ...custom, from: e.target.value })}
          className="h-9 w-[140px]"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          value={custom.to}
          onChange={(e) => onCustomChange({ ...custom, to: e.target.value })}
          className="h-9 w-[140px]"
        />
      </div>
    )}
  </div>
);

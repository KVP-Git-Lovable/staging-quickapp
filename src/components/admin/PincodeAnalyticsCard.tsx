import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { BarChart3, Eye, EyeOff } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Retailer {
  id: number;
  category: string | null;
  match_score: number | null;
  is_converted: boolean;
}

interface PincodeAnalyticsCardProps {
  retailers: Retailer[];
}

import { getMatchTier } from '@/utils/retailerMatchTier';

const SCORE_COLORS: Record<string, string> = {
  'Excellent (≥70)': 'hsl(var(--success))',
  'Good (50–69)': 'hsl(110 55% 65%)',
  'Fair (30–49)': 'hsl(var(--warning))',
  'Low (<30)': 'hsl(var(--destructive))',
  Unscored: 'hsl(var(--muted-foreground))',
};

export function PincodeAnalyticsCard({ retailers }: PincodeAnalyticsCardProps) {
  const [visible, setVisible] = useState(false);

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};

    retailers.forEach((retailer) => {
      const category = retailer.category || 'Uncategorized';
      map[category] = (map[category] || 0) + 1;
    });

    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [retailers]);

  const scoreData = useMemo(() => {
    const counts = { excellent: 0, good: 0, fair: 0, low: 0, unscored: 0 };
    retailers.forEach((retailer) => {
      counts[getMatchTier(retailer.match_score).key] += 1;
    });
    return [
      { name: 'Excellent (≥70)', value: counts.excellent },
      { name: 'Good (50–69)', value: counts.good },
      { name: 'Fair (30–49)', value: counts.fair },
      { name: 'Low (<30)', value: counts.low },
      { name: 'Unscored', value: counts.unscored },
    ].filter((item) => item.value > 0);
  }, [retailers]);

  const convertedCount = useMemo(
    () => retailers.filter((retailer) => retailer.is_converted).length,
    [retailers]
  );

  const conversionPct = useMemo(() => {
    if (!retailers.length) return '0.0';
    return ((convertedCount / retailers.length) * 100).toFixed(1);
  }, [convertedCount, retailers.length]);

  if (!retailers.length) return null;

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BarChart3 className="h-4 w-4 text-warning" />
          <span>Pincode Analytics</span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? (
            <>
              <EyeOff className="h-3.5 w-3.5" /> Hide
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5" /> Show
            </>
          )}
        </Button>
      </div>

      {visible && (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1.5fr_1fr_0.8fr]">
          <div className="rounded-md border border-border/50 bg-background/70 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">External retailers by category</p>
            <ResponsiveContainer width="100%" height={Math.max(140, categoryData.length * 32)}>
              <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 4 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  interval={0}
                  tickLine={false}
                />
                <Tooltip cursor={{ fill: 'hsl(var(--accent))' }} />
                <Bar dataKey="count" fill="hsl(var(--warning))" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-md border border-border/50 bg-background/70 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">External retailers by score</p>
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie
                  data={scoreData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={60}
                  innerRadius={32}
                  paddingAngle={2}
                >
                  {scoreData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={SCORE_COLORS[entry.name as keyof typeof SCORE_COLORS]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-col items-center justify-center rounded-md border border-border/50 bg-background/70 p-3 text-center">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Conversion score</p>
            <span className="text-4xl font-bold text-warning">{conversionPct}%</span>
            <p className="mt-2 text-xs text-muted-foreground">
              {convertedCount} of {retailers.length} retailers converted
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

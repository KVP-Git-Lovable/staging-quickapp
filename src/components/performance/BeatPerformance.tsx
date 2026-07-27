import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Route, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { PerformanceData } from '@/hooks/usePerformanceSummary';

interface BeatPerformanceProps {
  beats: PerformanceData[];
  quantityUnit: string;
  isLoading?: boolean;
}

export function BeatPerformance({ beats, quantityUnit, isLoading }: BeatPerformanceProps) {
  const navigate = useNavigate();
  const { format, displayCurrency } = useCurrency();

  const formatCurrency = (amount: number): string => {
    if (displayCurrency !== 'INR') return format(amount);
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return format(amount);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            Beat Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (beats.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            Beat Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No beat activity in this period. Orders will appear here when placed.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Sort by revenue (actual) descending
  const sortedBeats = [...beats].sort((a, b) => b.revenueActual - a.revenueActual);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route className="h-5 w-5 text-primary" />
          Beat Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Beat</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Quantity ({quantityUnit})</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedBeats.slice(0, 10).map((beat, index) => (
                <TableRow 
                  key={beat.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/beat/${beat.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                        index === 0 ? "bg-yellow-100 text-yellow-700" :
                        index === 1 ? "bg-gray-100 text-gray-700" :
                        index === 2 ? "bg-orange-100 text-orange-700" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {index + 1}
                      </span>
                      <span className="font-medium text-primary hover:underline flex items-center gap-1">
                        {beat.name}
                        <ExternalLink className="h-3 w-3 opacity-50" />
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {beat.revenueTarget > 0 ? formatCurrency(beat.revenueTarget) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(beat.revenueActual)}</TableCell>
                  <TableCell className="text-right">{beat.quantityActual.toFixed(0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {beats.length > 10 && (
          <div className="p-3 text-center text-sm text-muted-foreground border-t">
            Showing top 10 of {beats.length} beats
          </div>
        )}
      </CardContent>
    </Card>
  );
}

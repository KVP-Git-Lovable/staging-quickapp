import { CardContent, CardHeader } from '@/components/ui/card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, MapPin, RefreshCw, ExternalLink, ChevronDown, Clock } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { usePincodeTopRetailers, type TopRetailer } from '@/hooks/usePincodeTopRetailers';
import { formatDistanceToNow } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface Props {
  pincode: string;
}

export function PincodeTopRetailersPanel({ pincode }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden border-[hsl(210_85%_55%)]/30">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full text-left transition-colors bg-gradient-to-r from-[hsl(210_85%_55%)]/15 via-[hsl(140_60%_45%)]/10 to-[hsl(45_95%_55%)]/15 hover:from-[hsl(210_85%_55%)]/25 hover:via-[hsl(140_60%_45%)]/20 hover:to-[hsl(45_95%_55%)]/25"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-full bg-background/80 border border-border flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-4 w-4 text-[hsl(210_85%_45%)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {open ? `Top Retailers in ${pincode}` : `Click here to view Top retailers in ${pincode}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Nearby supermarkets & grocery stores · powered by Google Maps
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <TopRetailersContent pincode={pincode} />
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function OpenStatusPill({ openNow }: { openNow: boolean | null }) {
  if (openNow === null) return null;
  if (openNow) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-700 dark:text-green-400">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Open
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-700 dark:text-red-400">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Closed
    </span>
  );
}

function HoursBlock({ retailer }: { retailer: TopRetailer }) {
  const [hoursOpen, setHoursOpen] = useState(false);
  const weekday = retailer.opening_hours?.weekday_text;

  if (!weekday || weekday.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground italic mt-1">Timings not available</p>
    );
  }

  // JS getDay: 0=Sun..6=Sat. Google weekday_text starts with Monday at index 0.
  const jsDay = new Date().getDay();
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1;

  return (
    <Collapsible open={hoursOpen} onOpenChange={setHoursOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          <Clock className="h-3 w-3" />
          <span>Hours</span>
          <ChevronDown className={cn('h-3 w-3 transition-transform', hoursOpen && 'rotate-180')} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent onClick={(e) => e.stopPropagation()}>
        <div className="mt-1.5 pl-4 border-l-2 border-border space-y-0.5">
          {weekday.map((line, i) => (
            <p
              key={i}
              className={cn(
                'text-[10px] text-muted-foreground',
                i === todayIdx && 'font-semibold text-foreground'
              )}
            >
              {line}
            </p>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function TopRetailersContent({ pincode }: Props) {
  const { data, isLoading, isError, error } = usePincodeTopRetailers(pincode);
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { error: invErr } = await supabase.functions.invoke('get-pincode-top-retailers', {
        body: { pincode, refresh: true },
      });
      if (invErr) throw invErr;
      await qc.invalidateQueries({ queryKey: ['pincode-top-retailers', pincode] });
      toast.success('Top retailers refreshed');
    } catch (e: any) {
      toast.error(e?.message || 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  const fetchedAt = data?.fetched_at ? new Date(data.fetched_at) : null;
  const retailers = data?.retailers ?? [];

  return (
    <>
      <CardHeader className="pb-3 pt-3">
        <div className="flex items-center justify-end gap-2">
          {fetchedAt && (
            <Badge variant="secondary" className="text-[10px]">
              {data?.cached ? 'Cached' : 'Fresh'} · {formatDistanceToNow(fetchedAt, { addSuffix: true })}
            </Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={handleRefresh}
            disabled={refreshing || isLoading}
            title="Refresh from Google"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : isError ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Couldn't load retailers. {(error as any)?.message || 'Please try again.'}
          </div>
        ) : retailers.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No retailers found for PIN {pincode}.
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground px-0.5">
              Showing top {retailers.length} — scroll for more
            </p>
            <div className="relative">
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {retailers.map((r) => (
                <a
                  key={`${r.rank}-${r.place_id}`}
                  href={r.place_id
                    ? `https://www.google.com/maps/place/?q=place_id:${r.place_id}`
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + ' ' + pincode)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start justify-between gap-2 p-2.5 bg-muted/40 hover:bg-muted/70 border border-border rounded-md transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-muted-foreground">#{r.rank}</span>
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      <OpenStatusPill openNow={r.open_now} />
                    </div>
                    {r.address && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{r.address}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      {r.rating != null && (
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                          <span className="text-[11px]">{r.rating.toFixed(1)}</span>
                          {r.user_ratings_total != null && (
                            <span className="text-[10px] text-muted-foreground">
                              ({r.user_ratings_total})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <HoursBlock retailer={r} />
                  </div>
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                </a>
              ))}
            </div>
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent" />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2 gap-2"
              onClick={() => window.open(`https://www.google.com/maps/search/supermarket+${pincode}/`, '_blank')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View all on Google Maps
            </Button>
          </>
        )}
      </CardContent>
    </>
  );
}

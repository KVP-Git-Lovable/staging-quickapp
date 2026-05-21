import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, MapPin, Search } from 'lucide-react';
import { karnatakaDistrictHDI } from '@/data/karnatakaHDI';
import { getGDIData } from '@/data/gdiIndexData';
import { Link, useNavigate } from 'react-router-dom';
import { DistrictIntelligence } from './DistrictIntelligence';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { fetchStateCountsByStates, normalizeStateName } from '@/lib/state-counts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PincodeData {
  pincode: string;
  territory_po: string | null;
}

export interface ExternalRetailer {
  id: number;
  company_name: string;
  address: string | null;
  city: string;
  mobile: string | null;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
}

export const PincodeMasterLookup: React.FC = () => {
  const navigate = useNavigate();
  const [states, setStates] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [pincodes, setPincodes] = useState<PincodeData[]>([]);
  
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingPincodes, setLoadingPincodes] = useState(false);

  const [pinSearch, setPinSearch] = useState('');
  const [pinSearching, setPinSearching] = useState(false);

  const [stateCounts, setStateCounts] = useState<Record<string, number>>({});
  const [hasLoadedStateCounts, setHasLoadedStateCounts] = useState(false);
  const [totalRetailerCount, setTotalRetailerCount] = useState<number | null>(null);

  const [pincodeRetailerStats, setPincodeRetailerStats] = useState<Record<string, { total: number; converted: number }>>({});
  const [showAllPincodes, setShowAllPincodes] = useState(false);

  const stateLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    states.forEach((s) => {
      if (!hasLoadedStateCounts) {
        labels[s] = s;
        return;
      }

      const count = stateCounts[normalizeStateName(s)] ?? 0;
      labels[s] = `${s} (${count.toLocaleString()} retailers)`;
    });
    return labels;
  }, [hasLoadedStateCounts, states, stateCounts]);

  const groupedPincodes = useMemo(() => {
    const map = new Map<string, string[]>();
    pincodes.forEach(item => {
      const territories = map.get(item.pincode) || [];
      if (item.territory_po && !territories.includes(item.territory_po)) {
        territories.push(item.territory_po);
      }
      map.set(item.pincode, territories);
    });
    return Array.from(map.entries()).map(([pincode, territories]) => ({ pincode, territories }));
  }, [pincodes]);

  const handlePinSearch = async () => {
    const pin = pinSearch.trim();
    if (!/^\d{6}$/.test(pin)) {
      toast.error('Please enter a valid 6-digit PIN code');
      return;
    }
    setPinSearching(true);
    try {
      const { data, error } = await (supabase as any)
        .from('pincode_master')
        .select('pincode')
        .eq('pincode', pin)
        .limit(1);
      if (error || !data || data.length === 0) {
        toast.error(`PIN code ${pin} not found`);
        return;
      }
      navigate(`/admin/pincode-master/${pin}`);
    } catch {
      toast.error('Failed to search PIN code');
    } finally {
      setPinSearching(false);
    }
  };

  const handlePinKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handlePinSearch();
  };

  useEffect(() => {
    const fetchStates = async () => {
      setLoadingStates(true);
      const { data, error } = await (supabase as any).rpc('get_distinct_states');
      if (!error && data) {
        setStates(data.map((d: { statename: string }) => d.statename));
      }
      setLoadingStates(false);
    };

    fetchStates();

    // Fetch total retailer count
    (async () => {
      const { count, error } = await (supabase as any)
        .from('retailer_external_db')
        .select('*', { count: 'exact', head: true });
      if (!error && typeof count === 'number') setTotalRetailerCount(count);
    })();
  }, []);

  useEffect(() => {
    if (states.length === 0) {
      setStateCounts({});
      setHasLoadedStateCounts(false);
      return;
    }

    let active = true;

    const fetchStateCounts = async () => {
      setHasLoadedStateCounts(false);

      try {
        const counts = await fetchStateCountsByStates({
          table: 'retailer_external_db',
          column: 'state',
          states,
        });

        if (active) {
          setStateCounts(counts);
          setHasLoadedStateCounts(true);
        }
      } catch (error) {
        console.error('Failed to load retailer counts for pincode lookup:', error);
        if (active) {
          setStateCounts({});
          setHasLoadedStateCounts(false);
        }
      }
    };

    fetchStateCounts();

    return () => {
      active = false;
    };
  }, [states]);

  useEffect(() => {
    if (!selectedState) {
      setDistricts([]);
      setSelectedDistrict('');
      setPincodes([]);
      return;
    }
    const fetchDistricts = async () => {
      setLoadingDistricts(true);
      setSelectedDistrict('');
      setPincodes([]);
      const { data, error } = await (supabase as any).rpc('get_distinct_districts', {
        p_state: selectedState
      });
      if (!error && data) {
        const districtNames = (data as any[]).map((d: { district: string }) => d.district);
        setDistricts(districtNames);

        if (districtNames.length > 0) {
          supabase.functions.invoke('district-intelligence', {
            body: { state: selectedState, mode: 'bulk', districts: districtNames },
          }).then(() => {
            console.log(`[DistrictIntelligence] Background pre-populate started for ${selectedState}`);
          }).catch((e) => {
            console.warn('[DistrictIntelligence] Background pre-populate failed:', e);
          });
        }
      }
      setLoadingDistricts(false);
    };
    fetchDistricts();
  }, [selectedState]);

  useEffect(() => {
    if (!selectedState || !selectedDistrict) {
      setPincodes([]);
      setPincodeRetailerStats({});
      return;
    }
    setShowAllPincodes(false);
    const fetchPincodes = async () => {
      setLoadingPincodes(true);
      setPincodeRetailerStats({});
      const { data, error } = await (supabase as any)
        .from('pincode_master')
        .select('pincode, territory_po')
        .eq('statename', selectedState)
        .eq('district', selectedDistrict)
        .order('pincode');
      if (!error && data) {
        setPincodes(data as any);

        // Fetch retailer stats for these pincodes
        const uniquePins = Array.from(new Set((data as any[]).map((d: any) => d.pincode))) as string[];
        if (uniquePins.length > 0) {
          try {
            const { data: statsData, error: statsError } = await (supabase as any)
              .from('retailer_external_db')
              .select('pincode, is_converted')
              .in('pincode', uniquePins);
            if (!statsError && statsData) {
              const stats: Record<string, { total: number; converted: number }> = {};
              (statsData as any[]).forEach((row: any) => {
                const pin = row.pincode;
                if (!stats[pin]) stats[pin] = { total: 0, converted: 0 };
                stats[pin].total++;
                if (row.is_converted) stats[pin].converted++;
              });
              setPincodeRetailerStats(stats);
            }
          } catch (e) {
            console.error('Failed to fetch pincode retailer stats:', e);
          }
        }
      }
      setLoadingPincodes(false);
    };
    fetchPincodes();
  }, [selectedState, selectedDistrict]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Retailer Lookup by Pincode
            {totalRetailerCount !== null && (
              <span className="ml-1 inline-flex items-center rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5 border border-primary/20">
                {totalRetailerCount.toLocaleString()} retailers
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="Search PIN…"
                value={pinSearch}
                onChange={(e) => setPinSearch(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={handlePinKeyDown}
                className="h-8 w-32 sm:w-36 pl-8 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs px-3"
              onClick={handlePinSearch}
              disabled={pinSearching || pinSearch.length !== 6}
            >
              {pinSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Go'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* State Dropdown */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Select State</label>
          <SearchableSelect
            value={selectedState}
            onValueChange={setSelectedState}
            options={states}
            placeholder={loadingStates ? "Loading..." : "Select a state"}
            searchPlaceholder="Search state..."
            disabled={loadingStates}
            loading={loadingStates}
            labels={stateLabels}
          />
        </div>

        {/* District Dropdown */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Select District</label>
          <SearchableSelect
            value={selectedDistrict}
            onValueChange={setSelectedDistrict}
            options={districts}
            placeholder={loadingDistricts ? "Loading..." : !selectedState ? "Select a state first" : "Select a district"}
            searchPlaceholder="Search district..."
            disabled={!selectedState || loadingDistricts}
            loading={loadingDistricts}
          />
        </div>

        {/* Karnataka HDI Info Boxes */}
        {selectedState === 'KARNATAKA' && selectedDistrict && (() => {
          const hdiData = karnatakaDistrictHDI[selectedDistrict.toLowerCase()];
          if (!hdiData) return null;
          return (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-center">
                  <p className="text-[10px] text-green-600 dark:text-green-400 font-medium uppercase tracking-wider">Health Index</p>
                  <p className="text-lg font-bold text-green-700 dark:text-green-300">{hdiData.healthIndex}</p>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-center">
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wider">Education Index</p>
                  <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{hdiData.educationIndex}</p>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-center">
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium uppercase tracking-wider">Standard of Living</p>
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{hdiData.standardOfLivingIndex}</p>
                </div>
                <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-center">
                  <p className="text-[10px] text-purple-600 dark:text-purple-400 font-medium uppercase tracking-wider">HDI</p>
                  <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{hdiData.hdi}</p>
                </div>
              </div>
              <div className="text-[9px] text-muted-foreground space-y-0.5 mt-2 px-1">
                <p><span className="font-semibold text-green-600 dark:text-green-400">Health Index</span> — Life expectancy at birth, reflecting overall health & longevity.</p>
                <p><span className="font-semibold text-blue-600 dark:text-blue-400">Education Index</span> — Mean & expected years of schooling combined.</p>
                <p><span className="font-semibold text-amber-600 dark:text-amber-400">Standard of Living</span> — Per-capita income & purchasing power of the district.</p>
                <p><span className="font-semibold text-purple-600 dark:text-purple-400">HDI</span> — Composite score of health, education & living standards (0–1).</p>
              </div>
              <p className="text-[9px] text-muted-foreground text-center mt-1 italic">
                Source: Directorate of Economics and Statistics, Govt. of Karnataka (2023-24)
              </p>
            </>
          );
        })()}

        {/* GDI Info Boxes for other states */}
        {selectedState && selectedDistrict && selectedState !== 'KARNATAKA' && (() => {
          const gdiData = getGDIData(selectedState, selectedDistrict);
          if (!gdiData) return null;
          return (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-center">
                  <p className="text-[10px] text-green-600 dark:text-green-400 font-medium uppercase tracking-wider">Health Index</p>
                  <p className="text-lg font-bold text-green-700 dark:text-green-300">{gdiData.healthIndex}</p>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-center">
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wider">Education Index</p>
                  <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{gdiData.educationIndex}</p>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-center">
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium uppercase tracking-wider">Standard of Living</p>
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{gdiData.standardOfLivingIndex}</p>
                </div>
                <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-center">
                  <p className="text-[10px] text-purple-600 dark:text-purple-400 font-medium uppercase tracking-wider">HDI</p>
                  <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{gdiData.hdi}</p>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground text-center mt-2 italic">
                Source: NITI Aayog SDG India Index 2024-25 &amp; UNDP Subnational HDI Database
              </p>
            </>
          );
        })()}

        {/* District Intelligence */}
        {selectedState && selectedDistrict && (
          <DistrictIntelligence state={selectedState} district={selectedDistrict} />
        )}

        {loadingPincodes && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loadingPincodes && pincodes.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-[auto_auto_1fr] gap-2 items-center text-sm font-medium text-muted-foreground border-b pb-2 px-3">
              <span>PIN Code</span>
              <span className="text-center">Ext. Retailers</span>
              <span className="text-right">Territory Name</span>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1">
              <TooltipProvider delayDuration={200}>
              {(() => {
                const displayPincodes = showAllPincodes
                  ? groupedPincodes
                  : groupedPincodes.filter(item => (pincodeRetailerStats[item.pincode]?.total ?? 0) > 0);
                const hiddenCount = groupedPincodes.length - groupedPincodes.filter(item => (pincodeRetailerStats[item.pincode]?.total ?? 0) > 0).length;

                return (
                  <>
                    {displayPincodes.map((item) => {
                      const stats = pincodeRetailerStats[item.pincode];
                      const totalExternal = stats?.total ?? 0;
                      const totalConverted = stats?.converted ?? 0;
                      const coverage = totalExternal > 0 ? Math.round((totalConverted / totalExternal) * 100) : 0;

                      return (
                        <div key={item.pincode} className="grid grid-cols-[auto_auto_1fr] gap-2 items-center py-2 px-3 rounded-md bg-muted/50 hover:bg-muted transition-colors">
                          <div className="flex items-center gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Link
                                  to={`/admin/pincode-master/${item.pincode}`}
                                  className="font-mono text-sm font-medium text-primary hover:underline"
                                >
                                  {item.pincode}
                                </Link>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs space-y-1 p-3">
                                <p className="font-semibold text-popover-foreground">Retailer Stats</p>
                                <p>External Retailers: <span className="font-medium">{totalExternal}</span></p>
                                <p>Added to Internal: <span className="font-medium">{totalConverted}</span></p>
                                <p>Coverage: <span className="font-medium">{coverage}%</span></p>
                              </TooltipContent>
                            </Tooltip>
                            <a
                              href={`https://www.google.com/maps/search/${item.pincode}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-primary transition-colors"
                              title="View on Google Maps"
                            >
                              <MapPin className="h-3.5 w-3.5" />
                            </a>
                          </div>
                          <div className="text-center">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm font-medium text-foreground cursor-default tabular-nums">
                                  {totalExternal > 0 ? totalExternal : '—'}
                                  {totalConverted > 0 && (
                                    <span className="text-[10px] text-green-600 dark:text-green-400 ml-0.5">({totalConverted})</span>
                                  )}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs space-y-0.5 p-2">
                                <p>Total External: <span className="font-medium">{totalExternal}</span></p>
                                <p>Converted: <span className="font-medium">{totalConverted}</span></p>
                                <p>Coverage: <span className="font-medium">{coverage}%</span></p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="text-sm text-muted-foreground text-right">
                            {item.territories.length > 0
                              ? item.territories.join(', ')
                              : '-'}
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
              </TooltipProvider>
            </div>
            <p className="text-xs text-muted-foreground text-center pt-2">
              Showing {showAllPincodes ? groupedPincodes.length : groupedPincodes.filter(item => (pincodeRetailerStats[item.pincode]?.total ?? 0) > 0).length} of {groupedPincodes.length} PIN codes
            </p>
            {!showAllPincodes && groupedPincodes.length > groupedPincodes.filter(item => (pincodeRetailerStats[item.pincode]?.total ?? 0) > 0).length && (
              <div className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setShowAllPincodes(true)}
                >
                  Show all {groupedPincodes.length} PIN codes
                </Button>
              </div>
            )}
            {showAllPincodes && groupedPincodes.length > groupedPincodes.filter(item => (pincodeRetailerStats[item.pincode]?.total ?? 0) > 0).length && (
              <div className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setShowAllPincodes(false)}
                >
                  Show only with retailers
                </Button>
              </div>
            )}
          </div>
        )}

        {!loadingPincodes && selectedDistrict && pincodes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No pincodes found for this selection.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

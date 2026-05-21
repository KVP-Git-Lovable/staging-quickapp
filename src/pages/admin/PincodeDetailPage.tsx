import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchInput } from '@/components/SearchInput';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, Loader2, MapPin, RefreshCw, Plus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ConvertRetailerDialog } from '@/components/admin/ConvertRetailerDialog';
import { PincodeAIInsightCard } from '@/components/admin/PincodeAIInsightCard';
import { PincodeAnalyticsCard } from '@/components/admin/PincodeAnalyticsCard';
import { PincodeTopRetailersPanel } from '@/components/admin/PincodeTopRetailersPanel';

interface MatchBreakdown {
  product_fit: number;
  category_fit: number;
  proximity: number;
  proximity_reason?: string;
  density: number;
  density_reason?: string;
}

interface Retailer {
  id: number;
  company_name: string;
  address: string | null;
  city: string;
  mobile: string | null;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  match_score: number | null;
  match_breakdown: MatchBreakdown | null;
  is_converted: boolean;
  converted_retailer_id: string | null;
  state?: string | null;
  pincode?: string | null;
}

import { getMatchTier, matchesTierFilter } from '@/utils/retailerMatchTier';

function getScoreColor(score: number | null) {
  const t = getMatchTier(score);
  return { bg: t.bg, text: t.text, label: t.key === 'unscored' ? '—' : t.label };
}

const PincodeDetailPage: React.FC = () => {
  const { pincode } = useParams<{ pincode: string }>();
  const navigate = useNavigate();
  const { hasAdminAccess, loading: adminLoading } = useAdminAccess();

  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [territories, setTerritories] = useState<string[]>([]);
  const [district, setDistrict] = useState<string>('');
  const [taluka, setTaluka] = useState<string>('Not available');
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [scoreFilter, setScoreFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [recalculating, setRecalculating] = useState(false);

  // Selection state
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Conversion state
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertTarget, setConvertTarget] = useState<Retailer | null>(null);
  const [bulkConvertOpen, setBulkConvertOpen] = useState(false);

  const fetchData = async () => {
    if (!pincode) return;
    setLoading(true);
    const [retRes, terRes] = await Promise.all([
      (supabase as any)
        .from('retailer_external_db')
        .select('id, company_name, address, city, mobile, category, latitude, longitude, match_score, match_breakdown, is_converted, converted_retailer_id')
        .eq('pincode', pincode)
        .order('company_name'),
      (supabase as any)
        .from('pincode_master')
        .select('territory_po, taluka, district')
        .eq('pincode', pincode),
    ]);
    if (!retRes.error && retRes.data) setRetailers(retRes.data as Retailer[]);
    if (!terRes.error && terRes.data) {
      const unique = [...new Set((terRes.data as any[]).map((d: any) => d.territory_po).filter(Boolean))] as string[];
      setTerritories(unique);
      const talukaVal = (terRes.data as any[])?.[0]?.taluka || 'Not available';
      setTaluka(talukaVal);
      const districtVal = (terRes.data as any[])?.[0]?.district || '';
      setDistrict(districtVal);
    }
    setLoading(false);
    return retRes.data as Retailer[] | null;
  };

  useEffect(() => {
    fetchData().then((data) => {
      if (data && data.some(r => r.match_score === null || r.match_score === undefined)) {
        triggerScoring(true);
      }
    });
  }, [pincode]);

  const triggerScoring = async (silent = false) => {
    if (!pincode) return;
    if (!silent) setRecalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke('calculate-match-scores', {
        body: { mode: 'pincode', pincode },
      });
      if (error) throw error;
      if (!silent) toast.success(`Scored ${data?.scored || 0} retailers`);
      await fetchData();
    } catch (err: any) {
      if (!silent) toast.error(`Scoring failed: ${err.message}`);
    } finally {
      if (!silent) setRecalculating(false);
    }
  };

  const categories = useMemo(() => {
    const cats = new Set<string>();
    retailers.forEach(r => { if (r.category) cats.add(r.category); });
    return Array.from(cats).sort();
  }, [retailers]);

  const filtered = useMemo(() => {
    let list = retailers;
    if (categoryFilter !== 'all') list = list.filter(r => r.category === categoryFilter);
    if (scoreFilter !== 'all') list = list.filter(r => matchesTierFilter(r.match_score, scoreFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.company_name.toLowerCase().includes(q) ||
        (r.address && r.address.toLowerCase().includes(q)) ||
        r.city.toLowerCase().includes(q)
      );
    }
    return list;
  }, [retailers, categoryFilter, scoreFilter, search]);

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const nonConverted = filtered.filter(r => !r.is_converted);
    if (selected.size === nonConverted.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(nonConverted.map(r => r.id)));
    }
  };

  if (adminLoading) {
    return <Layout><div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></Layout>;
  }
  if (!hasAdminAccess) return <Navigate to="/dashboard" replace />;

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle p-4 pb-20">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Button onClick={() => navigate('/admin/pincode-master')} variant="ghost" size="sm" className="p-2 shrink-0">
                <ArrowLeft size={20} />
              </Button>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                  <MapPin className="h-5 w-5 shrink-0" /> PIN {pincode}
                </h1>
                {territories.length > 0 && (
                  <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">Territories: {territories.join(', ')}</p>
                )}
                {taluka && taluka !== 'Not available' && (
                  <p className="text-xs sm:text-sm text-muted-foreground">Taluka: {taluka}</p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerScoring(false)}
              disabled={recalculating}
              className="flex items-center gap-2 shrink-0 self-start sm:self-auto ml-10 sm:ml-0"
            >
              <RefreshCw className={`h-4 w-4 ${recalculating ? 'animate-spin' : ''}`} />
              <span className="sm:hidden">{recalculating ? 'Scoring…' : 'Recalculate'}</span>
              <span className="hidden sm:inline">{recalculating ? 'Scoring…' : 'Recalculate Scores'}</span>
            </Button>
          </div>

          {/* AI Market Intelligence */}
          {!loading && pincode && (
            <>
              <PincodeAIInsightCard
                pincode={pincode}
                territories={territories}
                taluka={taluka}
                retailerCount={retailers.length}
              />
              <PincodeAnalyticsCard retailers={retailers} />
              <PincodeTopRetailersPanel pincode={pincode} />
            </>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="w-full sm:w-48">
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:w-48">
                  <Select value={scoreFilter} onValueChange={setScoreFilter}>
                    <SelectTrigger><SelectValue placeholder="All Scores" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Scores</SelectItem>
                      <SelectItem value="excellent">Excellent (≥70)</SelectItem>
                      <SelectItem value="good">Good (50–69)</SelectItem>
                      <SelectItem value="fair">Fair (30–49)</SelectItem>
                      <SelectItem value="low">Low (&lt;30)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <SearchInput placeholder="Search by retailer name or area..." value={search} onChange={setSearch} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {filtered.length} retailer{filtered.length !== 1 ? 's' : ''} found
                </p>
                {filtered.filter(r => !r.is_converted).length > 0 && (
                  <Button variant="ghost" size="sm" onClick={toggleSelectAll} className="text-xs">
                    {selected.size === filtered.filter(r => !r.is_converted).length ? 'Deselect All' : 'Select All'}
                  </Button>
                )}
              </div>

              {/* Retailer List */}
              <TooltipProvider>
                <div className="space-y-2">
                  {filtered.map(r => {
                    const sc = getScoreColor(r.match_score);
                    const bd = r.match_breakdown;
                    const isConverted = r.is_converted;
                    const isSelected = selected.has(r.id);

                    return (
                      <Card key={r.id} className={`overflow-hidden transition-all ${isConverted ? 'opacity-60 bg-muted/60 border-muted' : ''}`}>
                        <CardContent className="p-3 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Checkbox */}
                            {!isConverted && (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelect(r.id)}
                                className="shrink-0"
                              />
                            )}

                            <p className="font-medium text-sm text-foreground flex-1">{r.company_name}</p>

                            {/* Converted badge */}
                            {isConverted && (
                              <Badge variant="secondary" className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                                ✓ Added to system
                              </Badge>
                            )}

                            {/* Match Score Badge */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold cursor-default ${sc.bg} ${sc.text}`}>
                                  {r.match_score !== null ? `${r.match_score}%` : '—'}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs space-y-1">
                                {bd ? (
                                  <div>
                                    <p className="font-semibold mb-1">Match Breakdown</p>
                                    <p>{bd.product_fit > 0 ? '✔' : '—'} Product Fit: {bd.product_fit}/40</p>
                                    <p>{bd.category_fit > 0 ? '✔' : '—'} Category Fit: {bd.category_fit}/20</p>
                                    <p>{bd.proximity > 0 ? '✔' : '—'} Proximity: {bd.proximity}/20{bd.proximity_reason ? ` (${bd.proximity_reason})` : ''}</p>
                                    <p>{bd.density > 0 ? '✔' : '—'} Density: {bd.density}/20{bd.density_reason ? ` (${bd.density_reason})` : ''}</p>
                                  </div>
                                ) : (
                                  <p>Not scored yet</p>
                                )}
                              </TooltipContent>
                            </Tooltip>

                            {/* Convert button */}
                            {!isConverted && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    className="h-7 w-7 p-0 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-md shadow-green-600/30 hover:shadow-green-700/40 transition-all"
                                    onClick={() => { setConvertTarget(r); setConvertOpen(true); }}
                                  >
                                    <Plus className="h-4 w-4 stroke-[3]" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Convert to internal retailer</TooltipContent>
                              </Tooltip>
                            )}

                            {r.latitude && r.longitude ? (
                              <a
                                href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-primary hover:underline"
                              >
                                📍 {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
                              </a>
                            ) : (
                              <span className="text-[10px] text-muted-foreground italic">No GPS</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {r.address && <span>{r.address}</span>}
                            <span>{r.city}</span>
                            {r.mobile && <span>📞 {r.mobile}</span>}
                            {r.category && <Badge variant="secondary" className="text-[10px] h-5">{r.category}</Badge>}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {filtered.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">No retailers found.</p>
                  )}
                </div>
              </TooltipProvider>
            </>
          )}
        </div>
      </div>

      {/* Sticky bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-lg">
          <div className="max-w-4xl mx-auto flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium text-foreground">
              {selected.size} retailer{selected.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setBulkConvertOpen(true)}
                className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white"
              >
                <Plus className="h-4 w-4" />
                Add to Beat
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="flex items-center gap-1">
                <X className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <ConvertRetailerDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        retailer={convertTarget}
        pincode={pincode || ''}
        district={district}
        onConverted={() => fetchData()}
      />
      <ConvertRetailerDialog
        open={bulkConvertOpen}
        onOpenChange={(o) => { setBulkConvertOpen(o); if (!o) setSelected(new Set()); }}
        retailers={filtered.filter(r => selected.has(r.id))}
        pincode={pincode || ''}
        district={district}
        onConverted={() => { fetchData(); setSelected(new Set()); }}
      />
    </Layout>
  );
};

export default PincodeDetailPage;

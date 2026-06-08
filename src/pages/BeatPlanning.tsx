import { useState, useEffect, useRef, useMemo } from "react";
import { MapPin, Users, CheckCircle, Save, ArrowLeft, Plus, Calendar as CalendarIcon, Search, ChevronLeft, ChevronRight, CalendarDays, Sparkles, Loader2 } from "lucide-react";
import { ModuleHelpButton } from "@/components/help/ModuleHelpButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/Layout";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchInput } from "@/components/SearchInput";
import { format, isAfter, startOfDay, startOfWeek, addDays, isSameDay, addWeeks, subWeeks } from "date-fns";
import { cn } from "@/lib/utils";
import { offlineStorage, STORES } from "@/lib/offlineStorage";
import { clearMyVisitsSnapshot } from "@/lib/myVisitsSnapshot";
import { toLocalISODate, getLocalTodayDate, parseLocalDate, formatWeekdayShort } from "@/utils/dateUtils";
import { UserSelector } from "@/components/UserSelector";
import { useSubordinates } from "@/hooks/useSubordinates";
import { getMyBeats } from "@/services/beatService";

interface Beat {
  id: string; // beat_id
  name: string; // beat name (same as id unless we have prettier names)
  retailerCount: number;
  lastVisited?: string;
  lastVisitedDate?: string | null; // yyyy-MM-dd for day-math
  category: "all";
  priority: "high" | "medium" | "low";
  accessType?: 'OWNED' | 'CO_OWNER' | 'OPERATIONAL' | 'VIEW_ONLY' | 'COVERAGE';
  coverageStartDate?: string | null;
  coverageEndDate?: string | null;
  ownerName?: string | null;
  avgOrderValue?: number | null;
}


// Beats are loaded dynamically from retailers table for the current user.

const getWeekDays = (selectedWeekStart: Date) => {
  const startOfSelectedWeek = startOfWeek(selectedWeekStart, { weekStartsOn: 1 }); // Start from Monday
  const today = new Date();
  
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(startOfSelectedWeek, i);
    const isToday = isSameDay(day, today);
    
    weekDays.push({
      day: format(day, 'EEE'),
      date: day.getDate().toString(),
      isToday: isToday,
      isoDate: format(day, 'yyyy-MM-dd'),
      fullDate: day,
      dayName: format(day, 'EEEE')
    });
  }
  return weekDays;
};

export const BeatPlanning = () => {
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');

  // Initialize date from URL param or use today
  const initialDate = dateParam ? new Date(dateParam + 'T00:00:00') : new Date();
  const initialWeekStart = startOfWeek(initialDate, { weekStartsOn: 1 });

  const [selectedCategory] = useState<"all">("all");
  // Important: initialize selected day from the selected date (not "today") to avoid mismatch
  const [selectedDay, setSelectedDay] = useState(() => format(initialDate, 'EEE'));
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [selectedWeek, setSelectedWeek] = useState(initialWeekStart);
  const [plannedBeats, setPlannedBeats] = useState<{ [key: string]: string[] }>({});
  const [weekDays, setWeekDays] = useState(() => getWeekDays(initialWeekStart));
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [calendarDate, setCalendarDate] = useState<Date | undefined>(initialDate);
  const [plannedDates, setPlannedDates] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subordinateIds, isManager } = useSubordinates();
  const [selectedUserId, setSelectedUserId] = useState<string>('self');
  const [beats, setBeats] = useState<Beat[]>([]);
  const hasLoadedFromCacheRef = useRef(false);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  // Calculate effective user ID based on selection
  const effectiveUserId = useMemo(() => {
    if (selectedUserId === 'self' || selectedUserId === user?.id) {
      return user?.id;
    }
    return selectedUserId;
  }, [selectedUserId, user?.id]);

  // toLocalISODate is now imported from @/utils/dateUtils

  // CACHE-FIRST: Load beats from local cache instantly, then sync from network
  const loadBeatsFromCache = async () => {
    if (!effectiveUserId) return;

    try {
      // INSTANT: Load from cache first
      const cachedBeats = await offlineStorage.getAll<any>(STORES.BEATS);
      const cachedRetailers = await offlineStorage.getAll<any>(STORES.RETAILERS);

      const userBeats = cachedBeats.filter((b: any) => b.is_active !== false && b.created_by === effectiveUserId);

      const userRetailers = cachedRetailers.filter((r: any) => r.user_id === effectiveUserId);

      if (userBeats.length > 0) {
        // Count retailers per beat
        const retailerCountMap = new Map<string, { count: number; priority: 'high' | 'medium' | 'low' }>();
        userRetailers.forEach((r: any) => {
          const beatId = r.beat_id;
          if (!beatId || beatId === 'unassigned') return;
          const current = retailerCountMap.get(beatId) || { count: 0, priority: 'medium' };
          const pr = (r.priority as string | null)?.toLowerCase() as 'high' | 'medium' | 'low' | undefined;
          const priority = pr === 'high' ? 'high' : pr === 'low' ? (current.priority === 'high' ? 'high' : 'low') : current.priority;
          retailerCountMap.set(beatId, { count: current.count + 1, priority });
        });

        const beatsArr: Beat[] = userBeats.map((beat: any) => {
          const retailerInfo = retailerCountMap.get(beat.beat_id) || { count: 0, priority: 'medium' };
          return {
            id: beat.beat_id,
            name: beat.beat_name,
            retailerCount: retailerInfo.count,
            category: beat.category || 'all',
            priority: retailerInfo.priority,
            lastVisited: undefined,
            lastVisitedDate: null,
            accessType: beat.accessType,
            coverageStartDate: beat.coverageStartDate ?? null,
            coverageEndDate: beat.coverageEndDate ?? null,
            ownerName: beat.ownerName ?? beat.owner_name ?? null,
            avgOrderValue: beat.avgOrderValue ?? null,
          };
        });

        setBeats(beatsArr);
        hasLoadedFromCacheRef.current = true;
        console.log('[BeatPlanning] ⚡ Loaded', beatsArr.length, 'beats from cache instantly');
      }
    } catch (e) {
      console.error('[BeatPlanning] Cache load error:', e);
    }
  };

  // BACKGROUND: Load beats from network and update if different
  const loadBeatsFromNetwork = async () => {
    if (!effectiveUserId) return;
    try {
      // Get user's beats (owned + CO_OWNER + OPERATIONAL + COVERAGE)
      const myBeats = await getMyBeats(effectiveUserId);
      const beatsData = (myBeats || []).filter((b: any) => b.is_active !== false);

      // Cache beats for offline usage
      if (beatsData?.length) {
        for (const beat of beatsData) {
          await offlineStorage.save(STORES.BEATS, beat);
        }
      }

      // Get retailer counts for each beat (filter by beat_id to include shared beats)
      const beatIdList = beatsData.map((b: any) => b.beat_id).filter(Boolean);
      const { data: retailersData, error: retailersError } = beatIdList.length
        ? await supabase
            .from('retailers')
            .select('beat_id, priority')
            .in('beat_id', beatIdList)
        : { data: [], error: null } as any;

      if (retailersError) throw retailersError;

      // Get last visited dates from beat_plans
      const beatIds = (beatsData || []).map((b: any) => b.beat_id);
      const { data: beatPlansData } = await supabase
        .from('beat_plans')
        .select('beat_id, plan_date')
        .eq('user_id', effectiveUserId)
        .in('beat_id', beatIds)
        .lte('plan_date', toLocalISODate(new Date()))
        .order('plan_date', { ascending: false });

      // Create a map of beat_id to last visited ISO date (yyyy-MM-dd)
      const lastVisitedMap = new Map<string, string>();
      (beatPlansData || []).forEach((plan: any) => {
        if (!lastVisitedMap.has(plan.beat_id)) {
          lastVisitedMap.set(plan.beat_id, String(plan.plan_date).slice(0, 10));
        }
      });

      // Count retailers per beat and determine priority
      const retailerCountMap = new Map<string, { count: number; priority: 'high' | 'medium' | 'low' }>();
      (retailersData || []).forEach((r: any) => {
        const beatId = r.beat_id;
        if (!beatId || beatId === 'unassigned') return;
        const current = retailerCountMap.get(beatId) || { count: 0, priority: 'medium' };
        const pr = (r.priority as string | null)?.toLowerCase() as 'high' | 'medium' | 'low' | undefined;
        const priority = pr === 'high' ? 'high' : pr === 'low' ? (current.priority === 'high' ? 'high' : 'low') : current.priority;
        retailerCountMap.set(beatId, { count: current.count + 1, priority });
      });

      // Map beats data with retailer counts - show ALL beats even if user has 0 retailers
      const beatsArr: Beat[] = (beatsData || []).map((beat: any) => {
        const retailerInfo = retailerCountMap.get(beat.beat_id) || { count: 0, priority: 'medium' };
        const lastIso = lastVisitedMap.get(beat.beat_id) ?? null;
        return {
          id: beat.beat_id,
          name: beat.beat_name,
          retailerCount: retailerInfo.count,
          category: beat.category || 'all',
          priority: retailerInfo.priority,
          lastVisited: lastIso ? new Date(lastIso).toLocaleDateString() : undefined,
          lastVisitedDate: lastIso,
          accessType: beat.accessType,
          coverageStartDate: beat.coverageStartDate ?? null,
          coverageEndDate: beat.coverageEndDate ?? null,
          ownerName: beat.ownerName ?? beat.owner_name ?? null,
          avgOrderValue: beat.avgOrderValue ?? null,
        };
      });

      // Only update if we have data (avoid clearing cache data with empty network result)
      if (beatsArr.length > 0 || !hasLoadedFromCacheRef.current) {
        setBeats(beatsArr);
        console.log('[BeatPlanning] 🌐 Updated', beatsArr.length, 'beats from network');
      }
    } catch (e) {
      console.error('[BeatPlanning] Network error loading beats:', e);
      // Don't clear beats on error - keep cached data
    }
  };

  // Ensure selected day matches selected date (prevents "no beat selected" mismatch)
  useEffect(() => {
    if (!selectedDate) return;
    const dayKey = format(selectedDate, 'EEE');
    if (selectedDay !== dayKey) {
      setSelectedDay(dayKey);
    }
  }, [selectedDate]);

  // Update week days when selected week changes
  useEffect(() => {
    setWeekDays(getWeekDays(selectedWeek));
  }, [selectedWeek]);

  // Load beats from cache IMMEDIATELY on mount or when effective user changes
  useEffect(() => {
    if (effectiveUserId) {
      loadBeatsFromCache();
    }
  }, [effectiveUserId]);

  // Load existing beat plans (cache-first) and sync beats from network when date or user changes
  useEffect(() => {
    if (effectiveUserId && selectedDate) {
      const dateString = toLocalISODate(selectedDate);
      loadBeatPlans(dateString);
      // Background network sync (non-blocking)
      if (navigator.onLine) {
        loadBeatsFromNetwork();
      }
    }
  }, [effectiveUserId, selectedDate]);

  // Load week plan markers for calendar (cache-first, then network)
  useEffect(() => {
    if (!effectiveUserId) return;

    const loadWeekPlans = async () => {
      try {
        const startIso = weekDays[0]?.isoDate;
        const endIso = weekDays[weekDays.length - 1]?.isoDate;
        if (!startIso || !endIso) return;

        // 1) Cache-first
        try {
          const cachedPlans = await offlineStorage.getAll<any>(STORES.BEAT_PLANS);
          const cachedDates = new Set(
            (cachedPlans || [])
              .filter((p: any) => p.user_id === effectiveUserId && p.plan_date >= startIso && p.plan_date <= endIso)
              .map((p: any) => p.plan_date)
          );
          if (cachedDates.size > 0) {
            setPlannedDates(cachedDates);
          }
        } catch (cacheErr) {
          console.error('Error loading week plans from cache:', cacheErr);
        }

        // 2) Network sync
        if (!navigator.onLine) return;

        const { data, error } = await supabase
          .from('beat_plans')
          .select('*')
          .eq('user_id', effectiveUserId)
          .gte('plan_date', startIso)
          .lte('plan_date', endIso);

        if (error) throw error;

        const nextDates = new Set((data || []).map((d: any) => d.plan_date));
        setPlannedDates(nextDates);

        // Cache plans for offline usage
        if (data?.length) {
          for (const plan of data) {
            await offlineStorage.save(STORES.BEAT_PLANS, plan);
          }
        }
      } catch (err) {
        console.error('Error loading week plans:', err);
      }
    };

    loadWeekPlans();
  }, [effectiveUserId, weekDays]);

  const loadBeatPlans = async (date: string) => {
    if (!effectiveUserId) return;

    const loadedDate = new Date(date + 'T00:00:00');
    const dayKey = format(loadedDate, 'EEE');

    // 1) Cache-first: show selection instantly even on slow/no network
    try {
      const cachedPlans = await offlineStorage.getAll<any>(STORES.BEAT_PLANS);
      const plansForDate = (cachedPlans || []).filter((p: any) => p.user_id === effectiveUserId && p.plan_date === date);
      if (plansForDate.length > 0) {
        const plannedBeatIds = plansForDate.map((p: any) => p.beat_id);
        setPlannedBeats(prev => ({
          ...prev,
          [dayKey]: plannedBeatIds,
        }));
        console.log('[BeatPlanning] ⚡ Loaded', plannedBeatIds.length, 'planned beats from cache for', date);
      }
    } catch (cacheErr) {
      console.error('Error loading beat plans from cache:', cacheErr);
    }

    // 2) Network sync
    if (!navigator.onLine) return;

    try {
      const { data, error } = await supabase
        .from('beat_plans')
        .select('*')
        .eq('user_id', effectiveUserId)
        .eq('plan_date', date);

      if (error) throw error;

      const plannedBeatIds = (data || []).map((plan: any) => plan.beat_id);
      setPlannedBeats(prev => ({
        ...prev,
        [dayKey]: plannedBeatIds,
      }));

      // Cache beat plans for offline usage
      if (data?.length) {
        for (const plan of data) {
          await offlineStorage.save(STORES.BEAT_PLANS, plan);
        }
      }

      // Keep plannedDates consistent for the marker dot
      setPlannedDates(prev => {
        const next = new Set(prev);
        if ((data || []).length > 0) next.add(date);
        else next.delete(date);
        return next;
      });
    } catch (error) {
      console.error('Error loading beat plans:', error);
    }
  };

  const filteredBeats = beats.filter(beat => 
    beat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    beat.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Date-aware enrichment: coverage-window gating + computed metrics
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const beatsForDate = filteredBeats.map(beat => {
    const start = beat.coverageStartDate || '';
    const end = beat.coverageEndDate || '';
    const isCoverage = beat.accessType === 'COVERAGE';
    const isSelectableForDate = !isCoverage
      ? true
      : (!!start && !!end && start <= selectedDateStr && end >= selectedDateStr);
    const isUpcomingCoverage = isCoverage && !!start && start > selectedDateStr;
    const coverageStartLabel = isUpcomingCoverage
      ? `Available from ${format(new Date(start), 'MMM d')}`
      : null;
    let daysSinceVisit: number | null = null;
    if (beat.lastVisitedDate) {
      const ms = new Date(todayStr).getTime() - new Date(beat.lastVisitedDate).getTime();
      daysSinceVisit = Math.max(0, Math.floor(ms / 86400000));
    }
    return { ...beat, isSelectableForDate, isUpcomingCoverage, coverageStartLabel, daysSinceVisit };
  });

  const handleSelectBeat = (beatId: string) => {
    setPlannedBeats(prev => ({
      ...prev,
      [selectedDay]: [...(prev[selectedDay] || []), beatId]
    }));
  };

  const handleRemoveBeat = async (beatId: string) => {
    // Remove from local state
    setPlannedBeats(prev => ({
      ...prev,
      [selectedDay]: (prev[selectedDay] || []).filter(id => id !== beatId)
    }));

    // Also delete from database if this beat was previously saved
    if (effectiveUserId && selectedDate) {
      const dateString = toLocalISODate(selectedDate);
      try {
        const { error } = await supabase
          .from('beat_plans')
          .delete()
          .eq('user_id', effectiveUserId)
          .eq('beat_id', beatId)
          .eq('plan_date', dateString);

        if (error) throw error;

        // Clear My Visits snapshot for this date
        await clearMyVisitsSnapshot(effectiveUserId, dateString);

        // Update planned dates marker
        setPlannedDates(prev => {
          const dateKey = selectedDate.toLocaleDateString('en-US', { weekday: 'short' });
          const remaining = (plannedBeats[dateKey] || []).filter(id => id !== beatId);
          const next = new Set(prev);
          if (remaining.length === 0) next.delete(dateString);
          return next;
        });

        toast.success('Beat plan removed successfully');
        window.dispatchEvent(new Event('visitDataChanged'));
      } catch (err) {
        console.error('Error removing beat plan:', err);
        toast.error('Failed to remove beat plan from database');
      }
    }
  };

  const createExpenseRecords = async (selectedBeatIds: string[], dateString: string) => {
    if (!user) {
      console.error('No user found when creating expense records');
      return;
    }
    
    try {
      console.log('Creating expense records for date:', dateString);
      console.log('Selected beat IDs:', selectedBeatIds);
      console.log('User ID:', user.id);
      
      if (selectedBeatIds.length === 0) {
        console.log('No beats selected, skipping expense creation');
        return;
      }

      // Create expense records for each planned beat using upsert
      const expenseData = selectedBeatIds.map(beatId => {
        const beat = beats.find(b => b.id === beatId);
        console.log(`Beat ${beatId} found:`, beat);
        return {
          user_id: user.id,
          beat_id: beatId,
          beat_name: beat?.name || beatId,
          daily_allowance: 500, // Default daily allowance
          travel_allowance: 200, // Default travel allowance
          created_at: `${dateString}T12:00:00.000Z`, // Use the correct date for expense records
          updated_at: new Date().toISOString()
        };
      });

      console.log('Expense data to upsert:', expenseData);

      if (expenseData.length === 0) {
        console.log('No expense data to upsert');
        return;
      }

      // Use upsert to handle existing records
      const { error, data } = await supabase
        .from('beat_allowances')
        .upsert(expenseData, {
          onConflict: 'beat_id,user_id',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('Upsert error:', error);
        console.error('Upsert error details:', JSON.stringify(error, null, 2));
        throw error;
      }
      
      console.log('Successfully created/updated expense records:', data);
    } catch (error) {
      console.error('Error creating expense records:', error);
      toast.error('Failed to create expense records. Please check the console for details.', {
        duration: 5000,
      });
    }
  };

  const handleSubmitPlan = async () => {
    if (!user || !selectedDate) return;
    
    const dateKey = selectedDate.toLocaleDateString('en-US', { weekday: 'short' });
    const selectedBeatIds = plannedBeats[dateKey] || [];

    setIsLoading(true);
    try {
      // Format date correctly to avoid timezone issues
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      console.log('Submitting plan for date:', dateString, 'from selectedDate:', selectedDate);
      
      // Delete existing plans for this date
      await supabase
        .from('beat_plans')
        .delete()
        .eq('user_id', user.id)
        .eq('plan_date', dateString);

      // CRITICAL FIX: Clear snapshot when beat plans change to prevent stale retailer data
      await clearMyVisitsSnapshot(user.id, dateString);
      console.log('[BeatPlanning] Cleared snapshot for', dateString, 'due to plan update');

      // If no beats selected, we've cleared all - just show success message
      if (selectedBeatIds.length === 0) {
        toast.success(`Cleared all beats for ${format(selectedDate, 'MMMM d, yyyy')}`);
        window.dispatchEvent(new Event('visitDataChanged'));
        setIsLoading(false);
        return;
      }

      const planData = selectedBeatIds.map(beatId => {
        const beat = beats.find(b => b.id === beatId);
        const beatData = beat
          ? { id: beat.id, name: beat.name, retailerCount: beat.retailerCount, category: beat.category, priority: beat.priority }
          : { id: beatId, name: beatId, retailerCount: 0, category: 'all', priority: 'medium' };
        return {
          user_id: user.id,
          plan_date: dateString,
          beat_id: beatId,
          beat_name: beat?.name || beatId,
          beat_data: beatData as any
        };
      });

      const { error } = await supabase
        .from('beat_plans')
        .insert(planData);

      if (error) throw error;

      // Automatically create/update expense records for planned beats
      await createExpenseRecords(selectedBeatIds, dateString);

      // Wait a bit to ensure all database operations complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Trigger data refresh on My Visits page
      window.dispatchEvent(new Event('visitDataChanged'));

      toast.success(`Successfully planned ${selectedBeatIds.length} beat(s) for ${format(selectedDate, 'MMMM d, yyyy')}`);
    } catch (error) {
      console.error('Error saving beat plan:', error);
      toast.error("Failed to save beat plan. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDayChange = (day: string) => {
    setSelectedDay(day);
    const dayInfo = weekDays.find(d => d.day === day);
    if (dayInfo) {
      setSelectedDate(dayInfo.fullDate);
    }
  };

  const handleCalendarDateSelect = (date: Date | undefined) => {
    if (date && isAfter(date, startOfDay(new Date()))) {
      setCalendarDate(date);
      const weekStart = startOfWeek(date, { weekStartsOn: 1 });
      setSelectedWeek(weekStart);
      
      // Set the selected day to the picked date
      const newWeekDays = getWeekDays(weekStart);
      const selectedDayInfo = newWeekDays.find(d => isSameDay(d.fullDate, date));
      if (selectedDayInfo) {
        setSelectedDay(selectedDayInfo.day);
        setSelectedDate(selectedDayInfo.fullDate);
      }
    } else if (date && !isAfter(date, startOfDay(new Date()))) {
      toast.error("Cannot plan for past dates. Please select a future date.");
    }
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newWeek = direction === 'prev' ? subWeeks(selectedWeek, 1) : addWeeks(selectedWeek, 1);
    setSelectedWeek(newWeek);
    setCalendarDate(newWeek);
    
    // Keep the same day of week if possible, otherwise select the first day
    const newWeekDays = getWeekDays(newWeek);
    const sameWeekdayIndex = weekDays.findIndex(d => d.day === selectedDay);
    const targetDay = newWeekDays[sameWeekdayIndex] || newWeekDays[0];
    setSelectedDay(targetDay.day);
    setSelectedDate(targetDay.fullDate);
  };

  const isBeatSelected = (beatId: string) => {
    // Use selectedDay directly for consistency with handleSelectBeat/handleRemoveBeat
    return (plannedBeats[selectedDay] || []).includes(beatId);
  };

  const handleProceedToRetailers = () => {
    const dateKey = selectedDate.toLocaleDateString('en-US', { weekday: 'short' });
    const selectedBeatIds = plannedBeats[dateKey] || [];
    if (selectedBeatIds.length > 0) {
      // Navigate to retailer list with selected beats
      navigate('/visits/retailers', { state: { selectedBeats: selectedBeatIds, selectedDay: dateKey } });
    }
  };

  const handleAutoGeneratePlan = async () => {
    if (!effectiveUserId) return;
    
    setIsGeneratingPlan(true);
    const loadingToast = toast.loading('Generating optimized plan for this week and next...');
    
    try {
      const { data, error } = await supabase.functions.invoke('auto-generate-beat-plan', {
        body: { 
          userId: effectiveUserId,
          forceRegenerate: true 
        }
      });
      
      if (error) throw error;
      
      toast.dismiss(loadingToast);
      
      const result = data?.results?.[0];
      if (result?.status === 'success') {
        const plansCreated = result.plansCreated || 0;
        const prescheduled = result.prescheduledPreserved || 0;
        
        toast.success(`Created ${plansCreated} new plans, preserved ${prescheduled} pre-scheduled beats!`);
        
        // Navigate to rationale page with the plan result
        navigate('/auto-plan-rationale', { state: { planResult: result } });
      } else {
        toast.error(result?.reason || 'Failed to generate plan');
      }
      
      // Refresh current view
      loadBeatPlans(toLocalISODate(selectedDate));
      loadBeatsFromNetwork();
    } catch (error) {
      console.error('Auto-generate error:', error);
      toast.dismiss(loadingToast);
      toast.error('Failed to generate plan. Please try again.');
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const getTotalPlannedDays = () => {
    return Object.keys(plannedBeats).filter(day => plannedBeats[day].length > 0).length;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "bg-destructive text-destructive-foreground";
      case "medium": return "bg-warning text-warning-foreground";
      case "low": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Layout>
      <div className="p-4 space-y-4">
        {/* Header */}
        <Card className="shadow-card bg-gradient-primary text-primary-foreground">
          <CardHeader className="pb-2 sm:pb-3">
          <div className="flex items-start justify-between w-full">
              <div className="flex items-start gap-2 sm:gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg sm:text-xl font-bold">
                      {(() => {
                        return plannedBeats[selectedDay]?.length > 0 
                          ? `Journey: ${plannedBeats[selectedDay].slice(0, 2).map(beatId => beats.find(b => b.id === beatId)?.name || beatId).join(', ')}${plannedBeats[selectedDay].length > 2 ? '...' : ''}`
                          : 'Plan My Journey';
                      })()}
                    </CardTitle>
                    <ModuleHelpButton categoryId="my-visit" articleId="my-visit-beat-planning" variant="onDark" />
                  </div>
                  {/* User Selector for managers - below title */}
                  <UserSelector
                    selectedUserId={selectedUserId}
                    onUserChange={setSelectedUserId}
                    showAllOption={false}
                    allOptionLabel="All Team"
                    className="h-7 min-w-[100px] max-w-[140px] text-xs mt-1 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground [&>span]:text-primary-foreground"
                  />
                  <p className="text-xs sm:text-sm text-primary-foreground/80 mt-1">
                    {(() => {
                      return plannedBeats[selectedDay]?.length > 0 
                        ? `${plannedBeats[selectedDay].length} beat${plannedBeats[selectedDay].length > 1 ? 's' : ''} selected`
                        : 'Select beats for your visit schedule';
                    })()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={handleAutoGeneratePlan}
                  disabled={isGeneratingPlan}
                  variant="secondary"
                  size="sm"
                  className="bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/20 text-xs sm:text-sm"
                  title="AI generates optimized weekly beat plans based on visit history, retailer priority, and pending collections"
                >
                  {isGeneratingPlan ? (
                    <Loader2 size={14} className="animate-spin sm:mr-1" />
                  ) : (
                    <Sparkles size={14} className="sm:mr-1" />
                  )}
                  <span className="hidden sm:inline">{isGeneratingPlan ? 'Generating...' : 'Auto-Plan'}</span>
                </Button>
                <Button 
                  onClick={() => navigate('/my-beats?openCreateModal=true')}
                  variant="secondary"
                  size="sm"
                  className="bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/20 text-xs sm:text-sm"
                >
                  <Plus size={14} className="sm:mr-1" />
                  <span className="hidden sm:inline">Create Beat</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Calendar Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/20",
                        !calendarDate && "text-primary-foreground/50"
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {calendarDate ? format(calendarDate, "MMM yyyy") : "Pick a month"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={calendarDate}
                      onSelect={handleCalendarDateSelect}
                      disabled={(date) => !isAfter(date, startOfDay(new Date()))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigateWeek('prev')}
                  className="bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/20"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium text-primary-foreground px-2">
                  {format(selectedWeek, "MMM d")} - {format(addDays(selectedWeek, 6), "MMM d, yyyy")}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigateWeek('next')}
                  className="bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/20"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Weekly Calendar - Mobile Optimized */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-6">
              {weekDays.map((dayInfo) => (
                <button
                  key={dayInfo.day}
                  onClick={() => handleDayChange(dayInfo.day)}
                  className={`p-2 sm:p-3 rounded-lg text-center transition-colors relative ${
                    selectedDay === dayInfo.day
                      ? 'bg-primary-foreground text-primary'
                      : 'bg-primary-foreground/10 hover:bg-primary-foreground/20'
                  }`}
                >
                  <div className="text-xs font-medium mb-1">{dayInfo.day}</div>
                  <div className="text-sm sm:text-lg font-bold">{dayInfo.date}</div>
                  {plannedDates.has(dayInfo.isoDate) && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 sm:w-3 sm:h-3 bg-success rounded-full"></div>
                  )}
                  {dayInfo.isToday && (
                    <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-primary-foreground rounded-full"></div>
                  )}
                </button>
              ))}
            </div>

            {/* Search Section */}
            <div className="mb-4">
              <SearchInput
                placeholder="Search beats by name or ID..."
                value={searchTerm}
                onChange={setSearchTerm}
              />
            </div>

            {/* Planning Summary */}
            <div className="text-center text-primary-foreground/90 text-sm">
              Planning for {format(selectedDate, 'EEEE, MMMM d, yyyy')} • 
              {(() => {
                const dateKey = selectedDate.toLocaleDateString('en-US', { weekday: 'short' });
                return plannedBeats[dateKey]?.length || 0;
              })()} beats selected
            </div>
          </CardContent>
        </Card>

        {/* Category Tabs removed - showing all beats derived from your retailers */}

        {/* Beats List */}
        <div className="space-y-3">
          {beatsForDate.map((beat) => (
            <Card key={beat.id} className={`shadow-card ${beat.isUpcomingCoverage ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                {/* Header row */}
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-foreground">{beat.name}</h3>
                      {beat.accessType === 'OWNED' && <Badge className="bg-green-100 text-green-700 text-xs">Mine</Badge>}
                      {beat.accessType === 'CO_OWNER' && <Badge className="bg-purple-100 text-purple-700 text-xs">Shared · Co-owner</Badge>}
                      {beat.accessType === 'OPERATIONAL' && <Badge className="bg-blue-100 text-blue-700 text-xs">Shared · Operational</Badge>}
                      {beat.accessType === 'VIEW_ONLY' && <Badge className="bg-gray-100 text-gray-600 text-xs">View only</Badge>}
                      {beat.accessType === 'COVERAGE' && !beat.isUpcomingCoverage && beat.coverageEndDate && (
                        <Badge className="bg-amber-100 text-amber-700 text-xs">
                          Coverage · Until {format(new Date(beat.coverageEndDate), 'MMM d')}
                        </Badge>
                      )}
                      {beat.isUpcomingCoverage && (
                        <Badge className="bg-gray-100 text-gray-500 text-xs">
                          🔒 {beat.coverageStartLabel}
                        </Badge>
                      )}
                    </div>
                    {beat.accessType && beat.accessType !== 'OWNED' && beat.ownerName && (
                      <p className="text-xs text-muted-foreground">
                        {beat.accessType === 'COVERAGE' ? 'Covering for:' : 'Owner:'} {beat.ownerName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Last visited: {beat.lastVisited || 'Never'}
                    </p>
                  </div>
                  <Badge className={getPriorityColor(beat.priority)}>{beat.priority}</Badge>
                </div>

                {/* Stats row */}
                <div className="flex gap-3 bg-muted/40 rounded-md p-2 mb-3">
                  <div className="flex-1 text-center">
                    <div className="text-sm font-semibold text-blue-600">{beat.retailerCount}</div>
                    <div className="text-xs text-muted-foreground">Retailers</div>
                  </div>
                  <div className="flex-1 text-center">
                    <div className="text-sm font-semibold text-emerald-600">
                      {beat.avgOrderValue ? `₹${beat.avgOrderValue.toLocaleString()}` : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">Avg Order</div>
                  </div>
                  <div className="flex-1 text-center">
                    <div className="text-sm font-semibold text-amber-600">
                      {beat.daysSinceVisit !== null ? `${beat.daysSinceVisit}d` : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">Since Visit</div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={isBeatSelected(beat.id) ? "destructive" : "default"}
                    disabled={!beat.isSelectableForDate}
                    title={beat.isUpcomingCoverage ? beat.coverageStartLabel ?? undefined : undefined}
                    onClick={() => {
                      if (isBeatSelected(beat.id)) handleRemoveBeat(beat.id);
                      else handleSelectBeat(beat.id);
                    }}
                    className="flex-1"
                  >
                    {isBeatSelected(beat.id)
                      ? 'Remove'
                      : beat.isUpcomingCoverage && beat.coverageStartDate
                        ? `Starts ${format(new Date(beat.coverageStartDate), 'MMM d')}`
                        : 'Select'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/beat-analytics?beat=${beat.id}`)}>
                    Analytics
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Floating Action - Mobile Optimized */}
        {(() => {
          const dateKey = selectedDate.toLocaleDateString('en-US', { weekday: 'short' });
          return (plannedBeats[dateKey]?.length || 0) > 0;
        })() && (
          <div className="fixed bottom-4 left-4 right-4 z-10">
            <Card className="shadow-lg bg-primary text-primary-foreground">
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm sm:text-base font-semibold truncate">
                      {(() => {
                        const dateKey = selectedDate.toLocaleDateString('en-US', { weekday: 'short' });
                        return plannedBeats[dateKey]?.length || 0;
                      })()} beat(s) selected for {format(selectedDate, 'MMM d')}
                    </div>
                    <div className="text-xs sm:text-sm text-primary-foreground/80">
                      Save plan or view my visit
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button 
                      variant="secondary"
                      onClick={async () => {
                        if (!user || !selectedDate) return;
                        const dateKey = selectedDate.toLocaleDateString('en-US', { weekday: 'short' });
                        setPlannedBeats(prev => ({
                          ...prev,
                          [dateKey]: []
                        }));
                        
                        // Also delete from database immediately
                        const year = selectedDate.getFullYear();
                        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                        const day = String(selectedDate.getDate()).padStart(2, '0');
                        const dateString = `${year}-${month}-${day}`;
                        
                        await supabase
                          .from('beat_plans')
                          .delete()
                          .eq('user_id', user.id)
                          .eq('plan_date', dateString);
                        
                        // Clear the snapshot so My Visit shows empty retailers
                        await clearMyVisitsSnapshot(user.id, dateString);
                        
                        // Also clear beat plans from offline storage for this date
                        try {
                          const allBeatPlans = await offlineStorage.getAll<any>(STORES.BEAT_PLANS);
                          const toDelete = allBeatPlans.filter(bp => 
                            bp.user_id === user.id && bp.plan_date === dateString
                          );
                          for (const bp of toDelete) {
                            await offlineStorage.delete(STORES.BEAT_PLANS, bp.id);
                          }
                          console.log('[ClearAll] Deleted', toDelete.length, 'beat plans from offline storage');
                        } catch (e) {
                          console.error('[ClearAll] Failed to clear offline storage:', e);
                        }
                        
                        window.dispatchEvent(new Event('visitDataChanged'));
                        toast.success(`Cleared all beats for ${format(selectedDate, 'MMMM d, yyyy')}`);
                      }}
                      size="sm"
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs sm:text-sm"
                    >
                      <span>Clear All</span>
                    </Button>
                    <Button 
                      variant="secondary"
                      onClick={handleSubmitPlan}
                      disabled={isLoading}
                      size="sm"
                      className="bg-success text-success-foreground hover:bg-success/90 text-xs sm:text-sm"
                    >
                      <Save size={14} className="mr-1 sm:mr-2" />
                      <span className="hidden xs:inline">{isLoading ? "Saving..." : "Save Plan"}</span>
                      <span className="xs:hidden">{isLoading ? "Save..." : "Save"}</span>
                    </Button>
                    <Button 
                      variant="secondary"
                      onClick={handleProceedToRetailers}
                      size="sm"
                      className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 text-xs sm:text-sm"
                    >
                      <MapPin size={14} className="mr-1 sm:mr-2" />
                      <span className="hidden xs:inline">View My Visit</span>
                      <span className="xs:hidden">Visit</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
};
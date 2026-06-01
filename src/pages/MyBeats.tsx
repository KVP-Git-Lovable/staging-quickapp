import { useState, useEffect, useMemo } from "react";
import { Plus, Users, MapPin, Calendar, BarChart, Edit2, Trash2, Clock, Truck, Sparkles, CalendarDays, Repeat, ChevronDown, TrendingUp, Package, Search, Store, Hash, Percent, AlertCircle, Power, Info } from "lucide-react";
import { fetchExpenseConfigs, resolveExpenseConfig, fetchUserManagerId } from "@/hooks/useResolvedExpenseConfig";
import { ModuleHelpButton } from "@/components/help/ModuleHelpButton";
import { CompactMultiUserSelector } from "@/components/CompactMultiUserSelector";
import { useSubordinates } from "@/hooks/useSubordinates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/SearchInput";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Layout } from "@/components/Layout";
import { RetailerAnalytics } from "@/components/RetailerAnalytics";
import { EditBeatModal } from "@/components/EditBeatModal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { moveToRecycleBin } from "@/utils/recycleBinUtils";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useRecommendations } from "@/hooks/useRecommendations";
import { RecommendationCard } from "@/components/RecommendationCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BeatAnalyticsModal } from "@/components/BeatAnalyticsModal";
import { BeatInsightModal } from "@/components/BeatInsightModal";
import { BeatCard } from "@/components/BeatCard";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, addDays, addWeeks, addMonths } from "date-fns";
import { cn } from "@/lib/utils";
import { AddRetailerInlineToBeat } from "@/components/AddRetailerInlineToBeat";
import { offlineStorage, STORES } from "@/lib/offlineStorage";
import { clearMyVisitsSnapshot } from "@/lib/myVisitsSnapshot";
import { useConnectivity } from "@/hooks/useConnectivity";
import { BeatDeleteDialog } from "@/components/BeatDeleteDialog";
import { BeatTransferDialog } from "@/components/BeatTransferDialog";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { useBeatLifecycle } from "@/hooks/useBeatLifecycle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/ui/PaginationControls";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


interface Beat {
  id: string;
  beat_number: number;
  name: string;
  retailer_count: number;
  total_retailers: number;
  last_visited?: string;
  created_at: string;
  category?: string;
  priority?: string;
  travel_allowance?: number;
  average_km?: number;
  average_time_minutes?: number;
  territory_id?: string;
  territory_name?: string;
  owner_name?: string;
  is_active?: boolean;
}

interface Retailer {
  id: string;
  name: string;
  address: string;
  phone: string; // Required for compatibility with RetailerAnalytics
  category?: string;
  beat_id?: string;
  type: string; // Required for compatibility with RetailerAnalytics
  isSelected: boolean; // Required for compatibility with RetailerAnalytics
  currentBeat?: string; // Current beat display name
  isUnassigned?: boolean; // Whether retailer is unassigned
  canBeReassigned?: boolean; // Whether retailer can be reassigned
  metrics: {
    avgOrders3Months: number;
    avgOrderPerVisit: number;
    visitsIn3Months: number;
  };
}

export const MyBeats = () => {
  const [beats, setBeats] = useState<Beat[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [allRetailers, setAllRetailers] = useState<Retailer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateBeatOpen, setIsCreateBeatOpen] = useState(false);
  const [beatName, setBeatName] = useState("");
  const [selectedRetailers, setSelectedRetailers] = useState<Set<string>>(new Set());
  const [selectedAnalyticsRetailer, setSelectedAnalyticsRetailer] = useState<Retailer | null>(null);
  const [loading, setLoading] = useState(true);
  const [travelAllowance, setTravelAllowance] = useState("");
  const [averageKm, setAverageKm] = useState("");
  const [averageTimeMinutes, setAverageTimeMinutes] = useState("");
  const [editingBeat, setEditingBeat] = useState<Beat | null>(null);
  const [isEditBeatOpen, setIsEditBeatOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Hierarchical user filter - multi-select like MyRetailers
  const { isManager, subordinates, subordinateIds } = useSubordinates();
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  
  // Initialize with self when user is available
  useEffect(() => {
    if (user?.id && selectedUserIds.length === 0) {
      setSelectedUserIds([user.id]);
    }
  }, [user?.id]);
  
  // Calculate effective user IDs for data filtering
  const effectiveUserIds = useMemo(() => {
    if (selectedUserIds.length === 0 && user?.id) {
      return [user.id];
    }
    return selectedUserIds;
  }, [selectedUserIds, user?.id]);
  const { recommendations, loading: recsLoading, generateRecommendation, provideFeedback } = useRecommendations('beat_visit');
  const [activeTab, setActiveTab] = useState('beats');
  const [showRetailerAnalytics, setShowRetailerAnalytics] = useState(false);
  const [selectedRetailerId, setSelectedRetailerId] = useState<string | null>(null);
  const [isAddRetailerModalOpen, setIsAddRetailerModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [beatSearchTerm, setBeatSearchTerm] = useState("");
  const [selectedBeatForAnalytics, setSelectedBeatForAnalytics] = useState<Beat | null>(null);
  const [selectedBeatForAI, setSelectedBeatForAI] = useState<string | null>(null);
  
  // Connectivity status
  const connectivityStatus = useConnectivity();
  const isOnline = connectivityStatus === 'online';
  
  // Recurrence state
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatType, setRepeatType] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('weekly');
  const [repeatDays, setRepeatDays] = useState<number[]>([1]); // Monday by default
  const [repeatEndDate, setRepeatEndDate] = useState<Date>(addMonths(new Date(), 1));
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [showRetailersList, setShowRetailersList] = useState(false);
  const [customIntervalDays, setCustomIntervalDays] = useState<number>(15);
  const [repeatUntilMode, setRepeatUntilMode] = useState<"date" | "permanent">("date");
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string>("");
  const [territories, setTerritories] = useState<any[]>([]);
  
  // Expense config for TA auto-population
  const [taType, setTaType] = useState<'fixed' | 'from_beat' | 'from_gps'>('from_beat');
  const [fixedTaAmount, setFixedTaAmount] = useState<number>(0);
  const [taPerKmRate, setTaPerKmRate] = useState<number>(0);
  
  // Monthly recurrence options
  const [monthlyType, setMonthlyType] = useState<"day" | "date">("day"); // "day" = First Monday, "date" = 15th
  const [monthlyWeek, setMonthlyWeek] = useState<"first" | "second" | "third" | "fourth" | "last">("first");
  const [monthlyDayOfWeek, setMonthlyDayOfWeek] = useState<number>(1); // 0=Sunday, 1=Monday, etc.
  const [monthlyDateOfMonth, setMonthlyDateOfMonth] = useState<number>(1); // 1-31
  
  // Beat creation options dialog
  const [showOptionsDialog, setShowOptionsDialog] = useState(false);
  const [createdBeatData, setCreatedBeatData] = useState<{beatId: string; beatName: string} | null>(null);
  
  // Delete state
  const [isDeleting, setIsDeleting] = useState(false);
  const [affectedRetailerCount, setAffectedRetailerCount] = useState(0);
  const [upcomingVisitsCount, setUpcomingVisitsCount] = useState(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [availableUsersForDialog, setAvailableUsersForDialog] = useState<{id: string; full_name: string}[]>([]);
  
  // Transfer state
  const [transferBeat, setTransferBeat] = useState<{id: string; name: string; retailerCount: number} | null>(null);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  
  // Deactivate state
  const [deactivateBeat, setDeactivateBeat] = useState<{id: string; name: string} | null>(null);
  
  // Stats detail dialog state
  const [statsDetailDialog, setStatsDetailDialog] = useState<'beats' | 'retailers' | 'unassigned' | 'average' | null>(null);
  
  // Delete confirmation dialog
  const { isOpen: isDeleteOpen, itemId: deleteItemId, itemName: deleteItemName, openDeleteDialog, closeDeleteDialog, setOpen: setDeleteOpen } = useDeleteConfirm();

  // Check for openCreateModal parameter and open modal if present
  useEffect(() => {
    if (searchParams.get('openCreateModal') === 'true') {
      setIsCreateBeatOpen(true);
      // Remove the parameter from URL after opening modal
      searchParams.delete('openCreateModal');
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams]);

  // Load data when user selection changes
  useEffect(() => {
    const loadData = async () => {
      if (effectiveUserIds.length > 0) {
        await loadBeats();
        await loadAllRetailers();
        
        if (isOnline) {
          await loadTerritories();
        }
      }
    };
    
    loadData();
  }, [effectiveUserIds, isOnline]);

  // Auto-populate retailers list when allRetailers loads and create modal is open
  useEffect(() => {
    if (isCreateBeatOpen && allRetailers.length > 0) {
      loadRetailersForCreateBeat();
    }
  }, [allRetailers, isCreateBeatOpen]);

  // Set up real-time updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('beats-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'retailers',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Retailer updated, reloading beats:', payload);
          // Reload beats and retailers when any retailer is updated
          loadBeats();
          loadAllRetailers();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'beat_plans',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Beat plan updated, reloading beats:', payload);
          // Reload when beat plans are updated
          loadBeats();
          loadAllRetailers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const loadBeats = async () => {
    if (effectiveUserIds.length === 0) {
      console.log('No user IDs available, skipping beat load');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      
      // STEP 1: ALWAYS load from cache FIRST (instant display, sub-1-second)
      const cachedBeats = await offlineStorage.getAll(STORES.BEATS);
      const cachedRetailers = await offlineStorage.getAll(STORES.RETAILERS);
      
      // Filter cached beats by selected users
      const userCachedBeats = cachedBeats.filter((b: any) => 
        effectiveUserIds.includes(b.user_id ?? b.created_by)
      );
      
      if (userCachedBeats.length > 0) {
        // Display cached data IMMEDIATELY
        const cachedRetailersData = cachedRetailers.filter((r: any) => 
          effectiveUserIds.includes(r.user_id) && r.beat_id && r.beat_id !== '' && r.beat_id !== 'unassigned'
        ).map((r: any) => ({ beat_id: r.beat_id }));
        
        const retailerCountMap = new Map<string, number>();
        cachedRetailersData.forEach((item: any) => {
          const beatId = item.beat_id;
          retailerCountMap.set(beatId, (retailerCountMap.get(beatId) || 0) + 1);
        });
        
        const beatsArray = userCachedBeats.map((beat: any, index) => ({
          id: beat.beat_id,
          name: beat.beat_name,
          retailer_count: retailerCountMap.get(beat.beat_id) || 0,
          total_retailers: retailerCountMap.get(beat.beat_id) || 0,
          category: beat.category || 'General',
          created_at: beat.created_at,
          travel_allowance: beat.travel_allowance || 0,
          average_km: beat.average_km || 0,
          average_time_minutes: beat.average_time_minutes || 0,
          beat_number: index + 1,
          retailers: []
        })).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        
        setBeats(beatsArray);
        setLoading(false); // Stop loading immediately
      } else {
        setLoading(false);
      }
      
      // STEP 2: If online, fetch fresh data in BACKGROUND and update cache
      if (navigator.onLine) {
        try {
          const { data: onlineBeats, error: beatsError } = await supabase
            .from('beats')
            .select('*')
            .eq('is_active', true)
            .in('user_id', effectiveUserIds)
            .order('created_at', { ascending: true });

          if (!beatsError && onlineBeats) {
            const beatsData = onlineBeats || [];
            
            // Clear only current user's beats and update cache
            await offlineStorage.clear(STORES.BEATS);
            for (const beat of beatsData) {
              await offlineStorage.save(STORES.BEATS, { ...beat, id: beat.beat_id });
            }

            // Fetch territories for beat names
            const { data: territoriesData } = await supabase
              .from('territories')
              .select('id, name');

            const territoriesMap = new Map();
            territoriesData?.forEach(t => territoriesMap.set(t.id, t.name));

            const { data: onlineRetailers, error: retailersError } = await supabase
              .from('retailers')
              .select('beat_id')
              .in('user_id', effectiveUserIds)
              .not('beat_id', 'is', null)
              .neq('beat_id', '')
              .neq('beat_id', 'unassigned');

            if (!retailersError && onlineRetailers) {
              const retailersData = onlineRetailers || [];
              
              // Update UI with fresh data
              const retailerCountMap = new Map<string, number>();
              retailersData.forEach((item: any) => {
                const beatId = item.beat_id;
                retailerCountMap.set(beatId, (retailerCountMap.get(beatId) || 0) + 1);
              });

              const beatsArray = beatsData.map((beat: any, index) => ({
                id: beat.beat_id,
                name: beat.beat_name,
                retailer_count: retailerCountMap.get(beat.beat_id) || 0,
                total_retailers: retailerCountMap.get(beat.beat_id) || 0,
                category: beat.category || 'General',
                created_at: beat.created_at,
                travel_allowance: beat.travel_allowance || 0,
                average_km: beat.average_km || 0,
                average_time_minutes: beat.average_time_minutes || 0,
                beat_number: index + 1,
                retailers: [],
                territory_id: beat.territory_id,
                territory_name: beat.territory_id ? territoriesMap.get(beat.territory_id) : null,
                owner_name: beat.owner_name || null
              })).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

              setBeats(beatsArray);
            }
          }
        } catch (error) {
          console.log('Background sync failed, using cached data:', error);
        }
      }
    } catch (error) {
      console.error('Error loading beats:', error);
      setLoading(false);
    }
  };

  const loadTerritories = async () => {
    if (!isOnline) {
      // In offline mode, skip loading territories
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('territories')
        .select('id, name')
        .order('name');

      if (!error && data) {
        setTerritories(data);
      }
    } catch (error) {
      console.error('Error loading territories:', error);
    }
  };

  const loadAllRetailers = async () => {
    if (effectiveUserIds.length === 0) {
      return;
    }
    
    try {
      // STEP 1: ALWAYS load from cache FIRST (instant display)
      const cachedRetailers = await offlineStorage.getAll(STORES.RETAILERS);
      const userRetailers = cachedRetailers.filter((r: any) => 
        effectiveUserIds.includes(r.user_id)
      );
      
      if (userRetailers.length > 0) {
        // Display cached data IMMEDIATELY
        const retailersWithMetrics = userRetailers.map((retailer: any) => ({
          id: retailer.id,
          name: retailer.name,
          address: retailer.address,
          phone: retailer.phone || 'N/A',
          category: retailer.category,
          type: retailer.retail_type || 'General Store',
          beat_id: retailer.beat_id,
          isSelected: false,
          metrics: {
            avgOrders3Months: Math.floor(Math.random() * 20) + 5,
            avgOrderPerVisit: Math.floor(Math.random() * 5000) + 1000,
            visitsIn3Months: Math.floor(Math.random() * 12) + 3
          }
        }));
        
        setAllRetailers(retailersWithMetrics);
      }
      
      // STEP 2: If online, fetch fresh data in BACKGROUND and update cache
      if (navigator.onLine && effectiveUserIds.length > 0) {
        try {
          const { data: onlineData, error } = await supabase
            .from('retailers')
            .select('*')
            .in('user_id', effectiveUserIds)
            .order('name');

          if (!error && onlineData) {
            // Update cache (single write to avoid UI hangs on large datasets)
            await offlineStorage.replaceAll(STORES.RETAILERS, onlineData);
            
            // Update UI with fresh data
            const retailersWithMetrics = onlineData.map((retailer: any) => ({
              id: retailer.id,
              name: retailer.name,
              address: retailer.address,
              phone: retailer.phone || 'N/A',
              category: retailer.category,
              type: retailer.retail_type || 'General Store',
              beat_id: retailer.beat_id,
              isSelected: false,
              metrics: {
                avgOrders3Months: Math.floor(Math.random() * 20) + 5,
                avgOrderPerVisit: Math.floor(Math.random() * 5000) + 1000,
                visitsIn3Months: Math.floor(Math.random() * 12) + 3
              }
            }));
            
            setAllRetailers(retailersWithMetrics);
          }
        } catch (error) {
          console.log('Background sync failed for retailers, using cached data:', error);
        }
      }
    } catch (error) {
      console.error('Error loading retailers:', error);
    }
  };

  const loadRetailersForCreateBeat = () => {
    console.log('Loading retailers for create beat. All retailers:', allRetailers.length);
    
    // If allRetailers is empty, we need to wait for the data to load
    if (allRetailers.length === 0) {
      console.log('No retailers loaded yet, retailers will be populated when data loads');
      setRetailers([]);
      return;
    }
    
    // Show ALL retailers with their current beat status
    const retailersForBeat = allRetailers.map(retailer => {
      const currentBeatId = retailer.beat_id;
      let beatDisplayName = 'Unassigned';
      
      // If retailer has a beat_id, try to find the beat name
      if (currentBeatId && currentBeatId !== 'unassigned' && currentBeatId !== '') {
        const beat = beats.find(b => b.id === currentBeatId);
        beatDisplayName = beat ? beat.name : currentBeatId;
      }
      
      const isUnassigned = !currentBeatId || currentBeatId === 'unassigned' || currentBeatId === '';
      
      console.log(`Retailer ${retailer.name}: beat_id=${currentBeatId}, beatName=${beatDisplayName}, isUnassigned=${isUnassigned}`);
      
      return {
        ...retailer,
        isSelected: false,
        currentBeat: beatDisplayName,
        isUnassigned: isUnassigned,
        canBeReassigned: true // Allow all retailers to be reassigned to new beats
      };
    });
    
    console.log('All retailers for beat creation:', retailersForBeat.length);
    setRetailers(retailersForBeat);
    setSelectedRetailers(new Set());
  };

  const handleCreateBeat = async () => {
    // First, ensure we have the latest retailers data
    await loadAllRetailers();
    // Use a small delay to let React state update before reading allRetailers
    setTimeout(() => {
      loadRetailersForCreateBeat();
    }, 100);
    setIsCreateBeatOpen(true);
    setBeatName("");
    setAverageKm("");
    setAverageTimeMinutes("");
    
    // Fetch expense config to determine TA behavior
    try {
      const { globalConfig, userConfigMap, teamConfigMap, userGroupConfigMap } = await fetchExpenseConfigs();
      const managerId = user?.id ? await fetchUserManagerId(user.id) : null;
      const resolved = resolveExpenseConfig(user?.id || '', managerId, globalConfig, userConfigMap, teamConfigMap, userGroupConfigMap);
      setTaType(resolved.ta_type);
      setFixedTaAmount(resolved.fixed_ta_amount);
      setTaPerKmRate(resolved.ta_per_km_rate);
      if (resolved.ta_type === 'fixed') {
        setTravelAllowance(resolved.fixed_ta_amount.toString());
      } else {
        setTravelAllowance("");
      }
    } catch (err) {
      console.error('Error fetching expense config:', err);
      setTaType('from_beat');
      setTravelAllowance("");
    }
  };

  const handleRetailerSelection = (retailerId: string) => {
    const newSelectedRetailers = new Set(selectedRetailers);
    if (newSelectedRetailers.has(retailerId)) {
      newSelectedRetailers.delete(retailerId);
    } else {
      newSelectedRetailers.add(retailerId);
    }
    setSelectedRetailers(newSelectedRetailers);

    // Update retailers list to reflect selection
    setRetailers(retailers.map(retailer => ({
      ...retailer,
      isSelected: newSelectedRetailers.has(retailer.id)
    })));
  };

  const handleSaveBeat = async () => {
    if (!beatName.trim()) {
      toast.error('Please enter a beat name');
      return;
    }

    // Check for duplicate beat name
    const duplicateBeat = beats.find(
      beat => beat.name.toLowerCase() === beatName.trim().toLowerCase()
    );
    
    if (duplicateBeat) {
      toast.error(`Beat name "${beatName.trim()}" already exists. Please use a different name.`);
      return;
    }

    if (repeatEnabled && repeatType === 'weekly' && repeatDays.length === 0) {
      toast.error("Please select at least one day for weekly repeat");
      return;
    }

    if (repeatEnabled && repeatType === 'custom' && (!customIntervalDays || customIntervalDays < 1)) {
      toast.error("Please enter a valid number of days (minimum 1) for custom interval");
      return;
    }

    if (repeatEnabled && repeatUntilMode === "date" && !repeatEndDate) {
      toast.error("Please select an end date for the recurring beat");
      return;
    }

    if (!user) return;

    setIsCreating(true);
    try {
      // Generate unique beat ID
      const beatId = `beat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const beatData = {
        beat_id: beatId,
        beat_name: beatName.trim(),
        category: 'General',
        travel_allowance: taType === 'fixed' ? fixedTaAmount : (parseFloat(travelAllowance) || 0),
        average_km: parseFloat(averageKm) || 0,
        average_time_minutes: parseInt(averageTimeMinutes) || 0,
        created_by: user.id,
        owner_id: user.id,
        user_id: user.id,
        is_active: true,
        territory_id: selectedTerritoryId || null,
        created_at: new Date().toISOString()
      };
      
      // Insert beat into database
      const { error: beatError } = await supabase
        .from('beats')
        .insert([beatData]);
      
      if (beatError) throw beatError;
      
      // Update selected retailers with beat information (only if retailers are selected)
      if (selectedRetailers.size > 0) {
        const { error: retailerError } = await supabase
          .from('retailers')
          .update({ 
            beat_id: beatId,
            beat_name: beatName.trim()
          })
          .in('id', Array.from(selectedRetailers));
        
        if (retailerError) throw retailerError;
      }

      // Create beat allowance record
      const allowanceData = {
        id: `allowance_${Date.now()}`,
        user_id: user.id,
        beat_id: beatId,
        beat_name: beatName.trim(),
        daily_allowance: 0,
        travel_allowance: parseFloat(travelAllowance) || 0,
        average_km: parseFloat(averageKm) || 0,
        average_time_minutes: parseInt(averageTimeMinutes) || 0,
        created_at: new Date().toISOString()
      };
      
      try {
        await supabase.from('beat_allowances').insert(allowanceData);
      } catch (error) {
        console.error('Error creating beat allowance:', error);
      }

      // Create beat plans if recurrence is enabled
      if (repeatEnabled) {
        const endDate = repeatUntilMode === "permanent" ? addDays(new Date(), 365) : repeatEndDate;
        await generateBeatPlans(beatId, endDate, beatName.trim());
      }

      // Log beat creation in audit log
      try {
        await supabase.from('beat_audit_log' as any).insert({
          beat_id: beatId,
          action: 'create',
          old_user_id: null,
          new_user_id: user.id,
          metadata: { beat_name: beatName.trim(), retailer_count: selectedRetailers.size },
          performed_by: user.id,
        });
      } catch (e) {
        console.error('Error inserting audit log:', e);
      }

      // Show options dialog for beat placement
      setCreatedBeatData({ beatId, beatName: beatName.trim() });
      setShowOptionsDialog(true);
    } catch (error) {
      console.error('Error creating beat:', error);
      toast.error('Failed to create beat');
    } finally {
      setIsCreating(false);
    }
  };

  const generateBeatPlans = async (beatId: string, endDate: Date, beatNameParam?: string) => {
    const resolvedBeatName = beatNameParam || beatName.trim();
    if (!user?.id || !resolvedBeatName) {
      console.error('generateBeatPlans: missing user or beat name');
      return;
    }
    
    try {
      const beatPlans: any[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let currentDate = new Date(today);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      while (currentDate <= end) {
        let shouldAddDate = false;

        if (repeatType === 'daily') {
          shouldAddDate = true;
        } else if (repeatType === 'weekly') {
          const dayOfWeek = currentDate.getDay();
          shouldAddDate = repeatDays.includes(dayOfWeek);
        } else if (repeatType === 'monthly') {
          if (monthlyType === 'date') {
            shouldAddDate = currentDate.getDate() === monthlyDateOfMonth;
          } else {
            const dayOfWeek = currentDate.getDay();
            if (dayOfWeek === monthlyDayOfWeek) {
              const dateOfMonth = currentDate.getDate();
              const weekOfMonth = Math.ceil(dateOfMonth / 7);
              
              if (monthlyWeek === 'first') shouldAddDate = weekOfMonth === 1;
              else if (monthlyWeek === 'second') shouldAddDate = weekOfMonth === 2;
              else if (monthlyWeek === 'third') shouldAddDate = weekOfMonth === 3;
              else if (monthlyWeek === 'fourth') shouldAddDate = weekOfMonth === 4;
              else if (monthlyWeek === 'last') {
                const nextWeek = addDays(currentDate, 7);
                shouldAddDate = nextWeek.getMonth() !== currentDate.getMonth();
              }
            }
          }
        } else if (repeatType === 'custom') {
          const daysDiff = Math.floor((currentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          shouldAddDate = daysDiff % customIntervalDays === 0;
        }

        if (shouldAddDate) {
          beatPlans.push({
            user_id: user.id,
            beat_id: beatId,
            beat_name: resolvedBeatName,
            plan_date: format(currentDate, 'yyyy-MM-dd'),
            beat_data: {
              retailer_ids: Array.from(selectedRetailers)
            }
          });
        }

        currentDate = addDays(currentDate, 1);
      }

      console.log(`[generateBeatPlans] Generated ${beatPlans.length} plans for beat "${resolvedBeatName}" (${beatId})`);

      if (beatPlans.length > 0) {
        // Insert in batches of 500 to avoid payload limits
        const batchSize = 500;
        let inserted = 0;
        for (let i = 0; i < beatPlans.length; i += batchSize) {
          const batch = beatPlans.slice(i, i + batchSize);
          const { error: planError } = await supabase
            .from('beat_plans')
            .insert(batch);

          if (planError) {
            console.error('Error creating beat plans batch:', planError);
            toast.error(`Failed to create some scheduled visits: ${planError.message}`);
            return;
          }
          inserted += batch.length;
        }
        toast.success(`Created ${inserted} scheduled visits for "${resolvedBeatName}"`);
      } else {
        toast.info('No dates matched the selected schedule pattern');
      }
    } catch (error: any) {
      console.error('Error generating beat plans:', error);
      toast.error(`Failed to create beat schedule: ${error.message}`);
    }
  };
  const handleRetailerAdded = (retailerId: string, retailerName: string) => {
    setSelectedRetailers(prev => new Set(prev).add(retailerId));
    loadAllRetailers();
    setIsAddRetailerModalOpen(false);
    toast.success(`Retailer "${retailerName}" added and selected`);
  };

  const handleWeekDayToggle = (day: number) => {
    setRepeatDays(prev => {
      const newDays = prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day].sort();
      return newDays;
    });
  };

  const handleAddBeatForToday = async () => {
    if (!createdBeatData || !user) return;
    
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Check if beat plan for today already exists
      const { data: existingPlan } = await supabase
        .from('beat_plans')
        .select('id')
        .eq('user_id', user.id)
        .eq('beat_id', createdBeatData.beatId)
        .eq('plan_date', today)
        .maybeSingle();
      
      if (existingPlan) {
        toast.success(`"${createdBeatData.beatName}" is already scheduled for today`);
        closeOptionsDialog();
        return;
      }
      
      const beatPlanData = {
        user_id: user.id,
        beat_id: createdBeatData.beatId,
        beat_name: createdBeatData.beatName,
        plan_date: today,
        beat_data: {
          retailer_ids: Array.from(selectedRetailers)
        }
      };

      const { error } = await supabase
        .from('beat_plans')
        .insert(beatPlanData);
      
      if (error) throw error;

      toast.success(`"${createdBeatData.beatName}" has been added to today's visit list`);

      // Dispatch event to refresh My Visits page
      window.dispatchEvent(new CustomEvent('visitDataChanged'));
      
      closeOptionsDialog();
    } catch (error: any) {
      console.error('Error adding beat to today:', error);
      toast.error('Failed to add beat to today');
    }
  };

  const handleSaveBeatOnly = () => {
    toast.success(`"${createdBeatData?.beatName}" has been saved to All Beats`);
    closeOptionsDialog();
  };

  const closeOptionsDialog = () => {
    setShowOptionsDialog(false);
    setIsCreateBeatOpen(false);
    setBeatName("");
    setTravelAllowance("");
    setAverageKm("");
    setAverageTimeMinutes("");
    setSelectedRetailers(new Set());
    setSelectedTerritoryId("");
    setRepeatEnabled(false);
    setRepeatType('weekly');
    setRepeatDays([1]);
    setRepeatEndDate(addMonths(new Date(), 1));
    setCustomIntervalDays(15);
    setRepeatUntilMode("date");
    
    // Reload data
    loadBeats();
    loadAllRetailers();
  };

  const handleDeleteBeatClick = async (beatId: string, beatName: string) => {
    try {
      // Fetch retailer count
      const { count: retailerCount } = await supabase
        .from('retailers')
        .select('id', { count: 'exact', head: true })
        .eq('beat_id', beatId)
        .eq('user_id', user?.id);
      setAffectedRetailerCount(retailerCount || 0);

      // Fetch upcoming visits count
      const today = new Date().toISOString().split('T')[0];
      const { count: visitsCount } = await supabase
        .from('beat_plans')
        .select('id', { count: 'exact', head: true })
        .eq('beat_id', beatId)
        .gte('plan_date', today);
      setUpcomingVisitsCount(visitsCount || 0);

      // Fetch pending orders count
      const { count: ordersCount } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('beat_id', beatId)
        .eq('status', 'pending');
      setPendingOrdersCount(ordersCount || 0);

      // Fetch available users
      const { data: users } = await supabase.rpc('get_profiles_for_selector');
      setAvailableUsersForDialog(
        (users || []).filter((u: any) => u.id !== user?.id).map((u: any) => ({ id: u.id, full_name: u.full_name }))
      );
    } catch (error) {
      console.error('Error fetching impact data:', error);
      setAffectedRetailerCount(0);
      setUpcomingVisitsCount(0);
      setPendingOrdersCount(0);
    }
    openDeleteDialog(beatId, beatName);
  };

  const handleConfirmDeleteBeat = async (deleteOption: 'delete' | 'transfer' | 'reassign' | 'unassign', targetBeatId?: string, targetUserId?: string, createNewBeat?: boolean) => {
    if (!deleteItemId || !deleteItemName || !user) {
      closeDeleteDialog();
      return;
    }

    setIsDeleting(true);

    try {
      // Get beat data for recycle bin
      const beatData = beats.find(b => b.id === deleteItemId);
      if (beatData) {
        await moveToRecycleBin({
          tableName: 'beats',
          recordId: deleteItemId,
          recordData: beatData,
          moduleName: 'Beats',
          recordName: deleteItemName
        });
      }

      // Handle retailers based on selected option
      if (deleteOption === 'delete') {
        const { data: retailersToDelete } = await supabase
          .from('retailers')
          .select('*')
          .eq('beat_id', deleteItemId)
          .eq('user_id', user.id);

        if (retailersToDelete && retailersToDelete.length > 0) {
          for (const retailer of retailersToDelete) {
            await moveToRecycleBin({
              tableName: 'retailers',
              recordId: retailer.id,
              recordData: retailer,
              moduleName: 'Retailers',
              recordName: retailer.name || 'Unknown Retailer'
            });
          }

          const { error: deleteRetailersError } = await supabase
            .from('retailers')
            .delete()
            .eq('beat_id', deleteItemId)
            .eq('user_id', user.id);

          if (deleteRetailersError) throw deleteRetailersError;

          const cachedRetailers = await offlineStorage.getAll(STORES.RETAILERS);
          const retailerIdsToDelete = new Set(retailersToDelete.map(r => r.id));
          for (const r of cachedRetailers as any[]) {
            if (retailerIdsToDelete.has(r.id)) {
              await offlineStorage.delete(STORES.RETAILERS, r.id);
            }
          }
        }
      } else if (deleteOption === 'transfer' && targetBeatId) {
        const targetBeat = beats.find(b => b.id === targetBeatId);
        const { error: transferError } = await supabase
          .from('retailers')
          .update({
            beat_id: targetBeatId,
            beat_name: targetBeat?.name || null
          })
          .eq('beat_id', deleteItemId)
          .eq('user_id', user.id);

        if (transferError) throw transferError;

        const cachedRetailers = await offlineStorage.getAll(STORES.RETAILERS);
        const retailersToUpdate = (cachedRetailers as any[]).filter(
          (r: any) => r.beat_id === deleteItemId && r.user_id === user.id
        );
        for (const retailer of retailersToUpdate) {
          await offlineStorage.save(STORES.RETAILERS, {
            ...retailer,
            beat_id: targetBeatId,
            beat_name: targetBeat?.name || null
          });
        }
      } else if (deleteOption === 'reassign' && targetUserId) {
        let newBeatId: string | null = null;
        if (createNewBeat) {
          const targetUser = availableUsersForDialog.find(u => u.id === targetUserId);
          const newBeatName = `${deleteItemName} - ${targetUser?.full_name || 'User'}`;
          newBeatId = `beat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          await supabase.from('beats').insert({
            beat_id: newBeatId,
            beat_name: newBeatName,
            created_by: targetUserId,
            owner_id: targetUserId,
            user_id: targetUserId,
            is_active: true,
            category: 'General',
            owner_name: targetUser?.full_name || null,
          });
        }

        const updateData: any = { user_id: targetUserId };
        if (newBeatId) {
          updateData.beat_id = newBeatId;
          updateData.beat_name = `${deleteItemName} - ${availableUsersForDialog.find(u => u.id === targetUserId)?.full_name || 'User'}`;
        }

        await supabase
          .from('retailers')
          .update(updateData)
          .eq('beat_id', deleteItemId)
          .eq('user_id', user.id);
      } else if (deleteOption === 'unassign') {
        await supabase
          .from('retailers')
          .update({ beat_id: null, beat_name: null })
          .eq('beat_id', deleteItemId)
          .eq('user_id', user.id);
      }

      // Delete ALL beat plans for this beat
      const { error: planError } = await supabase
        .from('beat_plans')
        .delete()
        .eq('beat_id', deleteItemId);

      if (planError) console.error('Error deleting beat plans:', planError);

      // Delete beat allowance if exists for this user
      const { error: allowanceError } = await supabase
        .from('beat_allowances')
        .delete()
        .eq('beat_id', deleteItemId)
        .eq('user_id', user.id);

      if (allowanceError) console.error('Error deleting beat allowance:', allowanceError);

      // Mark beat as inactive (soft delete)
      const { error: beatError } = await supabase
        .from('beats')
        .update({ is_active: false })
        .eq('beat_id', deleteItemId)
        .or(`user_id.eq.${user.id},created_by.eq.${user.id}`);

      if (beatError) throw beatError;

      // Insert audit log
      try {
        await supabase.from('beat_audit_log' as any).insert({
          beat_id: deleteItemId,
          action: 'delete',
          old_user_id: user.id,
          new_user_id: deleteOption === 'reassign' ? targetUserId : null,
          metadata: { 
            beat_name: deleteItemName, 
            delete_option: deleteOption, 
            retailer_count: affectedRetailerCount 
          },
          performed_by: user.id,
        });
      } catch (e) {
        console.error('Error inserting audit log:', e);
      }

      // IMMEDIATE UI UPDATE
      setBeats(prev => prev.filter(b => b.id !== deleteItemId));

      // Clear offline cache for beat plans
      const cachedPlans = await offlineStorage.getAll(STORES.BEAT_PLANS);
      const plansToDelete = (cachedPlans as any[]).filter((plan: any) => plan.beat_id === deleteItemId);
      for (const plan of plansToDelete) {
        await offlineStorage.delete(STORES.BEAT_PLANS, (plan as any).id);
      }

      await offlineStorage.delete(STORES.BEATS, deleteItemId);

      const today = new Date();
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        await clearMyVisitsSnapshot(user.id, dateStr);
      }

      const actionText = deleteOption === 'delete'
        ? `and ${affectedRetailerCount} retailer(s) deleted`
        : deleteOption === 'transfer'
          ? `and retailers transferred`
          : deleteOption === 'reassign'
            ? `and retailers reassigned`
            : deleteOption === 'unassign'
              ? `and retailers marked as unassigned`
              : '';
      toast.success(`Beat "${deleteItemName}" deleted ${actionText}`.trim());
      
      window.dispatchEvent(new CustomEvent('visitDataChanged'));
      window.dispatchEvent(new CustomEvent('beatDeleted', { detail: { beatId: deleteItemId } }));
      window.dispatchEvent(new CustomEvent('forceVisitsRefresh'));
      
      loadAllRetailers();
      loadBeats();
    } catch (error) {
      console.error('Error deleting beat:', error);
      toast.error('Failed to delete beat');
      loadBeats();
    } finally {
      setIsDeleting(false);
      closeDeleteDialog();
      setAffectedRetailerCount(0);
      setUpcomingVisitsCount(0);
      setPendingOrdersCount(0);
    }
  };

  const handleTransferBeat = async (beatId: string, beatName: string) => {
    const beat = beats.find(b => b.id === beatId);
    // Fetch users
    const { data: users } = await supabase.rpc('get_profiles_for_selector');
    setAvailableUsersForDialog(
      (users || []).filter((u: any) => u.id !== user?.id).map((u: any) => ({ id: u.id, full_name: u.full_name }))
    );
    setTransferBeat({ id: beatId, name: beatName, retailerCount: beat?.retailer_count || 0 });
    setIsTransferOpen(true);
  };

  const handleDeactivateBeat = (beatId: string, beatName: string) => {
    setDeactivateBeat({ id: beatId, name: beatName });
  };

  const confirmDeactivateBeat = async () => {
    if (!deactivateBeat || !user) return;
    try {
      await supabase
        .from('beats')
        .update({ is_active: false })
        .eq('beat_id', deactivateBeat.id)
        .or(`user_id.eq.${user.id},created_by.eq.${user.id}`);

      await supabase.from('beat_audit_log' as any).insert({
        beat_id: deactivateBeat.id,
        action: 'deactivate',
        old_user_id: user.id,
        metadata: { beat_name: deactivateBeat.name },
        performed_by: user.id,
      });

      setBeats(prev => prev.filter(b => b.id !== deactivateBeat.id));
      toast.success(`Beat "${deactivateBeat.name}" deactivated`);
      window.dispatchEvent(new CustomEvent('visitDataChanged'));
    } catch (error) {
      console.error('Error deactivating beat:', error);
      toast.error('Failed to deactivate beat');
    } finally {
      setDeactivateBeat(null);
    }
  };


  const handleAddBeats = () => {
    navigate('/add-beat');
  };

  const handleEditBeat = (beat: Beat) => {
    setEditingBeat(beat);
    setIsEditBeatOpen(true);
  };

  const handleEditBeatClose = () => {
    setEditingBeat(null);
    setIsEditBeatOpen(false);
  };

  const handleBeatUpdated = () => {
    loadBeats();
    loadAllRetailers();
  };

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const filteredRetailers = retailers.filter(retailer =>
    retailer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    retailer.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    retailer.phone.includes(searchTerm)
  );

  const filteredBeats = beats.filter((beat) =>
    beat.name.toLowerCase().includes(beatSearchTerm.toLowerCase())
  );

  // Pagination for beats - 10 items per page
  const {
    currentPage: beatsCurrentPage,
    totalPages: beatsTotalPages,
    paginatedItems: paginatedBeats,
    goToPage: beatsGoToPage,
    nextPage: beatsNextPage,
    prevPage: beatsPrevPage,
    startIndex: beatsStartIndex,
    endIndex: beatsEndIndex,
    totalItems: beatsTotalItems,
    hasNextPage: beatsHasNextPage,
    hasPrevPage: beatsHasPrevPage,
  } = usePagination(filteredBeats, { pageSize: 10 });

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-6">
        {/* Header Section */}
        <Card className="bg-gradient-primary text-primary-foreground">
          <CardHeader className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-2xl font-bold">My Beats</CardTitle>
                    <ModuleHelpButton categoryId="retailers" variant="onDark" />
                  </div>
                  <p className="text-primary-foreground/80 mt-1">Manage your sales territories and routes</p>
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    {/* Multi-User Selector below title */}
                    <CompactMultiUserSelector
                      selectedUserIds={selectedUserIds}
                      onSelectionChange={setSelectedUserIds}
                      className="bg-primary-foreground/10 border-primary-foreground/20"
                    />
                  </div>
                </div>
              </div>
              <Button 
                onClick={handleCreateBeat}
                variant="secondary"
                className="flex items-center gap-2 bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/20"
              >
                <Plus className="h-4 w-4" />
                Create New Beat
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card 
            className="text-center cursor-pointer hover:shadow-md transition-shadow hover:border-primary"
            onClick={() => setStatsDetailDialog('beats')}
          >
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-primary">{beats.length}</div>
              <div className="text-sm text-muted-foreground">Total Beats</div>
            </CardContent>
          </Card>
          <Card 
            className="text-center cursor-pointer hover:shadow-md transition-shadow hover:border-green-500"
            onClick={() => setStatsDetailDialog('retailers')}
          >
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">
                {beats.reduce((sum, beat) => sum + beat.retailer_count, 0)}
              </div>
              <div className="text-sm text-muted-foreground">Total Retailers</div>
            </CardContent>
          </Card>
          <Card 
            className="text-center cursor-pointer hover:shadow-md transition-shadow hover:border-orange-500"
            onClick={() => setStatsDetailDialog('unassigned')}
          >
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-orange-600">
                {allRetailers.filter(r => !r.beat_id || r.beat_id === 'unassigned').length}
              </div>
              <div className="text-sm text-muted-foreground">Unassigned</div>
            </CardContent>
          </Card>
          <Card 
            className="text-center cursor-pointer hover:shadow-md transition-shadow hover:border-blue-500"
            onClick={() => setStatsDetailDialog('average')}
          >
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600">
                {beats.length > 0 ? Math.round(beats.reduce((sum, beat) => sum + beat.retailer_count, 0) / beats.length) : 0}
              </div>
              <div className="text-sm text-muted-foreground">Avg per Beat</div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Detail Dialog */}
        <Dialog open={statsDetailDialog !== null} onOpenChange={(open) => !open && setStatsDetailDialog(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {statsDetailDialog === 'beats' && (
                  <>
                    <Hash className="h-5 w-5 text-primary" />
                    Total Beats Breakdown
                  </>
                )}
                {statsDetailDialog === 'retailers' && (
                  <>
                    <Store className="h-5 w-5 text-green-600" />
                    Retailers by Beat
                  </>
                )}
                {statsDetailDialog === 'unassigned' && (
                  <>
                    <AlertCircle className="h-5 w-5 text-orange-600" />
                    Unassigned Retailers
                  </>
                )}
                {statsDetailDialog === 'average' && (
                  <>
                    <Percent className="h-5 w-5 text-blue-600" />
                    Beat Distribution Analysis
                  </>
                )}
              </DialogTitle>
            </DialogHeader>
            
            <ScrollArea className="max-h-[60vh]">
              {/* Total Beats Detail */}
              {statsDetailDialog === 'beats' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-3xl font-bold text-primary">{beats.length}</div>
                        <div className="text-sm text-muted-foreground">Active Beats</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-3xl font-bold text-green-600">
                          {beats.reduce((sum, beat) => sum + beat.retailer_count, 0)}
                        </div>
                        <div className="text-sm text-muted-foreground">Total Retailers</div>
                      </CardContent>
                    </Card>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Beat Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Retailers</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {beats.map((beat, index) => (
                        <TableRow 
                          key={beat.id} 
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            setStatsDetailDialog(null);
                            navigate(`/beats/${beat.id}`);
                          }}
                        >
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell>{beat.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{beat.category || 'General'}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{beat.retailer_count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Retailers by Beat Detail */}
              {statsDetailDialog === 'retailers' && (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Beat Name</TableHead>
                        <TableHead className="text-right">Retailer Count</TableHead>
                        <TableHead className="text-right">% of Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {beats
                        .sort((a, b) => b.retailer_count - a.retailer_count)
                        .map((beat) => {
                          const totalRetailers = beats.reduce((sum, b) => sum + b.retailer_count, 0);
                          const percentage = totalRetailers > 0 
                            ? ((beat.retailer_count / totalRetailers) * 100).toFixed(1) 
                            : '0';
                          return (
                            <TableRow 
                              key={beat.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => {
                                setStatsDetailDialog(null);
                                navigate(`/beats/${beat.id}`);
                              }}
                            >
                              <TableCell className="font-medium">{beat.name}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant="secondary">{beat.retailer_count}</Badge>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {percentage}%
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                  <div className="text-sm text-muted-foreground text-center pt-2 border-t">
                    Total: {beats.reduce((sum, beat) => sum + beat.retailer_count, 0)} retailers across {beats.length} beats
                  </div>
                </div>
              )}

              {/* Unassigned Retailers Detail */}
              {statsDetailDialog === 'unassigned' && (
                <div className="space-y-4">
                  {allRetailers.filter(r => !r.beat_id || r.beat_id === 'unassigned').length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                      <p className="text-muted-foreground">All retailers are assigned to beats!</p>
                    </div>
                  ) : (
                    <>
                      <div className="bg-orange-50 dark:bg-orange-950/20 p-3 rounded-lg mb-4">
                        <p className="text-sm text-orange-700 dark:text-orange-400">
                          {allRetailers.filter(r => !r.beat_id || r.beat_id === 'unassigned').length} retailers need to be assigned to beats
                        </p>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Retailer Name</TableHead>
                            <TableHead>Address</TableHead>
                            <TableHead>Category</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {allRetailers
                            .filter(r => !r.beat_id || r.beat_id === 'unassigned')
                            .slice(0, 20)
                            .map((retailer) => (
                              <TableRow 
                                key={retailer.id}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => {
                                  setStatsDetailDialog(null);
                                  navigate(`/retailers/${retailer.id}`);
                                }}
                              >
                                <TableCell className="font-medium">{retailer.name}</TableCell>
                                <TableCell className="text-muted-foreground max-w-[200px] truncate">
                                  {retailer.address}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{retailer.category || 'N/A'}</Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                      {allRetailers.filter(r => !r.beat_id || r.beat_id === 'unassigned').length > 20 && (
                        <p className="text-sm text-muted-foreground text-center">
                          Showing 20 of {allRetailers.filter(r => !r.beat_id || r.beat_id === 'unassigned').length} unassigned retailers
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Average per Beat Analysis */}
              {statsDetailDialog === 'average' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-blue-600">
                          {beats.length > 0 ? Math.round(beats.reduce((sum, beat) => sum + beat.retailer_count, 0) / beats.length) : 0}
                        </div>
                        <div className="text-xs text-muted-foreground">Average</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {beats.length > 0 ? Math.max(...beats.map(b => b.retailer_count)) : 0}
                        </div>
                        <div className="text-xs text-muted-foreground">Maximum</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-orange-600">
                          {beats.length > 0 ? Math.min(...beats.map(b => b.retailer_count)) : 0}
                        </div>
                        <div className="text-xs text-muted-foreground">Minimum</div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Beat Name</TableHead>
                        <TableHead className="text-right">Retailers</TableHead>
                        <TableHead className="text-right">vs Avg</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {beats
                        .sort((a, b) => b.retailer_count - a.retailer_count)
                        .map((beat) => {
                          const avg = beats.length > 0 
                            ? beats.reduce((sum, b) => sum + b.retailer_count, 0) / beats.length 
                            : 0;
                          const diff = beat.retailer_count - avg;
                          return (
                            <TableRow 
                              key={beat.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => {
                                setStatsDetailDialog(null);
                                navigate(`/beats/${beat.id}`);
                              }}
                            >
                              <TableCell className="font-medium">{beat.name}</TableCell>
                              <TableCell className="text-right">{beat.retailer_count}</TableCell>
                              <TableCell className="text-right">
                                <Badge 
                                  variant={diff >= 0 ? "default" : "secondary"}
                                  className={diff >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                                >
                                  {diff >= 0 ? '+' : ''}{Math.round(diff)}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              type="text"
              placeholder="Search beats by name..."
              value={beatSearchTerm}
              onChange={(e) => setBeatSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Beats Section */}
        <div className="mt-6">
            {/* Beats Grid */}
            {beats.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="space-y-4">
                    <Users className="h-16 w-16 mx-auto text-muted-foreground" />
                    <div>
                      <h3 className="text-xl font-semibold mb-2">No beats created yet</h3>
                      <p className="text-muted-foreground mb-4">Create your first beat to organize your retailers into manageable routes</p>
                    </div>
                    <Button onClick={handleCreateBeat} className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Create Your First Beat
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <h2 className="text-lg font-semibold">Your Beats ({filteredBeats.length} of {beats.length})</h2>
                </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedBeats.map((beat) => (
                <BeatCard
                  key={beat.id}
                  beat={beat}
                  userId={user?.id || ''}
                  onEdit={() => handleEditBeat(beat)}
                  onDelete={() => handleDeleteBeatClick(beat.id, beat.name)}
                  onDetails={() => setSelectedBeatForAnalytics(beat)}
                  onAIInsights={() => {
                    setSelectedBeatForAI(beat.id);
                    generateRecommendation('beat_visit', beat.id);
                  }}
                  onTransfer={() => handleTransferBeat(beat.id, beat.name)}
                  onDeactivate={() => handleDeactivateBeat(beat.id, beat.name)}
                />
              ))}
            </div>
            
            {/* Beats Pagination */}
            <PaginationControls
              currentPage={beatsCurrentPage}
              totalPages={beatsTotalPages}
              startIndex={beatsStartIndex}
              endIndex={beatsEndIndex}
              totalItems={beatsTotalItems}
              hasNextPage={beatsHasNextPage}
              hasPrevPage={beatsHasPrevPage}
              onNextPage={beatsNextPage}
              onPrevPage={beatsPrevPage}
              onGoToPage={beatsGoToPage}
            />
          </div>
        )}
        </div>

        {/* Create Beat Modal */}
        <Dialog open={isCreateBeatOpen} onOpenChange={setIsCreateBeatOpen}>
          <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Create New Beat
              </DialogTitle>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {/* Beat Name */}
              <div className="space-y-2">
                <Label htmlFor="beatName">Beat Name</Label>
                <Input
                  id="beatName"
                  placeholder="Enter beat name"
                  value={beatName}
                  onChange={(e) => setBeatName(e.target.value)}
                  className={beats.some(b => b.name.toLowerCase() === beatName.trim().toLowerCase()) && beatName.trim() ? 'border-destructive' : ''}
                />
                {beatName.trim() && beats.some(b => b.name.toLowerCase() === beatName.trim().toLowerCase()) && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    A beat with this name already exists
                  </p>
                )}
              </div>

              {/* Schedule Recurring Visits - Moved here from bottom */}
              <div className="space-y-4 border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="repeatEnabledTop"
                    checked={repeatEnabled}
                    onChange={(e) => setRepeatEnabled(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="repeatEnabledTop" className="flex items-center gap-2 cursor-pointer">
                    <Repeat className="h-4 w-4" />
                    Schedule Recurring Visits
                  </Label>
                </div>

                {repeatEnabled && (
                  <div className="space-y-4 pl-6">
                    <div className="space-y-2">
                      <Label>Repeat Frequency</Label>
                      <RadioGroup value={repeatType} onValueChange={(value: any) => setRepeatType(value)}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="daily" id="daily-top" />
                          <Label htmlFor="daily-top" className="cursor-pointer">Daily</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="weekly" id="weekly-top" />
                          <Label htmlFor="weekly-top" className="cursor-pointer">Weekly</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="monthly" id="monthly-top" />
                          <Label htmlFor="monthly-top" className="cursor-pointer">Monthly</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="custom" id="custom-top" />
                          <Label htmlFor="custom-top" className="cursor-pointer">Custom Interval</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {repeatType === 'custom' && (
                      <div className="space-y-2">
                        <Label>Repeat Every (Days) *</Label>
                        <Input
                          type="number"
                          min="1"
                          value={customIntervalDays}
                          onChange={(e) => setCustomIntervalDays(parseInt(e.target.value) || 1)}
                          placeholder="Enter number of days"
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground">
                          Visit will repeat every {customIntervalDays} day(s)
                        </p>
                      </div>
                    )}

                    {repeatType === 'weekly' && (
                      <div className="space-y-2">
                        <Label>Select Days</Label>
                        <div className="flex gap-2 flex-wrap">
                          {[
                            { label: 'Sun', value: 0 },
                            { label: 'Mon', value: 1 },
                            { label: 'Tue', value: 2 },
                            { label: 'Wed', value: 3 },
                            { label: 'Thu', value: 4 },
                            { label: 'Fri', value: 5 },
                            { label: 'Sat', value: 6 },
                          ].map(day => (
                            <Button
                              key={day.value}
                              type="button"
                              size="sm"
                              variant={repeatDays.includes(day.value) ? "default" : "outline"}
                              onClick={() => handleWeekDayToggle(day.value)}
                            >
                              {day.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {repeatType === 'monthly' && (
                      <div className="space-y-3">
                        <Label>Monthly Schedule</Label>
                        
                        <RadioGroup value={monthlyType} onValueChange={(val: "day" | "date") => setMonthlyType(val)}>
                          <div className="space-y-3">
                            {/* Option 1: Specific week and day */}
                            <div className="flex items-start space-x-2">
                              <RadioGroupItem value="day" id="monthly-day-mybeats" className="mt-1" />
                              <div className="flex-1 space-y-2">
                                <Label htmlFor="monthly-day-mybeats" className="cursor-pointer font-normal">
                                  On a specific day of the month
                                </Label>
                                {monthlyType === "day" && (
                                  <div className="pl-2 space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Week</Label>
                                        <select
                                          value={monthlyWeek}
                                          onChange={(e) => setMonthlyWeek(e.target.value as any)}
                                          className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                                        >
                                          <option value="first">First</option>
                                          <option value="second">Second</option>
                                          <option value="third">Third</option>
                                          <option value="fourth">Fourth</option>
                                          <option value="last">Last</option>
                                        </select>
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Day</Label>
                                        <select
                                          value={monthlyDayOfWeek}
                                          onChange={(e) => setMonthlyDayOfWeek(parseInt(e.target.value))}
                                          className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                                        >
                                          <option value="0">Sunday</option>
                                          <option value="1">Monday</option>
                                          <option value="2">Tuesday</option>
                                          <option value="3">Wednesday</option>
                                          <option value="4">Thursday</option>
                                          <option value="5">Friday</option>
                                          <option value="6">Saturday</option>
                                        </select>
                                      </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      Example: {monthlyWeek.charAt(0).toUpperCase() + monthlyWeek.slice(1)} {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][monthlyDayOfWeek]} of each month
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Option 2: Specific date */}
                            <div className="flex items-start space-x-2">
                              <RadioGroupItem value="date" id="monthly-date-mybeats" className="mt-1" />
                              <div className="flex-1 space-y-2">
                                <Label htmlFor="monthly-date-mybeats" className="cursor-pointer font-normal">
                                  On a specific date of the month
                                </Label>
                                {monthlyType === "date" && (
                                  <div className="pl-2 space-y-2">
                                    <div className="space-y-1">
                                      <Label className="text-xs text-muted-foreground">Date</Label>
                                      <Input
                                        type="number"
                                        min="1"
                                        max="31"
                                        value={monthlyDateOfMonth}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value);
                                          if (val >= 1 && val <= 31) {
                                            setMonthlyDateOfMonth(val);
                                          }
                                        }}
                                        placeholder="Day of month (1-31)"
                                        className="w-32"
                                      />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      Example: {monthlyDateOfMonth}{monthlyDateOfMonth === 1 ? 'st' : monthlyDateOfMonth === 2 ? 'nd' : monthlyDateOfMonth === 3 ? 'rd' : 'th'} of each month
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </RadioGroup>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Repeat Until</Label>
                      <RadioGroup value={repeatUntilMode} onValueChange={(val: any) => setRepeatUntilMode(val)}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="date" id="until-date-top" />
                          <Label htmlFor="until-date-top" className="cursor-pointer">Until Date</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="permanent" id="permanent-top" />
                          <Label htmlFor="permanent-top" className="cursor-pointer">Permanent</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {repeatUntilMode === "date" && (
                      <div className="space-y-2">
                        <Label>End Date *</Label>
                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !repeatEndDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarDays className="mr-2 h-4 w-4" />
                              {repeatEndDate ? format(repeatEndDate, "PPP") : "Pick a date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={repeatEndDate}
                              onSelect={(date) => {
                                if (date) {
                                  setRepeatEndDate(date);
                                  setIsCalendarOpen(false);
                                }
                              }}
                              disabled={(date) => date < new Date()}
                              initialFocus
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}

                    {repeatUntilMode === "permanent" && (
                      <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                        Visits will repeat indefinitely for this beat
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Territory */}
              <div className="space-y-2">
                <Label htmlFor="territorySelect">Territory (Optional)</Label>
                <select
                  id="territorySelect"
                  value={selectedTerritoryId}
                  onChange={(e) => setSelectedTerritoryId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="">Select a territory</option>
                  {territories.map((territory) => (
                    <option key={territory.id} value={territory.id}>
                      {territory.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Travel Allowance and Average KM */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="travelAllowance">Travel Allowance (₹)</Label>
                  <Input
                    id="travelAllowance"
                    type="number"
                    value={travelAllowance}
                    readOnly
                    className="bg-muted cursor-not-allowed"
                  />
                  {taType === 'fixed' ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Info className="h-3 w-3" /> Fixed TA set by admin policy (₹{fixedTaAmount})
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Info className="h-3 w-3" /> Auto-calculated: {averageKm || 0} km × ₹{taPerKmRate}/km
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="averageKm" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Beat Average KM
                  </Label>
                  <Input
                    id="averageKm"
                    type="number"
                    step="0.1"
                    placeholder="Enter average distance"
                    value={averageKm}
                    onChange={(e) => {
                      setAverageKm(e.target.value);
                      if (taType === 'from_beat') {
                        const km = parseFloat(e.target.value) || 0;
                        setTravelAllowance((km * taPerKmRate).toFixed(2));
                      }
                    }}
                  />
                </div>
              </div>

              {/* Average Time */}
              <div className="space-y-2">
                <Label htmlFor="averageTimeMinutes" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Average Time (minutes)
                </Label>
                <Input
                  id="averageTimeMinutes"
                  type="number"
                  placeholder="Enter average time in minutes"
                  value={averageTimeMinutes}
                  onChange={(e) => setAverageTimeMinutes(e.target.value)}
                />
              </div>

              {/* Add New Retailer Button */}
              <div className="border-t pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddRetailerModalOpen(true)}
                  className="flex items-center gap-2 w-full sm:w-auto"
                >
                  <Plus className="h-4 w-4" />
                  Add New Retailer to {beatName || 'Beat'}
                </Button>
              </div>

              {/* Select Retailers Section */}
              <div className="space-y-4">
                <div 
                  className="flex items-center justify-between cursor-pointer py-2 border-b hover:bg-muted/30 transition-colors"
                  onClick={() => setShowRetailersList(!showRetailersList)}
                >
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      Select Retailers
                      <ChevronDown className={`h-4 w-4 transition-transform ${showRetailersList ? 'rotate-180' : ''}`} />
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Choose retailers to include in this beat ({selectedRetailers.size} selected)
                    </p>
                  </div>
                </div>

                {showRetailersList && (
                  <>
                    <SearchInput
                      placeholder="Search retailers by name, address, or phone"
                      value={searchTerm}
                      onChange={setSearchTerm}
                    />

                    {filteredRetailers.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        {allRetailers.length === 0 
                          ? "No retailers found. Please add some retailers first."
                          : searchTerm 
                            ? "No retailers found matching your search"
                            : "No retailers available"
                        }
                      </div>
                    ) : (
                      <div className="grid gap-4 max-h-64 overflow-y-auto">
                        {filteredRetailers.map((retailer) => (
                          <Card 
                            key={retailer.id} 
                            className={`cursor-pointer transition-all hover:shadow-md ${
                              retailer.isSelected ? 'ring-2 ring-primary bg-primary/5' : ''
                            }`}
                            onClick={() => handleRetailerSelection(retailer.id)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3 flex-1">
                                  <Checkbox
                                    checked={retailer.isSelected}
                                    onChange={() => handleRetailerSelection(retailer.id)}
                                    className="mt-1"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <h4 className="font-medium truncate">{retailer.name}</h4>
                                      {retailer.category && (
                                        <Badge variant="outline" className="text-xs">
                                          {retailer.category}
                                        </Badge>
                                      )}
                                      {/* Current Beat Status */}
                                      <Badge 
                                        variant={retailer.isUnassigned ? "default" : "secondary"} 
                                        className={`text-xs ${
                                          retailer.isUnassigned 
                                            ? "bg-green-100 text-green-800 border-green-200" 
                                            : "bg-orange-100 text-orange-800 border-orange-200"
                                        }`}
                                      >
                                        {retailer.currentBeat || 'Unassigned'}
                                      </Badge>
                                    </div>
                                    <div className="space-y-1 text-sm text-muted-foreground">
                                      <div className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        <span className="truncate">{retailer.address}</span>
                                      </div>
                                      <div>📞 {retailer.phone}</div>
                                      {!retailer.isUnassigned && (
                                        <div className="text-xs text-orange-600 font-medium">
                                          ⚠️ Currently assigned to "{retailer.currentBeat}" - will be reassigned
                                        </div>
                                      )}
                                      {retailer.metrics && (
                                        <div className="text-xs">
                                          Avg Orders (3M): {retailer.metrics.avgOrders3Months} | 
                                          Avg Order Value: ₹{retailer.metrics.avgOrderPerVisit.toLocaleString()}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAnalyticsRetailer(retailer);
                                  }}
                                >
                                  <BarChart className="h-4 w-4" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

            </div>

            {/* Fixed Footer */}
            <div className="flex justify-end gap-2 pt-4 border-t bg-background">
              <Button variant="outline" onClick={() => setIsCreateBeatOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveBeat} disabled={!beatName.trim() || isCreating}>
                {isCreating ? 'Creating...' : `Create Beat (${selectedRetailers.size} retailer${selectedRetailers.size !== 1 ? 's' : ''})`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Beat Options Dialog */}
        <Dialog open={showOptionsDialog} onOpenChange={setShowOptionsDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Beat Created Successfully!</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-4">
              Would you like to add this beat to today's visit list or save it for later?
            </p>
            <div className="space-y-3">
              <Button
                onClick={handleAddBeatForToday}
                className="w-full justify-start h-auto py-4 px-6"
                variant="default"
              >
                <div className="text-left">
                  <div className="font-semibold text-base">Add it for the day</div>
                  <div className="text-xs opacity-90 mt-1">
                    Beat will be added to today's visit list and saved to All Beats
                  </div>
                </div>
              </Button>
              <Button
                onClick={handleSaveBeatOnly}
                className="w-full justify-start h-auto py-4 px-6"
                variant="outline"
              >
                <div className="text-left">
                  <div className="font-semibold text-base">Save it in All Beats</div>
                  <div className="text-xs opacity-90 mt-1">
                    Beat will be saved and available for selection later
                  </div>
                </div>
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Retailer Modal */}
        <AddRetailerInlineToBeat
          open={isAddRetailerModalOpen}
          onClose={() => setIsAddRetailerModalOpen(false)}
          beatName={beatName || createdBeatData?.beatName || ''}
          beatId={createdBeatData?.beatId}
          onRetailerAdded={handleRetailerAdded}
        />

        {/* Edit Beat Modal */}
        <EditBeatModal
          isOpen={isEditBeatOpen}
          onClose={handleEditBeatClose}
          beat={editingBeat}
          onBeatUpdated={handleBeatUpdated}
        />

        {/* Retailer Analytics Modal */}
        {selectedAnalyticsRetailer && (
          <RetailerAnalytics
            isOpen={!!selectedAnalyticsRetailer}
            retailer={selectedAnalyticsRetailer}
            onClose={() => setSelectedAnalyticsRetailer(null)}
          />
        )}

        {/* Beat Analytics Modal */}
        {selectedBeatForAnalytics && (
          <BeatAnalyticsModal
            isOpen={!!selectedBeatForAnalytics}
            onClose={() => setSelectedBeatForAnalytics(null)}
            beatId={selectedBeatForAnalytics.id}
            beatName={selectedBeatForAnalytics.name}
            userId={user?.id || ''}
          />
        )}

        {/* AI Health Insight Modal */}
        <BeatInsightModal
          isOpen={!!selectedBeatForAI}
          onClose={() => setSelectedBeatForAI(null)}
          beatId={selectedBeatForAI || ''}
          beatName={beats.find(b => b.id === selectedBeatForAI)?.name || 'Beat'}
        />

        {/* Delete Confirmation Dialog */}
        <BeatDeleteDialog
          open={isDeleteOpen}
          onOpenChange={setDeleteOpen}
          beatName={deleteItemName}
          affectedRetailerCount={affectedRetailerCount}
          upcomingVisitsCount={upcomingVisitsCount}
          pendingOrdersCount={pendingOrdersCount}
          availableBeats={beats
            .filter(b => b.id !== deleteItemId)
            .map(b => ({ id: b.id, name: b.name, retailer_count: b.retailer_count }))}
          availableUsers={availableUsersForDialog}
          onConfirm={handleConfirmDeleteBeat}
          isLoading={isDeleting}
        />

        {/* Transfer Dialog */}
        {transferBeat && (
          <BeatTransferDialog
            open={isTransferOpen}
            onOpenChange={(v) => {
              setIsTransferOpen(v);
              if (!v) setTransferBeat(null);
            }}
            beatId={transferBeat.id}
            beatName={transferBeat.name}
            retailerCount={transferBeat.retailerCount}
            availableUsers={availableUsersForDialog}
            onTransferred={() => {
              setIsTransferOpen(false);
              setTransferBeat(null);
              loadBeats();
              loadAllRetailers();
            }}
          />
        )}

        {/* Deactivate Confirmation */}
        <AlertDialog open={!!deactivateBeat} onOpenChange={(v) => { if (!v) setDeactivateBeat(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Power size={18} className="text-orange-500" />
                Deactivate Beat
              </AlertDialogTitle>
              <AlertDialogDescription>
                Deactivate "{deactivateBeat?.name}"? It will be hidden from daily planning but remain in reports.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeactivateBeat} className="bg-orange-500 hover:bg-orange-600">
                Deactivate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
};

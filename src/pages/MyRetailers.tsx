import { useDeferredValue, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CompactMultiUserSelector } from "@/components/CompactMultiUserSelector";
import { useSubordinates } from "@/hooks/useSubordinates";
import { offlineStorage, STORES } from "@/lib/offlineStorage";
import { buildRetailerIndex, filterRetailersIndexed, getUniqueValues, clearRetailerIndex } from "@/lib/retailerIndex";
import { shouldSuppressError } from "@/utils/offlineErrorHandler";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, Pencil, Trash2, Calendar, Users, Check, ShoppingCart, Phone, CheckCircle2, CreditCard, Download } from "lucide-react";
import { RetailerExportDialog } from "@/components/RetailerExportDialog";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/ui/PaginationControls";
import { VoiceSearchButton } from "@/components/VoiceSearchButton";
import { Checkbox } from "@/components/ui/checkbox";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Layout } from "@/components/Layout";
import { AddRetailerToVisitModal } from "@/components/AddRetailerToVisitModal";
import { BeatTransferModal } from "@/components/BeatTransferModal";
import { RetailerDetailModal } from "@/components/RetailerDetailModal";
import { BulkImportRetailersModal } from "@/components/BulkImportRetailersModal";
import { RetailerAnalytics } from "@/components/RetailerAnalytics";
import { CreditScoreDisplay } from "@/components/CreditScoreDisplay";
import { VirtualizedRetailerTable } from "@/components/VirtualizedRetailerTable";
import { moveToRecycleBin } from "@/utils/recycleBinUtils";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { RetailersSkeleton } from "@/components/home/RetailersSkeleton";



interface Retailer {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
  beat_id: string;
  beat_name?: string | null;
  territory_id?: string | null;
  created_at: string;
  last_visit_date?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  order_value?: number | null;
  notes?: string | null;
  parent_type?: string | null;
  parent_name?: string | null;
  location_tag?: string | null;
  retail_type?: string | null;
  potential?: string | null;
  competitors?: string[] | null;
  entity_type?: string | null;
  gst_number?: string | null;
  photo_url?: string | null;
  verified?: boolean;
  user_id?: string;
  owner_name?: string;
}

export const MyRetailers = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Hierarchical user filter - multi-select
  const { isManager, subordinates, subordinateIds } = useSubordinates();
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  
  // Track if initial data load is complete (prevents flickering)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isUserChanging, setIsUserChanging] = useState(false); // Track user selection changes
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  
  // Ref to prevent duplicate API calls
  const loadingRef = useRef(false);
  const lastLoadedUserIdsRef = useRef<string>('');
  
  // Initialize with current user when available (only once)
  const userInitializedRef = useRef(false);
  useEffect(() => {
    if (user?.id && !userInitializedRef.current) {
      userInitializedRef.current = true;
      setSelectedUserIds([user.id]);
    }
  }, [user?.id]);
  
  // Map of user IDs to names for owner column display - memoized with stable reference
  const userNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (user) {
      map[user.id] = 'Me';
    }
    subordinates.forEach(sub => {
      map[sub.subordinate_user_id] = sub.full_name;
    });
    return map;
  }, [user?.id, subordinates]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [potentialFilter, setPotentialFilter] = useState<string | undefined>();
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [retailTypeFilter, setRetailTypeFilter] = useState<string | undefined>();
  const [beatFilter, setBeatFilter] = useState<string | undefined>();

  const [beatDialogOpen, setBeatDialogOpen] = useState(false);
  const [selectedRetailer, setSelectedRetailer] = useState<Retailer | null>(null);
  const [existingBeat, setExistingBeat] = useState<string | undefined>();
  const [newBeat, setNewBeat] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    name: "",
    phone: "",
    address: "",
    entity_type: "retailer",
    beat_id: ""
  });

  const location = useLocation();
  type EditForm = {
    id: string;
    name: string;
    phone: string;
    address: string;
    category: string | null;
    priority: string | null;
    status: string | null;
    notes: string | null;
    parent_type: string | null;
    parent_name: string | null;
    location_tag: string | null;
    retail_type: string | null;
    potential: string | null;
    competitorsString?: string;
  };
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [expandedAddress, setExpandedAddress] = useState<string | null>(null);
  const [expandedBeat, setExpandedBeat] = useState<string | null>(null);
  
  // New state for enhanced functionality
  const [addToVisitModalOpen, setAddToVisitModalOpen] = useState(false);
  const [massEditModalOpen, setMassEditModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [bulkImportModalOpen, setBulkImportModalOpen] = useState(false);
  const [analyticsModalOpen, setAnalyticsModalOpen] = useState(false);
  const [selectedRetailerForVisit, setSelectedRetailerForVisit] = useState<Retailer | null>(null);
  const [selectedRetailerForDetail, setSelectedRetailerForDetail] = useState<Retailer | null>(null);
  const [selectedRetailerForAnalytics, setSelectedRetailerForAnalytics] = useState<Retailer | null>(null);
  const [selectedRetailerIds, setSelectedRetailerIds] = useState<string[]>([]);
  
  // Delete confirmation dialog state
  const { isOpen: isDeleteOpen, itemId: deleteItemId, itemName: deleteItemName, openDeleteDialog, closeDeleteDialog, setOpen: setDeleteOpen } = useDeleteConfirm();
  const [isBulkDelete, setIsBulkDelete] = useState(false);

  useEffect(() => {
    document.title = "My Retailers | Manage and Assign Beats";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "My Retailers: search, filter, and assign retailers to beats.");
    const link = document.createElement("link");
    link.rel = "canonical";
    link.href = `${window.location.origin}/my-retailers`;
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);


  // Pagination state for loading retailers in batches
  const [loadingProgress, setLoadingProgress] = useState<string>('');
  const PAGE_SIZE = 500; // Load 500 retailers at a time
  
  const loadRetailers = useCallback(async (userIds: string[]) => {
    if (!user) return;
    if (userIds.length === 0) {
      // Don't clear data, just mark as loaded
      if (!initialLoadComplete) setInitialLoadComplete(true);
      return;
    }
    
    // Prevent duplicate calls for the same user selection
    const userIdsKey = userIds.sort().join(',');
    if (loadingRef.current && lastLoadedUserIdsRef.current === userIdsKey) {
      return;
    }
    
    loadingRef.current = true;
    lastLoadedUserIdsRef.current = userIdsKey;
    setLoading(true);
    setLoadingProgress('Loading...');
    
    try {
      // Check if we're online before attempting network fetch
      if (navigator.onLine) {
        try {
          console.log('🔄 Fetching retailers from database for users:', userIds.length);
          
          // Fetch all data in one go for better UX (avoid partial updates)
          let allRetailers: any[] = [];
          let page = 0;
          let hasMore = true;
          
          while (hasMore) {
            const from = page * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;
            
            setLoadingProgress(`Loading retailers ${from + 1}+...`);
            
            const { data, error } = await supabase
              .from("retailers")
              .select("*")
              .in("user_id", userIds)
              .order("name")
              .range(from, to);
              
            if (error) throw error;
            
            if (data && data.length > 0) {
              allRetailers = [...allRetailers, ...data];
              hasMore = data.length === PAGE_SIZE;
              page++;
            } else {
              hasMore = false;
            }
          }
          
          console.log('✅ Fetched total retailers:', allRetailers.length);
          
          // Process and set all data at once (prevents flickering)
          setLoadingProgress('Processing...');
          await new Promise(resolve => setTimeout(resolve, 0));
          
          const withOwners = allRetailers.map(r => ({
            ...r,
            owner_name: userNameMap[r.user_id] || 'Unknown'
          }));
          
          const sorted = [...withOwners].sort((a, b) => a.name.localeCompare(b.name));
          
          // Set data in one atomic update
          setRetailers(sorted);
          
          // Build index after data is set
          buildRetailerIndex(sorted);
          
          // Update cache in background (don't await)
          offlineStorage.mergeData(STORES.RETAILERS, allRetailers as any).catch(console.error);
          
          setLoadingProgress('');
          setLoading(false);
          setIsUserChanging(false);
          setInitialLoadComplete(true);
          loadingRef.current = false;
          return;
        } catch (networkError: any) {
          console.log('Network fetch failed, falling back to cache:', networkError.message);
        }
      }
      
      // Fallback to cache if offline or network failed
      setLoadingProgress('Loading from cache...');
      console.log('📦 Loading retailers from cache for users:', userIds.length);
      let cachedRetailers: any[] = await offlineStorage.getAll(STORES.RETAILERS);
      
      // Filter cache by selected user IDs
      cachedRetailers = cachedRetailers.filter((r: any) => userIds.includes(r.user_id));
      
      if (cachedRetailers.length > 0) {
        console.log('✅ Displaying cached retailers:', cachedRetailers.length);
        
        const withOwners = cachedRetailers.map(r => ({
          ...r,
          owner_name: userNameMap[r.user_id] || 'Unknown'
        }));
        const sorted = withOwners.sort((a, b) => a.name.localeCompare(b.name));
        
        // Set data in one atomic update
        setRetailers(sorted);
        buildRetailerIndex(sorted);
      }
      
      setLoadingProgress('');
    } catch (error: any) {
      console.error('Error loading retailers:', error);
      setLoadingProgress('');
    } finally {
      setLoading(false);
      setIsUserChanging(false);
      setInitialLoadComplete(true);
      loadingRef.current = false;
    }
  }, [user]);
  
  // Stable ref for loadRetailers to avoid dependency issues
  const loadRetailersRef = useRef(loadRetailers);
  useEffect(() => {
    loadRetailersRef.current = loadRetailers;
  }, [loadRetailers]);
  
  // Wrapper function that uses current selectedUserIds - for use in callbacks
  const refreshRetailers = useCallback(() => {
    loadRetailersRef.current(selectedUserIds);
  }, [selectedUserIds]);

  // Debounce the loadRetailers call to prevent rapid firing
  const loadRetailersTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Track previous user IDs to detect user changes
  const prevUserIdsRef = useRef<string>('');
  
  // Track if we've done initial load
  const hasLoadedRef = useRef(false);
  
  useEffect(() => {
    // Clear any pending timeout
    if (loadRetailersTimeoutRef.current) {
      clearTimeout(loadRetailersTimeoutRef.current);
    }
    
    if (user && selectedUserIds.length > 0) {
      const currentUserIdsKey = selectedUserIds.sort().join(',');
      
      // Skip if already loaded for same users
      if (hasLoadedRef.current && lastLoadedUserIdsRef.current === currentUserIdsKey) {
        return;
      }
      
      const isChangingUsers = prevUserIdsRef.current !== '' && prevUserIdsRef.current !== currentUserIdsKey;
      
      if (isChangingUsers) {
        // Mark that we're changing users - this prevents flicker
        setIsUserChanging(true);
      } else if (retailers.length === 0 && !hasLoadedRef.current) {
        // Only show loading for initial load when no data
        setLoading(true);
      }
      
      prevUserIdsRef.current = currentUserIdsKey;
      hasLoadedRef.current = true;
      
      // Debounce the actual data load by 100ms to prevent rapid firing
      loadRetailersTimeoutRef.current = setTimeout(() => {
        loadRetailersRef.current(selectedUserIds);
      }, 100);
    }
    
    // Cleanup on unmount only
    return () => {
      if (loadRetailersTimeoutRef.current) {
        clearTimeout(loadRetailersTimeoutRef.current);
      }
    };
  }, [user, selectedUserIds]); // Removed loadRetailers and initialLoadComplete from deps
  
  // Cleanup index only on unmount
  useEffect(() => {
    return () => {
      clearRetailerIndex();
    };
  }, []);

  // Use index for fast filter dropdown values
  const categories = useMemo(() => {
    const indexed = getUniqueValues('category');
    if (indexed.length > 0) return indexed;
    return [...new Set(retailers.map(r => r.category).filter(Boolean))].sort() as string[];
  }, [retailers]);
  
  const retailTypes = useMemo(() => {
    const indexed = getUniqueValues('retailType');
    if (indexed.length > 0) return indexed;
    return [...new Set(retailers.map(r => r.retail_type).filter(Boolean))].sort() as string[];
  }, [retailers]);

  // Use indexed filtering for 10x faster search with large datasets
  const filtered = useMemo((): Retailer[] => {
    // Try indexed search first (O(1) lookups)
    const indexedResults = filterRetailersIndexed<Retailer>({
      searchQuery: deferredSearch.trim() || undefined,
      beatId: beatFilter || undefined,
      category: categoryFilter || undefined,
      potential: potentialFilter || undefined,
      retailType: retailTypeFilter || undefined,
    });
    
    // If index has results, use them (much faster)
    if (indexedResults.length > 0 || (deferredSearch || beatFilter || categoryFilter || potentialFilter || retailTypeFilter)) {
      return indexedResults.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    // Fallback to full array if no filters applied and index is empty
    return retailers;
  }, [retailers, deferredSearch, potentialFilter, categoryFilter, retailTypeFilter, beatFilter]);

  // Pagination - 10 items per page
  const {
    currentPage,
    totalPages,
    paginatedItems: paginatedRetailers,
    goToPage,
    nextPage,
    prevPage,
    startIndex,
    endIndex,
    totalItems,
    hasNextPage,
    hasPrevPage,
  } = usePagination(filtered, { pageSize: 10 });

  const beats = useMemo(() => {
    // Create a map of beat_id -> beat_name from all retailers
    const beatMap = new Map<string, string>();
    retailers.forEach(r => {
      if (r.beat_id) {
        // Prioritize beat_name if available, otherwise use beat_id as fallback
        const currentName = beatMap.get(r.beat_id);
        const newName = r.beat_name || r.beat_id;
        // Prefer actual names over beat_id-style strings
        if (!currentName || (currentName.startsWith('beat_') && !newName.startsWith('beat_'))) {
          beatMap.set(r.beat_id, newName);
        }
      }
    });
    
    // Convert to array of objects sorted by display name
    return Array.from(beatMap.entries())
      .map(([beat_id, beat_name]) => ({ beat_id, beat_name }))
      .sort((a, b) => a.beat_name.localeCompare(b.beat_name));
  }, [retailers]);

  const openEdit = (retailer: Retailer) => {
    setSelectedRetailer(retailer);
    setEditForm({
      id: retailer.id,
      name: retailer.name,
      phone: retailer.phone || '',
      address: retailer.address,
      category: retailer.category,
      priority: retailer.priority,
      status: retailer.status,
      notes: retailer.notes,
      parent_type: retailer.parent_type,
      parent_name: retailer.parent_name,
      location_tag: retailer.location_tag,
      retail_type: retailer.retail_type,
      potential: retailer.potential,
      competitorsString: retailer.competitors ? retailer.competitors.join(', ') : ''
    });
    setEditDialogOpen(true);
  };

  const openRetailerDetail = (retailer: Retailer) => {
    setSelectedRetailerForDetail(retailer);
    setDetailModalOpen(true);
  };

  const openRetailerAnalytics = (retailer: Retailer) => {
    setSelectedRetailerForAnalytics(retailer);
    setAnalyticsModalOpen(true);
  };

  const openAddToVisit = (retailer: Retailer) => {
    setSelectedRetailerForVisit(retailer);
    setAddToVisitModalOpen(true);
  };

  const openMassEdit = () => {
    setMassEditModalOpen(true);
  };

  const confirmAssignBeat = async () => {
    if (!selectedRetailer) return;
    const chosenBeat = (existingBeat && existingBeat !== "__new__") ? existingBeat : newBeat.trim();
    if (!chosenBeat) {
      toast({ title: "Choose a beat", description: "Pick an existing beat or enter a new name." });
      return;
    }
    const { error } = await supabase
      .from("retailers")
      .update({ beat_id: chosenBeat })
      .eq("id", selectedRetailer.id)
      .eq("user_id", user?.id);
    if (error) {
      toast({ title: "Failed to assign beat", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Assigned", description: `${selectedRetailer.name} → ${chosenBeat}` });
      setBeatDialogOpen(false);
      setSelectedRetailer(null);
      refreshRetailers();
    }
  }; 

  const updateRetailer = async () => {
    if (!editForm) return;
    const { error } = await supabase
      .from("retailers")
      .update({
        name: editForm.name,
        phone: editForm.phone || null,
        address: editForm.address,
        category: editForm.category,
        priority: editForm.priority,
        status: editForm.status,
        notes: editForm.notes || null,
        parent_type: editForm.parent_type || null,
        parent_name: editForm.parent_name || null,
        location_tag: editForm.location_tag || null,
        retail_type: editForm.retail_type || null,
        potential: editForm.potential || null,
        competitors: editForm.competitorsString
          ? editForm.competitorsString.split(',').map(s => s.trim()).filter(Boolean)
          : null,
      })
      .eq("id", editForm.id)
      .eq("user_id", user?.id);
    if (error) {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Updated", description: "Retailer updated successfully." });
      setEditDialogOpen(false);
      setEditForm(null);
      refreshRetailers();
    }
  };

  const handleDeleteClick = (retailer: Retailer) => {
    setIsBulkDelete(false);
    openDeleteDialog(retailer.id, retailer.name);
  };

  const handleBulkDeleteClick = () => {
    if (selectedRetailerIds.length === 0) return;
    setIsBulkDelete(true);
    openDeleteDialog('bulk', `${selectedRetailerIds.length} retailer${selectedRetailerIds.length > 1 ? 's' : ''}`);
  };

  const handleConfirmDelete = async () => {
    if (isBulkDelete) {
      await performBulkDelete();
    } else if (deleteItemId) {
      const retailer = retailers.find(r => r.id === deleteItemId);
      if (retailer) {
        await performSingleDelete(retailer);
      }
    }
    closeDeleteDialog();
  };

  const performSingleDelete = async (retailer: Retailer) => {
    // Move to recycle bin first
    const movedToRecycleBin = await moveToRecycleBin({
      tableName: 'retailers',
      recordId: retailer.id,
      recordData: retailer,
      moduleName: 'Retailers',
      recordName: retailer.name
    });

    if (!movedToRecycleBin) {
      toast({ title: "Failed to delete", description: "Could not move to recycle bin", variant: "destructive" });
      return;
    }

    // Now delete from retailers table
    const { error } = await supabase
      .from("retailers")
      .delete()
      .eq("id", retailer.id)
      .eq("user_id", user?.id);
    
    if (error) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Moved to Recycle Bin", description: `${retailer.name} can be restored from Recycle Bin.` });
      refreshRetailers();
    }
  };

  const performBulkDelete = async () => {
    const count = selectedRetailerIds.length;
    setLoading(true);
    
    // Get retailer data for recycle bin
    const retailersToDelete = retailers.filter(r => selectedRetailerIds.includes(r.id));
    
    // Move each to recycle bin
    for (const retailer of retailersToDelete) {
      await moveToRecycleBin({
        tableName: 'retailers',
        recordId: retailer.id,
        recordData: retailer,
        moduleName: 'Retailers',
        recordName: retailer.name
      });
    }

    // Now delete from retailers table
    const { error } = await supabase
      .from("retailers")
      .delete()
      .in("id", selectedRetailerIds)
      .eq("user_id", user?.id);
    
    if (error) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Moved to Recycle Bin", description: `${count} retailer${count > 1 ? 's' : ''} can be restored from Recycle Bin.` });
      setSelectedRetailerIds([]);
      refreshRetailers();
    }
    setLoading(false);
  };


  const toggleSelectAll = () => {
    if (selectedRetailerIds.length === filtered.length) {
      setSelectedRetailerIds([]);
    } else {
      setSelectedRetailerIds(filtered.map(r => r.id));
    }
  };

  const toggleSelectRetailer = (retailerId: string) => {
    setSelectedRetailerIds(prev => 
      prev.includes(retailerId) 
        ? prev.filter(id => id !== retailerId)
        : [...prev, retailerId]
    );
  };

  const saveNewEntity = async () => {
    if (!user) return;
    if (!newForm.name || !newForm.phone || !newForm.address) {
      toast({ title: "Missing Information", description: "Please fill in name, phone and address", variant: "destructive" });
      return;
    }
    const payload: any = {
      user_id: user.id,
      name: newForm.name,
      phone: newForm.phone,
      address: newForm.address,
      entity_type: newForm.entity_type,
      beat_id: newForm.beat_id || 'unassigned',
      status: 'active'
    };
    const { data, error } = await supabase.from('retailers').insert(payload).select('*').maybeSingle();
    if (error) {
      toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Added', description: `${newForm.name} saved successfully. Fill in additional details now.` });
    setAddOpen(false);
    setNewForm({ name: '', phone: '', address: '', entity_type: 'retailer', beat_id: '' });
    
    // Open detail modal immediately with the newly created retailer data
    if (data) {
      setSelectedRetailerForDetail(data as Retailer);
      setDetailModalOpen(true);
    }
    
    // Refresh the list
    await refreshRetailers();
  };

  useEffect(() => {
    const state = location.state as any;
    if (state?.openRetailerId && retailers.length) {
      const found = retailers.find((x) => x.id === state.openRetailerId);
      if (found) openEdit(found);
    }
  }, [location.state, retailers]);

  // Show skeleton during initial load for smooth UX - no flicker
  if (!initialLoadComplete && loading) {
    return (
      <Layout>
        <RetailersSkeleton />
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="container mx-auto p-4 space-y-4 animate-fade-in">
        <Card className="bg-gradient-primary text-primary-foreground">
          <CardHeader className="pb-3 px-4 sm:px-6 pt-4 sm:pt-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <CardTitle className="text-lg sm:text-xl font-bold whitespace-nowrap">My Retailers</CardTitle>
                <span className="bg-primary-foreground/20 text-primary-foreground text-sm font-medium px-3 py-1 rounded-full whitespace-nowrap">
                  {loading ? '...' : retailers.length.toLocaleString()} {retailers.length === 1 ? 'retailer' : 'retailers'}
                </span>
              </div>
              <CompactMultiUserSelector
                selectedUserIds={selectedUserIds}
                onSelectionChange={setSelectedUserIds}
                className="bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/20 flex-shrink-0"
              />
            </div>
          </CardHeader>
        </Card>


        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input placeholder="Search by name, phone, address, category, beat" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-10" />
              </div>
              <VoiceSearchButton onSearchResult={(text) => setSearch(text)} />
              <Button 
                variant="secondary" 
                onClick={() => {
                  const originalReturnTo = location.state?.returnTo || '/my-retailers';
                  navigate('/add-retailer', { state: { returnTo: originalReturnTo } });
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Add
              </Button>
            </div>
            
            <div className="flex flex-wrap gap-3 mb-4">
              <Button onClick={openMassEdit} variant="outline" size="sm" className="flex items-center gap-1">
                <Users size={16} />
                Mass Edit Beats
              </Button>
              <Button onClick={() => setBulkImportModalOpen(true)} variant="outline" size="sm" className="flex items-center gap-1">
                <Plus size={16} />
                Bulk Import
              </Button>
              {selectedRetailerIds.length > 0 && (
                <Button onClick={handleBulkDeleteClick} variant="destructive" size="sm" className="flex items-center gap-1">
                  <Trash2 size={16} />
                  Delete Selected ({selectedRetailerIds.length})
                </Button>
              )}

            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Potential</label>
                <Select value={potentialFilter} onValueChange={(v) => setPotentialFilter(v === "all" ? undefined : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v === "all" ? undefined : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Retailer Type</label>
                <Select value={retailTypeFilter} onValueChange={(v) => setRetailTypeFilter(v === "all" ? undefined : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {retailTypes.map(rt => (
                      <SelectItem key={rt} value={rt}>{rt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Beat</label>
                <Select value={beatFilter} onValueChange={(v) => setBeatFilter(v === "all" ? undefined : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {beats.map(b => (
                      <SelectItem key={b.beat_id} value={b.beat_id}>{b.beat_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {paginatedRetailers.map(r => (
                <Card key={r.id} className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedRetailerIds.includes(r.id)}
                            onCheckedChange={() => toggleSelectRetailer(r.id)}
                          />
                          <h3 
                            className="font-semibold cursor-pointer hover:text-primary flex items-center gap-2"
                            onClick={() => openRetailerDetail(r)}
                          >
                            {r.name}
                            {r.verified && (
                              <CheckCircle2 className="h-4 w-4 text-blue-600" />
                            )}
                          </h3>
                        </div>
                      <div className="flex items-center gap-1">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => navigate(`/order-entry?phoneOrder=true&retailerId=${r.id}&retailer=${encodeURIComponent(r.name)}`)}
                          className="h-8 w-8 p-0"
                          title="Phone Order"
                        >
                          <ShoppingCart className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => openAddToVisit(r)} 
                          className="h-8 w-8 p-0"
                          title="Add to visit"
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => navigate('/add-retailer', { state: { retailer: r, returnTo: '/my-retailers' } })} className="h-8 w-8 p-0">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      {r.phone && (
                        <a 
                          href={`tel:${r.phone.replace(/\s+/g, '')}`}
                          className="flex items-center gap-2 text-primary hover:underline cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.location.href = `tel:${r.phone.replace(/\s+/g, '')}`;
                          }}
                        >
                          <Phone size={14} />
                          <span className="text-muted-foreground">Phone:</span>
                          <span>{r.phone}</span>
                        </a>
                      )}
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground">Address:</span>
                        <span className="flex-1">{r.address}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Beat:</span>
                        <span>{r.beat_name || r.beat_id}</span>
                      </div>
                      {selectedUserIds.length > 1 && r.owner_name && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Owner:</span>
                          <span className="font-medium">{r.owner_name}</span>
                        </div>
                      )}
                      {r.category && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Category:</span>
                          <span>{r.category}</span>
                        </div>
                      )}
                      {/* Credit Score Display */}
                      <div className="pt-2 border-t">
                        <CreditScoreDisplay retailerId={r.id} variant="compact" showCreditLimit />
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
              {paginatedRetailers.length === 0 && (
                <div className="text-center py-12">
                  {loading || isUserChanging ? (
                    <div className="space-y-2">
                      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                      <p className="text-muted-foreground">{loadingProgress || 'Loading...'}</p>
                    </div>
                  ) : retailers.length === 0 ? (
                    <div className="space-y-3">
                      <Users className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
                      <p className="text-muted-foreground font-medium">No data available for this user</p>
                      <p className="text-sm text-muted-foreground">This user has no retailers assigned yet.</p>
                      <Button 
                        variant="outline" 
                        onClick={() => navigate('/add-retailer', { state: { returnTo: '/my-retailers' } })}
                        className="mt-2"
                      >
                        <Plus className="mr-2 h-4 w-4" /> Add Retailer
                      </Button>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No retailers match your filters</p>
                  )}
                </div>
              )}
              
              {/* Mobile Pagination */}
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                startIndex={startIndex}
                endIndex={endIndex}
                totalItems={totalItems}
                hasNextPage={hasNextPage}
                hasPrevPage={hasPrevPage}
                onNextPage={nextPage}
                onPrevPage={prevPage}
                onGoToPage={goToPage}
              />
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={filtered.length > 0 && selectedRetailerIds.length === filtered.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    {selectedUserIds.length > 1 && <TableHead>Owner</TableHead>}
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Beat</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRetailers.map(r => {
                    const shortAddress = r.address.length > 30 ? r.address.substring(0, 30) + '...' : r.address;
                    const isAddressExpanded = expandedAddress === r.id;
                    
                    const beatDisplay = r.beat_name || r.beat_id;
                    const shortBeat = beatDisplay && beatDisplay.length > 15 ? beatDisplay.substring(0, 15) + '...' : beatDisplay;
                    const isBeatExpanded = expandedBeat === r.id;
                    
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedRetailerIds.includes(r.id)}
                            onCheckedChange={() => toggleSelectRetailer(r.id)}
                          />
                        </TableCell>
                         <TableCell 
                          className="font-medium cursor-pointer hover:text-primary"
                          onClick={() => openRetailerDetail(r)}
                          title="Click to view retailer details"
                        >
                          <div className="flex items-center gap-2">
                            {r.name}
                            {r.verified && (
                              <CheckCircle2 className="h-4 w-4 text-blue-600" />
                            )}
                          </div>
                        </TableCell>
                        {selectedUserIds.length > 1 && (
                          <TableCell className="text-sm text-muted-foreground">
                            {r.owner_name || '-'}
                          </TableCell>
                        )}
                        <TableCell>
                          {r.phone ? (
                            <a 
                              href={`tel:${r.phone.replace(/\s+/g, '')}`}
                              className="flex items-center gap-1 text-primary hover:underline cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.location.href = `tel:${r.phone.replace(/\s+/g, '')}`;
                              }}
                            >
                              <Phone size={14} />
                              {r.phone}
                            </a>
                          ) : '-'}
                        </TableCell>
                        <TableCell 
                          className="max-w-[200px] cursor-pointer hover:text-primary"
                          onClick={() => setExpandedAddress(isAddressExpanded ? null : r.id)}
                          title="Click to expand/collapse address"
                        >
                          {isAddressExpanded ? r.address : shortAddress}
                        </TableCell>
                        <TableCell 
                          className="max-w-[150px] cursor-pointer hover:text-primary"
                          onClick={() => setExpandedBeat(isBeatExpanded ? null : r.id)}
                          title="Click to expand/collapse beat"
                        >
                          {isBeatExpanded ? beatDisplay : shortBeat}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => navigate(`/order-entry?phoneOrder=true&retailerId=${r.id}&retailer=${encodeURIComponent(r.name)}`)}
                              className="h-8 w-8 p-0"
                              title="Phone Order"
                            >
                              <ShoppingCart className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => openAddToVisit(r)} 
                              className="h-8 w-8 p-0"
                              title="Add to visit"
                            >
                              <Calendar className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => navigate('/add-retailer', { state: { retailer: r, returnTo: '/my-retailers' } })} className="h-8 w-8 p-0">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {paginatedRetailers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={selectedUserIds.length > 1 ? 7 : 6} className="text-center py-12">
                        {loading || isUserChanging ? (
                          <div className="space-y-2">
                            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                            <p className="text-muted-foreground">{loadingProgress || 'Loading...'}</p>
                          </div>
                        ) : retailers.length === 0 ? (
                          <div className="space-y-3">
                            <Users className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
                            <p className="text-muted-foreground font-medium">No data available for this user</p>
                            <p className="text-sm text-muted-foreground">This user has no retailers assigned yet.</p>
                            <Button 
                              variant="outline" 
                              onClick={() => navigate('/add-retailer', { state: { returnTo: '/my-retailers' } })}
                              className="mt-2"
                            >
                              <Plus className="mr-2 h-4 w-4" /> Add Retailer
                            </Button>
                          </div>
                        ) : (
                          <p className="text-muted-foreground">No retailers match your filters</p>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              
              {/* Desktop Pagination */}
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                startIndex={startIndex}
                endIndex={endIndex}
                totalItems={totalItems}
                hasNextPage={hasNextPage}
                hasPrevPage={hasPrevPage}
                onNextPage={nextPage}
                onPrevPage={prevPage}
                onGoToPage={goToPage}
              />
            </div>
          </CardContent>
        </Card>

        {/* Add Retailer to Visit Modal */}
        <AddRetailerToVisitModal
          isOpen={addToVisitModalOpen}
          onClose={() => setAddToVisitModalOpen(false)}
          retailer={selectedRetailerForVisit}
          onVisitCreated={() => {
            setAddToVisitModalOpen(false);
            setSelectedRetailerForVisit(null);
          }}
        />

        {/* Beat Transfer Modal */}
        <BeatTransferModal
          open={massEditModalOpen}
          onOpenChange={setMassEditModalOpen}
          onSuccess={() => {
            refreshRetailers();
            setMassEditModalOpen(false);
          }}
        />

        {/* Retailer Detail Modal */}
        <RetailerDetailModal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          retailer={selectedRetailerForDetail}
          onSuccess={() => {
            refreshRetailers();
            setDetailModalOpen(false);
            setSelectedRetailerForDetail(null);
          }}
        />

        {/* Bulk Import Modal */}
        <BulkImportRetailersModal
          open={bulkImportModalOpen}
          onOpenChange={setBulkImportModalOpen}
          onSuccess={refreshRetailers}
        />

        {/* Retailer Analytics Modal */}
        {selectedRetailerForAnalytics && (
          <RetailerAnalytics
            isOpen={analyticsModalOpen}
            retailer={{
              id: selectedRetailerForAnalytics.id,
              name: selectedRetailerForAnalytics.name,
              type: selectedRetailerForAnalytics.entity_type || 'retailer',
              phone: selectedRetailerForAnalytics.phone || '',
              address: selectedRetailerForAnalytics.address,
              lastVisitDate: selectedRetailerForAnalytics.last_visit_date || undefined,
              isSelected: false,
              priority: selectedRetailerForAnalytics.priority as "high" | "medium" | "low" | undefined,
              metrics: {
                avgOrders3Months: selectedRetailerForAnalytics.order_value || 0,
                avgOrderPerVisit: selectedRetailerForAnalytics.order_value || 0,
                visitsIn3Months: 0
              }
            }}
            onClose={() => {
              setAnalyticsModalOpen(false);
              setSelectedRetailerForAnalytics(null);
            }}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          open={isDeleteOpen}
          onOpenChange={setDeleteOpen}
          onConfirm={handleConfirmDelete}
          title={isBulkDelete ? "Delete Selected Retailers" : "Delete Retailer"}
          description={isBulkDelete 
            ? `Are you sure you want to delete ${deleteItemName}? They will be moved to the recycle bin and can be restored later.`
            : `Are you sure you want to delete "${deleteItemName}"? It will be moved to the recycle bin and can be restored later.`
          }
        />
      </section>
    </Layout>
  );
};

export default MyRetailers;


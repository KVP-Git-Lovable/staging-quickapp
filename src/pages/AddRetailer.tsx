import { useState, useEffect } from "react";
import { compressImageFile, compressToTargetSize } from "@/utils/imageCompression";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/Layout";
import { Plus, MapPin, Phone, Store, Camera, Tag, X, ScanLine, Check, ChevronsUpDown, WifiOff, ChevronDown, Pencil, ArrowLeft, User, MessageCircle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useOfflineRetailers } from "@/hooks/useOfflineRetailers";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { offlineStorage, STORES } from "@/lib/offlineStorage";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useCompanyData } from "@/hooks/useCompanyData";

export const AddRetailer = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const connectivityStatus = useConnectivity();
  const { company, headerName } = useCompanyData();
  const companyDisplayName = headerName || company?.name || "";
  const returnTo = location.state?.returnTo || '/my-retailers';
  const plannedBeats = location.state?.plannedBeats || [];
  
  // Edit mode: check if retailer data is passed via location state
  const editingRetailer = location.state?.retailer as any | null;
  const isEditMode = !!editingRetailer;
  
  const [retailerData, setRetailerData] = useState(() => {
    if (editingRetailer) {
      // Pre-fill form with existing retailer data
      const competitors = editingRetailer.competitors || [];
      return {
        name: editingRetailer.name || "",
        contactName: editingRetailer.contact_name || "",
        contactTitle: editingRetailer.contact_title || "",
        gstNumber: editingRetailer.gst_number || "",
        phone: editingRetailer.phone || "",
        address: editingRetailer.address || "",
        category: editingRetailer.category || "",
        notes: editingRetailer.notes || "",
        parentType: editingRetailer.parent_type || "Distributor",
        parentName: editingRetailer.parent_name || "",
        selectedDistributors: [] as string[], // Will be populated after distributors load
        locationTag: editingRetailer.location_tag || "",
        retailType: editingRetailer.retail_type || "",
        potential: editingRetailer.potential ? editingRetailer.potential.charAt(0).toUpperCase() + editingRetailer.potential.slice(1) : "",
        competitor1: competitors[0] || "",
        competitor2: competitors[1] || "",
        competitor3: competitors[2] || "",
        latitude: editingRetailer.latitude?.toString() || "",
        longitude: editingRetailer.longitude?.toString() || "",
        photo_url: editingRetailer.photo_url || "",
        manual_credit_score: editingRetailer.manual_credit_score?.toString() || "",
        state: editingRetailer.state || ""
      };
    }
    return {
      name: "",
      contactName: "",
      contactTitle: "",
      gstNumber: "",
      phone: "",
      address: "",
      category: "",
      notes: "",
      parentType: "Distributor",
      parentName: "",
      selectedDistributors: [] as string[],
      locationTag: "",
      retailType: "",
      potential: "",
      competitor1: "",
      competitor2: "",
      competitor3: "",
      latitude: "",
      longitude: "",
      photo_url: "",
      manual_credit_score: "",
      state: ""
    };
  });
  
  // State to track the scanned board photo URL
  const [scannedBoardPhotoUrl, setScannedBoardPhotoUrl] = useState<string | null>(null);
  
  const contactTitles = ["Shop owner", "Support staff", "Family member", "Others"];

  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({});
  const [beatDialogOpen, setBeatDialogOpen] = useState(false);
  const [existingBeat, setExistingBeat] = useState<string | undefined>();
  const [newBeat, setNewBeat] = useState("");
  const [existingBeats, setExistingBeats] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [capturedPhotoPreview, setCapturedPhotoPreview] = useState<string | null>(null);
  const [distributors, setDistributors] = useState<{id: string, name: string}[]>([]);
  const [beatMappedDistributors, setBeatMappedDistributors] = useState<{id: string, name: string}[]>([]);
  const [selectedBeat, setSelectedBeat] = useState<string>('');
  const [beats, setBeats] = useState<{beat_id: string, beat_name: string, id?: string, user_id?: string, owner_name?: string | null, access_type?: string}[]>([]);
  const [isScanningBoard, setIsScanningBoard] = useState(false);
  const [territories, setTerritories] = useState<{id: string, name: string, region: string}[]>([]);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null);
  const [territoryComboOpen, setTerritoryComboOpen] = useState(false);
  const [creditConfig, setCreditConfig] = useState<{is_enabled: boolean, scoring_mode: string} | null>(null);
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false);
  const [stateComboOpen, setStateComboOpen] = useState(false);
  
  // Owner field states
  const [allUsers, setAllUsers] = useState<{id: string, full_name: string}[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [selectedOwnerName, setSelectedOwnerName] = useState<string>('');
  const [ownerComboOpen, setOwnerComboOpen] = useState(false);
  const [contactDialog, setContactDialog] = useState<{ retailerId: string; phone: string; name: string } | null>(null);
  const [contactSending, setContactSending] = useState<null | 'whatsapp' | 'call'>(null);


  const categories = ["Category A", "Category B", "Category C"];
  const parentTypes = ["Company", "Super Stockist", "Distributor"];
  const retailTypes = ["Individual stall", "Kirana store", "Super market", "Bakery", "Milk Parlour", "Hotel", "Restaurants", "Catering Services", "Business Office", "Others"];
  const potentials = ["High", "Medium", "Low"];
  
  // All Indian states and union territories
  const indianStates = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
    "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
    "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
    "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
  ];
  const [customRetailType, setCustomRetailType] = useState("");

  // Load all distributors from distributors table
  const loadDistributors = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('distributors')
      .select('id, name')
      .eq('status', 'active')
      .order('name');
    
    if (error) {
      console.error('Failed to load distributors:', error);
      setDistributors([]);
    } else {
      setDistributors(data || []);
    }
  };

  // Load distributors mapped to the selected beat
  const loadBeatMappedDistributors = async (beatId: string) => {
    if (!beatId || beatId === 'unassigned') {
      setBeatMappedDistributors([]);
      return;
    }
    
    try {
      // Find the beat's UUID from beat_id
      const beat = beats.find(b => b.beat_id === beatId);
      if (!beat?.id) {
        setBeatMappedDistributors([]);
        return;
      }

      const { data, error } = await supabase
        .from('distributor_beat_mappings')
        .select('distributor_id, distributors(id, name)')
        .eq('beat_id', beat.id);
      
      if (error) throw error;
      
      const mappedDistributors = (data || [])
        .filter(d => d.distributors)
        .map(d => ({ id: (d.distributors as any)?.id, name: (d.distributors as any)?.name }));
      
      setBeatMappedDistributors(mappedDistributors);
      
      // Auto-select first distributor if available
      if (mappedDistributors.length > 0 && !retailerData.selectedDistributors.length) {
        handleInputChange("selectedDistributors", [mappedDistributors[0].id]);
        handleInputChange("parentName", mappedDistributors[0].name);
      }
    } catch (error) {
      console.error('Failed to load beat-mapped distributors:', error);
      setBeatMappedDistributors([]);
    }
  };

  // Load beat-mapped distributors when beat selection changes
  useEffect(() => {
    if (selectedBeat && selectedBeat !== 'unassigned') {
      loadBeatMappedDistributors(selectedBeat);
    } else {
      setBeatMappedDistributors([]);
    }
  }, [selectedBeat, beats]);

  // Load beats from the beats table (online) or from cache (offline)
  // CACHE-FIRST: Always load from cache immediately, then update from network in background
  const loadBeats = async () => {
    if (!user) {
      console.log('[AddRetailer] Cannot load beats - no user');
      return;
    }
    
    console.log('[AddRetailer] Loading beats. User ID:', user.id, 'Connectivity status:', connectivityStatus);
    
    // STEP 1: ALWAYS load from cache FIRST for instant display (even on slow network)
    let cachedBeatsLoaded = false;
    try {
      await offlineStorage.init();
      const cachedBeats = await offlineStorage.getAll(STORES.BEATS);
      console.log('[AddRetailer Cache-First] Total cached beats:', cachedBeats.length);
      
      // Include both owned beats and beats shared/covering this user
      const userBeats = cachedBeats.filter((beat: any) =>
        beat.is_active !== false &&
        (beat.user_id === user.id || beat.access_type)
      );

      if (userBeats.length > 0) {
        const mappedBeats = userBeats.map((beat: any) => ({
          beat_id: beat.beat_id,
          beat_name: beat.beat_name,
          id: beat.id,
          user_id: beat.user_id,
          owner_name: beat.owner_name ?? null,
          access_type: beat.access_type,
        }));
        setBeats(mappedBeats);
        cachedBeatsLoaded = true;
        console.log('[AddRetailer Cache-First] ✅ Loaded beats from cache instantly:', mappedBeats.length);
      }
    } catch (cacheError) {
      console.error('[AddRetailer Cache-First] Cache read error:', cacheError);
    }
    
    // STEP 2: If online, fetch from network in background to update cache (non-blocking)
    const tryOnlineFetch = connectivityStatus !== 'offline';
    
    if (tryOnlineFetch) {
      try {
        // Add a timeout for slow networks - 8 seconds
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 8000)
        );
        
        const nowIso = new Date().toISOString();
        const fetchPromise = Promise.all([
          supabase
            .from('beats')
            .select('beat_id, beat_name, user_id, created_by, owner_name, is_active, id')
            .eq('user_id', user.id)
            .eq('is_active', true),
          supabase
            .from('beat_user_access')
            .select('access_type, beat_id, effective_from, effective_to, is_active, beats:beats!beat_user_access_beat_id_fkey(beat_id, beat_name, user_id, created_by, owner_name, is_active, id)')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .or(`effective_to.is.null,effective_to.gt.${nowIso}`),
        ]);
        
        const [ownedRes, accessRes] = await Promise.race([fetchPromise, timeoutPromise]) as any;
        
        if (ownedRes.error) throw ownedRes.error;
        
        const WRITE_ACCESS = new Set(['OWNED', 'CO_OWNER', 'OPERATIONAL', 'COVERAGE']);
        const byId = new Map<string, any>();
        for (const b of (ownedRes.data ?? [])) {
          byId.set(b.beat_id, { ...b, access_type: 'OWNED' });
        }
        for (const row of (accessRes?.data ?? [])) {
          const at = String(row.access_type || '').toUpperCase();
          if (!WRITE_ACCESS.has(at)) continue;
          const beat = row.beats;
          if (!beat?.beat_id || beat.is_active === false) continue;
          if (byId.has(beat.beat_id)) continue;
          byId.set(beat.beat_id, { ...beat, access_type: at });
        }
        
        const merged = Array.from(byId.values()).sort((a: any, b: any) =>
          String(a.beat_name || '').localeCompare(String(b.beat_name || ''))
        );
        
        // Cache merged beats for offline access (include ownership fields)
        if (merged.length > 0) {
          await offlineStorage.init();
          console.log('[AddRetailer Online] Caching beats to IndexedDB:', merged.length);
          for (const beat of merged) {
            await offlineStorage.save(STORES.BEATS, {
              id: beat.id,
              beat_id: beat.beat_id,
              beat_name: beat.beat_name,
              user_id: beat.user_id,
              created_by: beat.created_by,
              owner_name: beat.owner_name ?? null,
              access_type: beat.access_type,
              is_active: true,
            });
          }
          console.log('[AddRetailer Online] ✅ Beats cached successfully');
        }
        
        setBeats(merged);
        console.log('[AddRetailer Online] Loaded beats from Supabase:', merged.length);
        return; // Success - exit function
      } catch (error) {
        console.error('[AddRetailer Online] Failed to load beats (timeout or error):', error);
        if (cachedBeatsLoaded) {
          console.log('[AddRetailer] Using cached beats due to network issue');
          return;
        }
      }
    }
    
    // STEP 3: OFFLINE or FALLBACK (only if cache wasn't already loaded above)
    if (!cachedBeatsLoaded) {
      try {
        console.log('[AddRetailer] Loading beats from cache (fallback)...');
        await offlineStorage.init();
        
        const cachedBeats = await offlineStorage.getAll(STORES.BEATS);
        console.log('[AddRetailer] Total cached beats:', cachedBeats.length);
        
        const userBeats = cachedBeats.filter((beat: any) => beat.is_active);
        
        const mappedBeats = userBeats.map((beat: any) => ({
          beat_id: beat.beat_id,
          beat_name: beat.beat_name,
          id: beat.id,
          user_id: beat.user_id,
          owner_name: beat.owner_name ?? null,
          access_type: beat.access_type,
        }));
        
        setBeats(mappedBeats);
        console.log('[AddRetailer] Loaded beats from cache:', mappedBeats.length);
        
        if (mappedBeats.length === 0 && connectivityStatus !== 'offline') {
          toast({
            title: "Loading beats...",
            description: "Slow network detected. Please wait or refresh.",
            duration: 3000
          });
        }
      } catch (error) {
        console.error('[AddRetailer] Error loading beats from cache:', error);
        setBeats([]);
      }
    }
  };

  // Load territories from the territories table
  const loadTerritories = async () => {
    try {
      const { data, error } = await supabase
        .from('territories')
        .select('id, name, region')
        .order('name');
      
      if (error) throw error;
      setTerritories(data || []);
    } catch (error: any) {
      console.error('Error loading territories:', error);
    }
  };

  // Load all users for owner dropdown
  const loadAllUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name');
      
      if (error) throw error;
      setAllUsers((data || []).filter(u => u.full_name));
    } catch (error) {
      console.error('Error loading users:', error);
      setAllUsers([]);
    }
  };

  useEffect(() => {
    if (user) {
      loadDistributors();
      loadBeats();
      loadTerritories();
      loadCreditConfig();
      loadAllUsers();
    }
  }, [user, connectivityStatus]); // Re-run when connectivity changes

  // Listen for beat creation events to reload beats
  useEffect(() => {
    const handleBeatCreated = () => {
      console.log('[AddRetailer] Beat created event received, reloading beats...');
      if (user) {
        loadBeats();
      }
    };

    window.addEventListener('beatCreated', handleBeatCreated);
    return () => window.removeEventListener('beatCreated', handleBeatCreated);
  }, [user]);

  // Auto-select beat if coming from My Visits with planned beat(s) or editing
  useEffect(() => {
    if (isEditMode && editingRetailer?.beat_id && !selectedBeat) {
      setSelectedBeat(editingRetailer.beat_id);
    } else if (plannedBeats.length > 0 && !selectedBeat) {
      // If only one beat planned, auto-select it
      // If multiple beats, auto-select the first one
      setSelectedBeat(plannedBeats[0].beat_id);
    }
  }, [plannedBeats, selectedBeat, isEditMode, editingRetailer]);

  // Set territory when in edit mode
  useEffect(() => {
    if (isEditMode && editingRetailer?.territory_id) {
      setSelectedTerritoryId(editingRetailer.territory_id);
    }
  }, [isEditMode, editingRetailer]);

  // Set owner when in edit mode, or auto-fill with current user for new retailers
  useEffect(() => {
    if (isEditMode && editingRetailer?.owner_id) {
      setSelectedOwnerId(editingRetailer.owner_id);
      setSelectedOwnerName(editingRetailer.owner_name || '');
    } else if (!isEditMode && user && allUsers.length > 0 && !selectedOwnerId) {
      // Auto-fill owner with current user when creating new retailer
      const currentUserProfile = allUsers.find(u => u.id === user.id);
      if (currentUserProfile) {
        setSelectedOwnerId(user.id);
        setSelectedOwnerName(currentUserProfile.full_name || '');
      }
    }
  }, [isEditMode, editingRetailer, user, allUsers, selectedOwnerId]);

  // When the selected beat is owned by someone else (shared / coverage),
  // auto-assign the owner field to the beat owner so the new retailer stays
  // with the beat owner after coverage ends. User can still override manually.
  useEffect(() => {
    if (isEditMode || !user || !selectedBeat) return;
    const beat = beats.find(b => b.beat_id === selectedBeat);
    if (!beat?.user_id) return;
    const isOwnBeat = beat.user_id === user.id;
    if (isOwnBeat) return;
    // Only auto-switch when owner currently points to the current user (i.e. auto-filled, not a manual override)
    if (selectedOwnerId && selectedOwnerId !== user.id) return;
    setSelectedOwnerId(beat.user_id);
    setSelectedOwnerName(beat.owner_name || '');
  }, [selectedBeat, beats, user, isEditMode]);

  
  // Set photo preview when editing
  useEffect(() => {
    if (isEditMode && editingRetailer?.photo_url) {
      setCapturedPhotoPreview(editingRetailer.photo_url);
    }
  }, [isEditMode, editingRetailer]);

  // Pre-fill distributor selection when editing
  useEffect(() => {
    if (isEditMode && editingRetailer?.distributor_id && distributors.length > 0) {
      // Check if the distributor exists in loaded distributors
      const existingDistributor = distributors.find(d => d.id === editingRetailer.distributor_id);
      if (existingDistributor && !retailerData.selectedDistributors.includes(editingRetailer.distributor_id)) {
        setRetailerData(prev => ({
          ...prev,
          selectedDistributors: [editingRetailer.distributor_id],
          parentName: existingDistributor.name
        }));
      }
    }
  }, [isEditMode, editingRetailer, distributors]);

  // In edit mode, fetch the freshest retailer row from DB and merge it in,
  // so prefill is complete even if the caller passed only a partial object.
  useEffect(() => {
    if (!isEditMode || !editingRetailer?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('retailers')
          .select('*')
          .eq('id', editingRetailer.id)
          .maybeSingle();
        if (error || !data || cancelled) return;
        const r: any = data;
        const competitors = r.competitors || [];
        setRetailerData(prev => ({
          ...prev,
          name: r.name ?? prev.name,
          contactName: r.contact_name ?? prev.contactName,
          contactTitle: r.contact_title ?? prev.contactTitle,
          gstNumber: r.gst_number ?? prev.gstNumber,
          phone: r.phone ?? prev.phone,
          address: r.address ?? prev.address,
          category: r.category ?? prev.category,
          notes: r.notes ?? prev.notes,
          parentType: r.parent_type ?? prev.parentType,
          parentName: r.parent_name ?? prev.parentName,
          locationTag: r.location_tag ?? prev.locationTag,
          retailType: r.retail_type ?? prev.retailType,
          potential: r.potential
            ? String(r.potential).charAt(0).toUpperCase() + String(r.potential).slice(1)
            : prev.potential,
          competitor1: competitors[0] ?? prev.competitor1,
          competitor2: competitors[1] ?? prev.competitor2,
          competitor3: competitors[2] ?? prev.competitor3,
          latitude: r.latitude != null ? String(r.latitude) : prev.latitude,
          longitude: r.longitude != null ? String(r.longitude) : prev.longitude,
          photo_url: r.photo_url ?? prev.photo_url,
          manual_credit_score: r.manual_credit_score != null ? String(r.manual_credit_score) : prev.manual_credit_score,
          state: r.state ?? prev.state,
        }));
        if (r.photo_url) setCapturedPhotoPreview(r.photo_url);
        if (r.beat_id) setSelectedBeat(prev => prev || r.beat_id);
        if (r.territory_id) setSelectedTerritoryId(prev => prev || r.territory_id);
        if (r.owner_id) {
          setSelectedOwnerId(prev => prev || r.owner_id);
          setSelectedOwnerName(prev => prev || r.owner_name || '');
        }
      } catch (e) {
        console.error('Edit-mode fresh fetch failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [isEditMode, editingRetailer?.id]);

  const loadCreditConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_management_config')
        .select('is_enabled, scoring_mode')
        .single();
      
      if (!error && data) {
        setCreditConfig(data);
      }
    } catch (error) {
      console.error('Error loading credit config:', error);
    }
  };

  // Auto-fill parent name with company brand when Parent Type is Company
  useEffect(() => {
    if (
      retailerData.parentType === "Company" &&
      companyDisplayName &&
      !retailerData.parentName
    ) {
      setRetailerData(prev => ({ ...prev, parentName: companyDisplayName }));
    }
  }, [retailerData.parentType, companyDisplayName, retailerData.parentName]);

  const handleInputChange = (field: string, value: string | string[]) => {
    setRetailerData(prev => ({ ...prev, [field]: value }));
    // Clear validation error when user fills the field
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleDistributorToggle = (distributorId: string, distributorName: string) => {
    setRetailerData(prev => {
      const isSelected = prev.selectedDistributors.includes(distributorId);
      if (isSelected) {
        return {
          ...prev,
          selectedDistributors: prev.selectedDistributors.filter(id => id !== distributorId),
          parentName: prev.selectedDistributors.length === 1 ? "" : prev.parentName
        };
      } else {
        const newSelectedDistributors = [...prev.selectedDistributors, distributorId];
        const distributorNames = newSelectedDistributors.map(id => 
          distributors.find(d => d.id === id)?.name || ""
        ).filter(Boolean);
        return {
          ...prev,
          selectedDistributors: newSelectedDistributors,
          parentName: distributorNames.join(", ")
        };
      }
    });
  };

  const handlePhotoCapture = async () => {
    if (!user) {
      toast({ title: 'Authentication Error', description: 'Please sign in to upload photos', variant: 'destructive' });
      return;
    }

    try {
      setIsUploadingPhoto(true);
      
      // Create file input for camera
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment'; // Use rear camera if available
      
      input.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
          // Show preview
          const reader = new FileReader();
          reader.onload = (e) => {
            setCapturedPhotoPreview(e.target?.result as string);
          };
          reader.readAsDataURL(file);

          // Compress and upload to Supabase Storage
          const compressedFile = await compressToTargetSize(file, 0.25, 1200);
          const fileName = `${user.id}/${Date.now()}_retailer_photo.jpg`;
          const { data, error } = await supabase.storage
            .from('retailer-photos')
            .upload(fileName, compressedFile, {
              cacheControl: '3600',
              upsert: false,
              contentType: 'image/jpeg'
            });

          if (error) throw error;

          // Get public URL
          const { data: urlData } = supabase.storage
            .from('retailer-photos')
            .getPublicUrl(fileName);

          // Update retailer data with photo URL
          handleInputChange('photo_url', urlData.publicUrl);
          
          toast({ 
            title: 'Photo Captured', 
            description: 'Retailer photo uploaded successfully!' 
          });
        } catch (error) {
          console.error('Photo upload error:', error);
          toast({ 
            title: 'Upload Failed', 
            description: 'Could not upload photo. Please try again.', 
            variant: 'destructive' 
          });
        } finally {
          setIsUploadingPhoto(false);
        }
      };

      input.click();
    } catch (error) {
      console.error('Camera access error:', error);
      toast({ 
        title: 'Camera Error', 
        description: 'Could not access camera. Please check permissions.', 
        variant: 'destructive' 
      });
      setIsUploadingPhoto(false);
    }
  };

  // Compress image before scanning to speed up processing
  const compressImage = (dataUrl: string, maxWidth = 1024, maxHeight = 1024): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions maintaining aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG with 0.8 quality
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = dataUrl;
    });
  };

  const handleScanBoard = async () => {
    if (!user) {
      toast({ title: 'Authentication Error', description: 'Please sign in to scan boards', variant: 'destructive' });
      return;
    }

    try {
      setIsScanningBoard(true);
      
      // Create file input for camera
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment'; // Use rear camera
      
      input.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) {
          setIsScanningBoard(false);
          return;
        }

        try {
          toast({ 
            title: 'Scanning...', 
            description: 'Reading board information',
            duration: 15000
          });

          // Convert image to base64
          const reader = new FileReader();
          reader.onload = async (e) => {
            const base64Image = e.target?.result as string;
            
            // Compress image before sending
            const compressedImage = await compressImage(base64Image);

            try {
              // Upload the scanned image to Supabase Storage for reuse
              const fileName = `${user.id}/${Date.now()}_scanned_board.jpg`;
              
              // Convert compressed base64 to blob, then compress for storage
              const fetchRes = await fetch(compressedImage);
              const blob = await fetchRes.blob();
              const compressedBlob = await compressToTargetSize(blob, 0.25, 1200);
              
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('retailer-photos')
                .upload(fileName, compressedBlob, {
                  cacheControl: '3600',
                  upsert: false,
                  contentType: 'image/jpeg'
                });

              if (!uploadError && uploadData) {
                // Get public URL
                const { data: urlData } = supabase.storage
                  .from('retailer-photos')
                  .getPublicUrl(fileName);
                
                const uploadedPhotoUrl = urlData.publicUrl;
                
                // Set as scanned board preview
                setScannedBoardPhotoUrl(uploadedPhotoUrl);
                
                // Also use this as retailer photo if no photo is set yet
                if (!retailerData.photo_url) {
                  handleInputChange('photo_url', uploadedPhotoUrl);
                  setCapturedPhotoPreview(compressedImage);
                }
              }

              // Call edge function with compressed image
              const { data, error } = await supabase.functions.invoke('scan-board', {
                body: { imageBase64: compressedImage }
              });

              if (error) {
                console.error('Scan error:', error);
                toast({ 
                  title: 'Scan Failed', 
                  description: error.message || 'Failed to scan board. Please try again.',
                  variant: 'destructive',
                  duration: 4000
                });
                setIsScanningBoard(false);
                return;
              }

              if (data?.error) {
                console.error('Scan data error:', data.error);
                toast({ 
                  title: 'Scan Failed', 
                  description: data.error,
                  variant: 'destructive',
                  duration: 4000
                });
                setIsScanningBoard(false);
                return;
              }

              // Auto-fill form fields with extracted data
              let fieldsFound = [];
              if (data?.name && data.name.trim()) {
                handleInputChange('name', data.name);
                fieldsFound.push('name');
              }
              if (data?.address && data.address.trim()) {
                handleInputChange('address', data.address);
                fieldsFound.push('address');
              }
              if (data?.phone && data.phone.trim()) {
                handleInputChange('phone', data.phone);
                fieldsFound.push('phone');
              }

              if (fieldsFound.length > 0) {
                toast({ 
                  title: 'Success!', 
                  description: `Found ${fieldsFound.join(', ')} from the board. Photo saved as retailer photo.`,
                  duration: 3000
                });
              } else {
                toast({ 
                  title: 'Scan Complete', 
                  description: 'No clear information found. Photo saved. Please enter details manually.',
                  duration: 3000
                });
              }
            } catch (scanError: any) {
              console.error('Scan error:', scanError);
            } finally {
              setIsScanningBoard(false);
            }
          };
          
          reader.readAsDataURL(file);
        } catch (error) {
          console.error('File read error:', error);
          toast({ 
            title: 'Error', 
            description: 'Could not read image file', 
            variant: 'destructive' 
          });
          setIsScanningBoard(false);
        }
      };

      input.click();
    } catch (error) {
      console.error('Camera access error:', error);
      toast({
        title: 'Camera Error', 
        description: 'Could not access camera. Please check permissions.', 
        variant: 'destructive' 
      });
      setIsScanningBoard(false);
    }
  };

  const loadExistingBeats = async () => {
    if (!user) return setExistingBeats([]);
    const { data, error } = await supabase
      .from('retailers')
      .select('beat_id')
      .eq('user_id', user.id);
    if (error) {
      setExistingBeats([]);
      return;
    }
    const set = new Set<string>();
    (data || []).forEach((r: any) => r.beat_id && set.add(r.beat_id));
    setExistingBeats(Array.from(set));
  };

  const { createRetailer } = useOfflineRetailers();
  const { isOnline } = useOfflineSync();

  const performInsert = async (beatId: string) => {
    if (!user) {
      toast({ title: 'Not signed in', description: 'Please sign in to continue', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    
    const payload: any = {
      name: retailerData.name,
      contact_name: retailerData.contactName || null,
      contact_title: retailerData.contactTitle || null,
      gst_number: retailerData.gstNumber || null,
      phone: retailerData.phone,
      address: retailerData.address,
      category: retailerData.category || null,
      beat_id: beatId,
      beat_name: beats.find(b => b.beat_id === beatId)?.beat_name || null,
      territory_id: selectedTerritoryId || null,
      notes: retailerData.notes || null,
      parent_type: retailerData.parentType || null,
      parent_name: retailerData.parentName || null,
      location_tag: retailerData.locationTag || null,
      retail_type: retailerData.retailType || null,
      potential: retailerData.potential ? retailerData.potential.toLowerCase() : null,
      competitors: [retailerData.competitor1, retailerData.competitor2, retailerData.competitor3].filter(Boolean),
      photo_url: retailerData.photo_url || null,
      latitude: retailerData.latitude ? parseFloat(retailerData.latitude) : null,
      longitude: retailerData.longitude ? parseFloat(retailerData.longitude) : null,
      manual_credit_score: retailerData.manual_credit_score ? parseFloat(retailerData.manual_credit_score) : null,
      state: retailerData.state || null,
      owner_id: selectedOwnerId || null,
      owner_name: selectedOwnerName || null,
    };

    if (isEditMode && editingRetailer?.id) {
      // Update existing retailer
      try {
        const { error } = await supabase
          .from('retailers')
          .update(payload)
          .eq('id', editingRetailer.id);
        
        setIsSaving(false);
        
        if (error) throw error;
        
        toast({ 
          title: 'Retailer Updated', 
          description: `${retailerData.name} updated successfully.`
        });
        navigate(returnTo, { replace: true });
      } catch (error: any) {
        console.error('Error updating retailer:', error);
        toast({ 
          title: 'Failed to update', 
          description: error.message || 'Could not update retailer', 
          variant: 'destructive' 
        });
        setIsSaving(false);
      }
    } else {
      // Create new retailer — ownership follows the beat owner for shared/coverage beats,
      // so retailers stay with the beat owner after coverage ends.
      const selectedBeatRow = beats.find(b => b.beat_id === beatId);
      const beatOwnerUserId = selectedBeatRow?.user_id ?? user.id;
      const beatOwnerName = selectedBeatRow?.owner_name ?? null;
      const isOwnBeat = beatOwnerUserId === user.id;

      payload.created_by = user.id; // audit: who physically added the row
      payload.user_id = isOwnBeat ? user.id : beatOwnerUserId;
      // Form-picked owner wins (manual override); otherwise default to beat owner
      payload.owner_id = selectedOwnerId || (isOwnBeat ? user.id : beatOwnerUserId);
      payload.owner_name = selectedOwnerName || (isOwnBeat ? null : beatOwnerName);
      payload.status = 'active';
      
      // SIMPLE FLOW: Retailer starts unverified, waiting for WhatsApp confirmation
      payload.retailer_confirmed = false;  // Waiting for WhatsApp confirmation
      payload.verified = false;             // Not verified yet
      payload.verification_method = null;   // Will be set to 'whatsapp' when customer confirms
      
      const result = await createRetailer(payload);
      setIsSaving(false);

      // Note: Welcome message no longer auto-sent. User chooses WhatsApp/SMS/Call from post-save dialog.

      if (result.success) {
        let title = 'Retailer Created';
        let description = `${retailerData.name} created successfully.`;

        if (result.offline) {
          title = 'Retailer Saved Offline';
          description = `${retailerData.name} saved offline. You can notify the customer once back online.`;
        }

        toast({
          title,
          description,
          action: result.offline ? <WifiOff className="h-4 w-4" /> : undefined
        });

        // Open contact-action dialog so user picks WhatsApp / SMS / Call.
        // Offline rows have no id yet — just navigate back.
        if (!isEditMode && result.data?.id && payload.phone && !result.offline) {
          setContactDialog({
            retailerId: result.data.id,
            phone: payload.phone,
            name: retailerData.name,
          });
        } else {
          navigate(returnTo, { replace: true });
        }
      } else {
        toast({
          title: 'Failed to save',
          description: 'Could not save retailer',
          variant: 'destructive'
        });
      }
    }
  };


  const handleSaveWithBeat = async () => {
    if (!retailerData.name || !retailerData.phone || !retailerData.address) {
      toast({ title: 'Missing Information', description: 'Please fill in all required fields (Name, Phone, Address)', variant: 'destructive' });
      return;
    }
    if (!selectedBeat || selectedBeat === 'unassigned') {
      toast({ title: 'Beat Required', description: 'Please select a beat for this retailer', variant: 'destructive' });
      return;
    }
    if (retailerData.parentType === "Distributor" && (!retailerData.selectedDistributors || retailerData.selectedDistributors.length === 0)) {
      toast({ title: 'Distributor Required', description: 'Please select a distributor for this retailer', variant: 'destructive' });
      return;
    }
    if (!retailerData.latitude || !retailerData.longitude) {
      toast({ title: 'Location Required', description: "GPS location is required - please tap 'Get Location' button", variant: 'destructive' });
      return;
    }
    await loadExistingBeats();
    setExistingBeat(undefined);
    setNewBeat("");
    setBeatDialogOpen(true);
  };

  const confirmAssignBeat = async () => {
    const chosenBeat = (existingBeat && existingBeat !== '__new__') ? existingBeat : newBeat.trim();
    if (!chosenBeat) {
      toast({ title: 'Choose a beat', description: 'Pick an existing beat or enter a new name.' });
      return;
    }
    await performInsert(chosenBeat);
    setBeatDialogOpen(false);
  };

  // Validate form and return errors object
  const validateForm = () => {
    const errors: {[key: string]: string} = {};
    
    if (!retailerData.name) errors.name = "Retailer name is required";
    if (!retailerData.phone) errors.phone = "Phone number is required";
    if (!retailerData.address) errors.address = "Address is required";
    if (!retailerData.retailType) errors.retailType = "Retailer type is required";
    if (!retailerData.category) errors.category = "Category is required";
    if (!selectedBeat || selectedBeat === 'unassigned') errors.beat = "Beat selection is required";
    if (!retailerData.parentType) errors.parentType = "Parent type is required";
    if (retailerData.parentType === "Distributor" && (!retailerData.selectedDistributors || retailerData.selectedDistributors.length === 0)) {
      errors.distributor = "Distributor selection is required";
    }
    if (!retailerData.latitude || !retailerData.longitude) {
      errors.location = "GPS location is required - please tap 'Get Location' button";
    }
    
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form and show inline errors immediately (works offline)
    const errors = validateForm();
    setValidationErrors(errors);
    
    if (Object.keys(errors).length > 0) {
      // Show toast as backup, but inline errors will always show
      toast({
        title: "Missing Required Fields",
        description: "Please fill in all fields marked with *",
        variant: "destructive"
      });
      return;
    }
    
    // Save with selected beat
    await performInsert(selectedBeat);
  };

  return (
    <Layout>
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 space-y-4">
        {/* Header */}
        <Card className="shadow-card bg-gradient-primary text-primary-foreground">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => navigate(returnTo)}
                className="text-primary-foreground hover:bg-primary-foreground/20"
              >
                <ArrowLeft size={20} />
              </Button>
              <div>
                <CardTitle className="text-xl font-bold">
                  {isEditMode ? t('retailer.editRetailer', 'Edit Retailer') : t('retailer.addRetailer')}
                </CardTitle>
                <p className="text-primary-foreground/80 text-sm">
                  {isEditMode ? editingRetailer?.name : t('retailer.subtitle')}
                </p>
              </div>
            </div>
            {isEditMode ? <Pencil size={24} /> : <Plus size={24} />}
          </CardHeader>
        </Card>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('retailer.information')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Scan Board & Retailer Photo Section - Side by Side with Background */}
              <div className="p-3 bg-muted/50 rounded-xl border border-border">
                <div className="grid grid-cols-2 gap-2">
                  {/* Scan Board */}
                  <div className="flex flex-col items-center text-center p-3 bg-background rounded-lg border border-border min-h-[180px]">
                    <ScanLine className="h-8 w-8 text-muted-foreground mb-1 flex-shrink-0" />
                    <Label className="text-xs font-semibold mb-0.5">{t('retailer.quickScan')}</Label>
                    <p className="text-[10px] text-muted-foreground mb-2 flex-1 leading-tight">
                      {t('retailer.quickScanDesc')}
                    </p>
                    {scannedBoardPhotoUrl && (
                      <div className="mb-2 w-12 h-12 border-2 border-primary rounded-lg overflow-hidden flex-shrink-0">
                        <img
                          src={scannedBoardPhotoUrl}
                          alt="Scanned board"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={handleScanBoard}
                      disabled={isScanningBoard}
                      className="w-full mt-auto text-xs px-2"
                    >
                      <ScanLine size={14} className="mr-1 flex-shrink-0" />
                      <span className="truncate">{isScanningBoard ? 'Scanning...' : 'Scan Board'}</span>
                    </Button>
                  </div>
                  
                  {/* Retailer Photo */}
                  <div className="flex flex-col items-center text-center p-3 bg-background rounded-lg border border-border min-h-[180px]">
                    <Camera className="h-8 w-8 text-muted-foreground mb-1 flex-shrink-0" />
                    <Label className="text-xs font-semibold mb-0.5">{t('retailer.retailerPhoto')}</Label>
                    <p className="text-[10px] text-muted-foreground mb-2 flex-1 leading-tight">
                      {t('retailer.photoDesc')}
                    </p>
                    {(capturedPhotoPreview || retailerData.photo_url) && (
                      <div className="mb-2 w-12 h-12 border-2 border-primary rounded-lg overflow-hidden flex-shrink-0">
                        <img
                          src={capturedPhotoPreview || retailerData.photo_url}
                          alt="Retailer photo"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handlePhotoCapture}
                      disabled={isUploadingPhoto}
                      className="w-full mt-auto text-xs px-2"
                    >
                      <Camera size={14} className="mr-1 flex-shrink-0" />
                      <span className="truncate">{isUploadingPhoto ? 'Uploading...' : 'Take Photo'}</span>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Owner Field - Searchable Dropdown */}
              <div className="space-y-2">
                <Label>Owner</Label>
                <Popover open={ownerComboOpen} onOpenChange={setOwnerComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={ownerComboOpen}
                      className="w-full justify-between bg-background"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <User size={16} className="text-muted-foreground flex-shrink-0" />
                        <span className="truncate">
                          {selectedOwnerName || "Select owner..."}
                        </span>
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0 z-50" align="start">
                    <Command>
                      <CommandInput placeholder="Search users..." />
                      <CommandList>
                        <CommandEmpty>No user found.</CommandEmpty>
                        <CommandGroup className="max-h-60 overflow-auto">
                          {allUsers.map((u) => (
                            <CommandItem
                              key={u.id}
                              value={u.full_name}
                              onSelect={() => {
                                setSelectedOwnerId(u.id);
                                setSelectedOwnerName(u.full_name);
                                setOwnerComboOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedOwnerId === u.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {u.full_name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">Auto-filled with current user. Change if needed.</p>
              </div>

              {/* Retailer Name */}
              <div className="space-y-2">
                <Label htmlFor="name">{t('retailer.retailerName')} *</Label>
                <Input
                  id="name"
                  placeholder={t('retailer.enterRetailerName')}
                  value={retailerData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  className="bg-background"
                />
              </div>

              {/* Contact Name and Title - Under Retailer Name */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactName">Contact Name</Label>
                  <Input
                    id="contactName"
                    placeholder="Enter contact person name"
                    value={retailerData.contactName}
                    onChange={(e) => handleInputChange("contactName", e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactTitle">Title</Label>
                  <Select 
                    value={retailerData.contactTitle} 
                    onValueChange={(value) => handleInputChange("contactTitle", value)}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select title" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border z-50">
                      {contactTitles.map((title) => (
                        <SelectItem key={title} value={title}>{title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gstNumber">{t('retailer.gstNumber')}</Label>
                <Input
                  id="gstNumber"
                  placeholder={t('retailer.enterGstNumber')}
                  value={retailerData.gstNumber}
                  onChange={(e) => handleInputChange("gstNumber", e.target.value)}
                  className="bg-background"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t('retailer.phone')} *</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder={t('retailer.enterPhone')}
                  value={retailerData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  className="bg-background"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">{t('retailer.address')} *</Label>
                <div className="flex gap-2">
                  <Textarea
                    id="address"
                    placeholder="Enter complete address"
                    value={retailerData.address}
                    onChange={(e) => handleInputChange("address", e.target.value)}
                    className="bg-background min-h-[80px] flex-1"
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="icon"
                    onClick={async () => {
                      if (!navigator.geolocation) {
                        toast({ 
                          title: "GPS Not Available", 
                          description: "Your device doesn't support location services", 
                          variant: "destructive" 
                        });
                        return;
                      }
                      
                      // Check if location permission is granted
                      try {
                        const permissionStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
                        
                        if (permissionStatus.state === 'denied') {
                          toast({ 
                            title: "Location Permission Denied", 
                            description: "Please enable location access in your device settings",
                            variant: "destructive",
                            duration: 5000
                          });
                          return;
                        }
                      } catch (e) {
                        console.log('Permission API not supported, will try direct geolocation');
                      }
                      
                      const loadingToast = toast({ 
                        title: "Getting Location...", 
                        description: "Please wait...",
                        duration: 5000
                      });
                      
                      try {
                        // Multi-strategy GPS capture with extended timeouts for slow networks
                        let position: GeolocationPosition | null = null;
                        
                        // Strategy 1: Try cached location first (fastest - 2 seconds)
                        try {
                          position = await new Promise<GeolocationPosition>((resolve, reject) => {
                            navigator.geolocation.getCurrentPosition(
                              resolve,
                              reject,
                              { 
                                enableHighAccuracy: false,
                                timeout: 2000, // Short timeout for cached location
                                maximumAge: 600000 // Accept location cached within last 10 minutes
                              }
                            );
                          });
                        } catch (cacheError) {
                          console.log('Cached location not available, trying network location...');
                          
                          // Strategy 2: Try network-based location (medium - 8 seconds for slow networks)
                          try {
                            position = await new Promise<GeolocationPosition>((resolve, reject) => {
                              navigator.geolocation.getCurrentPosition(
                                resolve,
                                reject,
                                { 
                                  enableHighAccuracy: false,
                                  timeout: 8000, // Increased for slow networks
                                  maximumAge: 0 // Force fresh location
                                }
                              );
                            });
                          } catch (networkError) {
                            console.log('Network location failed, trying high accuracy GPS...');
                            
                            // Strategy 3: Fall back to high accuracy GPS (slowest - 15 seconds for reliability)
                            position = await new Promise<GeolocationPosition>((resolve, reject) => {
                              navigator.geolocation.getCurrentPosition(
                                resolve,
                                reject,
                                { 
                                  enableHighAccuracy: true,
                                  timeout: 15000, // Extended for GPS lock in poor conditions
                                  maximumAge: 0
                                }
                              );
                            });
                          }
                        }
                        
                        if (!position) {
                          throw new Error('Failed to get location');
                        }
                        
                        // Get precise coordinates with 7 decimal places (~1 cm accuracy)
                        const lat = Number(position.coords.latitude.toFixed(7));
                        const lon = Number(position.coords.longitude.toFixed(7));
                        const accuracy = position.coords.accuracy;
                        
                        // Update coordinates immediately
                        handleInputChange("latitude", lat.toString());
                        handleInputChange("longitude", lon.toString());
                        
                        loadingToast.dismiss?.();
                        
                        if (accuracy > 100) {
                          toast({ 
                            title: "Location Captured", 
                            description: `GPS locked (accuracy: ${accuracy.toFixed(0)}m). Fetching address...`,
                            duration: 3000
                          });
                        } else {
                          toast({ 
                            title: "GPS Location Locked", 
                            description: `High accuracy: ${accuracy.toFixed(0)}m. Fetching address...`,
                            duration: 2000
                          });
                        }
                        
                        // Use Google Maps Geocoding with timeout
                        try {
                          const googleApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

                          // Helper to compute distance in meters
                          const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
                            const toRad = (v: number) => (v * Math.PI) / 180;
                            const R = 6371000; // meters
                            const dLat = toRad(lat2 - lat1);
                            const dLon = toRad(lon2 - lon1);
                            const a =
                              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                                Math.sin(dLon / 2) * Math.sin(dLon / 2);
                            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                            return R * c;
                          };

                          if (googleApiKey && googleApiKey !== 'your_google_maps_api_key_here') {
                            // Add timeout for API calls - increased for slow networks
                            const fetchWithTimeout = (url: string, timeout = 15000) => {
                              return Promise.race([
                                fetch(url),
                                new Promise<Response>((_, reject) => 
                                  setTimeout(() => reject(new Error('API timeout')), timeout)
                                )
                              ]);
                            };

                            // 1) Reverse geocode prioritizing POIs/premise/street address
                            const geocodeUrl =
                              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}` +
                              `&language=en&key=${googleApiKey}` +
                              `&result_type=street_address|premise|point_of_interest|establishment|shopping_mall` +
                              `&location_type=ROOFTOP|GEOMETRIC_CENTER`;

                            // 2) Nearby places ordered by distance
                            const nearbyUrl =
                              `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}` +
                              `&rankby=distance&type=establishment&key=${googleApiKey}`;

                            const [geoRes, nearbyRes] = await Promise.allSettled([
                              fetchWithTimeout(geocodeUrl),
                              fetchWithTimeout(nearbyUrl)
                            ]);

                            let bestGeocode: any | null = null;
                            if (geoRes.status === 'fulfilled' && geoRes.value.ok) {
                              const geoData = await geoRes.value.json();
                              if (geoData.status === 'OK' && Array.isArray(geoData.results)) {
                                const priority = [
                                  'shopping_mall',
                                  'premise',
                                  'establishment',
                                  'point_of_interest',
                                  'street_address',
                                  'route'
                                ];
                                const score = (types: string[] = []) => {
                                  for (let i = 0; i < priority.length; i++) {
                                    if (types.includes(priority[i])) return i;
                                  }
                                  return 999;
                                };
                                bestGeocode = geoData.results
                                  .slice()
                                  .sort((a: any, b: any) => score(a.types) - score(b.types))[0] || null;
                              }
                            }

                            let bestPlace: any | null = null;
                            if (nearbyRes.status === 'fulfilled' && nearbyRes.value.ok) {
                              const nearbyData = await nearbyRes.value.json();
                              if ((nearbyData.status === 'OK' || nearbyData.status === 'ZERO_RESULTS') && Array.isArray(nearbyData.results)) {
                                const desiredPlaceTypes = new Set([
                                  'shopping_mall',
                                  'supermarket',
                                  'department_store',
                                  'grocery_or_supermarket',
                                  'store',
                                  'point_of_interest',
                                  'establishment'
                                ]);
                                // Prefer closest place matching desired types and within ~300m
                                for (const p of nearbyData.results) {
                                  if (!Array.isArray(p.types)) continue;
                                  const hasDesired = p.types.some((t: string) => desiredPlaceTypes.has(t));
                                  if (!hasDesired) continue;
                                  const plat = p.geometry?.location?.lat;
                                  const plon = p.geometry?.location?.lng;
                                  if (typeof plat === 'number' && typeof plon === 'number') {
                                    const d = haversine(lat, lon, plat, plon);
                                    if (d <= 350) { // within 350m of user
                                      bestPlace = p;
                                      break; // first match is the closest due to rankby=distance
                                    }
                                  }
                                }
                                // If nothing within 350m, still take the very first result as the nearest POI fallback
                                if (!bestPlace && nearbyData.results[0]) bestPlace = nearbyData.results[0];
                              }
                            }

                            // If we have a close POI (e.g., Bharath Mall), use its official name and address
                            if (bestPlace?.place_id) {
                              try {
                                const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${bestPlace.place_id}&fields=name,formatted_address,geometry,types&key=${googleApiKey}`;
                                const detRes = await fetch(detailsUrl);
                                if (detRes.ok) {
                                  const detData = await detRes.json();
                                  if (detData.status === 'OK' && detData.result) {
                                    const name = detData.result.name;
                                    const addr = detData.result.formatted_address || bestGeocode?.formatted_address || bestPlace.vicinity;
                                    const finalAddr = name && addr && !addr.startsWith(name) ? `${name}, ${addr}` : (addr || name);
                                    if (finalAddr) {
                                      handleInputChange('address', finalAddr);
                                      toast({ title: 'Address Found', description: `📍 ${name || 'Nearby place'} selected`, duration: 2500 });
                                      return;
                                    }
                                  }
                                }
                              } catch {}
                              // Fallback to place vicinity/name if details failed
                              const fallbackAddr = (bestPlace.name ? `${bestPlace.name}, ` : '') + (bestPlace.vicinity || bestGeocode?.formatted_address || `${lat}, ${lon}`);
                              handleInputChange('address', fallbackAddr);
                              toast({ title: 'Address Found', description: 'Nearest place selected', duration: 2500 });
                              return;
                            }

                            // Otherwise, use the best geocode result (more precise than generic area)
                            if (bestGeocode?.formatted_address) {
                              handleInputChange('address', bestGeocode.formatted_address);
                              toast({ title: 'Address Found', description: 'Location fetched from Google Maps', duration: 2000 });
                              return;
                            }
                          }

                          // Fallback to OpenStreetMap Nominatim with increased timeout for slow networks
                          const geocodeTimeout = new Promise((_, reject) => {
                            setTimeout(() => reject(new Error('Geocoding timeout')), 12000);
                          });
                          
                          const geocodePromise = fetch(
                            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
                            { headers: { 'User-Agent': 'FieldSalesNavigator/1.0' } }
                          );
                          
                          const response = await Promise.race([geocodePromise, geocodeTimeout]) as Response;
                          if (!response.ok) throw new Error('Geocoding service unavailable');
                          const data = await response.json();
                          const address = data.address || {};
                          const parts = [] as string[];
                          if (address.house_number) parts.push(address.house_number);
                          if (address.road || address.street) parts.push(address.road || address.street);
                          if (address.neighbourhood || address.suburb) parts.push(address.neighbourhood || address.suburb);
                          if (address.city || address.town || address.village) parts.push(address.city || address.town || address.village);
                          if (address.state_district) parts.push(address.state_district);
                          if (address.state) parts.push(address.state);
                          if (address.postcode) parts.push(address.postcode);
                          const formattedAddress = parts.length > 0 ? parts.join(', ') : data.display_name || `${lat}, ${lon}`;
                          handleInputChange('address', formattedAddress);
                          toast({ title: '✓ Address Found', description: 'Location fetched successfully', duration: 2000 });
                        } catch (geocodeError) {
                          console.error('Geocoding error:', geocodeError);
                          // Coordinates are already saved (lines 911-913), so user can proceed
                          toast({ 
                            title: 'Location Saved', 
                            description: `GPS coordinates (${lat}, ${lon}) saved. Address lookup failed - please enter address manually or retry.`, 
                            variant: 'default', 
                            duration: 5000 
                          });
                        }
                        
                      } catch (error: any) {
                        loadingToast.dismiss?.();
                        console.error('GPS/Geocoding error:', error);
                        
                        // Provide specific error messages
                        if (error.code === 1) {
                          toast({ 
                            title: "Location Permission Denied", 
                            description: "Please enable location access: Settings → Privacy → Location",
                            variant: "destructive",
                            duration: 5000
                          });
                        } else if (error.code === 2) {
                          toast({ 
                            title: "GPS Signal Not Available", 
                            description: "Please move to an open area with clear sky view and try again",
                            variant: "destructive",
                            duration: 5000
                          });
                        } else if (error.code === 3 || error.message?.includes('timeout')) {
                          toast({ 
                            title: "GPS Timeout", 
                            description: "Location request took too long. Please ensure GPS is enabled and try again",
                            variant: "destructive",
                            duration: 5000
                          });
                        } else {
                          toast({ 
                            title: "Location Error", 
                            description: "Could not get location. Please check GPS settings and try again",
                            variant: "destructive",
                            duration: 5000
                          });
                        }
                      }
                    }}
                    className="mt-auto"
                  >
                    <MapPin size={16} />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('retailer.gpsButton')} *</p>
                {validationErrors.location && (
                  <p className="text-xs text-destructive mt-1">{validationErrors.location}</p>
                )}
                
                {/* Latitude and Longitude - Manual Entry */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="latitude">Latitude</Label>
                      <Input
                        id="latitude"
                        type="number"
                        step="any"
                        value={retailerData.latitude}
                        onChange={(e) => handleInputChange("latitude", e.target.value)}
                        className="bg-background"
                        placeholder="e.g. 12.9716"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="longitude">Longitude</Label>
                      <Input
                        id="longitude"
                        type="number"
                        step="any"
                        value={retailerData.longitude}
                        onChange={(e) => handleInputChange("longitude", e.target.value)}
                        className="bg-background"
                        placeholder="e.g. 77.5946"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Enter manually or use the GPS button above to auto-fill</p>
                    
                  {/* Google Maps Style Coordinate Display */}
                  {retailerData.latitude && retailerData.longitude && (
                    <div className="p-3 bg-muted/50 rounded-lg border">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">GPS Coordinates</Label>
                          <button
                            type="button"
                            onClick={() => {
                              const googleMapsUrl = `https://www.google.com/maps?q=${retailerData.latitude},${retailerData.longitude}`;
                              window.open(googleMapsUrl, '_blank');
                              toast({ title: "Opening Google Maps", description: "Redirecting to Google Maps..." });
                            }}
                            className="text-primary hover:text-primary/80 transition-colors text-sm font-mono mt-1 block"
                            title="Click to open in Google Maps"
                          >
                            {retailerData.latitude}, {retailerData.longitude}
                          </button>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const googleMapsUrl = `https://www.google.com/maps?q=${retailerData.latitude},${retailerData.longitude}`;
                            window.open(googleMapsUrl, '_blank');
                            toast({ title: "Opening Google Maps", description: "Redirecting to Google Maps..." });
                          }}
                          className="text-xs"
                        >
                          <MapPin size={14} className="mr-1" />
                          Open in Maps
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Click coordinates or button to view location in Google Maps
                      </p>
                    </div>
                  )}
                </div>
              </div>


              {/* Manual Credit Score - Only show when credit management is enabled and mode is manual */}
              {creditConfig?.is_enabled && creditConfig?.scoring_mode === 'manual' && (
                <div className="space-y-2">
                  <Label htmlFor="manual_credit_score">Credit Score (Manual)</Label>
                  <Input
                    id="manual_credit_score"
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    placeholder="Enter credit score (0-10)"
                    value={retailerData.manual_credit_score}
                    onChange={(e) => handleInputChange("manual_credit_score", e.target.value)}
                    className="bg-background"
                  />
                  <p className="text-xs text-muted-foreground">Manual credit score out of 10</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Retail Type *</Label>
                  <Select 
                    value={retailerData.retailType === "Other" ? "Other" : retailerData.retailType} 
                    onValueChange={(value) => {
                      handleInputChange("retailType", value);
                      if (value !== "Other") {
                        setCustomRetailType("");
                      }
                    }}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border z-50">
                      {retailTypes.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {retailerData.retailType === "Other" && (
                    <Input
                      placeholder="Enter custom retail type"
                      value={customRetailType}
                      onChange={(e) => {
                        setCustomRetailType(e.target.value);
                        handleInputChange("retailType", e.target.value);
                      }}
                      className="bg-background mt-2"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label>{t('retailer.category')} *</Label>
                  <Select value={retailerData.category} onValueChange={(value) => handleInputChange("category", value)}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={t('retailer.selectCategory')} />
                    </SelectTrigger>
                    <SelectContent className="bg-background border z-50">
                      {categories.map((category) => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

            </CardContent>
          </Card>

          {/* IMPORTANT: Beat, Distributor & Location Assignment - Highlighted Section */}
          <Card className="border-2 border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Beat & Distributor Assignment
                <Badge variant="destructive" className="ml-2 text-xs">Required</Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">Assign this retailer to a beat and distributor for proper routing</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Beat and Territory Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Beat Selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="beat" className="font-semibold">Assign to Beat *</Label>
                    <Badge variant={connectivityStatus === 'offline' ? 'destructive' : 'secondary'} className="text-xs">
                      {connectivityStatus === 'offline' ? '📴 Offline' : '🌐 Online'} • {beats.length} beats
                    </Badge>
                  </div>
                  <Select 
                    value={selectedBeat} 
                    onValueChange={(value) => {
                      setSelectedBeat(value);
                      if (validationErrors.beat) {
                        setValidationErrors(prev => ({ ...prev, beat: '' }));
                      }
                    }}
                  >
                    <SelectTrigger className={cn("bg-background border-primary/30", validationErrors.beat && "border-destructive")}>
                      <SelectValue placeholder="Select a beat" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border z-50">
                      {beats.length > 0 ? (
                        beats.map((beat) => (
                          <SelectItem key={beat.beat_id} value={beat.beat_id}>
                            {beat.beat_name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>No beats available</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {validationErrors.beat && (
                    <p className="text-sm text-destructive">{validationErrors.beat}</p>
                  )}
                  <p className="text-xs text-muted-foreground">Select which beat this retailer belongs to</p>
                  {(() => {
                    const sb = beats.find(b => b.beat_id === selectedBeat);
                    if (!sb?.user_id || !user?.id || sb.user_id === user.id) return null;
                    return (
                      <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                        This beat is owned by <span className="font-semibold">{sb.owner_name || 'another user'}</span>. The new retailer will be assigned to them; you'll remain recorded as the creator.
                      </p>
                    );
                  })()}
                </div>

                {/* Territory Selection */}
                <div className="space-y-2">
                  <Label className="font-semibold">Assign to Territory</Label>
                  <Popover open={territoryComboOpen} onOpenChange={setTerritoryComboOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={territoryComboOpen}
                        className="w-full justify-between bg-background"
                      >
                        {selectedTerritoryId
                          ? territories.find((t) => t.id === selectedTerritoryId)?.name
                          : "Select territory..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
                      <Command>
                        <CommandInput placeholder="Search territory..." />
                        <CommandList>
                          <CommandEmpty>No territory found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              onSelect={() => {
                                setSelectedTerritoryId(null);
                                setTerritoryComboOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  !selectedTerritoryId ? "opacity-100" : "opacity-0"
                                )}
                              />
                              None
                            </CommandItem>
                            {territories.map((territory) => (
                              <CommandItem
                                key={territory.id}
                                onSelect={() => {
                                  setSelectedTerritoryId(territory.id);
                                  setTerritoryComboOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedTerritoryId === territory.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span>{territory.name}</span>
                                  <span className="text-xs text-muted-foreground">{territory.region}</span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">Optionally assign to a sales territory</p>
                </div>
              </div>

              {/* Distributor Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-semibold">Parent Type *</Label>
                  <Select 
                    value={retailerData.parentType} 
                    onValueChange={(value) => {
                      handleInputChange("parentType", value);
                      if (value === "Company") {
                        handleInputChange("parentName", companyDisplayName);
                      } else if (retailerData.parentType === "Company") {
                        // switching away from Company → clear the auto-filled company name
                        handleInputChange("parentName", "");
                      }
                      if (validationErrors.parentType) {
                        setValidationErrors(prev => ({ ...prev, parentType: '' }));
                      }
                    }}
                  >
                    <SelectTrigger className={cn("bg-background", validationErrors.parentType && "border-destructive")}>
                      <SelectValue placeholder="Select parent" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border z-50">
                      {parentTypes.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {validationErrors.parentType && (
                    <p className="text-sm text-destructive">{validationErrors.parentType}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="font-semibold">Select Distributor {retailerData.parentType === "Distributor" && "*"}</Label>
                  {retailerData.parentType === "Distributor" ? (
                    <Select 
                      value={retailerData.selectedDistributors[0] || ""} 
                      onValueChange={(value) => {
                        const allDistributors = [...beatMappedDistributors, ...distributors];
                        const distributor = allDistributors.find(d => d.id === value);
                        handleInputChange("selectedDistributors", [value]);
                        handleInputChange("parentName", distributor?.name || "");
                        if (validationErrors.distributor) {
                          setValidationErrors(prev => ({ ...prev, distributor: '' }));
                        }
                      }}
                    >
                      <SelectTrigger className={cn("bg-background", validationErrors.distributor && "border-destructive")}>
                        <SelectValue placeholder="Select distributor" className="truncate" />
                      </SelectTrigger>
                      <SelectContent className="bg-background border z-50">
                        {beatMappedDistributors.length > 0 && (
                          <>
                            <SelectItem value="header-beat" disabled className="font-semibold text-primary">
                              Distributors for this Beat
                            </SelectItem>
                            {beatMappedDistributors.map((distributor) => (
                              <SelectItem key={distributor.id} value={distributor.id}>
                                {distributor.name}
                              </SelectItem>
                            ))}
                            <SelectItem value="header-all" disabled className="font-semibold text-muted-foreground border-t mt-1 pt-1">
                              All Distributors
                            </SelectItem>
                          </>
                        )}
                        {distributors.length > 0 ? (
                          distributors.map((distributor) => (
                            <SelectItem key={distributor.id} value={distributor.id}>
                              {distributor.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>No distributors available</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder="Enter parent name"
                      value={retailerData.parentName}
                      onChange={(e) => handleInputChange("parentName", e.target.value)}
                      className="bg-background text-sm"
                    />
                  )}
                  {validationErrors.distributor && (
                    <p className="text-sm text-destructive">{validationErrors.distributor}</p>
                  )}
                </div>
              </div>

            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional notes about the retailer"
                  value={retailerData.notes}
                  onChange={(e) => handleInputChange("notes", e.target.value)}
                  className="bg-background min-h-[60px]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" size="lg" disabled={isSaving}>
              <Plus size={16} className="mr-2" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
        <Dialog open={beatDialogOpen} onOpenChange={setBeatDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to Beat</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Choose existing beat</Label>
                <Select value={existingBeat} onValueChange={setExistingBeat}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select a beat" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border z-50">
                    {existingBeats.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                    <SelectItem value="__new__">Create new…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(existingBeat === "__new__" || (!existingBeat && newBeat)) && (
                <div className="space-y-2">
                  <Label>New beat name</Label>
                  <Input placeholder="Enter beat name" value={newBeat} onChange={(e) => setNewBeat(e.target.value)} className="bg-background" />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setBeatDialogOpen(false)}>Cancel</Button>
              <Button onClick={confirmAssignBeat} disabled={isSaving}>Assign & Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Post-save contact action dialog */}
        <Dialog
          open={!!contactDialog}
          onOpenChange={(open) => {
            if (!open) {
              setContactDialog(null);
              navigate(returnTo, { replace: true });
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Notify {contactDialog?.name}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Choose how to reach the retailer at {contactDialog?.phone}.
            </p>
            <div className="grid gap-2 py-2">
              <Button
                variant="default"
                className="justify-start"
                disabled={contactSending !== null}
                onClick={async () => {
                  if (!contactDialog) return;
                  setContactSending('whatsapp');
                  try {
                    const { triggerRetailerWelcomeMessage } = await import('@/utils/retailerWelcomeMessage');
                    const result = await triggerRetailerWelcomeMessage(contactDialog.retailerId, contactDialog.phone);
                    if (result.ok) {
                      toast({ title: 'WhatsApp sent', description: `Message sent to ${contactDialog.phone}${result.sid ? ` (SID ${result.sid.slice(0, 10)}…)` : ''}` });
                    } else {
                      toast({ title: 'WhatsApp not sent', description: result.error || 'Twilio rejected the message', variant: 'destructive' });
                    }
                  } catch (e: any) {
                    toast({ title: 'Failed to send WhatsApp', description: e?.message || 'Try again', variant: 'destructive' });
                  } finally {
                    setContactSending(null);
                    setContactDialog(null);
                    navigate(returnTo, { replace: true });
                  }
                }}
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                {contactSending === 'whatsapp' ? 'Sending…' : 'Send WhatsApp'}
              </Button>
              <Button
                variant="secondary"
                className="justify-start"
                onClick={() => {
                  toast({ title: 'Coming soon', description: 'SMS sending will be available shortly.' });
                }}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Send SMS
              </Button>
              <Button
                variant="secondary"
                className="justify-start"
                disabled={contactSending !== null}
                onClick={async () => {
                  if (!contactDialog) return;
                  setContactSending('call');
                  toast({ title: 'Calling retailer via Bolna…' });
                  try {
                    const { data, error } = await supabase.functions.invoke('bolna-outbound-call', {
                      body: { retailer_id: contactDialog.retailerId },
                    });
                    if (error) throw error;
                    if (!(data as any)?.success) throw new Error((data as any)?.error || 'Failed to initiate outbound call.');
                    toast({ title: 'Call initiated.' });
                  } catch (e: any) {
                    toast({ title: e?.message || 'Failed to initiate outbound call.', variant: 'destructive' });
                  } finally {
                    setContactSending(null);
                    setContactDialog(null);
                    navigate(returnTo, { replace: true });
                  }
                }}
              >
                <Phone className="h-4 w-4 mr-2" />
                {contactSending === 'call' ? 'Calling…' : 'Initiate Call'}
              </Button>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setContactDialog(null);
                  navigate(returnTo, { replace: true });
                }}
              >
                Skip
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
    </Layout>
  );
};

import { useState, useEffect } from "react";
import { compressImageFile, compressToTargetSize } from "@/utils/imageCompression";
import { useTranslation } from "react-i18next";
import { X, Camera, ScanLine, Store, ChevronsUpDown, Check, MapPin, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useConnectivity } from "@/hooks/useConnectivity";
import { offlineStorage, STORES } from "@/lib/offlineStorage";
import { addRetailerToSnapshot, updateBeatPlanInSnapshot } from "@/lib/myVisitsSnapshot";

interface AddRetailerInlineToBeatProps {
  open: boolean;
  onClose: () => void;
  beatName: string;
  beatId?: string; // Optional - if not provided, will use selected beat in offline mode
  onRetailerAdded: (retailerId: string, retailerName: string) => void;
}

export const AddRetailerInlineToBeat = ({ open, onClose, beatName, beatId, onRetailerAdded }: AddRetailerInlineToBeatProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const connectivityStatus = useConnectivity();
  const isOffline = connectivityStatus === 'offline';
  const [isSaving, setIsSaving] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [capturedPhotoPreview, setCapturedPhotoPreview] = useState<string | null>(null);
  const [isScanningBoard, setIsScanningBoard] = useState(false);
  const [distributors, setDistributors] = useState<{id: string, name: string}[]>([]);
  const [territories, setTerritories] = useState<{id: string, name: string, region: string}[]>([]);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null);
  const [territoryComboOpen, setTerritoryComboOpen] = useState(false);
  const [creditConfig, setCreditConfig] = useState<{is_enabled: boolean, scoring_mode: string} | null>(null);
  
  // Owner field states
  const [allUsers, setAllUsers] = useState<{id: string, full_name: string}[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [selectedOwnerName, setSelectedOwnerName] = useState<string>('');
  const [ownerComboOpen, setOwnerComboOpen] = useState(false);
  
  // NEW OFFLINE FEATURE: States for beat selection
  const [availableBeats, setAvailableBeats] = useState<{id: string, beat_id: string, beat_name: string}[]>([]);
  const [selectedBeatId, setSelectedBeatId] = useState<string>('');
  const [selectedBeatName, setSelectedBeatName] = useState<string>(beatName);
  const [beatComboOpen, setBeatComboOpen] = useState(false);

  const [retailerData, setRetailerData] = useState({
    name: "",
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
    manual_credit_score: ""
  });

  const categories = ["Category A", "Category B", "Category C"];
  const parentTypes = ["Company", "Super Stockist", "Distributor"];
  const retailTypes = ["Grocery Store", "Supermarket", "Convenience Store", "Provision Store", "General Store", "Milk Parlour", "Hotel", "Other"];
  const potentials = ["High", "Medium", "Low"];
  const [customRetailType, setCustomRetailType] = useState("");

  // Load all users for owner dropdown
  const loadAllUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name');
      
      if (error) throw error;
      setAllUsers((data || []).filter(u => u.full_name));
      
      // Auto-fill owner with current user
      if (user) {
        const currentUserProfile = (data || []).find(u => u.id === user.id);
        if (currentUserProfile && !selectedOwnerId) {
          setSelectedOwnerId(user.id);
          setSelectedOwnerName(currentUserProfile.full_name || '');
        }
      }
    } catch (error) {
      console.error('Error loading users:', error);
      setAllUsers([]);
    }
  };

  useEffect(() => {
    if (user && open) {
      loadAllUsers();
      if (isOffline) {
        // OFFLINE: Load from cache
        loadOfflineData();
      } else {
        // ONLINE: Load from Supabase (existing behavior)
        loadDistributors();
        loadTerritories();
        loadCreditConfig();
      }
    }
  }, [user, open, isOffline]);

  // Listen for beat creation events to reload beats
  useEffect(() => {
    if (!open) return;

    const handleBeatCreated = () => {
      console.log('[AddRetailerInlineToBeat] Beat created event received, reloading beats...');
      if (user) {
        if (isOffline) {
          loadOfflineData();
        }
      }
    };

    window.addEventListener('beatCreated', handleBeatCreated);
    return () => window.removeEventListener('beatCreated', handleBeatCreated);
  }, [user, open, isOffline]);

  // NEW OFFLINE FEATURE: Load data from IndexedDB cache
  const loadOfflineData = async () => {
    try {
      await offlineStorage.init();
      
      // Load ALL beats from cache (not just today's beat plans)
      // This allows users to see all their beats even when offline
      const cachedBeats = await offlineStorage.getAll(STORES.BEATS);
      console.log('[Offline] Total beats in cache:', cachedBeats.length);
      
      const userBeats = cachedBeats.filter((beat: any) => 
        beat.created_by === user?.id && beat.is_active
      );
      
      // Set beats to dropdown
      const beatsList = userBeats.map((beat: any) => ({
        id: beat.beat_id,
        beat_id: beat.beat_id,
        beat_name: beat.beat_name
      }));
      
      setAvailableBeats(beatsList);
      
      // If beatName prop matches a beat, pre-select it
      const matchingBeat = beatsList.find((b: any) => b.beat_name === beatName);
      if (matchingBeat) {
        setSelectedBeatId(matchingBeat.beat_id);
        setSelectedBeatName(matchingBeat.beat_name);
      }
      
      console.log('[Offline] Loaded beats from BEATS cache for offline mode:', beatsList.length, beatsList);
    } catch (error) {
      console.error('[Offline] Error loading offline data:', error);
    }
  };

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

  const loadDistributors = async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc('get_public_vendors');
    if (error) {
      console.error('Failed to load distributors:', error);
      setDistributors([]);
    } else {
      setDistributors(data || []);
    }
  };

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

  const handleInputChange = (field: string, value: string | string[]) => {
    setRetailerData(prev => ({ ...prev, [field]: value }));
  };

  const handleDistributorToggle = (distributorId: string) => {
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
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      
      input.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
          const reader = new FileReader();
          reader.onload = (e) => {
            setCapturedPhotoPreview(e.target?.result as string);
          };
          reader.readAsDataURL(file);

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

          const { data: urlData } = supabase.storage
            .from('retailer-photos')
            .getPublicUrl(fileName);

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
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      
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

          const reader = new FileReader();
          reader.onload = async (e) => {
            const base64Image = e.target?.result as string;
            
            // Compress image before sending
            const compressedImage = await compressImage(base64Image);

            try {
              const { data, error } = await supabase.functions.invoke('scan-board', {
                body: { imageBase64: compressedImage }
              });

              if (error) {
                console.error('Scan error:', error);
                setIsScanningBoard(false);
                return;
              }

              if (data?.error) {
                console.error('Scan data error:', data.error);
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
                  description: `Found ${fieldsFound.join(', ')} from the board`,
                  duration: 3000
                });
              } else {
                toast({ 
                  title: 'Scan Complete', 
                  description: 'No clear information found. Please enter details manually.',
                  duration: 3000
                });
              }
            } catch (scanError) {
              console.error('Scan processing error:', scanError);
            } finally {
              setIsScanningBoard(false);
            }
          };
          
          reader.readAsDataURL(file);
        } catch (error) {
          console.error('File read error:', error);
          setIsScanningBoard(false);
        }
      };

      input.click();
    } catch (error) {
      console.error('Camera access error:', error);
      setIsScanningBoard(false);
    }
  };

  const handleSave = async () => {
    if (!retailerData.name || !retailerData.phone || !retailerData.address) {
      toast({ title: 'Missing Information', description: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    if (!retailerData.latitude || !retailerData.longitude) {
      setLocationError(true);
      toast({ title: 'Location Required', description: 'Please tap the location button to capture GPS coordinates', variant: 'destructive' });
      return;
    }
    setLocationError(false);

    if (!user) {
      toast({ title: 'Not signed in', description: 'Please sign in to continue', variant: 'destructive' });
      return;
    }

    setIsSaving(true);

    // Use prop beatId when available, otherwise use selected beat
    // CRITICAL: Always prefer the prop beatId which comes from the current beat plan
    const useBeatId = beatId || selectedBeatId || 'temporary';
    const useBeatName = beatName || selectedBeatName;
    
    console.log('[AddRetailer] Saving with beat info:', { useBeatId, useBeatName, propBeatId: beatId, selectedBeatId, isOffline });
    
    const payload: any = {
      user_id: user.id,
      name: retailerData.name,
      gst_number: retailerData.gstNumber || null,
      phone: retailerData.phone,
      address: retailerData.address,
      category: retailerData.category || null,
      beat_id: useBeatId,
      beat_name: useBeatName,
      territory_id: selectedTerritoryId || null,
      status: 'active',
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
      owner_id: selectedOwnerId || user.id,
      owner_name: selectedOwnerName || null,
    };

    // NEW OFFLINE FEATURE: Save offline or online based on connectivity
    if (isOffline) {
      await handleOfflineSave(payload);
    } else {
      await handleOnlineSave(payload);
    }
  };

  // Helper to update today's beat plan with new retailer ID
  const updateTodaysBeatPlanRetailerIds = async (retailerId: string, beatIdToUpdate: string, isOfflineMode: boolean, beatNameForCreate?: string) => {
    const today = new Date().toISOString().split('T')[0];
    
    if (isOfflineMode) {
      // OFFLINE: Update cached beat plan or CREATE if missing
      try {
        const cachedBeatPlans = await offlineStorage.getAll<any>(STORES.BEAT_PLANS);
        const todaysBeatPlan = cachedBeatPlans.find((bp: any) => 
          bp.user_id === user?.id && 
          bp.plan_date === today && 
          bp.beat_id === beatIdToUpdate
        );
        
        if (todaysBeatPlan) {
          const beatData = todaysBeatPlan.beat_data || {};
          const existingRetailerIds = Array.isArray(beatData.retailer_ids) ? beatData.retailer_ids : [];
          
          if (!existingRetailerIds.includes(retailerId)) {
            const updatedBeatPlan = {
              ...todaysBeatPlan,
              beat_data: {
                ...beatData,
                retailer_ids: [...existingRetailerIds, retailerId]
              },
              updated_at: new Date().toISOString()
            };
            
            await offlineStorage.save(STORES.BEAT_PLANS, updatedBeatPlan);
            
            // FIX: Also update snapshot so it persists across app restarts
            await updateBeatPlanInSnapshot(user!.id, today, updatedBeatPlan);
            
            console.log('[Offline] Updated today\'s beat plan with new retailer:', retailerId);
          }
        } else if (beatIdToUpdate && beatIdToUpdate !== 'temporary') {
          // FIX: CREATE beat plan if it doesn't exist for today
          console.log('[Offline] No beat plan exists for today, creating one...');
          const newBeatPlan = {
            id: `offline_bp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            user_id: user!.id,
            beat_id: beatIdToUpdate,
            beat_name: beatNameForCreate || selectedBeatName,
            plan_date: today,
            beat_data: { retailer_ids: [retailerId] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          await offlineStorage.save(STORES.BEAT_PLANS, newBeatPlan);
          await offlineStorage.addToSyncQueue('CREATE_BEAT_PLAN', newBeatPlan);
          
          // FIX: Also update snapshot so it persists across app restarts
          await updateBeatPlanInSnapshot(user!.id, today, newBeatPlan);
          
          console.log('[Offline] Created new beat plan for today:', newBeatPlan.beat_name);
        }
      } catch (err) {
        console.error('[Offline] Error updating beat plan:', err);
      }
    } else {
      // ONLINE: Update database beat plan
      try {
        const { data: existingPlan } = await supabase
          .from('beat_plans')
          .select('id, beat_data')
          .eq('user_id', user?.id)
          .eq('plan_date', today)
          .eq('beat_id', beatIdToUpdate)
          .maybeSingle();
        
        if (existingPlan) {
          const beatData = (existingPlan.beat_data as any) || {};
          const existingRetailerIds = Array.isArray(beatData.retailer_ids) ? beatData.retailer_ids : [];
          
          if (!existingRetailerIds.includes(retailerId)) {
            const updatedBeatData = {
              ...beatData,
              retailer_ids: [...existingRetailerIds, retailerId]
            };
            
            await supabase
              .from('beat_plans')
              .update({ beat_data: updatedBeatData, updated_at: new Date().toISOString() })
              .eq('id', existingPlan.id);
            
            console.log('[Online] Updated today\'s beat plan with new retailer:', retailerId);
          }
        }
      } catch (err) {
        console.error('[Online] Error updating beat plan:', err);
      }
    }
  };

  // ONLINE SAVE - dispatch refresh event after saving
  const handleOnlineSave = async (payload: any) => {
    const { data, error } = await supabase.from('retailers').insert(payload).select('id, name').maybeSingle();
    setIsSaving(false);

    if (error) {
      toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
      return;
    }

    if (data?.id) {
      const { maybeTriggerWhatsAppVerification } = await import('@/utils/retailerVerificationTrigger');
      maybeTriggerWhatsAppVerification(data.id, payload.phone);
      const { sendRetailerWelcomeWhatsApp } = await import('@/utils/retailerWelcomeWhatsAppTrigger');
      sendRetailerWelcomeWhatsApp(data.id, payload.phone);
    }

    toast({ title: 'Retailer Added', description: `${retailerData.name} added to ${beatName}` });
    
    // Also cache the new retailer for offline access
    const fullRetailerData = {
      ...payload,
      id: data.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    try {
      await offlineStorage.init();
      await offlineStorage.save(STORES.RETAILERS, fullRetailerData);
      console.log('[Online] Cached new retailer for offline access:', data.id);
    } catch (cacheError) {
      console.error('[Online] Failed to cache retailer:', cacheError);
    }
    
    // CRITICAL: Update today's beat plan retailer_ids so new retailer shows in My Visits
    await updateTodaysBeatPlanRetailerIds(data.id, payload.beat_id, false);
    
    // Dispatch event to refresh My Visits page with new retailer ID AND full data for immediate display
    console.log('[Online] Dispatching visitDataChanged event with newRetailerId:', data.id);
    window.dispatchEvent(new CustomEvent('visitDataChanged', { 
      detail: { 
        newRetailerId: data.id,
        retailerData: fullRetailerData
      } 
    }));
    
    // Dispatch retailerAdded event for Smart Silent Background Sync
    window.dispatchEvent(new CustomEvent('retailerAdded', { 
      detail: { retailer: fullRetailerData } 
    }));
    
    // Call parent callback with the new retailer
    onRetailerAdded(data.id, data.name);
    
    resetForm();
  };

  // NEW OFFLINE FEATURE: Save to IndexedDB and sync queue
  const handleOfflineSave = async (payload: any) => {
    try {
      await offlineStorage.init();
      
      // Generate temporary ID for offline retailer
      const tempId = `offline_retailer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const offlineRetailer = {
        ...payload,
        id: tempId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Save to IndexedDB cache
      await offlineStorage.save(STORES.RETAILERS, offlineRetailer);
      
      // Add to sync queue for later upload
      await offlineStorage.addToSyncQueue('CREATE_RETAILER', {
        retailer: payload,
        tempId: tempId
      });

      // CRITICAL: Update today's beat plan retailer_ids so new retailer shows in My Visits (offline)
      await updateTodaysBeatPlanRetailerIds(tempId, payload.beat_id, true, payload.beat_name);

      // FIX: DIRECTLY update snapshot - don't rely on event handlers (they may not be mounted)
      const today = new Date().toISOString().split('T')[0];
      await addRetailerToSnapshot(user.id, today, offlineRetailer);
      console.log('[Offline] Directly added retailer to snapshot');

      setIsSaving(false);
      
      console.log('[Offline] Retailer saved to IndexedDB:', {
        tempId,
        retailerName: retailerData.name,
        beatId: payload.beat_id,
        beatName: payload.beat_name
      });
      
      toast({ 
        title: 'Retailer Saved Offline', 
        description: `${retailerData.name} saved to ${selectedBeatName}. Will sync when online.`,
        duration: 4000
      });

      // Dispatch event to refresh My Visits page with new retailer ID AND full data for immediate display
      console.log('[Offline] Dispatching visitDataChanged event with newRetailerId:', tempId);
      window.dispatchEvent(new CustomEvent('visitDataChanged', { 
        detail: { 
          newRetailerId: tempId,
          retailerData: offlineRetailer
        } 
      }));
      
      // Dispatch retailerAdded event for Smart Silent Background Sync
      window.dispatchEvent(new CustomEvent('retailerAdded', { 
        detail: { retailer: offlineRetailer } 
      }));
      
      // Call parent callback with temporary ID
      onRetailerAdded(tempId, retailerData.name);
      
      resetForm();
    } catch (error: any) {
      setIsSaving(false);
      console.error('[Offline] Error saving retailer:', error);
      toast({ 
        title: 'Save Failed', 
        description: 'Could not save retailer offline. Please try again.', 
        variant: 'destructive' 
      });
    }
  };

  const resetForm = () => {
    setRetailerData({
      name: "",
      gstNumber: "",
      phone: "",
      address: "",
      category: "",
      notes: "",
      parentType: "Distributor",
      parentName: "",
      selectedDistributors: [],
      locationTag: "",
      retailType: "",
      potential: "",
      competitor1: "",
      competitor2: "",
      competitor3: "",
      latitude: "",
      longitude: "",
      photo_url: "",
      manual_credit_score: ""
    });
    setCapturedPhotoPreview(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Add New Retailer to {beatName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Scan Board Section */}
          <div className="space-y-2 p-3 bg-muted/30 rounded-lg border border-dashed">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Quick Scan</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Scan shop board to auto-fill details
                </p>
              </div>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleScanBoard}
                disabled={isScanningBoard}
                className="flex items-center gap-2"
              >
                <ScanLine size={16} />
                {isScanningBoard ? 'Scanning...' : 'Scan Board'}
              </Button>
            </div>
          </div>

          {/* NEW OFFLINE FEATURE: Beat Selection - Only show when offline */}
          {isOffline && (
            <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border">
              <Label>Select Beat *</Label>
              <Popover open={beatComboOpen} onOpenChange={setBeatComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={beatComboOpen}
                    className="w-full justify-between"
                  >
                    {selectedBeatName || "Select beat..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Search beat..." />
                    <CommandList>
                      <CommandEmpty>No beat found.</CommandEmpty>
                      <CommandGroup>
                        {availableBeats.map((beat) => (
                          <CommandItem
                            key={beat.id}
                            onSelect={() => {
                              setSelectedBeatId(beat.beat_id);
                              setSelectedBeatName(beat.beat_name);
                              setBeatComboOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedBeatId === beat.beat_id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {beat.beat_name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                Offline mode: Select beat from today's planned beats
              </p>
            </div>
          )}

          {/* Basic Information */}
          <div className="space-y-4">
            {/* Owner Field - Searchable Dropdown */}
            <div className="space-y-2">
              <Label>Owner</Label>
              <Popover open={ownerComboOpen} onOpenChange={setOwnerComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={ownerComboOpen}
                    className="w-full justify-between"
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
              <p className="text-xs text-muted-foreground">Auto-filled with current user</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Retailer Name *</Label>
              <Input
                id="name"
                placeholder="Enter retailer name"
                value={retailerData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  placeholder="Enter phone number"
                  value={retailerData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gst">GST Number</Label>
                <Input
                  id="gst"
                  placeholder="Enter GST number"
                  value={retailerData.gstNumber}
                  onChange={(e) => handleInputChange("gstNumber", e.target.value)}
                />
              </div>
            </div>

            <div className={cn("space-y-2", locationError && !retailerData.latitude && "ring-2 ring-destructive rounded-md p-2")}>
              <Label htmlFor="address">Address * {locationError && !retailerData.latitude && <span className="text-destructive text-xs ml-1">(GPS location required)</span>}</Label>
              <div className="flex gap-2">
                <Textarea
                  id="address"
                  placeholder="Enter complete address"
                  value={retailerData.address}
                  onChange={(e) => handleInputChange("address", e.target.value)}
                  rows={2}
                  className="flex-1"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  size="icon"
                  className="shrink-0 h-[72px]"
                  onClick={async () => {
                    if (!navigator.geolocation) {
                      toast({ 
                        title: "GPS Not Available", 
                        description: "Your device doesn't support location services", 
                        variant: "destructive" 
                      });
                      return;
                    }
                    
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
                    
                    toast({ 
                      title: "Accessing Location", 
                      description: "Please allow location access...",
                      duration: 4000
                    });
                    
                    try {
                      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                        let best: GeolocationPosition | null = null;
                        const startedAt = Date.now();
                        const targetAccuracy = 30;
                        const maxWait = 45000;
                        
                        const watchId = navigator.geolocation.watchPosition(
                          (pos) => {
                            if (!best || pos.coords.accuracy < best.coords.accuracy) {
                              best = pos;
                            }
                            
                            const ageMs = Date.now() - pos.timestamp;
                            const goodEnough = pos.coords.accuracy <= targetAccuracy && ageMs < 30000;
                            const timedOut = Date.now() - startedAt > maxWait;
                            
                            if (goodEnough || timedOut) {
                              navigator.geolocation.clearWatch(watchId);
                              resolve(best || pos);
                            }
                          },
                          (error) => {
                            navigator.geolocation.clearWatch(watchId);
                            reject(error);
                          },
                          { 
                            enableHighAccuracy: true,
                            timeout: maxWait,
                            maximumAge: 0
                          }
                        );
                        
                        setTimeout(() => {
                          if (best) {
                            navigator.geolocation.clearWatch(watchId);
                            resolve(best);
                          }
                        }, maxWait + 1000);
                      });
                      
                      const lat = Number(position.coords.latitude.toFixed(7));
                      const lon = Number(position.coords.longitude.toFixed(7));
                      const accuracy = position.coords.accuracy;
                      
                      handleInputChange("latitude", lat.toString());
                      handleInputChange("longitude", lon.toString());
                      setLocationError(false);
                      
                      if (accuracy > 100) {
                        toast({ 
                          title: "Low GPS Accuracy", 
                          description: `Current accuracy: ${accuracy.toFixed(0)}m. Try moving to an open area.`,
                          variant: "default",
                          duration: 4000
                        });
                      } else {
                        toast({ 
                          title: "GPS Location Locked", 
                          description: `Accuracy: ${accuracy.toFixed(0)}m. Fetching address...`,
                          duration: 2000
                        });
                      }
                      
                      // Fetch address using Nominatim
                      try {
                        const response = await fetch(
                          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
                          { headers: { 'User-Agent': 'FieldSalesNavigator/1.0' } }
                        );
                        
                        if (response.ok) {
                          const data = await response.json();
                          if (data.display_name) {
                            handleInputChange('address', data.display_name);
                            toast({ 
                              title: 'Address Found', 
                              description: 'Location address retrieved successfully',
                              duration: 2000
                            });
                          }
                        }
                      } catch (error) {
                        console.error('Address fetch error:', error);
                        toast({ 
                          title: 'GPS Location Captured', 
                          description: `Coordinates saved: ${lat}, ${lon}`,
                          duration: 2000
                        });
                      }
                    } catch (error) {
                      console.error('Geolocation error:', error);
                      toast({ 
                        title: 'Location Error', 
                        description: 'Could not get location. Please enter address manually.',
                        variant: 'destructive'
                      });
                    }
                  }}
                >
                  <MapPin className="h-4 w-4" />
                </Button>
              </div>
              {(retailerData.latitude && retailerData.longitude) && (
                <p className="text-xs text-muted-foreground">
                  📍 GPS: {retailerData.latitude}, {retailerData.longitude}
                </p>
              )}
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
                />
                <p className="text-xs text-muted-foreground">Manual credit score out of 10</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={retailerData.category} onValueChange={(value) => handleInputChange("category", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Retail Type</Label>
                <Select 
                  value={retailerData.retailType === "Other" ? "Other" : retailerData.retailType} 
                  onValueChange={(value) => {
                    handleInputChange("retailType", value);
                    if (value !== "Other") {
                      setCustomRetailType("");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
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
                    className="mt-2"
                  />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Potential</Label>
              <Select value={retailerData.potential} onValueChange={(value) => handleInputChange("potential", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select potential" />
                </SelectTrigger>
                <SelectContent>
                  {potentials.map((pot) => (
                    <SelectItem key={pot} value={pot}>{pot}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Assign to Territory</Label>
              <Popover open={territoryComboOpen} onOpenChange={setTerritoryComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={territoryComboOpen}
                    className="w-full justify-between"
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
              <p className="text-xs text-muted-foreground">Optionally assign this retailer to a sales territory</p>
            </div>

            {/* Photo Capture */}
            <div className="space-y-2">
              <Label>Retailer Photo</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePhotoCapture}
                  disabled={isUploadingPhoto}
                  className="flex items-center gap-2"
                >
                  <Camera size={16} />
                  {isUploadingPhoto ? 'Uploading...' : 'Capture Photo'}
                </Button>
                {capturedPhotoPreview && (
                  <img src={capturedPhotoPreview} alt="Preview" className="h-16 w-16 rounded object-cover" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any additional notes..."
                value={retailerData.notes}
                onChange={(e) => handleInputChange("notes", e.target.value)}
                rows={2}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Add Retailer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

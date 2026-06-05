import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, Users, MapPin, UserPlus, WifiOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { offlineStorage, STORES } from "@/lib/offlineStorage";
import { updateBeatPlanInSnapshot, addRetailerToSnapshot } from "@/lib/myVisitsSnapshot";
import { useConnectivity } from "@/hooks/useConnectivity";
import { getMyBeats } from "@/services/beatService";

interface Beat {
  id: string;
  name: string;
  retailerCount: number;
  category: string;
  priority: string;
}

interface CreateNewVisitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVisitCreated?: () => void;
  initialDate?: string; // ISO format date string (yyyy-MM-dd)
}

export const CreateNewVisitModal = ({ isOpen, onClose, onVisitCreated, initialDate }: CreateNewVisitModalProps) => {
  const [selectedBeat, setSelectedBeat] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [availableBeats, setAvailableBeats] = useState<Beat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isJointSales, setIsJointSales] = useState(false);
  const [jointSalesMember, setJointSalesMember] = useState<string>("");
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const { user } = useAuth();
  const connectivityStatus = useConnectivity();
  const isOnline = connectivityStatus === 'online';

  // Reset date and joint sales state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      if (initialDate) {
        setSelectedDate(new Date(initialDate));
      } else {
        setSelectedDate(new Date());
      }
    } else {
      // Reset joint sales state when modal closes
      setIsJointSales(false);
      setJointSalesMember("");
      setSelectedBeat("");
    }
  }, [isOpen, initialDate]);

  useEffect(() => {
    if (isOpen && user) {
      loadAvailableBeats();
      loadAvailableUsers();
    }
  }, [isOpen, user]);

  const loadAvailableBeats = async () => {
    if (!user) return;

    try {
      // Try to load from offline cache first for instant display
      const cachedBeats = await offlineStorage.getAll<any>(STORES.BEATS);
      if (cachedBeats && cachedBeats.length > 0) {
        const beatsFromCache = cachedBeats
          .filter((b: any) => b.created_by === user.id && b.is_active !== false)
          .map((b: any) => ({
            id: b.beat_id || b.id,
            name: b.beat_name || b.name,
            retailerCount: b.retailerCount || 0,
            category: b.category || '',
            priority: b.priority || ''
          }));
        if (beatsFromCache.length > 0) {
          setAvailableBeats(beatsFromCache);
        }
      }

      // If online, fetch fresh data
      if (isOnline) {
        // Get all beats accessible to this user (owned + shared + coverage)
        const myBeats = await getMyBeats(user.id);
        const beatsData = (myBeats || [])
          .filter((b: any) => b.is_active !== false)
          .map((b: any) => ({
            id: b.id ?? b.beat_id,
            beat_id: b.beat_id,
            beat_name: b.beat_name,
            category: b.category,
            accessType: b.accessType,
          }));

        // Get all retailers grouped by beat (by beat_id to include shared beats)
        const beatIdList = beatsData.map(b => b.beat_id).filter(Boolean);
        const { data: retailers, error } = beatIdList.length
          ? await supabase
              .from('retailers')
              .select('beat_id, category, priority')
              .in('beat_id', beatIdList)
              .eq('status', 'active')
          : { data: [], error: null } as any;

        if (error) throw error;

        // Create a map of beat_id to beat_name
        const beatNameMap = new Map<string, string>();
        (beatsData || []).forEach(beat => {
          beatNameMap.set(beat.beat_id, beat.beat_name);
        });

        // Group retailers by beat and create beat objects
        const beatMap = new Map<string, { retailerCount: number; category: string; priority: string }>();
        
        (retailers || []).forEach(retailer => {
          const beatId = retailer.beat_id;
          if (!beatId || beatId === 'unassigned') return;
          
          const existing = beatMap.get(beatId) || { retailerCount: 0, category: '', priority: '' };
          beatMap.set(beatId, {
            retailerCount: existing.retailerCount + 1,
            category: retailer.category || '',
            priority: retailer.priority || ''
          });
        });

        const beats: Beat[] = Array.from(beatMap.entries()).map(([beatId, data]) => ({
          id: beatId,
          name: beatNameMap.get(beatId) || beatId,
          retailerCount: data.retailerCount,
          category: data.category,
          priority: data.priority
        }));

        setAvailableBeats(beats);

        // Cache beats for offline use
        for (const beat of beatsData || []) {
          const beatWithCount = {
            ...beat,
            retailerCount: beatMap.get(beat.beat_id)?.retailerCount || 0,
            priority: beatMap.get(beat.beat_id)?.priority || '',
            created_by: user.id
          };
          await offlineStorage.save(STORES.BEATS, beatWithCount);
        }
      }
    } catch (error) {
      console.error('Error loading beats:', error);
      // Only show error if no cached data available
      if (availableBeats.length === 0) {
        toast({
          title: "Error",
          description: "Failed to load available beats",
          variant: "destructive"
        });
      }
    }
  };

  const loadAvailableUsers = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, full_name, username')
        .neq('id', user?.id || '');

      if (error) throw error;

      const users = (profiles || []).map(p => ({
        id: p.id,
        name: p.full_name || p.username,
        role: 'Team Member'
      }));

      setAvailableUsers(users);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const handleCreateVisit = async () => {
    if (!selectedBeat || !user) {
      toast({
        title: "Missing Information",
        description: "Please select a beat to create a visit",
        variant: "destructive"
      });
      return;
    }

    if (isJointSales && !jointSalesMember) {
      toast({
        title: "Missing Joint Sales Member",
        description: "Please select a joint sales member",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const formattedDate = format(selectedDate, 'yyyy-MM-dd');
      
      // Get beat details
      const selectedBeatData = availableBeats.find(b => b.id === selectedBeat);
      const beatDisplayName = selectedBeatData?.name || selectedBeat;
      
      const beatPlanData = {
        user_id: user.id,
        beat_id: selectedBeat,
        beat_name: beatDisplayName,
        plan_date: formattedDate,
        joint_sales_manager_id: isJointSales ? jointSalesMember : null,
        beat_data: {
          id: selectedBeat,
          name: beatDisplayName,
          retailerCount: selectedBeatData?.retailerCount || 0,
          category: selectedBeatData?.category || '',
          priority: selectedBeatData?.priority || ''
        }
      };

      let createdPlan: any = null;

      if (isOnline) {
        // Check if beat plan already exists for this date (online only)
        const { data: existingPlan } = await supabase
          .from('beat_plans')
          .select('id')
          .eq('user_id', user.id)
          .eq('beat_id', selectedBeat)
          .eq('plan_date', formattedDate)
          .single();

        if (existingPlan) {
          toast({
            title: "Beat Already Planned",
            description: "This beat is already planned for the selected date",
            variant: "destructive"
          });
          setIsLoading(false);
          return;
        }

        // Create beat plan online
        const { data, error } = await supabase
          .from('beat_plans')
          .insert(beatPlanData)
          .select()
          .single();

        if (error) throw error;
        createdPlan = data;
      } else {
        // Offline mode - check local storage for duplicates
        const cachedPlans = await offlineStorage.getAll<any>(STORES.BEAT_PLANS);
        const existingLocal = cachedPlans?.find(
          (p: any) => p.user_id === user.id && p.beat_id === selectedBeat && p.plan_date === formattedDate
        );

        if (existingLocal) {
          toast({
            title: "Beat Already Planned",
            description: "This beat is already planned for the selected date",
            variant: "destructive"
          });
          setIsLoading(false);
          return;
        }

        // Create local beat plan with temporary ID
        createdPlan = {
          ...beatPlanData,
          id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          _offline: true
        };

        // Add to sync queue for later sync
        await offlineStorage.addToSyncQueue('CREATE_BEAT_PLAN', createdPlan);
      }

      // Save to offline storage for immediate access
      if (createdPlan) {
        await offlineStorage.save(STORES.BEAT_PLANS, createdPlan);
        
        // Update snapshot cache for instant UI refresh
        await updateBeatPlanInSnapshot(user.id, formattedDate, createdPlan);
        
        // Fetch and cache retailers for this beat
        if (isOnline) {
          const { data: beatRetailers } = await supabase
            .from('retailers')
            .select('*')
            .eq('beat_id', selectedBeat)
            .eq('status', 'active');
            
          if (beatRetailers) {
            for (const retailer of beatRetailers) {
              await offlineStorage.save(STORES.RETAILERS, retailer);
              await addRetailerToSnapshot(user.id, formattedDate, retailer);
            }
          }
        } else {
          // Try to get retailers from cache when offline
          const cachedRetailers = await offlineStorage.getAll<any>(STORES.RETAILERS);
          const beatRetailers = cachedRetailers?.filter((r: any) => r.beat_id === selectedBeat && r.status === 'active') || [];
          for (const retailer of beatRetailers) {
            await addRetailerToSnapshot(user.id, formattedDate, retailer);
          }
        }
      }

      // Dispatch event to trigger My Visits UI refresh
      window.dispatchEvent(new Event('visitDataChanged'));

      toast({
        title: "Visit Created",
        description: `Successfully planned ${beatDisplayName} for ${format(selectedDate, 'PPP')}${!isOnline ? ' (will sync when online)' : ''}`,
      });

      onVisitCreated?.();
      onClose();
    } catch (error) {
      console.error('Error creating visit:', error);
      toast({
        title: "Error",
        description: "Failed to create visit. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Create New Visit
            {!isOnline && (
              <Badge variant="outline" className="ml-2 bg-orange-100 text-orange-700 border-orange-300">
                <WifiOff className="h-3 w-3 mr-1" />
                Offline
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Beat</Label>
            <Select value={selectedBeat} onValueChange={setSelectedBeat}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a beat to visit" />
              </SelectTrigger>
              <SelectContent>
                {availableBeats.map((beat) => (
                  <SelectItem key={beat.id} value={beat.id}>
                    <div className="flex items-center justify-between w-full">
                      <span>{beat.name}</span>
                      <div className="flex items-center gap-2 ml-2">
                        <Badge variant="secondary" className="text-xs">
                          <Users className="h-3 w-3 mr-1" />
                          {beat.retailerCount}
                        </Badge>
                        {beat.category && (
                          <Badge variant="outline" className="text-xs">
                            {beat.category}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableBeats.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No beats available. Create retailers and assign them to beats first.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Select Date</Label>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              className="rounded-md border"
            />
          </div>

          <div className={`flex items-center space-x-2 p-3 bg-muted/30 rounded-lg ${!isOnline ? 'opacity-50' : ''}`}>
            <Checkbox 
              id="jointSales" 
              checked={isJointSales}
              disabled={!isOnline}
              onCheckedChange={(checked) => {
                setIsJointSales(checked === true);
                if (!checked) setJointSalesMember("");
              }}
            />
            <label
              htmlFor="jointSales"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Joint Sales Visit
              {!isOnline && <span className="text-xs text-muted-foreground ml-1">(online only)</span>}
            </label>
          </div>

          {isJointSales && (
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Joint Sales Member <span className="text-destructive">*</span>
              </Label>
              <Select value={jointSalesMember} onValueChange={setJointSalesMember}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{user.name}</span>
                        <Badge variant="outline" className="text-xs ml-2">
                          {user.role}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This team member will also see this beat in their visits
              </p>
            </div>
          )}

          {selectedBeat && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-2">Selected Beat Details</h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>Beat: {availableBeats.find(b => b.id === selectedBeat)?.name || selectedBeat}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>
                    {availableBeats.find(b => b.id === selectedBeat)?.retailerCount || 0} retailers
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreateVisit} 
            disabled={!selectedBeat || isLoading}
          >
            {isLoading ? "Creating..." : "Create Visit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
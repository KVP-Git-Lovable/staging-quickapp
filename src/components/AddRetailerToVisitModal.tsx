import { useState, useEffect } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { offlineStorage, STORES } from "@/lib/offlineStorage";
import { useOfflineSync } from "@/hooks/useOfflineSync";

interface Retailer {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  beat_id: string;
  beat_name?: string | null;
}

interface AddRetailerToVisitModalProps {
  isOpen: boolean;
  onClose: () => void;
  retailer: Retailer | null;
  onVisitCreated: () => void;
}

export const AddRetailerToVisitModal = ({ isOpen, onClose, retailer, onVisitCreated }: AddRetailerToVisitModalProps) => {
  const { user } = useAuth();
  const { isOnline } = useOfflineSync();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [loading, setLoading] = useState(false);
  const [isJointSales, setIsJointSales] = useState(false);
  const [jointSalesMember, setJointSalesMember] = useState<string>('');
  const [availableUsers, setAvailableUsers] = useState<{ id: string; name: string }[]>([]);

  // Fetch available users for joint sales
  useState(() => {
    const fetchUsers = async () => {
      if (!isOpen) return;
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name')
          .order('full_name');
        
        setAvailableUsers(data?.map(u => ({ id: u.id, name: u.full_name })) || []);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };
    fetchUsers();
  });

  const handleCreateVisit = async () => {
    if (!retailer || !selectedDate || !user) return;

    // Validate joint sales member if joint sales is checked
    if (isJointSales && !jointSalesMember) {
      toast({
        title: "Joint Sales Member Required",
        description: "Please select a joint sales member",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const plannedDate = format(selectedDate, 'yyyy-MM-dd');
      
      // Check if beat plan exists for this date
      let beatPlanId = null;
      const { data: existingPlan } = await supabase
        .from('beat_plans')
        .select('id')
        .eq('user_id', user.id)
        .eq('plan_date', plannedDate)
        .maybeSingle();
      
      if (existingPlan) {
        beatPlanId = existingPlan.id;
        
        // Update beat plan with joint sales member if selected
        if (isJointSales && jointSalesMember) {
          await supabase
            .from('beat_plans')
            .update({ joint_sales_manager_id: jointSalesMember })
            .eq('id', beatPlanId);
        }
      } else if (isJointSales && jointSalesMember) {
        // Create beat plan if it doesn't exist and joint sales is selected
        const { data: newPlan } = await supabase
          .from('beat_plans')
          .insert({
            user_id: user.id,
            beat_id: retailer.beat_id,
            beat_name: retailer.beat_name || retailer.beat_id,
            plan_date: plannedDate,
            beat_data: {},
            joint_sales_manager_id: jointSalesMember
          })
          .select('id')
          .single();
        
        beatPlanId = newPlan?.id;
      }
      
      const visitData = {
        // Stable client-generated UUID so queue retries upsert onto the same visit
        id: crypto.randomUUID(),
        user_id: user.id,
        retailer_id: retailer.id,
        planned_date: plannedDate,
        status: 'planned',
        created_at: new Date().toISOString()
      };


      if (isOnline) {
        // Online: Create visit directly
        const { error } = await supabase
          .from('visits')
          .insert({
            user_id: user.id,
            retailer_id: retailer.id,
            planned_date: plannedDate,
            status: 'planned'
          });

        if (error) throw error;
      } else {
        // Offline: Save visit to cache and queue for sync
        await offlineStorage.save(STORES.VISITS, visitData);
        await offlineStorage.addToSyncQueue('CREATE_VISIT', visitData);
        
        // CRITICAL: Also cache the retailer data so it shows up in the visits list
        // This ensures the retailer name displays correctly when loading from cache
        const retailerData = {
          id: retailer.id,
          name: retailer.name,
          address: retailer.address,
          phone: retailer.phone,
          beat_id: retailer.beat_id,
          beat_name: retailer.beat_name,
          user_id: user.id,
          created_at: new Date().toISOString()
        };
        await offlineStorage.save(STORES.RETAILERS, retailerData);
        console.log('📦 [OFFLINE] Cached retailer data for offline visit:', retailer.name);
      }

      toast({
        title: "Visit Added",
        description: `Unplanned visit scheduled for ${retailer.name} on ${format(selectedDate, 'MMM dd, yyyy')}${!isOnline ? ' (will sync when online)' : ''}${isJointSales ? ` with ${availableUsers.find(u => u.id === jointSalesMember)?.name}` : ''}`,
      });

      onVisitCreated();
      onClose();
      // Reset form
      setIsJointSales(false);
      setJointSalesMember('');
    } catch (error: any) {
      toast({
        title: "Failed to create visit",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Unplanned Visit</DialogTitle>
        </DialogHeader>
        
        {retailer && (
          <div className="space-y-4">
            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="font-medium">{retailer.name}</p>
              <p className="text-sm text-muted-foreground">{retailer.address}</p>
              <p className="text-sm text-muted-foreground">Beat: {retailer.beat_name || retailer.beat_id}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Visit Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Joint Sales Checkbox */}
            <div className="space-y-3 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="joint-sales"
                  checked={isJointSales}
                  onCheckedChange={(checked) => {
                    setIsJointSales(checked as boolean);
                    if (!checked) setJointSalesMember('');
                  }}
                />
                <label
                  htmlFor="joint-sales"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Joint Sales Visit
                </label>
              </div>

              {isJointSales && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Joint Sales Member *</label>
                  <select
                    className="w-full p-2 border rounded-md bg-background"
                    value={jointSalesMember}
                    onChange={(e) => setJointSalesMember(e.target.value)}
                  >
                    <option value="">Select member...</option>
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreateVisit} 
                disabled={!selectedDate || loading}
              >
                {loading ? "Creating..." : "Add Visit"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
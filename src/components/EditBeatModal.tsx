import React, { useState, useEffect } from 'react';
import { fetchExpenseConfigs, resolveExpenseConfig, fetchUserManagerId } from '@/hooks/useResolvedExpenseConfig';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SearchInput } from '@/components/SearchInput';
import { Save, X, Users, MapPin, Clock, Truck, Repeat, CalendarDays, Navigation, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';

interface Beat {
  id: string;
  name: string;
  travel_allowance?: number;
  average_km?: number;
  average_time_minutes?: number;
  territory_id?: string;
  category?: string;
}

interface Territory {
  id: string;
  name: string;
}

interface Retailer {
  id: string;
  name: string;
  address: string;
  phone: string;
  category?: string;
  beat_id?: string;
  beat_name?: string;
}

interface EditBeatModalProps {
  isOpen: boolean;
  onClose: () => void;
  beat: Beat | null;
  onBeatUpdated: () => void;
}

export const EditBeatModal = ({ isOpen, onClose, beat, onBeatUpdated }: EditBeatModalProps) => {
  const [beatName, setBeatName] = useState('');
  const [travelAllowance, setTravelAllowance] = useState('');
  const [averageKm, setAverageKm] = useState('');
  const [averageTimeMinutes, setAverageTimeMinutes] = useState('');
  const [category, setCategory] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [allRetailers, setAllRetailers] = useState<Retailer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRetailers, setSelectedRetailers] = useState<Set<string>>(new Set());
  const { user } = useAuth();
  
  // Recurrence settings
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatType, setRepeatType] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [repeatDays, setRepeatDays] = useState<number[]>([1]); // 0=Sunday, 1=Monday, etc.
  const [repeatEndDate, setRepeatEndDate] = useState<Date | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  
  // Monthly recurrence settings
  const [monthlyType, setMonthlyType] = useState<"day" | "date">("day");
  const [monthlyWeek, setMonthlyWeek] = useState<string>("first");
  const [monthlyDayOfWeek, setMonthlyDayOfWeek] = useState<number>(1); // Monday by default
  const [monthlyDateOfMonth, setMonthlyDateOfMonth] = useState<string>("1");
  
  // Territory
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null);
  
  // Expense config for TA
  const [taType, setTaType] = useState<'fixed' | 'from_beat' | 'from_gps'>('from_beat');
  const [fixedTaAmount, setFixedTaAmount] = useState<number>(0);
  const [taPerKmRate, setTaPerKmRate] = useState<number>(0);

  const weekDays = [
    { label: "Mon", value: 1 },
    { label: "Tue", value: 2 },
    { label: "Wed", value: 3 },
    { label: "Thu", value: 4 },
    { label: "Fri", value: 5 },
    { label: "Sat", value: 6 },
    { label: "Sun", value: 0 },
  ];

  useEffect(() => {
    if (beat && isOpen) {
      setBeatName(beat.name || '');
      setAverageKm(beat.average_km?.toString() || '');
      setAverageTimeMinutes(beat.average_time_minutes?.toString() || '');
      loadRetailers();
      loadTerritories();
      loadBeatTerritory();
      
      // Fetch expense config
      (async () => {
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
            // from_beat: always auto-calculate from KM × rate
            const km = beat.average_km || 0;
            setTravelAllowance((km * resolved.ta_per_km_rate).toFixed(2));
          }
        } catch {
          setTaType('from_beat');
          setTravelAllowance(beat.travel_allowance?.toString() || '');
        }
      })();
    }
  }, [beat, isOpen]);
  
  const loadTerritories = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('territories')
        .select('id, name')
        .order('name');
      if (error) throw error;
      setTerritories(data || []);
    } catch (error) {
      console.error('Error loading territories:', error);
    }
  };
  
  const loadBeatTerritory = async () => {
    if (!beat) return;
    try {
      const { data, error } = await supabase
        .from('beats')
        .select('territory_id')
        .eq('beat_id', beat.id)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      setSelectedTerritoryId(data?.territory_id || null);
    } catch (error) {
      console.error('Error loading beat territory:', error);
    }
  };

  const loadRetailers = async () => {
    if (!user || !beat) return;
    
    try {
      // Get all retailers for user
      const { data: allRetailersData, error: allError } = await supabase
        .from('retailers')
        .select('*')
        .eq('user_id', user.id)
        .order('name');

      if (allError) throw allError;

      // Get current beat retailers
      const { data: beatRetailersData, error: beatError } = await supabase
        .from('retailers')
        .select('*')
        .eq('user_id', user.id)
        .eq('beat_id', beat.id)
        .order('name');

      if (beatError) throw beatError;

      const allRetailersFormatted = (allRetailersData || []).map(retailer => ({
        id: retailer.id,
        name: retailer.name,
        address: retailer.address,
        phone: retailer.phone || 'N/A',
        category: retailer.category,
        beat_id: retailer.beat_id,
        beat_name: retailer.beat_name
      }));

      const beatRetailerIds = new Set((beatRetailersData || []).map(r => r.id));
      
      setAllRetailers(allRetailersFormatted);
      setRetailers(allRetailersFormatted);
      setSelectedRetailers(beatRetailerIds);
    } catch (error) {
      console.error('Error loading retailers:', error);
      toast.error('Failed to load retailers');
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
  };

  const handleWeekDayToggle = (dayValue: number) => {
    setRepeatDays(prev => 
      prev.includes(dayValue)
        ? prev.filter(d => d !== dayValue)
        : [...prev, dayValue]
    );
  };

  const generateBeatPlans = (beatId: string, beatName: string, endDate: Date) => {
    const plans = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let currentDate = new Date(today);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    while (currentDate <= end) {
      let shouldInclude = false;

      if (repeatType === "daily") {
        shouldInclude = true;
      } else if (repeatType === "weekly") {
        const dayOfWeek = currentDate.getDay();
        shouldInclude = repeatDays.includes(dayOfWeek);
      } else if (repeatType === "monthly") {
        const dayOfWeek = currentDate.getDay();
        shouldInclude = repeatDays.includes(dayOfWeek);
      }

      if (shouldInclude) {
        plans.push({
          user_id: user!.id,
          beat_id: beatId,
          beat_name: beatName,
          plan_date: format(currentDate, 'yyyy-MM-dd'),
          beat_data: {
            retailer_ids: Array.from(selectedRetailers)
          }
        });
      }

      currentDate = addDays(currentDate, 1);
    }

    return plans;
  };

  const handleSave = async () => {
    if (!beatName.trim()) {
      toast.error('Please enter a beat name');
      return;
    }

    if (!user || !beat) return;

    setLoading(true);
    try {
      // Update the shared beats table
      const { error: beatUpdateError } = await supabase
        .from('beats')
        .update({
          beat_name: beatName.trim(),
          travel_allowance: taType === 'fixed' ? fixedTaAmount : (parseFloat(travelAllowance) || 0),
          average_km: parseFloat(averageKm) || 0,
          average_time_minutes: parseInt(averageTimeMinutes) || 0,
          territory_id: selectedTerritoryId || null,
          updated_at: new Date().toISOString()
        })
        .eq('beat_id', beat.id);

      if (beatUpdateError) throw beatUpdateError;

      // Update beat allowances for this user
      const { error: allowanceError } = await supabase
        .from('beat_allowances')
        .upsert({
          user_id: user.id,
          beat_id: beat.id,
          beat_name: beatName.trim(),
          travel_allowance: taType === 'fixed' ? fixedTaAmount : (parseFloat(travelAllowance) || 0),
          average_km: parseFloat(averageKm) || 0,
          average_time_minutes: parseInt(averageTimeMinutes) || 0,
          daily_allowance: 0
        }, {
          onConflict: 'user_id,beat_id'
        });

      if (allowanceError) throw allowanceError;

      // Get current retailers in this beat
      const { data: currentBeatRetailers, error: currentError } = await supabase
        .from('retailers')
        .select('id')
        .eq('user_id', user.id)
        .eq('beat_id', beat.id);

      if (currentError) throw currentError;

      const currentRetailerIds = new Set((currentBeatRetailers || []).map(r => r.id));
      const newRetailerIds = selectedRetailers;

      // Retailers to remove from beat (unassign)
      const retailersToRemove = Array.from(currentRetailerIds).filter(id => !newRetailerIds.has(id));
      
      // Retailers to add to beat
      const retailersToAdd = Array.from(newRetailerIds).filter(id => !currentRetailerIds.has(id));

      // Remove retailers from beat
      if (retailersToRemove.length > 0) {
        const { error: removeError } = await supabase
          .from('retailers')
          .update({ 
            beat_id: 'unassigned',
            beat_name: null
          })
          .in('id', retailersToRemove)
          .eq('user_id', user.id);

        if (removeError) throw removeError;
      }

      // Add retailers to beat
      if (retailersToAdd.length > 0) {
        const { error: addError } = await supabase
          .from('retailers')
          .update({ 
            beat_id: beat.id,
            beat_name: beatName.trim()
          })
          .in('id', retailersToAdd)
          .eq('user_id', user.id);

        if (addError) throw addError;
      }

      // Note: retailers.beat_name is auto-synced for ALL users by the
      // trg_sync_retailers_beat_name database trigger when beats.beat_name changes.

      // Handle beat plans if recurrence is enabled
      if (repeatEnabled && repeatEndDate) {
        // Delete existing future beat plans for this beat
        const { error: deletePlansError } = await supabase
          .from('beat_plans')
          .delete()
          .eq('beat_id', beat.id)
          .eq('user_id', user.id)
          .gte('plan_date', format(new Date(), 'yyyy-MM-dd'));

        if (deletePlansError) throw deletePlansError;

        // Create new beat plans
        const beatPlans = generateBeatPlans(beat.id, beatName, repeatEndDate);
        
        if (beatPlans.length > 0) {
          const { error: planError } = await supabase
            .from('beat_plans')
            .insert(beatPlans);

          if (planError) throw planError;
        }
      }

      toast.success(`Beat "${beatName}" updated successfully`);
      onBeatUpdated();
      onClose();
    } catch (error) {
      console.error('Error updating beat:', error);
      toast.error('Failed to update beat');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setBeatName('');
    setTravelAllowance('');
    setAverageKm('');
    setAverageTimeMinutes('');
    setSearchTerm('');
    setSelectedRetailers(new Set());
    setRepeatEnabled(false);
    setRepeatType("weekly");
    setRepeatDays([1]);
    setRepeatEndDate(undefined);
    setMonthlyType("day");
    setMonthlyWeek("first");
    setMonthlyDayOfWeek(1);
    setMonthlyDateOfMonth("1");
    setSelectedTerritoryId(null);
    onClose();
  };

  const filteredRetailers = retailers.filter(retailer =>
    retailer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    retailer.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    retailer.phone.includes(searchTerm)
  );

  const getCurrentBeatName = (retailer: Retailer) => {
    if (!retailer.beat_id || retailer.beat_id === 'unassigned') {
      return 'Unassigned';
    }
    return retailer.beat_name || retailer.beat_id;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Edit Beat: {beat?.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-6">
              {/* Beat Details Form */}
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="beatName">Beat Name</Label>
                      <Input
                        id="beatName"
                        placeholder="Enter beat name"
                        value={beatName}
                        onChange={(e) => setBeatName(e.target.value)}
                      />
                    </div>
                    
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
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="averageKm" className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Beat Average KM
                      </Label>
                      <Input
                        id="averageKm"
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        value={averageKm}
                        onChange={(e) => {
                          setAverageKm(e.target.value);
                          if (taType === 'from_beat' && taPerKmRate > 0) {
                            const km = parseFloat(e.target.value) || 0;
                            setTravelAllowance((km * taPerKmRate).toFixed(2));
                          }
                        }}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="averageTime" className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Average Time (minutes)
                      </Label>
                      <Input
                        id="averageTime"
                        type="number"
                        placeholder="0"
                        value={averageTimeMinutes}
                        onChange={(e) => setAverageTimeMinutes(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="territory" className="flex items-center gap-2">
                      <Navigation className="h-4 w-4" />
                      Territory
                    </Label>
                    <Select 
                      value={selectedTerritoryId || "none"} 
                      onValueChange={(value) => setSelectedTerritoryId(value === "none" ? null : value)}
                    >
                      <SelectTrigger id="territory">
                        <SelectValue placeholder="Select territory" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Territory</SelectItem>
                        {territories.map((territory) => (
                          <SelectItem key={territory.id} value={territory.id}>
                            {territory.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Recurrence Scheduling */}
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="repeatEnabled"
                      checked={repeatEnabled}
                      onCheckedChange={(checked) => setRepeatEnabled(checked as boolean)}
                    />
                    <Label htmlFor="repeatEnabled" className="flex items-center gap-2 cursor-pointer">
                      <Repeat className="h-4 w-4" />
                      Create Recurring Visit Schedule
                    </Label>
                  </div>
                  
                  {repeatEnabled && (
                    <div className="space-y-4 pl-6 border-l-2 border-primary/20">
                      <div className="space-y-2">
                        <Label>Repeat Pattern</Label>
                        <RadioGroup value={repeatType} onValueChange={(value: any) => setRepeatType(value)}>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="daily" id="daily" />
                            <Label htmlFor="daily" className="cursor-pointer">Daily</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="weekly" id="weekly" />
                            <Label htmlFor="weekly" className="cursor-pointer">Weekly</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="monthly" id="monthly" />
                            <Label htmlFor="monthly" className="cursor-pointer">Monthly</Label>
                          </div>
                        </RadioGroup>
                      </div>
                      
                      {repeatType === "weekly" && (
                        <div className="space-y-2">
                          <Label>Select Days</Label>
                          <div className="flex flex-wrap gap-2">
                            {weekDays.map((day) => (
                              <Button
                                key={day.value}
                                type="button"
                                variant={repeatDays.includes(day.value) ? "default" : "outline"}
                                size="sm"
                                onClick={() => handleWeekDayToggle(day.value)}
                                className="w-12"
                              >
                                {day.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {repeatType === "monthly" && (
                        <div className="space-y-4">
                          <div className="space-y-3">
                            <RadioGroup value={monthlyType} onValueChange={(value: any) => setMonthlyType(value)}>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="day" id="monthly-day" />
                                <Label htmlFor="monthly-day" className="cursor-pointer">
                                  On a specific day of the month
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="date" id="monthly-date" />
                                <Label htmlFor="monthly-date" className="cursor-pointer">
                                  On a specific date of the month
                                </Label>
                              </div>
                            </RadioGroup>
                          </div>
                          
                          {monthlyType === "day" && (
                            <div className="space-y-3 pl-4">
                              <div className="space-y-2">
                                <Label>Select Week</Label>
                                <select
                                  value={monthlyWeek}
                                  onChange={(e) => setMonthlyWeek(e.target.value)}
                                  className="w-full px-3 py-2 border border-input bg-background rounded-md"
                                >
                                  <option value="first">First</option>
                                  <option value="second">Second</option>
                                  <option value="third">Third</option>
                                  <option value="fourth">Fourth</option>
                                  <option value="last">Last</option>
                                </select>
                              </div>
                              
                              <div className="space-y-2">
                                <Label>Select Day of Week</Label>
                                <select
                                  value={monthlyDayOfWeek}
                                  onChange={(e) => setMonthlyDayOfWeek(parseInt(e.target.value))}
                                  className="w-full px-3 py-2 border border-input bg-background rounded-md"
                                >
                                  <option value="1">Monday</option>
                                  <option value="2">Tuesday</option>
                                  <option value="3">Wednesday</option>
                                  <option value="4">Thursday</option>
                                  <option value="5">Friday</option>
                                  <option value="6">Saturday</option>
                                  <option value="0">Sunday</option>
                                </select>
                              </div>
                            </div>
                          )}
                          
                          {monthlyType === "date" && (
                            <div className="space-y-2 pl-4">
                              <Label>Enter Date of Month (1-31)</Label>
                              <Input
                                type="number"
                                min="1"
                                max="31"
                                value={monthlyDateOfMonth}
                                onChange={(e) => setMonthlyDateOfMonth(e.target.value)}
                                placeholder="Enter date (1-31)"
                              />
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        <Label>End Date</Label>
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
                              {repeatEndDate ? format(repeatEndDate, "PPP") : "Pick an end date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={repeatEndDate}
                              onSelect={(date) => {
                                setRepeatEndDate(date);
                                setIsCalendarOpen(false);
                              }}
                              disabled={(date) => date < new Date()}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Retailer Management */}
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Manage Retailers</h3>
                    <Badge variant="secondary">
                      {selectedRetailers.size} selected
                    </Badge>
                  </div>
                  
                  <SearchInput
                    placeholder="Search retailers by name, address, or phone"
                    value={searchTerm}
                    onChange={setSearchTerm}
                  />
                  
                  <div className="space-y-2">
                    {filteredRetailers.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">
                        No retailers found
                      </div>
                    ) : (
                      filteredRetailers.map((retailer) => (
                        <div
                          key={retailer.id}
                          className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 ${
                            selectedRetailers.has(retailer.id) 
                              ? 'border-primary bg-primary/5' 
                              : ''
                          }`}
                          onClick={() => handleRetailerSelection(retailer.id)}
                        >
                          <Checkbox
                            checked={selectedRetailers.has(retailer.id)}
                            onChange={() => handleRetailerSelection(retailer.id)}
                          />
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="min-w-0 flex-1">
                                <h4 className="font-medium text-sm truncate">
                                  {retailer.name}
                                </h4>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3" />
                                  <span className="truncate">{retailer.address}</span>
                                </div>
                                {retailer.phone && (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>{retailer.phone}</span>
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex flex-col items-end gap-1">
                                {retailer.category && (
                                  <Badge variant="outline" className="text-xs">
                                    {retailer.category}
                                  </Badge>
                                )}
                                <div className="flex items-center gap-1 text-xs">
                                  <Truck className="h-3 w-3" />
                                  <span className="text-muted-foreground">
                                    {getCurrentBeatName(retailer)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </div>
        
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
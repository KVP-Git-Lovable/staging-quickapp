import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  CalendarIcon, Loader2, Navigation, Store, Route, Users, Map as MapSearch, Warehouse,
  Megaphone, CalendarDays as CalendarEvent, Star, X as XIcon, Wifi, WifiOff, MapPin, LogOut,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useActivityEvents } from '@/hooks/useActivityEvents';
import { useSubordinates } from '@/hooks/useSubordinates';
import { useConnectivity } from '@/hooks/useConnectivity';
import { getMyBeats } from '@/services/beatService';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Geolocation } from '@capacitor/geolocation';

interface AddActivityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const VISIT_TYPES = [
  { id: 'customer_visit',    label: 'Customer',     icon: Store,         color: 'green'  },
  { id: 'beat_visit',        label: 'Beat visit',   icon: Route,         color: 'blue'   },
  { id: 'joint_beat_visit',  label: 'Joint visit',  icon: Users,         color: 'purple' },
  { id: 'new_beat_survey',   label: 'Route survey', icon: MapSearch,     color: 'teal'   },
  { id: 'distributor_visit', label: 'Distributor',  icon: Warehouse,     color: 'amber'  },
  { id: 'event_promotion',   label: 'Event',        icon: Megaphone,     color: 'orange' },
  { id: 'meeting_training',  label: 'Meeting',      icon: CalendarEvent, color: 'gray'   },
] as const;

type VisitTypeId = typeof VISIT_TYPES[number]['id'];

const TYPE_COLOR_CLASSES: Record<string, string> = {
  green:  'bg-green-50 border-green-400 text-green-800 dark:bg-green-950/30 dark:text-green-300',
  blue:   'bg-blue-50 border-blue-400 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
  purple: 'bg-purple-50 border-purple-400 text-purple-800 dark:bg-purple-950/30 dark:text-purple-300',
  teal:   'bg-teal-50 border-teal-400 text-teal-800 dark:bg-teal-950/30 dark:text-teal-300',
  amber:  'bg-amber-50 border-amber-400 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
  orange: 'bg-orange-50 border-orange-400 text-orange-800 dark:bg-orange-950/30 dark:text-orange-300',
  gray:   'bg-gray-50 border-gray-400 text-gray-800 dark:bg-gray-950/30 dark:text-gray-300',
};

const StarRating = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type="button"
        onClick={() => onChange(value === n ? 0 : n)}
        className={cn(
          'w-7 h-7 rounded text-sm flex items-center justify-center border transition-colors',
          n <= value
            ? 'bg-amber-100 border-amber-400 text-amber-700'
            : 'bg-muted border-border text-muted-foreground'
        )}
      >
        <Star className={cn('h-3.5 w-3.5', n <= value && 'fill-amber-500 text-amber-500')} />
      </button>
    ))}
  </div>
);

export const AddActivityModal = ({ open, onOpenChange }: AddActivityModalProps) => {
  const { user } = useAuth();
  const { createActivity, updateVisitCheckOut } = useActivityEvents();
  const { subordinates } = useSubordinates();
  const connectivity = useConnectivity();
  const isOnline = connectivity === 'online';
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Type selection
  const [selectedType, setSelectedType] = useState<VisitTypeId>('customer_visit');
  const activeType = VISIT_TYPES.find((t) => t.id === selectedType)!;

  // Shared
  const [activityDate, setActivityDate] = useState<Date>(new Date());
  const [checkInTime, setCheckInTime] = useState<string>(new Date().toISOString());
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [capturingGps, setCapturingGps] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [savedVisitId, setSavedVisitId] = useState<string | null>(null);
  const [savedActivityId, setSavedActivityId] = useState<string | null>(null);

  // Customer
  const [retailerId, setRetailerId] = useState('');
  const [retailerName, setRetailerName] = useState('');
  const [retailerSearch, setRetailerSearch] = useState('');
  const [retailerResults, setRetailerResults] = useState<{ id: string; name: string }[]>([]);
  const [outcome, setOutcome] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  // Beat
  const [availableBeats, setAvailableBeats] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBeatId, setSelectedBeatId] = useState('');
  const [selectedBeatName, setSelectedBeatName] = useState('');
  const [shopsPlanned, setShopsPlanned] = useState<number | null>(null);
  const [shopsVisited, setShopsVisited] = useState<number | null>(null);
  const [kmTravelled, setKmTravelled] = useState<number | null>(null);

  // Joint
  const [subordinateId, setSubordinateId] = useState('');
  const [subordinateBeat, setSubordinateBeat] = useState<{ beat_id: string; beat_name: string; beat_plan_id: string | null; planned_count: number } | null>(null);
  const [beatLoadError, setBeatLoadError] = useState(false);
  const [repRatings, setRepRatings] = useState({
    product_knowledge: 0,
    retailer_relationship: 0,
    scheme_communication: 0,
    branding: 0,
    market_intel: 0,
  });
  const [repOverallOutcome, setRepOverallOutcome] = useState('');
  const [repStrengths, setRepStrengths] = useState('');
  const [repImprovementAreas, setRepImprovementAreas] = useState('');
  const [repActionItems, setRepActionItems] = useState('');
  const [repFollowupDate, setRepFollowupDate] = useState('');
  const [captureMarketIntel, setCaptureMarketIntel] = useState(false);
  const [intelConversation, setIntelConversation] = useState('');
  const [intelImpact, setIntelImpact] = useState('');
  const [intelMonthlyPotential, setIntelMonthlyPotential] = useState('');

  // Route survey
  const [surveyBeatName, setSurveyBeatName] = useState('');
  const [surveyArea, setSurveyArea] = useState('');
  const [surveyTotalShops, setSurveyTotalShops] = useState<number | null>(null);
  const [surveyOurStockShops, setSurveyOurStockShops] = useState<number | null>(null);
  const [surveyTargetShops, setSurveyTargetShops] = useState<number | null>(null);
  const [surveyCompetitorCount, setSurveyCompetitorCount] = useState<number | null>(null);
  const [surveyEstMonthlyValue, setSurveyEstMonthlyValue] = useState<number | null>(null);
  const [surveyMarketType, setSurveyMarketType] = useState('');
  const [surveyPriority, setSurveyPriority] = useState('');
  const [surveySuggestedBeatCount, setSurveySuggestedBeatCount] = useState<number | null>(null);
  const [surveyProposedBeatNames, setSurveyProposedBeatNames] = useState<string[]>([]);
  const [beatNameInput, setBeatNameInput] = useState('');
  const [surveyCompetitionBrands, setSurveyCompetitionBrands] = useState('');
  const [surveyObservations, setSurveyObservations] = useState('');
  const [surveyRecommendation, setSurveyRecommendation] = useState('');

  // Distributor
  const [distributorId, setDistributorId] = useState('');
  const [distributorName, setDistributorName] = useState('');
  const [distributorSearch, setDistributorSearch] = useState('');
  const [distributorResults, setDistributorResults] = useState<{ id: string; name: string }[]>([]);
  const [visitPurpose, setVisitPurpose] = useState('');

  // Event
  const [eventSubType, setEventSubType] = useState('Event');
  const [eventName, setEventName] = useState('');
  const [eventPlace, setEventPlace] = useState('');
  const [actualFootfall, setActualFootfall] = useState<number | null>(null);
  const [salesAchieved, setSalesAchieved] = useState<number | null>(null);

  // Meeting
  const [meetingSubType, setMeetingSubType] = useState('Meeting');
  const [topic, setTopic] = useState('');
  const [attendeeCount, setAttendeeCount] = useState<number | null>(null);
  const [meetingPlace, setMeetingPlace] = useState('');
  const [durationType, setDurationType] = useState<'hour_based' | 'half_day' | 'full_day'>('full_day');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [halfDayType, setHalfDayType] = useState('first_half');

  // GPS capture
  const captureGps = async () => {
    setCapturingGps(true);
    try {
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      setGpsLat(position.coords.latitude);
      setGpsLng(position.coords.longitude);
      toast.success('Location captured');
    } catch {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (p) => {
            setGpsLat(p.coords.latitude);
            setGpsLng(p.coords.longitude);
            toast.success('Location captured');
          },
          () => toast.error('Unable to capture location'),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      } else {
        toast.error('Location services not available');
      }
    } finally {
      setCapturingGps(false);
    }
  };

  // Retailer search (debounced via effect)
  useEffect(() => {
    if (selectedType !== 'customer_visit') return;
    if (!retailerSearch || retailerSearch.length < 2) {
      setRetailerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('retailers')
        .select('id, name')
        .ilike('name', `%${retailerSearch}%`)
        .limit(8);
      setRetailerResults((data as any) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [retailerSearch, selectedType]);

  // Distributor search — distributor_users table (distributors table not present in this project)
  useEffect(() => {
    if (selectedType !== 'distributor_visit') return;
    if (!distributorSearch || distributorSearch.length < 2) {
      setDistributorResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('distributor_users')
        .select('distributor_id, full_name')
        .ilike('full_name', `%${distributorSearch}%`)
        .not('distributor_id', 'is', null)
        .limit(8);
      const dedup = new Map<string, string>();
      ((data as any) || []).forEach((d: any) => {
        if (d.distributor_id && !dedup.has(d.distributor_id)) dedup.set(d.distributor_id, d.full_name);
      });
      setDistributorResults(Array.from(dedup, ([id, name]) => ({ id, name })));
    }, 250);
    return () => clearTimeout(t);
  }, [distributorSearch, selectedType]);

  // Load beats for beat visit
  useEffect(() => {
    if (selectedType !== 'beat_visit' || !user?.id) return;
    getMyBeats(user.id)
      .then((beats: any[]) => {
        setAvailableBeats(
          (beats || []).map((b) => ({ id: String(b.id ?? b.beat_id ?? ''), name: String(b.name ?? b.beat_name ?? 'Unnamed') }))
        );
      })
      .catch((e) => console.warn('[AddActivityModal] getMyBeats failed', e));
  }, [selectedType, user?.id]);

  // Auto-load planned shop count for beat_visit
  useEffect(() => {
    if (selectedType !== 'beat_visit' || !selectedBeatId || !activityDate || !user?.id) return;
    const dateStr = format(activityDate, 'yyyy-MM-dd');
    supabase
      .from('beat_plans')
      .select('beat_data')
      .eq('user_id', user.id)
      .eq('beat_id', selectedBeatId)
      .eq('plan_date', dateStr)
      .maybeSingle()
      .then(({ data }: any) => {
        const planned = data?.beat_data?.retailers?.length || data?.beat_data?.planned_count || 0;
        if (planned) setShopsPlanned(planned);
      });
  }, [selectedBeatId, activityDate, user?.id, selectedType]);

  // Auto-load subordinate beat plan
  useEffect(() => {
    if (selectedType !== 'joint_beat_visit' || !subordinateId || !activityDate) {
      setSubordinateBeat(null);
      setBeatLoadError(false);
      return;
    }
    const dateStr = format(activityDate, 'yyyy-MM-dd');
    supabase
      .from('beat_plans')
      .select('id, beat_id, beat_name, beat_data')
      .eq('user_id', subordinateId)
      .eq('plan_date', dateStr)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          const planned = data.beat_data?.retailers?.length || data.beat_data?.planned_count || 0;
          setSubordinateBeat({
            beat_id: data.beat_id,
            beat_name: data.beat_name,
            beat_plan_id: data.id,
            planned_count: planned,
          });
          setBeatLoadError(false);
        } else {
          setSubordinateBeat(null);
          setBeatLoadError(true);
        }
      });
  }, [subordinateId, activityDate, selectedType]);

  const handleCheckOut = async () => {
    if (!savedVisitId || !savedActivityId) {
      toast.error('Submit the activity first before logging check-out');
      return;
    }
    const now = new Date().toISOString();
    setCheckOutTime(now);
    const mins = await updateVisitCheckOut(savedVisitId, savedActivityId, now);
    if (mins != null) setDurationMinutes(mins);
    toast.success(mins != null ? `Check-out logged — ${mins} mins` : 'Check-out logged');
  };

  const resetForm = () => {
    setSelectedType('customer_visit');
    setActivityDate(new Date());
    setCheckInTime(new Date().toISOString());
    setCheckOutTime(null);
    setDurationMinutes(null);
    setGpsLat(null);
    setGpsLng(null);
    setRemarks('');
    setIsSubmitted(false);
    setSavedVisitId(null);
    setSavedActivityId(null);
    setRetailerId(''); setRetailerName(''); setRetailerSearch(''); setRetailerResults([]);
    setOutcome(''); setContactPerson(''); setFollowUpDate('');
    setSelectedBeatId(''); setSelectedBeatName(''); setShopsPlanned(null); setShopsVisited(null); setKmTravelled(null);
    setSubordinateId(''); setSubordinateBeat(null); setBeatLoadError(false);
    setRepRatings({ product_knowledge: 0, retailer_relationship: 0, scheme_communication: 0, branding: 0, market_intel: 0 });
    setRepOverallOutcome(''); setRepStrengths(''); setRepImprovementAreas(''); setRepActionItems(''); setRepFollowupDate('');
    setCaptureMarketIntel(false); setIntelConversation(''); setIntelImpact(''); setIntelMonthlyPotential('');
    setSurveyBeatName(''); setSurveyArea(''); setSurveyTotalShops(null); setSurveyOurStockShops(null);
    setSurveyTargetShops(null); setSurveyCompetitorCount(null); setSurveyEstMonthlyValue(null);
    setSurveyMarketType(''); setSurveyPriority(''); setSurveySuggestedBeatCount(null);
    setSurveyProposedBeatNames([]); setBeatNameInput(''); setSurveyCompetitionBrands('');
    setSurveyObservations(''); setSurveyRecommendation('');
    setDistributorId(''); setDistributorName(''); setDistributorSearch(''); setDistributorResults([]);
    setVisitPurpose('');
    setEventSubType('Event'); setEventName(''); setEventPlace(''); setActualFootfall(null); setSalesAchieved(null);
    setMeetingSubType('Meeting'); setTopic(''); setAttendeeCount(null); setMeetingPlace('');
    setDurationType('full_day'); setStartTime('09:00'); setEndTime('11:00'); setHalfDayType('first_half');
  };

  const handleSubmit = async () => {
    if (!user?.id) { toast.error('Please log in first'); return; }
    if (!isOnline) { toast.error('Activity logging requires an internet connection'); return; }
    if (isSubmitted) { toast.info('Already submitted — use Log check-out to close.'); return; }

    const dateStr = format(activityDate, 'yyyy-MM-dd');

    if (selectedType === 'customer_visit' && !retailerId) { toast.error('Please select a retailer'); return; }
    if (selectedType === 'beat_visit' && !selectedBeatId) { toast.error('Please select a beat'); return; }
    if (selectedType === 'joint_beat_visit' && !subordinateId) { toast.error('Please select a subordinate'); return; }
    if (selectedType === 'new_beat_survey') {
      if (!surveyBeatName) { toast.error('Please enter a proposed beat name'); return; }
      if (!surveyObservations) { toast.error('Please add your field observations'); return; }
    }
    if (selectedType === 'distributor_visit' && !distributorId) { toast.error('Please select a distributor'); return; }
    if (selectedType === 'event_promotion' && !eventName) { toast.error('Please enter an event name'); return; }
    if (selectedType === 'meeting_training' && !topic) { toast.error('Please enter a topic'); return; }

    setIsSubmitting(true);
    try {
      const common: any = {
        activity_date: dateStr,
        duration_type: 'full_day',
        check_in_time: checkInTime,
        check_in_latitude: gpsLat ?? undefined,
        check_in_longitude: gpsLng ?? undefined,
        start_latitude: gpsLat ?? undefined,
        start_longitude: gpsLng ?? undefined,
        remarks: remarks || undefined,
      };

      let params: any = { ...common, activity_type: selectedType, visit_category: selectedType };

      if (selectedType === 'customer_visit') {
        params = {
          ...params,
          retailer_id: retailerId,
          retailer_name: retailerName,
          outcome: outcome || undefined,
          contact_person: contactPerson || undefined,
          follow_up_date: followUpDate || undefined,
        };
      } else if (selectedType === 'beat_visit') {
        params = {
          ...params,
          beat_id: selectedBeatId,
          beat_name: selectedBeatName,
          shops_planned: shopsPlanned ?? undefined,
          shops_visited: shopsVisited ?? undefined,
          km_travelled: kmTravelled ?? undefined,
        };
      } else if (selectedType === 'joint_beat_visit') {
        params = {
          ...params,
          subordinate_user_id: subordinateId,
          beat_id: subordinateBeat?.beat_id || undefined,
          beat_name: subordinateBeat?.beat_name || undefined,
          shops_visited: shopsVisited ?? undefined,
          rep_rating_product_knowledge: repRatings.product_knowledge || undefined,
          rep_rating_retailer_relationship: repRatings.retailer_relationship || undefined,
          rep_rating_scheme_communication: repRatings.scheme_communication || undefined,
          rep_rating_branding: repRatings.branding || undefined,
          rep_rating_market_intel: repRatings.market_intel || undefined,
          rep_overall_outcome: repOverallOutcome || undefined,
          rep_strengths: repStrengths || undefined,
          rep_improvement_areas: repImprovementAreas || undefined,
          rep_action_items: repActionItems || undefined,
          rep_followup_date: repFollowupDate || undefined,
        };
      } else if (selectedType === 'new_beat_survey') {
        params = {
          ...params,
          activity_name: surveyBeatName,
          activity_place: surveyArea,
          survey_total_shops: surveyTotalShops ?? undefined,
          survey_our_stock_shops: surveyOurStockShops ?? undefined,
          survey_target_shops: surveyTargetShops ?? undefined,
          survey_competitor_count: surveyCompetitorCount ?? undefined,
          survey_estimated_monthly_value: surveyEstMonthlyValue ?? undefined,
          survey_market_type: surveyMarketType || undefined,
          survey_priority: surveyPriority || undefined,
          survey_suggested_beat_count: surveySuggestedBeatCount ?? undefined,
          survey_shops_per_beat:
            surveyTargetShops && surveySuggestedBeatCount
              ? Math.round(surveyTargetShops / surveySuggestedBeatCount)
              : undefined,
          survey_proposed_beat_names: surveyProposedBeatNames.length ? surveyProposedBeatNames : undefined,
          survey_competition_brands: surveyCompetitionBrands || undefined,
          survey_observations: surveyObservations,
          survey_recommendation: surveyRecommendation || undefined,
        };
      } else if (selectedType === 'distributor_visit') {
        params = {
          ...params,
          distributor_id: distributorId,
          distributor_name: distributorName,
          visit_purpose: visitPurpose || undefined,
          contact_person: contactPerson || undefined,
          outcome: outcome || undefined,
        };
      } else if (selectedType === 'event_promotion') {
        params = {
          ...params,
          activity_sub_type: eventSubType,
          activity_name: eventName,
          activity_place: eventPlace || undefined,
          actual_footfall: actualFootfall ?? undefined,
          sales_achieved: salesAchieved ?? undefined,
        };
      } else if (selectedType === 'meeting_training') {
        params = {
          ...params,
          activity_sub_type: meetingSubType,
          topic,
          attendee_count: attendeeCount ?? undefined,
          activity_place: meetingPlace || undefined,
          duration_type: durationType,
          ...(durationType === 'hour_based'
            ? {
                start_time: new Date(`${dateStr}T${startTime}:00`).toISOString(),
                end_time: new Date(`${dateStr}T${endTime}:00`).toISOString(),
              }
            : {}),
          ...(durationType === 'half_day' ? { half_day_type: halfDayType } : {}),
        };
      }

      const result = await createActivity(params);
      if (!result) throw new Error('createActivity returned null');

      setSavedVisitId(result.visitId);
      setSavedActivityId(result.activityId);
      setIsSubmitted(true);

      if (selectedType === 'joint_beat_visit') {
        const sessionInsert: Record<string, unknown> = {
          manager_id: user.id,
          fse_user_id: subordinateId,
          session_date: dateStr,
          beat_id: subordinateBeat?.beat_id || null,
          beat_name: subordinateBeat?.beat_name || null,
          beat_plan_id: subordinateBeat?.beat_plan_id || null,
          session_start_time: checkInTime,
          session_end_time: checkOutTime || null,
          total_retailers_visited: shopsVisited || 0,
          total_feedback_captured: 0,
        };
        const { data: sessionData } = await supabase
          .from('joint_sales_sessions')
          .insert(sessionInsert as any)
          .select('id')
          .single();

        if ((sessionData as any)?.id) {
          await supabase
            .from('activity_events')
            .update({ joint_session_id: (sessionData as any).id } as any)
            .eq('id', result.activityId);

          if (captureMarketIntel && (intelConversation || intelImpact || intelMonthlyPotential)) {
            await supabase.from('joint_sales_feedback').insert({
              visit_id: result.visitId,
              manager_id: user.id,
              fse_user_id: subordinateId,
              beat_plan_id: subordinateBeat?.beat_plan_id || null,
              feedback_date: dateStr,
              conversation_highlights: intelConversation || null,
              joint_sales_impact: intelImpact || null,
              monthly_potential_6months: intelMonthlyPotential ? Number(intelMonthlyPotential) : null,
            } as any);
          }
        }
      }

      toast.success(
        selectedType === 'new_beat_survey'
          ? 'Route survey submitted!'
          : selectedType === 'joint_beat_visit'
          ? 'Joint visit saved!'
          : 'Activity logged successfully!'
      );

      window.dispatchEvent(new CustomEvent('visitDataChanged'));
      // Keep modal open so user can log check-out, but reset on close
    } catch (error: any) {
      console.error('[AddActivityModal] Submit error:', error);
      toast.error(error?.message || 'Failed to save activity');
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeAndReset = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-lg">
            <span className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              Add Activity / Visit
            </span>
            <span className={cn('flex items-center gap-1 text-xs font-normal', isOnline ? 'text-green-600' : 'text-red-600')}>
              {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Type selector */}
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
            {VISIT_TYPES.map((t) => {
              const Icon = t.icon;
              const isActive = selectedType === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedType(t.id)}
                  disabled={isSubmitted}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border-2 p-2 text-[10px] font-medium transition-colors disabled:opacity-50',
                    isActive ? TYPE_COLOR_CLASSES[t.color] : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="leading-tight text-center">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Shared header — date + GPS */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal mt-1 h-9 text-xs">
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {format(activityDate, 'PP')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={activityDate} onSelect={(d) => d && setActivityDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs">GPS Location</Label>
              <Button
                type="button"
                variant={gpsLat ? 'default' : 'outline'}
                onClick={captureGps}
                disabled={capturingGps}
                className={cn('w-full mt-1 h-9 text-xs gap-1', gpsLat && 'bg-green-600 hover:bg-green-700 text-white')}
              >
                {capturingGps ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
                {gpsLat ? 'Captured' : 'Capture'}
              </Button>
            </div>
          </div>
          {gpsLat && gpsLng && (
            <p className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1 -mt-2">
              <MapPin className="h-3 w-3" />
              {gpsLat.toFixed(4)}, {gpsLng.toFixed(4)}
            </p>
          )}

          {/* Check-in / Check-out */}
          {selectedType !== 'meeting_training' && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 flex items-center justify-between text-xs">
              <span>
                <span className="text-muted-foreground">Check-in:</span>{' '}
                <span className="font-medium">
                  {new Date(checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </span>
              {durationMinutes != null && (
                <Badge variant="outline" className="text-[10px]">{durationMinutes} mins</Badge>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] gap-1"
                onClick={handleCheckOut}
                disabled={!isSubmitted || !!checkOutTime}
              >
                <LogOut className="h-3 w-3" />
                {checkOutTime ? 'Checked out' : 'Log check-out'}
              </Button>
            </div>
          )}

          {/* ============ Customer ============ */}
          {selectedType === 'customer_visit' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Retailer *</Label>
                {retailerId ? (
                  <div className="flex items-center justify-between rounded border p-2 text-sm mt-1">
                    <span className="font-medium truncate">{retailerName}</span>
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => { setRetailerId(''); setRetailerName(''); setRetailerSearch(''); }}>
                      <XIcon className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input value={retailerSearch} onChange={(e) => setRetailerSearch(e.target.value)} placeholder="Search retailer..." className="mt-1 h-9 text-sm" />
                    {retailerResults.length > 0 && (
                      <div className="border rounded mt-1 max-h-40 overflow-y-auto">
                        {retailerResults.map((r) => (
                          <button key={r.id} type="button" onClick={() => { setRetailerId(r.id); setRetailerName(r.name); setRetailerResults([]); }} className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted">
                            {r.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <Label className="text-xs">Outcome</Label>
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select outcome" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="order_placed">Order placed</SelectItem>
                    <SelectItem value="no_order">No order</SelectItem>
                    <SelectItem value="follow_up_needed">Follow-up needed</SelectItem>
                    <SelectItem value="complaint">Complaint</SelectItem>
                    <SelectItem value="info_shared">Info shared</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Contact person</Label>
                  <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Follow-up date</Label>
                  <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="mt-1 h-9 text-sm" />
                </div>
              </div>
            </div>
          )}

          {/* ============ Beat ============ */}
          {selectedType === 'beat_visit' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Beat *</Label>
                <Select value={selectedBeatId} onValueChange={(v) => { setSelectedBeatId(v); setSelectedBeatName(availableBeats.find((b) => b.id === v)?.name || ''); }}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder={availableBeats.length ? 'Select beat' : 'No beats found'} /></SelectTrigger>
                  <SelectContent>
                    {availableBeats.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Shops planned</Label>
                  <Input type="number" value={shopsPlanned ?? ''} onChange={(e) => setShopsPlanned(e.target.value ? Number(e.target.value) : null)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Shops visited</Label>
                  <Input type="number" value={shopsVisited ?? ''} onChange={(e) => setShopsVisited(e.target.value ? Number(e.target.value) : null)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">KM travelled</Label>
                  <Input type="number" step="0.1" value={kmTravelled ?? ''} onChange={(e) => setKmTravelled(e.target.value ? Number(e.target.value) : null)} className="mt-1 h-9 text-sm" />
                </div>
              </div>
            </div>
          )}

          {/* ============ Joint ============ */}
          {selectedType === 'joint_beat_visit' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Subordinate *</Label>
                <Select value={subordinateId} onValueChange={setSubordinateId}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder={subordinates.length ? 'Select subordinate' : 'No subordinates'} /></SelectTrigger>
                  <SelectContent>
                    {subordinates.map((s) => (
                      <SelectItem key={s.subordinate_user_id} value={s.subordinate_user_id}>{s.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {subordinateBeat && (
                <div className="rounded border bg-muted/30 px-3 py-2 text-xs">
                  Beat: <span className="font-medium">{subordinateBeat.beat_name}</span>
                  {subordinateBeat.planned_count > 0 && <span className="ml-2 text-muted-foreground">· {subordinateBeat.planned_count} planned</span>}
                </div>
              )}
              {beatLoadError && (
                <p className="text-xs text-amber-600">No beat plan found for this subordinate on selected date.</p>
              )}
              <div>
                <Label className="text-xs">Shops visited</Label>
                <Input type="number" value={shopsVisited ?? ''} onChange={(e) => setShopsVisited(e.target.value ? Number(e.target.value) : null)} className="mt-1 h-9 text-sm" />
              </div>
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-xs font-semibold">Rep ratings</p>
                {[
                  ['product_knowledge', 'Product knowledge'],
                  ['retailer_relationship', 'Retailer relationship'],
                  ['scheme_communication', 'Scheme communication'],
                  ['branding', 'Branding'],
                  ['market_intel', 'Market intel'],
                ].map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs">{label}</span>
                    <StarRating
                      value={(repRatings as any)[key]}
                      onChange={(v) => setRepRatings({ ...repRatings, [key]: v })}
                    />
                  </div>
                ))}
              </div>
              <div>
                <Label className="text-xs">Overall outcome</Label>
                <Select value={repOverallOutcome} onValueChange={setRepOverallOutcome}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select rating" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Excellent">Excellent</SelectItem>
                    <SelectItem value="Good">Good</SelectItem>
                    <SelectItem value="Average">Average</SelectItem>
                    <SelectItem value="Poor">Poor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Textarea placeholder="Strengths" value={repStrengths} onChange={(e) => setRepStrengths(e.target.value)} rows={2} className="text-xs" />
                <Textarea placeholder="Improvement areas" value={repImprovementAreas} onChange={(e) => setRepImprovementAreas(e.target.value)} rows={2} className="text-xs" />
              </div>
              <Textarea placeholder="Action items" value={repActionItems} onChange={(e) => setRepActionItems(e.target.value)} rows={2} className="text-xs" />
              <div>
                <Label className="text-xs">Follow-up date</Label>
                <Input type="date" value={repFollowupDate} onChange={(e) => setRepFollowupDate(e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Capture market intelligence</Label>
                  <Switch checked={captureMarketIntel} onCheckedChange={setCaptureMarketIntel} />
                </div>
                {captureMarketIntel && (
                  <>
                    <Textarea placeholder="Conversation highlights" value={intelConversation} onChange={(e) => setIntelConversation(e.target.value)} rows={2} className="text-xs" />
                    <Textarea placeholder="Joint sales impact" value={intelImpact} onChange={(e) => setIntelImpact(e.target.value)} rows={2} className="text-xs" />
                    <Input type="number" placeholder="Monthly potential (next 6 months)" value={intelMonthlyPotential} onChange={(e) => setIntelMonthlyPotential(e.target.value)} className="h-9 text-sm" />
                  </>
                )}
              </div>
            </div>
          )}

          {/* ============ Route survey ============ */}
          {selectedType === 'new_beat_survey' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Proposed beat name *</Label>
                  <Input value={surveyBeatName} onChange={(e) => setSurveyBeatName(e.target.value)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Area / market</Label>
                  <Input value={surveyArea} onChange={(e) => setSurveyArea(e.target.value)} className="mt-1 h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Total shops</Label>
                  <Input type="number" value={surveyTotalShops ?? ''} onChange={(e) => setSurveyTotalShops(e.target.value ? Number(e.target.value) : null)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Our stock shops</Label>
                  <Input type="number" value={surveyOurStockShops ?? ''} onChange={(e) => setSurveyOurStockShops(e.target.value ? Number(e.target.value) : null)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Target shops</Label>
                  <Input type="number" value={surveyTargetShops ?? ''} onChange={(e) => setSurveyTargetShops(e.target.value ? Number(e.target.value) : null)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Competitor count</Label>
                  <Input type="number" value={surveyCompetitorCount ?? ''} onChange={(e) => setSurveyCompetitorCount(e.target.value ? Number(e.target.value) : null)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Est. monthly value (₹)</Label>
                  <Input type="number" value={surveyEstMonthlyValue ?? ''} onChange={(e) => setSurveyEstMonthlyValue(e.target.value ? Number(e.target.value) : null)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Suggested beat count</Label>
                  <Input type="number" value={surveySuggestedBeatCount ?? ''} onChange={(e) => setSurveySuggestedBeatCount(e.target.value ? Number(e.target.value) : null)} className="mt-1 h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Market type</Label>
                  <Select value={surveyMarketType} onValueChange={setSurveyMarketType}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urban">Urban</SelectItem>
                      <SelectItem value="semi_urban">Semi-urban</SelectItem>
                      <SelectItem value="rural">Rural</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Priority</Label>
                  <Select value={surveyPriority} onValueChange={setSurveyPriority}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Proposed beat names</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={beatNameInput} onChange={(e) => setBeatNameInput(e.target.value)} placeholder="Add beat name..." className="h-9 text-sm" onKeyDown={(e) => { if (e.key === 'Enter' && beatNameInput.trim()) { e.preventDefault(); setSurveyProposedBeatNames([...surveyProposedBeatNames, beatNameInput.trim()]); setBeatNameInput(''); } }} />
                  <Button type="button" size="sm" variant="outline" onClick={() => { if (beatNameInput.trim()) { setSurveyProposedBeatNames([...surveyProposedBeatNames, beatNameInput.trim()]); setBeatNameInput(''); } }}>Add</Button>
                </div>
                {surveyProposedBeatNames.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {surveyProposedBeatNames.map((n, i) => (
                      <Badge key={i} variant="secondary" className="gap-1 text-[10px]">
                        {n}
                        <button onClick={() => setSurveyProposedBeatNames(surveyProposedBeatNames.filter((_, idx) => idx !== i))}>
                          <XIcon className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <Textarea placeholder="Competition brands seen" value={surveyCompetitionBrands} onChange={(e) => setSurveyCompetitionBrands(e.target.value)} rows={2} className="text-xs" />
              <Textarea placeholder="Field observations *" value={surveyObservations} onChange={(e) => setSurveyObservations(e.target.value)} rows={3} className="text-xs" />
              <Textarea placeholder="Recommendation" value={surveyRecommendation} onChange={(e) => setSurveyRecommendation(e.target.value)} rows={2} className="text-xs" />
            </div>
          )}

          {/* ============ Distributor ============ */}
          {selectedType === 'distributor_visit' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Distributor *</Label>
                {distributorId ? (
                  <div className="flex items-center justify-between rounded border p-2 text-sm mt-1">
                    <span className="font-medium truncate">{distributorName}</span>
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => { setDistributorId(''); setDistributorName(''); setDistributorSearch(''); }}>
                      <XIcon className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input value={distributorSearch} onChange={(e) => setDistributorSearch(e.target.value)} placeholder="Search distributor..." className="mt-1 h-9 text-sm" />
                    {distributorResults.length > 0 && (
                      <div className="border rounded mt-1 max-h-40 overflow-y-auto">
                        {distributorResults.map((d) => (
                          <button key={d.id} type="button" onClick={() => { setDistributorId(d.id); setDistributorName(d.name); setDistributorResults([]); }} className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted">
                            {d.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <Label className="text-xs">Visit purpose</Label>
                <Select value={visitPurpose} onValueChange={setVisitPurpose}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stock_review">Stock review</SelectItem>
                    <SelectItem value="payment_collection">Payment collection</SelectItem>
                    <SelectItem value="order_review">Order review</SelectItem>
                    <SelectItem value="claim_settlement">Claim settlement</SelectItem>
                    <SelectItem value="relationship">Relationship</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Contact person</Label>
                  <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Outcome</Label>
                  <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} className="mt-1 h-9 text-sm" />
                </div>
              </div>
            </div>
          )}

          {/* ============ Event ============ */}
          {selectedType === 'event_promotion' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Sub-type</Label>
                <Select value={eventSubType} onValueChange={setEventSubType}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Event">Event</SelectItem>
                    <SelectItem value="Promotion">Promotion</SelectItem>
                    <SelectItem value="Demo">Demo</SelectItem>
                    <SelectItem value="Celebration">Celebration</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Event name *</Label>
                <Input value={eventName} onChange={(e) => setEventName(e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Place</Label>
                <Input value={eventPlace} onChange={(e) => setEventPlace(e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Actual footfall</Label>
                  <Input type="number" value={actualFootfall ?? ''} onChange={(e) => setActualFootfall(e.target.value ? Number(e.target.value) : null)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Sales achieved (₹)</Label>
                  <Input type="number" value={salesAchieved ?? ''} onChange={(e) => setSalesAchieved(e.target.value ? Number(e.target.value) : null)} className="mt-1 h-9 text-sm" />
                </div>
              </div>
            </div>
          )}

          {/* ============ Meeting ============ */}
          {selectedType === 'meeting_training' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Sub-type</Label>
                <Select value={meetingSubType} onValueChange={setMeetingSubType}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Meeting">Meeting</SelectItem>
                    <SelectItem value="Training">Training</SelectItem>
                    <SelectItem value="Review">Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Topic *</Label>
                <Input value={topic} onChange={(e) => setTopic(e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Attendees</Label>
                  <Input type="number" value={attendeeCount ?? ''} onChange={(e) => setAttendeeCount(e.target.value ? Number(e.target.value) : null)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Place</Label>
                  <Input value={meetingPlace} onChange={(e) => setMeetingPlace(e.target.value)} className="mt-1 h-9 text-sm" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Duration</Label>
                <Select value={durationType} onValueChange={(v) => setDurationType(v as any)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hour_based">Hour-based</SelectItem>
                    <SelectItem value="half_day">Half day</SelectItem>
                    <SelectItem value="full_day">Full day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {durationType === 'hour_based' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Start</Label>
                    <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">End</Label>
                    <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                </div>
              )}
              {durationType === 'half_day' && (
                <div>
                  <Label className="text-xs">Half-day</Label>
                  <Select value={halfDayType} onValueChange={setHalfDayType}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first_half">First half</SelectItem>
                      <SelectItem value="second_half">Second half</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Remarks */}
          <div>
            <Label className="text-xs">Remarks</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} className="mt-1 text-sm" placeholder="Optional notes..." />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 h-9 text-sm" onClick={closeAndReset} disabled={isSubmitting}>
              {isSubmitted ? 'Close' : 'Cancel'}
            </Button>
            <Button
              className={cn('flex-1 h-9 text-sm', activeType && TYPE_COLOR_CLASSES[activeType.color])}
              onClick={handleSubmit}
              disabled={isSubmitting || isSubmitted || !isOnline}
            >
              {isSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
              ) : isSubmitted ? 'Saved' : 'Save Activity'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

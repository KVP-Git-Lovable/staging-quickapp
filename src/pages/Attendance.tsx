import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TeamAttendanceTab } from '@/components/attendance/TeamAttendanceTab';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Layout } from '@/components/Layout';
import { CheckCircle, XCircle, Camera, MapPin, Clock, Plus, Filter, Navigation2, Route, CalendarDays, FileText, LogOut, LogIn, Edit3, ChevronLeft, ChevronRight } from 'lucide-react';
import RejectionReasonDialog from '@/components/RejectionReasonDialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useSubordinates } from '@/hooks/useSubordinates';
import { supabase } from '@/integrations/supabase/client';
import { format, subMonths, addMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameMonth } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import HolidayList from '@/components/HolidayList';
import LeaveApplicationModal from '@/components/LeaveApplicationModal';
import MyLeaveApplications from '@/components/MyLeaveApplications';
import LeaveBalanceCards from '@/components/LeaveBalanceCards';
import { useGPSTrackingOptimized } from '@/hooks/useGPSTrackingOptimized';
import { JourneyMap } from '@/components/JourneyMap';
import { TimelineView } from '@/components/TimelineView';
import { cn } from '@/lib/utils';
import { useFaceMatching } from '@/hooks/useFaceMatching';
import { CameraCapture } from '@/components/CameraCapture';
import { offlineStorage, STORES } from '@/lib/offlineStorage';
import { shouldSuppressError } from '@/utils/offlineErrorHandler';
import { requestLocationPermission } from '@/utils/permissions';
import { useVanSales } from '@/hooks/useVanSales';
import { getLocalTodayDate, toLocalISODate } from '@/utils/dateUtils';
import RegularizationRequestModal from '@/components/RegularizationRequestModal';
import { useAttendanceCache } from '@/hooks/useAttendanceCache';
import { useWorkingDaysConfig } from '@/hooks/useWorkingDaysConfig';
import { getSignedStorageUrl } from '@/utils/storageUtils';
import { AttendanceCalendarView } from '@/components/attendance/AttendanceCalendarView';
import { useQuery } from '@tanstack/react-query';

// Processing steps for attendance
type ProcessingStep = 'location' | 'photo' | 'face' | 'saving' | 'complete';

interface ProcessingState {
  isProcessing: boolean;
  currentStep: ProcessingStep | null;
  stepMessage: string;
}

const Attendance = () => {
  const { t } = useTranslation('common');
  const { toast } = useToast();
  const { userProfile, user } = useAuth();
  const navigate = useNavigate();
  
  // Hierarchical user filter
  const { isManager, subordinateIds, directReportIds } = useSubordinates();
  const [selectedTopTab, setSelectedTopTab] = useState<'my-attendance' | 'my-team'>('my-attendance');
  const [selectedUserId, setSelectedUserId] = useState<string>('self');
  
  // Calculate effective user ID for data filtering
  const effectiveUserId = React.useMemo(() => {
    if (selectedUserId === 'self' || selectedUserId === user?.id) {
      return user?.id;
    }
    if (selectedUserId === 'all') {
      return null; // Will filter by all subordinate IDs
    }
    return selectedUserId;
  }, [selectedUserId, user?.id]);
  
  // Check if viewing own data
  const isViewingOwnData = selectedUserId === 'self' || selectedUserId === user?.id;
  
   // Date filter state - month-based navigation
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const dateFilter = isSameMonth(selectedMonth, new Date()) ? 'current-month' : 'custom-month';
  
  // NEW: Use cached attendance data hooks (offline-first pattern)
  const {
    attendanceRecords: cachedAttendanceRecords,
    todaysAttendance: cachedTodaysAttendance,
    todaysVisits: cachedTodaysVisits,
    regularizationRequests: cachedRegularizationRequests,
    activeMarketHours: cachedActiveMarketHours,
    isLoading: isLoadingAttendance,
    refreshTodayOnly,
    forceRefresh
  } = useAttendanceCache(dateFilter, selectedMonth);
  
  // NEW: Use cached working days config (offline-first pattern)
  const {
    totalWorkingDays,
    elapsedWorkingDays,
    elapsedWorkingDates,
    holidayDates,
    weekOffConfig,
    isLoading: isLoadingConfig
  } = useWorkingDaysConfig(dateFilter, selectedMonth);

  // Calendar view state
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Fetch user's leave applications for calendar
  const { data: userLeaveRecords = [] } = useQuery({
    queryKey: ['my-leave-applications-calendar', user?.id, format(calendarMonth, 'yyyy-MM')],
    queryFn: async () => {
      if (!user?.id) return [];
      const monthStart = format(startOfMonth(calendarMonth), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(calendarMonth), 'yyyy-MM-dd');
      const { data } = await supabase
        .from('leave_applications')
        .select('id, start_date, end_date, status, is_half_day, half_day_period, leave_types(name)')
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .or(`start_date.lte.${monthEnd},end_date.gte.${monthStart}`);
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  });
  // Use cached data IMMEDIATELY for instant UI - don't wait for loading
  // The hooks now return cached data synchronously via placeholderData
  const [attendanceData, setAttendanceData] = useState<any[]>(() => cachedAttendanceRecords);
  const [todaysAttendance, setTodaysAttendance] = useState<any>(() => cachedTodaysAttendance);
  const [todaysVisits, setTodaysVisits] = useState<any[]>(() => cachedTodaysVisits);
  const [activeMarketHours, setActiveMarketHours] = useState<number | null>(() => cachedActiveMarketHours);
  const [stats, setStats] = useState(() => {
    // Calculate initial stats from cached data (exclude holidays from present count)
    const presentDaysCount = cachedAttendanceRecords.filter((r: any) => r.status === 'present' && !holidayDates.has(r.date)).length;
    const workingDays = totalWorkingDays || 20;
    const attendancePercentage = workingDays > 0 ? Math.round((presentDaysCount / workingDays) * 100) : 0;
    return {
      totalDays: workingDays,
      presentDays: presentDaysCount,
      absentDays: Math.max(0, elapsedWorkingDays - presentDaysCount),
      attendance: attendancePercentage
    };
  });
  const [presentDatesList, setPresentDatesList] = useState<string[]>([]);
  const [absentDatesList, setAbsentDatesList] = useState<string[]>([]);
  const [showPresentDaysDialog, setShowPresentDaysDialog] = useState(false);
  const [showAbsentDaysDialog, setShowAbsentDaysDialog] = useState(false);
  const [isMarkingAttendance, setIsMarkingAttendance] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [location, setLocation] = useState(null);
  const [leaveRefreshTrigger, setLeaveRefreshTrigger] = useState(0);
  const [selectedDateForMap, setSelectedDateForMap] = useState<Date | null>(null);
  const [selectedDateVisits, setSelectedDateVisits] = useState([]);
  const [gpsPositionsByDate, setGpsPositionsByDate] = useState<Map<string, any[]>>(new Map());
  const [showStopReasonDialog, setShowStopReasonDialog] = useState(false);
  const [stopReason, setStopReason] = useState('');
  const [attendanceType, setAttendanceType] = useState<'check-in' | 'check-out' | null>(null);
  const [faceVerificationAttempts, setFaceVerificationAttempts] = useState(0);
  const [attendanceFailureAttempts, setAttendanceFailureAttempts] = useState(0);
  const [showOverrideReasonDialog, setShowOverrideReasonDialog] = useState(false);
  const [pendingOverrideData, setPendingOverrideData] = useState<{
    userId: string;
    today: string;
    timestamp: string;
    freshLocation: { latitude: number; longitude: number };
    photoPath: string;
    matchStatus: string;
    confidence: number;
  } | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>({
    isProcessing: false,
    currentStep: null,
    stepMessage: ''
  });
  const { compareImages, getMatchStatusIcon, getMatchStatusText } = useFaceMatching();
  const { isVanSalesEnabled } = useVanSales();

  // Regularization request states - use cached data
  const [regularizationRequests, setRegularizationRequests] = useState<Map<string, any>>(new Map());
  const [showRegularizationModal, setShowRegularizationModal] = useState(false);
  const [selectedRecordForRegularization, setSelectedRecordForRegularization] = useState<any>(null);

  // GPS Tracking for today - using optimized hook with React Query caching
  const today = new Date();
  const { 
    isTracking, 
    positions, 
    startTracking, 
    stopTracking, 
    isWithinWorkingHours,
    loadPositionsForDate 
  } = useGPSTrackingOptimized(userProfile?.id, today);

  // Load GPS positions for a specific date - uses cached data from optimized hook
  const loadGPSPositionsForDate = async (date: string) => {
    // Check local cache first
    if (gpsPositionsByDate.has(date)) return gpsPositionsByDate.get(date);

    try {
      // Use the optimized hook's method which has deduplication and caching
      const positions = await loadPositionsForDate(date);
      
      // Update local state for backward compatibility with JourneyMap
      setGpsPositionsByDate(prev => new Map(prev.set(date, positions)));
      return positions;
    } catch (error) {
      console.error('Error loading GPS positions:', error);
      return [];
    }
  };

  const handleStopTracking = async () => {
    // Check if stopping during working hours
    if (isWithinWorkingHours()) {
      setShowStopReasonDialog(true);
    } else {
      stopTracking();
    }
  };

  const confirmStopTracking = async () => {
    if (!stopReason) {
      toast({ title: 'Please select a reason', variant: 'destructive' });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('gps_tracking_stops').insert({
          user_id: user.id,
          reason: stopReason,
          date: format(new Date(), 'yyyy-MM-dd'),
        });
      }
      stopTracking();
      setShowStopReasonDialog(false);
      setStopReason('');
    } catch (error) {
      console.error('Error saving stop reason:', error);
      toast({ title: 'Failed to save stop reason', variant: 'destructive' });
    }
  };

  // Sync cached data to local state when cache updates
  // This runs AFTER initial render with cached data, updating only if data changed
  useEffect(() => {
    // Sync attendance records from cache (runs on any update)
    if (cachedAttendanceRecords.length > 0 || !isLoadingAttendance) {
      const records = cachedAttendanceRecords.length > 0 ? cachedAttendanceRecords : [];
      const presentDaysCount = records.filter((r: any) => r.status === 'present' && !holidayDates.has(r.date)).length;
      const presentDates = records.filter((r: any) => r.status === 'present' && !holidayDates.has(r.date)).map((r: any) => r.date);
      const presentDatesSet = new Set(presentDates);
      
      // Calculate absent dates using working days config
      const workingDays = totalWorkingDays > 0 ? totalWorkingDays : 20;
      const absentDates = elapsedWorkingDates.filter(date => !presentDatesSet.has(date));
      const absentDays = absentDates.length;
      const attendancePercentage = workingDays > 0 ? Math.round((presentDaysCount / workingDays) * 100) : 0;

      // Update stats
      setStats({
        totalDays: workingDays,
        presentDays: presentDaysCount,
        absentDays,
        attendance: attendancePercentage
      });

      setPresentDatesList(presentDates.sort());
      setAbsentDatesList(absentDates.sort());

      // Merge attendance records with absent day placeholders
      const absentRecords = absentDates.map(date => ({
        id: `absent-${date}`,
        date,
        status: 'absent',
        check_in_time: null,
        check_out_time: null,
        total_hours: null,
        face_match_confidence: null,
        isAbsentPlaceholder: true
      }));
      
      const mergedRecords = [...records, ...absentRecords]
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setAttendanceData(mergedRecords);
    }

    // Sync today's data
    setTodaysAttendance(cachedTodaysAttendance);
    setTodaysVisits(cachedTodaysVisits);
    setActiveMarketHours(cachedActiveMarketHours);
    setRegularizationRequests(cachedRegularizationRequests);
  }, [
    cachedAttendanceRecords, 
    cachedTodaysAttendance, 
    cachedTodaysVisits, 
    cachedActiveMarketHours,
    cachedRegularizationRequests,
    elapsedWorkingDates,
    totalWorkingDays,
    isLoadingAttendance,
    holidayDates
  ]);

  // Only fetch location on mount - GPS is only needed for check-in/out actions
  useEffect(() => {
    // Don't auto-fetch location on page load - wait until user initiates check-in/out
    // This saves battery and reduces permission prompts
  }, []);

  const handleOpenRegularizationModal = (record: any) => {
    setSelectedRecordForRegularization(record);
    setShowRegularizationModal(true);
  };

  const handleRegularizationSubmitted = () => {
    // Use cached data refresh instead of direct network call
    forceRefresh();
  };

  const getCurrentLocation = async () => {
    // Request location permission first
    try {
      const granted = await requestLocationPermission();
      
      if (!granted) {
        toast({
          title: "Location Permission Required",
          description: "Please allow location access for attendance check-in and GPS tracking.",
          variant: "destructive"
        });
        return;
      }
    } catch (error) {
      console.error('Error requesting location permission:', error);
    }
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          console.error('Error getting location:', error);
          toast({
            title: "Location Error",
            description: "Could not get your location. Please enable GPS and grant location permission.",
            variant: "destructive"
          });
        },
        { 
          enableHighAccuracy: true, // Use GPS for precise location
          timeout: 30000, // Wait up to 30 seconds
          maximumAge: 0 // Don't use cached location
        }
      );
    }
  };

  const getDateRange = () => {
    const now = new Date();
    let startDate, endDate;

    startDate = startOfMonth(selectedMonth);
    endDate = endOfMonth(selectedMonth);

    return {
      start: format(startDate, 'yyyy-MM-dd'),
      end: format(endDate, 'yyyy-MM-dd')
    };
  };

  // REMOVED: Old fetchAttendanceData and fetchTodaysVisits functions
  // These are now handled by useAttendanceCache hook which provides:
  // - Instant loading from offline cache
  // - Background network sync when online
  // - 5-minute stale time to prevent unnecessary network calls

  const handleCameraCapture = async (photoBlob: Blob) => {
    if (!attendanceType) return;

    // Start processing state
    setProcessingState({
      isProcessing: true,
      currentStep: 'location',
      stepMessage: 'Getting your location...'
    });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Get user's profile picture for face verification
      const { data: profile } = await supabase
        .from('profiles')
        .select('profile_picture_url')
        .eq('id', user.id)
        .single();

      if (!profile?.profile_picture_url) {
        setProcessingState({ isProcessing: false, currentStep: null, stepMessage: '' });
        toast({
          title: "Profile Picture Required",
          description: "Please upload your profile picture first in your profile settings.",
          variant: "destructive"
        });
        return;
      }

      // Get fresh high-accuracy location
      const freshLocation = await new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation not supported'));
          return;
        }
        
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            });
          },
          (error) => {
            reject(error);
          },
          { 
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 0
          }
        );
      });

      // Update to photo upload step
      setProcessingState({
        isProcessing: true,
        currentStep: 'photo',
        stepMessage: 'Uploading photo...'
      });

      const today = getLocalTodayDate();
      const timestamp = new Date().toISOString();

      // Upload photo - path must start with user.id for RLS policy
      const photoPath = `${user.id}/attendance/${today}_${attendanceType}_${Date.now()}.jpg`;
      console.log('Uploading photo to path:', photoPath);
      
      const { error: uploadError } = await supabase.storage
        .from('attendance-photos')
        .upload(photoPath, photoBlob);

      if (uploadError) {
        console.error('Photo upload error:', uploadError);
        throw uploadError;
      }
      
      console.log('Photo uploaded successfully');

      // Create signed URLs for face matching (buckets are private)
      const [attendanceSignedUrl, baselineSignedUrl] = await Promise.all([
        getSignedStorageUrl(photoPath, 'attendance-photos', 300),
        getSignedStorageUrl(profile.profile_picture_url),
      ]);

      // Update to face verification step
      setProcessingState({
        isProcessing: true,
        currentStep: 'face',
        stepMessage: 'Verifying face match...'
      });

      // Perform SERVER-SIDE face matching for security
      const { data: faceMatchResult, error: faceMatchError } = await supabase.functions.invoke(
        'verify-face-match',
        {
          body: {
            baselinePhotoUrl: baselineSignedUrl,
            attendancePhotoUrl: attendanceSignedUrl
          }
        }
      );

      // Handle face match error - check if it's a credit/payment error
      const isCreditError = faceMatchError?.message?.includes('402') || 
                            faceMatchError?.message?.includes('credit') ||
                            faceMatchError?.message?.includes('payment');
      
      const confidence = faceMatchError ? 0 : (faceMatchResult?.confidence || 0);
      const matchStatus = confidence >= 70 ? 'match' : confidence >= 50 ? 'partial' : 'nomatch';
      
      if (faceMatchError) {
        console.error('Face verification error:', faceMatchError);
      }
      
      // If credit/service error, bypass verification completely and proceed with attendance
      if (isCreditError || faceMatchError) {
        console.log('Face verification service unavailable, bypassing verification...');
        toast({
          title: "Face Verification Unavailable ⚠️",
          description: "Face photo captured. Verification service unavailable, proceeding with attendance.",
          variant: "default"
        });
        setFaceVerificationAttempts(0);
        // Continue to record attendance below without blocking
      } else if (confidence < 50) {
        const newAttemptCount = faceVerificationAttempts + 1;
        setFaceVerificationAttempts(newAttemptCount);
        setProcessingState({ isProcessing: false, currentStep: null, stepMessage: '' });
        
        if (newAttemptCount < 2) {
          // First attempt failed - ask to retry
          toast({
            title: `Face Verification Failed (Attempt ${newAttemptCount}/1) ❌`,
            description: `Match confidence ${Math.round(confidence)}% is below 50%. Please try again with better lighting.`,
            variant: "destructive"
          });
          setShowCamera(false);
          setAttendanceType(null);
          setIsMarkingAttendance(false);
          return; // Do NOT record attendance, user can retry
        } else {
          // 2nd attempt - allow with warning
          toast({
            title: "Face Verification Bypassed ⚠️",
            description: `After 1 failed attempt, attendance is allowed. Please update your profile photo if this persists.`,
            variant: "default"
          });
          setFaceVerificationAttempts(0);
          // Continue to record attendance below
        }
      } else {
        // Successful match - reset attempts counter
        setFaceVerificationAttempts(0);
        
        const statusMessage = confidence >= 70 
          ? 'Face Match Verified ✅' 
          : 'Partial Face Match ⚠️ (Above 50% threshold)';
        
        toast({
          title: statusMessage,
          description: `Match Confidence: ${Math.round(confidence)}%`,
          variant: 'default',
        });
      }

      // Update to saving step
      setProcessingState({
        isProcessing: true,
        currentStep: 'saving',
        stepMessage: attendanceType === 'check-in' ? 'Recording attendance & starting day...' : 'Recording check-out & ending day...'
      });

      if (attendanceType === 'check-in') {
        console.log('Starting check-in process...');
        
        // Check if attendance already exists for today (unique constraint: user_id + date)
        const { data: existingAttendance } = await supabase
          .from('attendance')
          .select('id')
          .eq('user_id', user.id)
          .eq('date', today)
          .maybeSingle();

        if (existingAttendance) {
          console.log('Attendance already marked for today, skipping insert');
          toast({
            title: "Already Checked In",
            description: "Your attendance for today has already been recorded.",
          });
          setShowCamera(false);
          setAttendanceType(null);
          setIsMarkingAttendance(false);
          setProcessingState({ isProcessing: false, currentStep: null, stepMessage: '' });
          await refreshTodayOnly();
          return;
        }

        // Mark attendance with face verification result
        const { error: attendanceError } = await supabase
          .from('attendance')
          .insert({
            user_id: user.id,
            date: today,
            check_in_time: timestamp,
            check_in_location: freshLocation,
            check_in_address: `${freshLocation.latitude}, ${freshLocation.longitude}`,
            check_in_photo_url: photoPath,
            status: 'present',
            face_verification_status: matchStatus,
            face_match_confidence: confidence
          });

        const isOfflineInsertError = !!attendanceError && shouldSuppressError(attendanceError);

        if (attendanceError && !isOfflineInsertError) {
          console.error('Attendance insert error:', JSON.stringify(attendanceError));
          throw new Error(attendanceError.message || 'Failed to insert attendance record');
        }
        
        console.log(isOfflineInsertError 
          ? 'Attendance cached locally due to offline mode'
          : 'Attendance marked successfully');

        // Cache attendance for offline access (works for both online and offline insert flows)
        try {
          await offlineStorage.init();
          await offlineStorage.save(STORES.ATTENDANCE, {
            id: `${user.id}_${today}`, // Unique ID for offline
            user_id: user.id,
            date: today,
            cached_at: timestamp
          });
          console.log('[Attendance] ✅ Cached attendance record for offline access');
        } catch (cacheError) {
          console.error('[Attendance] Failed to cache attendance (non-critical):', cacheError);
          // Don't throw - caching failure shouldn't block attendance marking
        }

        // IMPORTANT: Attendance should NOT modify visit statuses or check-in/out times.
        // It only records attendance; visit lifecycle is handled from My Visits / Visit Card.
        // (Previously this updated all planned visits to in-progress, which broke No-Order counts.)
        // No-op by design.

        // Update to complete step
        setProcessingState({
          isProcessing: true,
          currentStep: 'complete',
          stepMessage: 'Day started successfully!'
        });

        // Close camera modal
        setShowCamera(false);
        setAttendanceType(null);
        setIsMarkingAttendance(false);

        // Refresh attendance data using cached hooks
        await refreshTodayOnly();

        // Reset processing state
        setProcessingState({ isProcessing: false, currentStep: null, stepMessage: '' });

        // Start GPS tracking immediately after check-in
        toast({
          title: "Success",
          description: "Day started successfully! GPS tracking is now active.",
        });
        
        console.log('Starting GPS tracking...');
        setTimeout(() => {
          startTracking();
        }, 500);

      } else if (attendanceType === 'check-out') {
        console.log('Starting check-out process...');
        
        // Update attendance record with check-out time
        const { error: checkoutError } = await supabase
          .from('attendance')
          .update({
            check_out_time: timestamp,
            check_out_location: freshLocation,
            check_out_address: `${freshLocation.latitude}, ${freshLocation.longitude}`,
            check_out_photo_url: photoPath,
            face_verification_status_out: matchStatus,
            face_match_confidence_out: confidence
          })
          .eq('user_id', user.id)
          .eq('date', today);

        if (checkoutError) {
          console.error('Check-out update error:', checkoutError);
          throw checkoutError;
        }
        
        console.log('Check-out recorded successfully');

        // Mark all remaining planned visits as cancelled
        const { error: cancelError } = await supabase
          .from('visits')
          .update({ 
            status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('planned_date', today)
          .eq('status', 'planned');
        
        if (cancelError) {
          console.error('Error cancelling planned visits:', cancelError);
        } else {
          console.log('Remaining planned visits cancelled');
        }

        // Auto-checkout all in-progress visits using their last activity time
        const { data: inProgressVisits } = await supabase
          .from('visits')
          .select('id, updated_at')
          .eq('user_id', user.id)
          .eq('planned_date', today)
          .eq('status', 'in-progress');

        if (inProgressVisits && inProgressVisits.length > 0) {
          for (const visit of inProgressVisits) {
            // Use visit's updated_at as last activity time, fallback to current time
            const checkOutTime = visit.updated_at || timestamp;
            
            await supabase
              .from('visits')
              .update({
                check_out_time: checkOutTime,
                check_out_location: freshLocation,
                check_out_address: `${freshLocation.latitude}, ${freshLocation.longitude}`,
                status: 'unproductive',
                updated_at: new Date().toISOString()
              })
              .eq('id', visit.id);
          }
          console.log(`Auto checked-out ${inProgressVisits.length} in-progress visits`);
        }

        // Close all active retailer visit logs
        const { data: activeLogs } = await supabase
          .from('retailer_visit_logs')
          .select('id, start_time, updated_at')
          .eq('user_id', user.id)
          .eq('visit_date', today)
          .is('end_time', null);

        if (activeLogs && activeLogs.length > 0) {
          for (const log of activeLogs) {
            // Use updated_at as last activity time, fallback to current time
            const endTime = log.updated_at || timestamp;
            const startTimeMs = new Date(log.start_time).getTime();
            const endTimeMs = new Date(endTime).getTime();
            const timeSpentSeconds = Math.floor((endTimeMs - startTimeMs) / 1000);

            await supabase
              .from('retailer_visit_logs')
              .update({
                end_time: endTime,
                time_spent_seconds: Math.max(0, timeSpentSeconds)
              })
              .eq('id', log.id);
          }
          console.log(`Closed ${activeLogs.length} active retailer visit logs`);
        }

        // Update to complete step
        setProcessingState({
          isProcessing: true,
          currentStep: 'complete',
          stepMessage: 'Day ended successfully!'
        });

        // Close camera modal
        setShowCamera(false);
        setAttendanceType(null);
        setIsMarkingAttendance(false);

        // Refresh attendance data using cached hooks
        await refreshTodayOnly();

        // Reset processing state
        setProcessingState({ isProcessing: false, currentStep: null, stepMessage: '' });

        // Stop GPS tracking after successful check-out
        console.log('Stopping GPS tracking...');
        stopTracking();

        toast({
          title: "Success",
          description: "Day ended successfully! GPS tracking stopped.",
        });
      }

    } catch (error) {
      console.error('Error marking attendance:', error instanceof Error ? error.message : JSON.stringify(error));
      setProcessingState({ isProcessing: false, currentStep: null, stepMessage: '' });
      
      // Track attendance failure attempts for check-in only
      if (attendanceType === 'check-in') {
        const newFailureCount = attendanceFailureAttempts + 1;
        setAttendanceFailureAttempts(newFailureCount);
        
        if (newFailureCount >= 2) {
          // After 2 failures, show override reason dialog
          // Cache pending data from the last attempt context
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          if (currentUser) {
            const todayDate = getLocalTodayDate();
            setPendingOverrideData({
              userId: currentUser.id,
              today: todayDate,
              timestamp: new Date().toISOString(),
              freshLocation: location || { latitude: 0, longitude: 0 },
              photoPath: '',
              matchStatus: 'override',
              confidence: 0
            });
            setShowOverrideReasonDialog(true);
          }
          toast({
            title: "Multiple Failures Detected",
            description: "Please provide a reason to manually mark your attendance.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Error",
            description: `Failed to mark check-in (Attempt ${newFailureCount}/2). Please try again.`,
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: "Error",
          description: `Failed to mark ${attendanceType}. Please try again.`,
          variant: "destructive"
        });
      }
      
      // Reset states on error
      setShowCamera(false);
      setAttendanceType(null);
      setIsMarkingAttendance(false);
    }
  };

  const markAttendance = async (type: 'check-in' | 'check-out') => {
    // For check-out (End My Day), validate closing GRN if van sales is enabled
    if (type === 'check-out' && isVanSalesEnabled) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const todayDate = new Date().toISOString().split('T')[0];
          
          // Check if closing GRN is verified for today
          const { data: vanStock } = await supabase
            .from('van_stock')
            .select('id, status')
            .eq('user_id', user.id)
            .eq('stock_date', todayDate)
            .maybeSingle();
          
          // If van stock exists for today but closing GRN is not verified
          if (vanStock && vanStock.status !== 'closing_verified') {
            toast({
              title: "Closing GRN Required",
              description: "Please save your Closing GRN in Van Stock before ending your day.",
              variant: "destructive"
            });
            setIsMarkingAttendance(false);
            return;
          }
          
          // If morning GRN was saved but no closing GRN
          if (vanStock && vanStock.status === 'morning_saved') {
            toast({
              title: "Closing GRN Required",
              description: "You have saved Morning GRN. Please save Closing GRN before ending your day.",
              variant: "destructive"
            });
            setIsMarkingAttendance(false);
            return;
          }
        }
      } catch (error) {
        console.error('Error checking closing GRN status:', error);
        // Don't block if there's an error checking - allow checkout to proceed
      }
    }
    
    setIsMarkingAttendance(true);
    setAttendanceType(type);
    setShowCamera(true);
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return '--:--';
    return new Date(timeString).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const fetchVisitsForDate = async (date: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if this date has a joint sales visit
      const { data: beatPlan } = await supabase
        .from('beat_plans')
        .select('id, joint_sales_manager_id')
        .eq('user_id', user.id)
        .eq('plan_date', date)
        .maybeSingle();

      const hasJointSales = !!beatPlan?.joint_sales_manager_id;
      let jointSalesFeedbackMap = new Map<string, boolean>();
      
      if (hasJointSales && beatPlan?.id) {
        // Check which retailers have joint sales feedback
        const { data: feedbacks } = await supabase
          .from('joint_sales_feedback')
          .select('retailer_id')
          .eq('beat_plan_id', beatPlan.id);
        
        feedbacks?.forEach(f => {
          jointSalesFeedbackMap.set(f.retailer_id, true);
        });
      }

      // First get visits with basic info
      const { data: visits, error: visitsError } = await supabase
        .from('visits')
        .select('*')
        .eq('user_id', user.id)
        .eq('planned_date', date)
        .not('check_in_time', 'is', null)
        .order('check_in_time', { ascending: true });

      if (visitsError) throw visitsError;

      if (!visits || visits.length === 0) {
        setSelectedDateVisits([]);
        return;
      }

      // Get retailer names
      const retailerIds = visits.map(v => v.retailer_id).filter(Boolean);
      const { data: retailers } = await supabase
        .from('retailers')
        .select('id, name')
        .in('id', retailerIds);

      const retailerMap = new Map(retailers?.map(r => [r.id, r.name]) || []);

      // Get orders
      const visitIds = visits.map(v => v.id);
      const { data: orders } = await supabase
        .from('orders')
        .select('visit_id, total_amount, id')
        .in('visit_id', visitIds)
        .eq('status', 'confirmed');

      const orderMap = new Map(orders?.map(o => [o.visit_id, o]) || []);

      // Get order items
      const orderIds = orders?.map(o => o.id) || [];
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('order_id, quantity')
        .in('order_id', orderIds);

      const orderItemsMap = new Map<string, number>();
      orderItems?.forEach(item => {
        const current = orderItemsMap.get(item.order_id) || 0;
        orderItemsMap.set(item.order_id, current + item.quantity);
      });

      const formattedVisits = visits.map(visit => {
        const order = orderMap.get(visit.id);
        const hasJointFeedback = jointSalesFeedbackMap.has(visit.retailer_id);
        return {
          id: visit.id,
          retailer_name: retailerMap.get(visit.retailer_id) || 'Unknown',
          check_in_time: visit.check_in_time,
          check_out_time: visit.check_out_time,
          check_in_address: visit.check_in_address,
          status: visit.status,
          order_value: order?.total_amount || 0,
          order_quantity: order ? (orderItemsMap.get(order.id) || 0) : 0,
          is_joint_sales: hasJointSales && hasJointFeedback
        };
      });

      setSelectedDateVisits(formattedVisits);
    } catch (error) {
      console.error('Error fetching visits:', error);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Page Title */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t('attendance.title')}</h1>
            <p className="text-muted-foreground text-sm">{t('attendance.subtitle')}</p>
          </div>

          {/* Segmented Control - only show if manager */}
          {isManager && (
            <div className="sticky top-0 z-10 bg-gradient-subtle pt-1 pb-2">
              <div className="flex bg-[hsl(0,0%,96%)] rounded-full p-1 border border-border/40">
                <button
                  className={cn(
                    'flex-1 text-sm font-semibold py-2.5 rounded-full transition-all',
                    selectedTopTab === 'my-attendance'
                      ? 'bg-[hsl(153,43%,43%)] text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setSelectedTopTab('my-attendance')}
                >
                  My Attendance
                </button>
                <button
                  className={cn(
                    'flex-1 text-sm font-semibold py-2.5 rounded-full transition-all',
                    selectedTopTab === 'my-team'
                      ? 'bg-[hsl(153,43%,43%)] text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setSelectedTopTab('my-team')}
                >
                  My Team
                </button>
              </div>
            </div>
          )}

          {/* My Team Tab Content */}
          {selectedTopTab === 'my-team' && isManager ? (
            <TeamAttendanceTab subordinateIds={subordinateIds} directReportIds={directReportIds} />
          ) : (
          /* My Attendance Tab Content */
          <div className="space-y-5">

            {/* Monthly Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card rounded-2xl p-5 text-center shadow-sm">
                <div className="text-3xl font-bold text-foreground">{stats.attendance}%</div>
                <div className="text-xs font-medium text-muted-foreground mt-1">{t('attendance.thisMonth')}</div>
              </div>
              <div className="bg-card rounded-2xl p-5 text-center shadow-sm">
                <div className="text-3xl font-bold text-foreground">{stats.presentDays}/{stats.totalDays}</div>
                <div className="text-xs font-medium text-muted-foreground mt-1">{t('attendance.presentDays')}</div>
              </div>
            </div>

            {/* Day Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => !todaysAttendance?.check_in_time && markAttendance('check-in')}
                disabled={isMarkingAttendance || !!todaysAttendance?.check_in_time}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-sm font-semibold transition-all border',
                  todaysAttendance?.check_in_time
                    ? 'bg-card text-muted-foreground border-border cursor-default'
                    : 'bg-card text-foreground border-border hover:bg-accent'
                )}
              >
                <CheckCircle className="h-4 w-4 text-[hsl(150,50%,45%)]" />
                {todaysAttendance?.check_in_time ? t('attendance.dayStarted') : isMarkingAttendance ? t('attendance.startingDay') : t('attendance.startMyDay')}
              </button>

              <button
                onClick={() => markAttendance('check-out')}
                disabled={isMarkingAttendance || !todaysAttendance?.check_in_time || !!todaysAttendance?.check_out_time}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-sm font-semibold transition-all',
                  !todaysAttendance?.check_in_time || todaysAttendance?.check_out_time
                    ? 'bg-destructive/10 text-destructive/50 cursor-default opacity-60'
                    : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                )}
              >
                <Clock className="h-4 w-4" />
                {todaysAttendance?.check_out_time ? t('attendance.dayEnded') : isMarkingAttendance ? t('attendance.endingDay') : t('attendance.endMyDay')}
              </button>
            </div>

            {/* Processing Progress Overlay */}
            {processingState.isProcessing && (
              <div className="bg-[hsl(160,30%,95%)] rounded-2xl p-4 shadow-sm">
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-[hsl(160,45%,50%)] border-t-transparent" />
                    <span className="font-medium text-[hsl(160,40%,35%)] text-sm">{processingState.stepMessage}</span>
                  </div>
                  <div className="flex justify-center gap-2">
                    {(['location', 'photo', 'face', 'saving', 'complete'] as ProcessingStep[]).map((step, index) => {
                      const steps: ProcessingStep[] = ['location', 'photo', 'face', 'saving', 'complete'];
                      const currentIndex = processingState.currentStep ? steps.indexOf(processingState.currentStep) : -1;
                      const stepIndex = steps.indexOf(step);
                      const isCompleted = stepIndex < currentIndex;
                      const isCurrent = stepIndex === currentIndex;
                      return (
                        <div key={step} className="flex items-center">
                          <div className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all",
                            isCompleted && "bg-[hsl(150,45%,50%)] text-white",
                            isCurrent && "bg-[hsl(160,45%,45%)] text-white animate-pulse",
                            !isCompleted && !isCurrent && "bg-[hsl(210,15%,90%)] text-[hsl(210,10%,55%)]"
                          )}>
                            {isCompleted ? <CheckCircle className="h-3.5 w-3.5" /> : index + 1}
                          </div>
                          {index < 4 && <div className={cn("w-5 h-0.5 mx-0.5", isCompleted ? "bg-[hsl(150,45%,50%)]" : "bg-[hsl(210,15%,88%)]")} />}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                    <span className="w-10 text-center">{t('attendance.stepLocation')}</span>
                    <span className="w-10 text-center">{t('attendance.stepPhoto')}</span>
                    <span className="w-10 text-center">{t('attendance.stepFace')}</span>
                    <span className="w-10 text-center">{t('attendance.stepSave')}</span>
                    <span className="w-10 text-center">{t('attendance.stepDone')}</span>
                  </div>
                </div>
              </div>
            )}

            {/* GPS Info Text */}
            {todaysAttendance && !todaysAttendance.check_out_time ? (
              <div className="flex justify-center items-center gap-2 text-xs text-muted-foreground">
                <Navigation2 className={cn("h-3.5 w-3.5", isTracking && "animate-pulse text-[hsl(150,50%,45%)]")} />
                <span>{isTracking ? `🟢 ${t('attendance.gpsTrackingActive')}` : `⚠ ${t('attendance.gpsTrackingWillStart')}`}</span>
              </div>
            ) : (
              <div className="flex justify-center items-center gap-2 text-xs text-muted-foreground">
                <span>⚠ {t('attendance.gpsTrackingWillStart')}</span>
              </div>
            )}

            {/* Stop Reason Dialog */}
            <Dialog open={showStopReasonDialog} onOpenChange={setShowStopReasonDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('attendance.whyStopTracking')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    {['Leave', 'Battery draining out', "Don't want to be tracked", 'Others'].map((reason) => (
                      <Button
                        key={reason}
                        variant={stopReason === reason ? "default" : "outline"}
                        className="w-full justify-start"
                        onClick={() => setStopReason(reason)}
                      >
                        {reason}
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setShowStopReasonDialog(false)}>
                      Cancel
                    </Button>
                    <Button className="flex-1" onClick={confirmStopTracking}>
                      Confirm Stop
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Calendar View with Present/Absent Summary */}
            <div className="bg-background rounded-2xl p-4 shadow-sm space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="bg-[hsl(150,35%,93%)] rounded-xl p-2.5 text-center cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setShowPresentDaysDialog(true)}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-[hsl(150,50%,45%)]" />
                    <span className="text-lg font-bold text-[hsl(150,45%,30%)]">{stats.presentDays}</span>
                  </div>
                  <div className="text-[11px] font-medium text-[hsl(150,35%,40%)]">{t('attendance.presentDays')}</div>
                </div>
                <div
                  className="bg-[hsl(0,40%,95%)] rounded-xl p-2.5 text-center cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setShowAbsentDaysDialog(true)}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <XCircle className="h-4 w-4 text-[hsl(0,50%,55%)]" />
                    <span className="text-lg font-bold text-[hsl(0,45%,35%)]">{stats.absentDays}</span>
                  </div>
                  <div className="text-[11px] font-medium text-[hsl(0,35%,45%)]">{t('attendance.absentDays')}</div>
                </div>
              </div>
              <AttendanceCalendarView
                attendanceRecords={cachedAttendanceRecords}
                leaveRecords={userLeaveRecords}
                weekOffConfig={weekOffConfig}
                holidayDates={holidayDates}
                currentMonth={calendarMonth}
                onMonthChange={setCalendarMonth}
              />
            </div>

            {/* Present Days Dialog */}
            <Dialog open={showPresentDaysDialog} onOpenChange={setShowPresentDaysDialog}>
              <DialogContent className="max-w-md max-h-[70vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-[hsl(150,50%,45%)]" />
                    Present Days ({presentDatesList.length})
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-2 mt-4">
                  {presentDatesList.length > 0 ? (
                    presentDatesList.map((date) => (
                      <div key={date} className="flex items-center gap-3 p-3 bg-[hsl(150,35%,94%)] rounded-xl">
                        <CheckCircle className="h-4 w-4 text-[hsl(150,50%,45%)]" />
                        <span className="font-medium text-sm">{format(new Date(date), 'EEE, MMM dd, yyyy')}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-muted-foreground py-4">No present days recorded</div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Absent Days Dialog */}
            <Dialog open={showAbsentDaysDialog} onOpenChange={setShowAbsentDaysDialog}>
              <DialogContent className="max-w-md max-h-[70vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-[hsl(0,50%,55%)]" />
                    Absent Days ({absentDatesList.length})
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-2 mt-4">
                  {absentDatesList.length > 0 ? (
                    absentDatesList.map((date) => (
                      <div key={date} className="flex items-center gap-3 p-3 bg-[hsl(0,40%,95%)] rounded-xl">
                        <XCircle className="h-4 w-4 text-[hsl(0,50%,55%)]" />
                        <span className="font-medium text-sm">{format(new Date(date), 'EEE, MMM dd, yyyy')}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-muted-foreground py-4">No absent days recorded</div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

          {/* Market Hours Module */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                {t('attendance.todaysMarketHours')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* First Check In - Start My Day */}
                {todaysAttendance?.check_in_time ? (
                  <div className="bg-green-100 dark:bg-green-900 p-4 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="text-center">
                      <CheckCircle className="h-5 w-5 mx-auto mb-2 text-green-600" />
                      <div className="font-semibold text-green-800 dark:text-green-200 text-sm">{t('attendance.firstCheckIn')}</div>
                      <div className="text-sm text-green-600 dark:text-green-400 mt-1">
                        {format(new Date(todaysAttendance.check_in_time), 'hh:mm a')}
                      </div>
                      <div className="text-xs text-green-500 mt-1">
                        {todaysVisits.length === 0 ? t('attendance.noVisitsToday') : `${todaysVisits.length} visit${todaysVisits.length === 1 ? '' : 's'} today`}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg border">
                    <div className="text-center text-gray-500 dark:text-gray-400">
                      <CheckCircle className="h-5 w-5 mx-auto mb-2" />
                      <div className="font-semibold text-sm">{t('attendance.firstCheckIn')}</div>
                      <div className="text-xs mt-1">{t('attendance.notStarted')}</div>
                    </div>
                  </div>
                )}

                {/* Active Market Hours - Only show after check-out */}
                <div className={`p-4 rounded-lg border ${
                  todaysAttendance?.check_out_time
                    ? 'bg-blue-100 dark:bg-blue-900 border-blue-200 dark:border-blue-800' 
                    : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}>
                  <div className="text-center">
                    <Clock className={`h-5 w-5 mx-auto mb-2 ${todaysAttendance?.check_out_time ? 'text-blue-600' : 'text-gray-500'}`} />
                    <div className={`font-semibold text-sm ${todaysAttendance?.check_out_time ? 'text-blue-800 dark:text-blue-200' : 'text-gray-500 dark:text-gray-400'}`}>
                      Active Market Hours
                    </div>
                    <div className={`text-sm mt-1 ${todaysAttendance?.check_out_time ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
                      {todaysAttendance?.check_in_time && todaysAttendance?.check_out_time ? (
                        (() => {
                          const checkIn = new Date(todaysAttendance.check_in_time);
                          const checkOut = new Date(todaysAttendance.check_out_time);
                          const diffMs = checkOut.getTime() - checkIn.getTime();
                          const hours = Math.floor(diffMs / (1000 * 60 * 60));
                          const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                          return `${hours}h ${minutes}m`;
                        })()
                      ) : '--:--'}
                    </div>
                  </div>
                </div>

                {/* Last Check Out - End My Day */}
                {todaysAttendance?.check_out_time ? (
                  <div className="bg-orange-100 dark:bg-orange-900 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
                    <div className="text-center">
                      <LogOut className="h-5 w-5 mx-auto mb-2 text-orange-600" />
                      <div className="font-semibold text-orange-800 dark:text-orange-200 text-sm">{t('attendance.lastCheckOut')}</div>
                      <div className="text-sm text-orange-600 dark:text-orange-400 mt-1">
                        {format(new Date(todaysAttendance.check_out_time), 'hh:mm a')}
                      </div>
                      <div className="text-xs text-orange-500 mt-1">
                        {todaysVisits.length === 0 ? t('attendance.noVisitsToday') : `${todaysVisits.length} visit${todaysVisits.length === 1 ? '' : 's'} today`}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg border">
                    <div className="text-center text-gray-500 dark:text-gray-400">
                      <LogOut className="h-5 w-5 mx-auto mb-2" />
                      <div className="font-semibold text-sm">{t('attendance.lastCheckOut')}</div>
                      <div className="text-xs mt-1">{t('attendance.notEnded')}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-sm text-muted-foreground text-center mt-4">
                Market hours are automatically tracked from your visit check-ins
              </div>
            </CardContent>
          </Card>

          {/* Tabs for different sections */}
          <Tabs defaultValue="attendance" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="attendance">{t('attendance.myAttendance')}</TabsTrigger>
              <TabsTrigger value="leave">{t('attendance.leave')}</TabsTrigger>
              <TabsTrigger value="holiday">{t('attendance.holiday')}</TabsTrigger>
            </TabsList>

            <TabsContent value="attendance" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>{t('attendance.recentAttendance')}</CardTitle>
                   <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedMonth(m => subMonths(m, 1))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium min-w-[100px] text-center">
                      {format(selectedMonth, 'MMM yyyy')}
                    </span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8" 
                      onClick={() => setSelectedMonth(m => addMonths(m, 1))}
                      disabled={isSameMonth(selectedMonth, new Date())}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {attendanceData.length > 0 ? (
                      attendanceData.slice(0, 15).map((record) => {
                        const recordDate = format(new Date(record.date), 'yyyy-MM-dd');
                        const isAbsent = record.status === 'absent' || record.isAbsentPlaceholder;
                        const isRegularized = record.status === 'regularized';
                        const existingRequest = regularizationRequests.get(recordDate);
                        const hasPendingRequest = existingRequest?.status === 'pending';
                        const hasApprovedRequest = existingRequest?.status === 'approved';
                        const hasRejectedRequest = existingRequest?.status === 'rejected';
                        
                        // Always show regularization button for any record
                        // Users can submit multiple requests or corrections as needed
                        const showRegularizationButton = true;
                        
                        return (
                          <div 
                            key={record.id} 
                            className={cn(
                              "flex flex-col gap-3 p-4 border rounded-lg hover:shadow-md transition-all",
                              isAbsent && "bg-red-50/50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
                              isRegularized && "bg-purple-50/50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                {isAbsent ? (
                                  <XCircle className="h-5 w-5 text-red-600" />
                                ) : isRegularized ? (
                                  <CheckCircle className="h-5 w-5 text-purple-600" />
                                ) : (
                                  <CheckCircle className="h-5 w-5 text-green-600" />
                                )}
                                <div className="flex-1">
                                  <div className="font-medium">
                                    {format(new Date(record.date), 'EEE, MMM dd, yyyy')}
                                  </div>
                                  {isAbsent ? (
                                    <div className="text-sm text-red-600 dark:text-red-400">
                                      Absent - No attendance recorded
                                    </div>
                                  ) : (
                                    <>
                                      <div className="text-sm text-muted-foreground">
                                        In: {formatTime(record.check_in_time)} | Out: {formatTime(record.check_out_time)}
                                      </div>
                                      {record.total_hours && (
                                        <div className="text-xs text-blue-600">
                                          Total: {record.total_hours.toFixed(1)} hours
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                                
                                {/* Status Badges */}
                                <div className="flex flex-col gap-1 items-end">
                                  {!isAbsent && record.face_match_confidence !== null && (
                                    <Badge 
                                      variant={
                                        record.face_match_confidence >= 70 ? 'default' : 
                                        record.face_match_confidence >= 40 ? 'secondary' : 
                                        'destructive'
                                      }
                                      className={cn(
                                        record.face_match_confidence >= 70 && "bg-green-500 hover:bg-green-600",
                                        record.face_match_confidence >= 40 && record.face_match_confidence < 70 && "bg-amber-500 hover:bg-amber-600"
                                      )}
                                    >
                                      {record.face_match_confidence >= 70 ? '✅' : 
                                       record.face_match_confidence >= 40 ? '⚠️' : '❌'}
                                      {' '}
                                      {Math.round(record.face_match_confidence)}%
                                    </Badge>
                                  )}
                                  
                                  {isAbsent && !hasPendingRequest && !hasRejectedRequest && (
                                    <Badge variant="destructive">{t('attendance.absent')}</Badge>
                                  )}
                                  
                                  {isRegularized && (
                                    <Badge className="bg-purple-500 hover:bg-purple-600">{t('attendance.regularized')}</Badge>
                                  )}
                                  
                                  {hasPendingRequest && (
                                    <Badge className="bg-yellow-500 hover:bg-yellow-600">{t('attendance.pendingApproval')}</Badge>
                                  )}
                                  
                                  {hasRejectedRequest && (
                                    <Badge variant="destructive" className="text-xs">
                                      {t('attendance.rejectedResubmit')}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap gap-2">
                              {/* Regularization Button */}
                              {showRegularizationButton && (
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 border-orange-300 text-orange-700 hover:bg-orange-50"
                                  onClick={() => handleOpenRegularizationModal(record)}
                                  title={hasRejectedRequest ? 'Resubmit Regularization' : 'Request Regularization'}
                                >
                                  <Edit3 className="h-4 w-4" />
                                </Button>
                              )}
                              
                              {/* Other action buttons - Only show for present/regularized days */}
                              {!isAbsent && (
                                <>
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-8 w-8"
                                        onClick={async () => {
                                          setSelectedDateForMap(new Date(record.date));
                                          await loadGPSPositionsForDate(recordDate);
                                        }}
                                        title={t('attendance.travelHeatMap')}
                                      >
                                        <Route className="h-4 w-4" />
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
                                      <DialogHeader>
                                        <div className="flex items-center justify-between">
                                          <DialogTitle>
                                            Journey Heat Map - {format(new Date(record.date), 'MMM dd, yyyy')}
                                          </DialogTitle>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              const userId = effectiveUserId || user?.id;
                                              navigate(`/gps-track?date=${recordDate}&userId=${userId}`);
                                            }}
                                          >
                                            <Navigation2 className="h-4 w-4 mr-2" />
                                            Open in GPS Track
                                          </Button>
                                        </div>
                                      </DialogHeader>
                                      <div className="mt-4">
                                        <JourneyMap 
                                          positions={gpsPositionsByDate.get(recordDate) || []} 
                                          height="500px"
                                        />
                                      </div>
                                    </DialogContent>
                                  </Dialog>

                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      navigate(`/visits/retailers?date=${recordDate}&timeline=true`);
                                    }}
                                    title={t('visits.timelineView')}
                                  >
                                    <CalendarDays className="h-4 w-4" />
                                  </Button>

                                  <Button
                                    size="icon"
                                    variant={record.status === 'present' || isRegularized ? 'default' : 'destructive'}
                                    className="h-8 w-8"
                                    onClick={() => navigate(`/today-summary?date=${recordDate}`)}
                                    title={t('attendance.productivityReport')}
                                  >
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                        <p>{t('attendance.noRecords')}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="leave">
              <div className="space-y-4">
                <LeaveBalanceCards 
                  refreshTrigger={leaveRefreshTrigger}
                  onApplicationSubmitted={() => setLeaveRefreshTrigger(prev => prev + 1)}
                />
                
                <MyLeaveApplications refreshTrigger={leaveRefreshTrigger} />
              </div>
            </TabsContent>

            <TabsContent value="holiday">
              <HolidayList />
            </TabsContent>
          </Tabs>
          </div>
          )}
        </div>
      </div>


      {/* Camera Capture Component */}
      <CameraCapture
        isOpen={showCamera}
        onClose={() => {
          setShowCamera(false);
          setIsMarkingAttendance(false);
          setAttendanceType(null);
        }}
        onCapture={handleCameraCapture}
        title={t('attendance.capturePhotoTitle')}
        description={t('attendance.capturePhotoDesc')}
      />

      {/* Regularization Request Modal */}
      <RegularizationRequestModal
        isOpen={showRegularizationModal}
        onClose={() => {
          setShowRegularizationModal(false);
          setSelectedRecordForRegularization(null);
        }}
        attendanceRecord={selectedRecordForRegularization}
        existingRequest={selectedRecordForRegularization ? regularizationRequests.get(selectedRecordForRegularization.date) : null}
        onSubmit={handleRegularizationSubmitted}
        userId={user?.id || ''}
      />

      {/* Override Reason Dialog - shown after 2 failed attendance attempts */}
      <RejectionReasonDialog
        isOpen={showOverrideReasonDialog}
        onClose={() => setShowOverrideReasonDialog(false)}
        onConfirm={async (reason: string) => {
          if (!pendingOverrideData) return;
          
          const { userId, today, timestamp, freshLocation } = pendingOverrideData;
          
          const { error } = await supabase
            .from('attendance')
            .insert({
              user_id: userId,
              date: today,
              check_in_time: timestamp,
              check_in_location: freshLocation,
              check_in_address: `${freshLocation.latitude}, ${freshLocation.longitude}`,
              status: 'present',
              face_verification_status: 'override',
              face_match_confidence: 0,
              manual_override_reason: reason
            } as any);
          
          if (error) {
            toast({
              title: "Override Failed",
              description: error.message || "Could not force-mark attendance.",
              variant: "destructive"
            });
            throw error;
          }
          
          // Reset counters and state
          setAttendanceFailureAttempts(0);
          setPendingOverrideData(null);
          
          await refreshTodayOnly();
          
          toast({
            title: "Attendance Marked ✅",
            description: "Attendance recorded with manual override reason.",
          });
        }}
        title={t('attendance.overrideReasonTitle')}
        description={t('attendance.overrideReasonDesc')}
      />
    </Layout>
  );
};

export default Attendance;
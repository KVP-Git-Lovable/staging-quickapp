import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useWorkingDaysConfig } from '@/hooks/useWorkingDaysConfig';
import { format, startOfMonth, endOfMonth } from 'date-fns';

export interface TeamMemberProfile {
  id: string;
  full_name: string;
  profile_picture_url: string | null;
  designation: string | null;
  phone_number: string | null;
}

export interface TeamMemberAttendance {
  profile: TeamMemberProfile;
  todayStatus: 'present' | 'absent' | 'on_leave' | 'late' | 'regularized';
  checkInTime: string | null;
  checkOutTime: string | null;
  totalHours: number | null;
  monthlyPresent: number;
  monthlyTotal: number;
}

export interface PendingApproval {
  id: string;
  type: 'leave' | 'regularization';
  userId: string;
  fullName: string;
  profilePictureUrl: string | null;
  designation: string | null;
  date: string;
  endDate?: string;
  reason: string | null;
  leaveTypeName?: string;
  daysRequested?: number | null;
  isHalfDay?: boolean | null;
  halfDayPeriod?: string | null;
  // regularization specific
  requestedCheckIn?: string | null;
  requestedCheckOut?: string | null;
  actualCheckIn?: string | null;
  actualCheckOut?: string | null;
  attendanceDate?: string;
  // approval engine fields
  approvalRequestId?: string;
  currentLevel?: number;
  totalLevels?: number;
  isFinalLevel?: boolean;
  myLevel?: number;
  // processed approval fields
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvedByName?: string | null;
  actionTakenAt?: string | null;
}

export const useTeamAttendance = (
  subordinateIds: string[],
  directReportIds?: string[],
  dateFilter: string = 'current-month',
  dateRangeStart?: string,
  dateRangeEnd?: string,
) => {
  // Compute date boundaries based on filter
  const today = format(new Date(), 'yyyy-MM-dd');
  const targetStart = dateRangeStart || today;
  const targetEnd = dateRangeEnd || today;
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');
  // Use directReportIds for approvals (only immediate reports), fall back to subordinateIds
  const approvalUserIds = directReportIds && directReportIds.length > 0 ? directReportIds : subordinateIds;
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const enabled = subordinateIds.length > 0;

  // 1. Subordinate profiles
  const { data: profiles = [] } = useQuery({
    queryKey: ['team-profiles', subordinateIds],
    queryFn: async () => {
      if (!subordinateIds.length) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, profile_picture_url, designation, phone_number')
        .in('id', subordinateIds);
      if (error) throw error;
      return (data || []) as TeamMemberProfile[];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  // 2. Attendance for the selected date range
  const { data: todayAttendance = [] } = useQuery({
    queryKey: ['team-today-attendance', subordinateIds, targetStart, targetEnd],
    queryFn: async () => {
      if (!subordinateIds.length) return [];
      let query = supabase
        .from('attendance')
        .select('*')
        .in('user_id', subordinateIds);
      if (targetStart === targetEnd) {
        query = query.eq('date', targetStart);
      } else {
        query = query.gte('date', targetStart).lte('date', targetEnd);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    refetchOnMount: 'always' as const,
  });

  // 3. Approved leaves overlapping the selected date range
  const { data: todayLeaves = [] } = useQuery({
    queryKey: ['team-today-leaves', subordinateIds, targetStart, targetEnd],
    queryFn: async () => {
      if (!subordinateIds.length) return [];
      const { data, error } = await supabase
        .from('leave_applications')
        .select('user_id, start_date, end_date')
        .in('user_id', subordinateIds)
        .eq('status', 'approved')
        .lte('start_date', targetEnd)
        .gte('end_date', targetStart);
      if (error) throw error;
      return data || [];
    },
    enabled,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  // 4. Monthly attendance counts
  const { data: monthlyCountsRaw = [] } = useQuery({
    queryKey: ['team-monthly-counts', subordinateIds, monthStart],
    queryFn: async () => {
      if (!subordinateIds.length) return [];
      const { data, error } = await supabase
        .from('attendance')
        .select('user_id, date')
        .in('user_id', subordinateIds)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .in('status', ['present', 'regularized']);
      if (error) throw error;
      return data || [];
    },
    enabled,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  // 5. Pending approvals via approval engine (my turn = current_level matches my step level)
  const { data: pendingStepsData = [] } = useQuery({
    queryKey: ['team-pending-leaves', approvalUserIds, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Try embedded join first, fallback to separate queries if PGRST200
      let steps: any[] = [];
      const { data: joinedSteps, error: joinError } = await supabase
        .from('approval_steps')
        .select(`
          id,
          level,
          approver_id,
          status,
          approval_request_id,
          approval_requests!inner(
            id,
            entity_type,
            entity_id,
            current_level,
            total_levels,
            status,
            requester_id
          )
        `)
        .eq('approver_id', user.id)
        .eq('status', 'pending');

      if (joinError) {
        console.warn('[useTeamAttendance] Join failed, using fallback:', joinError.message);
        // Fallback: fetch separately and merge
        const { data: rawSteps } = await supabase
          .from('approval_steps')
          .select('id, level, approver_id, status, approval_request_id')
          .eq('approver_id', user.id)
          .eq('status', 'pending');
        if (rawSteps && rawSteps.length > 0) {
          const arIds = [...new Set(rawSteps.map((s: any) => s.approval_request_id))];
          const { data: arData } = await supabase
            .from('approval_requests')
            .select('id, entity_type, entity_id, current_level, total_levels, status, requester_id')
            .in('id', arIds);
          const arMap = new Map((arData || []).map((ar: any) => [ar.id, ar]));
          steps = rawSteps.map((s: any) => ({
            ...s,
            approval_requests: arMap.get(s.approval_request_id) || null,
          })).filter((s: any) => s.approval_requests);
        }
      } else {
        steps = joinedSteps || [];
      }

      // Parallel: show all pending steps for pending requests
      const myTurnSteps = (steps || []).filter((s: any) =>
        s.approval_requests?.status === 'pending' &&
        ['leave', 'regularization'].includes(s.approval_requests?.entity_type)
      );

      if (myTurnSteps.length === 0) return [];

      const leaveIds = myTurnSteps
        .filter((s: any) => s.approval_requests.entity_type === 'leave')
        .map((s: any) => s.approval_requests.entity_id);
      const regIds = myTurnSteps
        .filter((s: any) => s.approval_requests.entity_type === 'regularization')
        .map((s: any) => s.approval_requests.entity_id);

      // Collect all requester IDs to fetch profiles in one shot (Fix 4)
      const requesterIds = [...new Set(myTurnSteps.map((s: any) => s.approval_requests.requester_id as string))];

      // Fetch leave details, requester profiles, and reg details in parallel (Fix 1, 2, 4)
      const [
        leavesResult,
        regsResult,
        profilesResult,
      ] = await Promise.all([
        leaveIds.length > 0
          ? supabase
              .from('leave_applications')
              .select('id, user_id, start_date, end_date, reason, leave_type_id, days_requested, is_half_day, half_day_period, created_at')
              .in('id', leaveIds)
          : Promise.resolve({ data: [], error: null }),
        regIds.length > 0
          ? supabase
              .from('regularization_requests')
              .select('id, user_id, attendance_date, reason, requested_check_in_time, requested_check_out_time, created_at')
              .in('id', regIds)
          : Promise.resolve({ data: [], error: null }),
        requesterIds.length > 0
          ? supabase
              .from('profiles')
              .select('id, full_name, profile_picture_url, designation')
              .in('id', requesterIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      // Error logging (Fix 2)
      if (leavesResult.error) console.error('[useTeamAttendance] Leave fetch error:', leavesResult.error);
      if (regsResult.error) console.error('[useTeamAttendance] Reg fetch error:', regsResult.error);
      if (profilesResult.error) console.error('[useTeamAttendance] Profiles fetch error:', profilesResult.error);

      // Build requester profile map (Fix 4)
      const requesterProfileMap = new Map<string, any>();
      (profilesResult.data || []).forEach((p: any) => requesterProfileMap.set(p.id, p));

      // Build leave map with type names
      let leaveMap = new Map<string, any>();
      const leaves = leavesResult.data || [];
      if (leaves.length > 0) {
        const typeIds = [...new Set(leaves.map((l: any) => l.leave_type_id).filter(Boolean))];
        let typeMap = new Map<string, string>();
        if (typeIds.length > 0) {
          const { data: types } = await supabase.from('leave_types').select('id, name').in('id', typeIds as string[]);
          types?.forEach((t: any) => typeMap.set(t.id, t.name));
        }
        leaves.forEach((l: any) => leaveMap.set(l.id, { ...l, leaveTypeName: typeMap.get(l.leave_type_id) || 'Leave' }));
      }

      // Build regularization map
      let regMap = new Map<string, any>();
      (regsResult.data || []).forEach((r: any) => regMap.set(r.id, r));

      // Fetch actual attendance records for regularization dates
      const regEntries = regsResult.data || [];
      const attendanceMap = new Map<string, any>();
      if (regEntries.length > 0) {
        const userDatePairs = regEntries.map((r: any) => ({ userId: r.user_id, date: r.attendance_date }));
        const uniqueUserIds = [...new Set(userDatePairs.map((p: any) => p.userId))];
        const uniqueDates = [...new Set(userDatePairs.map((p: any) => p.date))];
        const { data: attRecords } = await supabase
          .from('attendance')
          .select('user_id, date, check_in_time, check_out_time')
          .in('user_id', uniqueUserIds as string[])
          .in('date', uniqueDates as string[]);
        (attRecords || []).forEach((a: any) => attendanceMap.set(`${a.user_id}_${a.date}`, a));
      }

      return myTurnSteps.map((s: any) => {
        const requesterId = s.approval_requests.requester_id;
        const requesterProfile = requesterProfileMap.get(requesterId);
        const entityType = s.approval_requests.entity_type as 'leave' | 'regularization';
        const entityId = s.approval_requests.entity_id;
        const entityData = entityType === 'leave' ? leaveMap.get(entityId) : regMap.get(entityId);

        return {
          step: s,
          entityType,
          entityId,
          approvalRequestId: s.approval_request_id,
          currentLevel: s.approval_requests.current_level,
          totalLevels: s.approval_requests.total_levels,
          isFinalLevel: s.level >= s.approval_requests.total_levels,
          myLevel: s.level,
          entityData,
          // Self-contained profile data — no race condition with outer profileMap (Fix 4)
          fullName: requesterProfile?.full_name || (entityData?.user_id ? null : 'Unknown'),
          profilePictureUrl: requesterProfile?.profile_picture_url || null,
          designation: requesterProfile?.designation || null,
          requesterId,
          // Actual attendance times for regularization comparison
          actualCheckIn: entityType === 'regularization' && entityData
            ? attendanceMap.get(`${entityData.user_id}_${entityData.attendance_date}`)?.check_in_time || null
            : null,
          actualCheckOut: entityType === 'regularization' && entityData
            ? attendanceMap.get(`${entityData.user_id}_${entityData.attendance_date}`)?.check_out_time || null
            : null,
        };
      });
    },
    enabled: !!user?.id,
    staleTime: 30 * 1000,
  });

  // 5b. Processed approvals (approved/rejected by me)
  const { data: processedStepsData = [] } = useQuery({
    queryKey: ['team-processed-approvals', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      let steps: any[] = [];
      const { data: joinedSteps, error: joinError } = await supabase
        .from('approval_steps')
        .select(`
          id,
          level,
          approver_id,
          status,
          action_taken_at,
          approval_request_id,
          approval_requests!inner(
            id,
            entity_type,
            entity_id,
            current_level,
            total_levels,
            status,
            requester_id,
            final_approved_by
          )
        `)
        .eq('approver_id', user.id)
        .in('status', ['approved', 'rejected'])
        .order('action_taken_at', { ascending: false })
        .limit(50);

      if (joinError) {
        console.warn('[useTeamAttendance] Processed join failed, using fallback:', joinError.message);
        const { data: rawSteps } = await supabase
          .from('approval_steps')
          .select('id, level, approver_id, status, action_taken_at, approval_request_id')
          .eq('approver_id', user.id)
          .in('status', ['approved', 'rejected'])
          .order('action_taken_at', { ascending: false })
          .limit(50);
        if (rawSteps && rawSteps.length > 0) {
          const arIds = [...new Set(rawSteps.map((s: any) => s.approval_request_id))];
          const { data: arData } = await supabase
            .from('approval_requests')
            .select('id, entity_type, entity_id, current_level, total_levels, status, requester_id, final_approved_by')
            .in('id', arIds);
          const arMap = new Map((arData || []).map((ar: any) => [ar.id, ar]));
          steps = rawSteps.map((s: any) => ({
            ...s,
            approval_requests: arMap.get(s.approval_request_id) || null,
          })).filter((s: any) => s.approval_requests);
        }
      } else {
        steps = joinedSteps || [];
      }

      const processedSteps = (steps || []).filter((s: any) =>
        ['approved', 'rejected'].includes(s.approval_requests?.status) &&
        ['leave', 'regularization'].includes(s.approval_requests?.entity_type)
      );

      if (processedSteps.length === 0) return [];

      const leaveIds = processedSteps
        .filter((s: any) => s.approval_requests.entity_type === 'leave')
        .map((s: any) => s.approval_requests.entity_id);
      const regIds = processedSteps
        .filter((s: any) => s.approval_requests.entity_type === 'regularization')
        .map((s: any) => s.approval_requests.entity_id);

      const requesterIds = [...new Set(processedSteps.map((s: any) => s.approval_requests.requester_id as string))];
      const approverIds = [...new Set(processedSteps.map((s: any) => s.approval_requests.final_approved_by as string).filter(Boolean))];
      const allProfileIds = [...new Set([...requesterIds, ...approverIds])];

      const [leavesResult, regsResult, profilesResult] = await Promise.all([
        leaveIds.length > 0
          ? supabase.from('leave_applications').select('id, user_id, start_date, end_date, reason, leave_type_id, days_requested, is_half_day, half_day_period').in('id', leaveIds)
          : Promise.resolve({ data: [], error: null }),
        regIds.length > 0
          ? supabase.from('regularization_requests').select('id, user_id, attendance_date, reason, requested_check_in_time, requested_check_out_time').in('id', regIds)
          : Promise.resolve({ data: [], error: null }),
        allProfileIds.length > 0
          ? supabase.from('profiles').select('id, full_name, profile_picture_url, designation').in('id', allProfileIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const profileMap = new Map<string, any>();
      (profilesResult.data || []).forEach((p: any) => profileMap.set(p.id, p));

      let leaveMap = new Map<string, any>();
      const leaves = leavesResult.data || [];
      if (leaves.length > 0) {
        const typeIds = [...new Set(leaves.map((l: any) => l.leave_type_id).filter(Boolean))];
        let typeMap = new Map<string, string>();
        if (typeIds.length > 0) {
          const { data: types } = await supabase.from('leave_types').select('id, name').in('id', typeIds as string[]);
          types?.forEach((t: any) => typeMap.set(t.id, t.name));
        }
        leaves.forEach((l: any) => leaveMap.set(l.id, { ...l, leaveTypeName: typeMap.get(l.leave_type_id) || 'Leave' }));
      }

      let regMap = new Map<string, any>();
      (regsResult.data || []).forEach((r: any) => regMap.set(r.id, r));

      // Fetch actual attendance records for regularization dates (processed)
      const regEntries2 = regsResult.data || [];
      const attendanceMap2 = new Map<string, any>();
      if (regEntries2.length > 0) {
        const userDatePairs2 = regEntries2.map((r: any) => ({ userId: r.user_id, date: r.attendance_date }));
        const uniqueUserIds2 = [...new Set(userDatePairs2.map((p: any) => p.userId))];
        const uniqueDates2 = [...new Set(userDatePairs2.map((p: any) => p.date))];
        const { data: attRecords2 } = await supabase
          .from('attendance')
          .select('user_id, date, check_in_time, check_out_time')
          .in('user_id', uniqueUserIds2 as string[])
          .in('date', uniqueDates2 as string[]);
        (attRecords2 || []).forEach((a: any) => attendanceMap2.set(`${a.user_id}_${a.date}`, a));
      }

      return processedSteps.map((s: any) => {
        const requesterId = s.approval_requests.requester_id;
        const requesterProfile = profileMap.get(requesterId);
        const approverProfile = s.approval_requests.final_approved_by ? profileMap.get(s.approval_requests.final_approved_by) : null;
        const entityType = s.approval_requests.entity_type as 'leave' | 'regularization';
        const entityId = s.approval_requests.entity_id;
        const entityData = entityType === 'leave' ? leaveMap.get(entityId) : regMap.get(entityId);

        return {
          entityType,
          entityId,
          approvalRequestId: s.approval_request_id,
          entityData,
          fullName: requesterProfile?.full_name || 'Unknown',
          profilePictureUrl: requesterProfile?.profile_picture_url || null,
          designation: requesterProfile?.designation || null,
          requesterId,
          approvalStatus: s.status as 'approved' | 'rejected',
          approvedByName: approverProfile?.full_name || requesterProfile?.full_name || null,
          actionTakenAt: s.action_taken_at,
          actualCheckIn: entityType === 'regularization' && entityData
            ? attendanceMap2.get(`${entityData.user_id}_${entityData.attendance_date}`)?.check_in_time || null
            : null,
          actualCheckOut: entityType === 'regularization' && entityData
            ? attendanceMap2.get(`${entityData.user_id}_${entityData.attendance_date}`)?.check_out_time || null
            : null,
        };
      });
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  // Legacy pending regularizations (for direct reports not yet using engine)
  const { data: pendingRegularizations = [] } = useQuery({
    queryKey: ['team-pending-regularizations', approvalUserIds],
    queryFn: async () => {
      if (!approvalUserIds.length) return [];
      const { data, error } = await supabase
        .from('regularization_requests')
        .select('id, user_id, attendance_date, reason, requested_check_in_time, requested_check_out_time, status')
        .in('user_id', approvalUserIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled,
    staleTime: 2 * 60 * 1000,
  });

  // Compute monthly counts map
  const monthlyCounts = new Map<string, number>();
  monthlyCountsRaw.forEach((r: any) => {
    monthlyCounts.set(r.user_id, (monthlyCounts.get(r.user_id) || 0) + 1);
  });

  // Compute sets (exclude 'leave'/'half_day_leave' from present so counts are accurate)
  const presentUserIds = new Set(
    todayAttendance
      .filter((a: any) => !['leave', 'half_day_leave'].includes(a.status))
      .map((a: any) => a.user_id)
  );

  // Unified on-leave detection: attendance rows with leave status OR approved leave applications
  const onLeaveUserIds = new Set<string>([
    ...todayAttendance
      .filter((a: any) => ['leave', 'half_day_leave'].includes(a.status))
      .map((a: any) => a.user_id as string),
    ...todayLeaves
      .map((l: any) => l.user_id as string)
      .filter((id: string) => !presentUserIds.has(id)),
  ]);

  // Summary counts
  const presentCount = presentUserIds.size;
  const onLeaveCount = onLeaveUserIds.size;
  const absentCount = Math.max(0, subordinateIds.length - presentCount - onLeaveCount);

  // Working days in month
  const { totalWorkingDays: totalWorkingDaysInMonth } = useWorkingDaysConfig(dateFilter);

  // Build team members list (memoized)
  const teamMembers: TeamMemberAttendance[] = useMemo(() => {
    const profileMap = new Map(profiles.map(p => [p.id, p]));
    const attendanceMap = new Map(todayAttendance.map((a: any) => [a.user_id, a]));

    return subordinateIds.map(id => {
      const profile = profileMap.get(id) || { id, full_name: 'Unknown', profile_picture_url: null, designation: null, phone_number: null };
      const att = attendanceMap.get(id);
      const isOnLeave = onLeaveUserIds.has(id) && !presentUserIds.has(id);

      let todayStatus: TeamMemberAttendance['todayStatus'] = 'absent';
      if (att) {
        if (att.status === 'leave' || att.status === 'half_day_leave') {
          todayStatus = 'on_leave';
        } else if (att.status === 'regularized') {
          todayStatus = 'regularized';
        } else {
          todayStatus = 'present';
        }
      } else if (isOnLeave) {
        todayStatus = 'on_leave';
      }

      return {
        profile,
        todayStatus,
        checkInTime: att?.check_in_time || null,
        checkOutTime: att?.check_out_time || null,
        totalHours: att?.total_hours || null,
        monthlyPresent: monthlyCounts.get(id) || 0,
        monthlyTotal: totalWorkingDaysInMonth,
      };
    });
  }, [subordinateIds, profiles, todayAttendance, todayLeaves, monthlyCountsRaw, totalWorkingDaysInMonth]);

  // Build pending approvals from approval engine (primary) + legacy fallback + processed
  const pendingApprovals: PendingApproval[] = useMemo(() => {
    const profileMap = new Map(profiles.map(p => [p.id, p]));

    const engineApprovals: PendingApproval[] = (pendingStepsData as any[]).map((item: any) => {
      const ed = item.entityData;
      const profileFallback = ed?.user_id ? profileMap.get(ed.user_id) : undefined;
      const fullName = item.fullName || profileFallback?.full_name || 'Unknown';
      const profilePictureUrl = item.profilePictureUrl ?? profileFallback?.profile_picture_url ?? null;
      const designation = item.designation ?? profileFallback?.designation ?? null;

      if (item.entityType === 'leave') {
        const userId = ed?.user_id || item.requesterId;
        return {
          id: ed?.id || item.entityId,
          type: 'leave' as const,
          userId,
          fullName,
          profilePictureUrl,
          designation,
          date: ed?.start_date || '',
          endDate: ed?.end_date,
          reason: ed?.reason || null,
          leaveTypeName: ed?.leaveTypeName || 'Leave',
          daysRequested: ed?.days_requested ?? null,
          isHalfDay: ed?.is_half_day ?? null,
          halfDayPeriod: ed?.half_day_period ?? null,
          approvalRequestId: item.approvalRequestId,
          currentLevel: item.currentLevel,
          totalLevels: item.totalLevels,
          isFinalLevel: item.isFinalLevel,
          myLevel: item.myLevel,
          approvalStatus: 'pending' as const,
        } as PendingApproval;
      } else {
        const userId = ed?.user_id || item.requesterId;
        return {
          id: ed?.id || item.entityId,
          type: 'regularization' as const,
          userId,
          fullName,
          profilePictureUrl,
          designation,
          date: ed?.attendance_date || '',
          reason: ed?.reason || null,
          requestedCheckIn: ed?.requested_check_in_time,
          requestedCheckOut: ed?.requested_check_out_time,
          actualCheckIn: item.actualCheckIn || null,
          actualCheckOut: item.actualCheckOut || null,
          attendanceDate: ed?.attendance_date,
          approvalRequestId: item.approvalRequestId,
          currentLevel: item.currentLevel,
          totalLevels: item.totalLevels,
          isFinalLevel: item.isFinalLevel,
          myLevel: item.myLevel,
          approvalStatus: 'pending' as const,
        } as PendingApproval;
      }
    }) as PendingApproval[];

    // Legacy: direct report pending regs not yet in engine
    const engineEntityIds = new Set(engineApprovals.map(a => a.id));
    const legacyRegApprovals: PendingApproval[] = (pendingRegularizations as any[])
      .filter((r: any) => !engineEntityIds.has(r.id) && approvalUserIds.includes(r.user_id))
      .map((r: any) => ({
        id: r.id,
        type: 'regularization' as const,
        userId: r.user_id,
        fullName: profileMap.get(r.user_id)?.full_name || 'Unknown',
        profilePictureUrl: profileMap.get(r.user_id)?.profile_picture_url || null,
        designation: profileMap.get(r.user_id)?.designation || null,
        date: r.attendance_date,
        reason: r.reason,
        requestedCheckIn: r.requested_check_in_time,
        requestedCheckOut: r.requested_check_out_time,
        attendanceDate: r.attendance_date,
        approvalStatus: 'pending' as const,
      }));

    // Processed approvals from engine
    const allPendingIds = new Set([...engineApprovals.map(a => a.id), ...legacyRegApprovals.map(a => a.id)]);
    const processedApprovals: PendingApproval[] = (processedStepsData as any[])
      .filter((item: any) => !allPendingIds.has(item.entityId))
      .map((item: any) => {
        const ed = item.entityData;
        if (item.entityType === 'leave') {
          return {
            id: ed?.id || item.entityId,
            type: 'leave' as const,
            userId: ed?.user_id || item.requesterId,
            fullName: item.fullName || 'Unknown',
            profilePictureUrl: item.profilePictureUrl || null,
            designation: item.designation || null,
            date: ed?.start_date || '',
            endDate: ed?.end_date,
            reason: ed?.reason || null,
            leaveTypeName: ed?.leaveTypeName || 'Leave',
            daysRequested: ed?.days_requested ?? null,
            isHalfDay: ed?.is_half_day ?? null,
            halfDayPeriod: ed?.half_day_period ?? null,
            approvalRequestId: item.approvalRequestId,
            approvalStatus: item.approvalStatus,
            approvedByName: item.approvedByName,
            actionTakenAt: item.actionTakenAt,
          } as PendingApproval;
        } else {
          return {
            id: ed?.id || item.entityId,
            type: 'regularization' as const,
            userId: ed?.user_id || item.requesterId,
            fullName: item.fullName || 'Unknown',
            profilePictureUrl: item.profilePictureUrl || null,
            designation: item.designation || null,
            date: ed?.attendance_date || '',
            reason: ed?.reason || null,
            requestedCheckIn: ed?.requested_check_in_time,
            requestedCheckOut: ed?.requested_check_out_time,
            actualCheckIn: item.actualCheckIn || null,
            actualCheckOut: item.actualCheckOut || null,
            attendanceDate: ed?.attendance_date,
            approvalRequestId: item.approvalRequestId,
            approvalStatus: item.approvalStatus,
            approvedByName: item.approvedByName,
            actionTakenAt: item.actionTakenAt,
          } as PendingApproval;
        }
      });

    // Pending first (newest created first), then processed
    const getCreated = (a: any): number => {
      const src = (pendingStepsData as any[]).find((x: any) => (x.entityData?.id || x.entityId) === a.id);
      const c = src?.entityData?.created_at;
      return c ? new Date(c).getTime() : 0;
    };
    const sortedEngine = [...engineApprovals].sort((a, b) => getCreated(b) - getCreated(a));
    return [...sortedEngine, ...legacyRegApprovals, ...processedApprovals];
  }, [pendingStepsData, processedStepsData, pendingRegularizations, profiles, approvalUserIds]);

  // handleLeaveAction: uses approval engine if approvalRequestId present, else legacy direct update
  const handleLeaveAction = async (applicationId: string, newStatus: 'approved' | 'rejected', approvalRequestId?: string) => {
    try {
      if (approvalRequestId) {
        const { data: result, error } = await supabase.rpc('process_approval_step', {
          p_approval_request_id: approvalRequestId,
          p_approver_id: user?.id,
          p_action: newStatus,
          p_reason: null,
        });
        if (error) throw error;
        const res = result as any;
        if (!res.success) throw new Error(res.message);
        if (newStatus === 'rejected') {
          toast({ title: 'Leave rejected' });
        } else {
          toast({ title: '✅ Leave approved' });
        }
      } else {
        const updateData: any = {
          status: newStatus,
          approved_date: newStatus === 'approved' ? new Date().toISOString() : null,
        };
        if (user) updateData.approved_by = user.id;
        const { error } = await supabase.from('leave_applications').update(updateData).eq('id', applicationId);
        if (error) throw error;
        toast({ title: `Leave ${newStatus} successfully` });
      }
      queryClient.invalidateQueries({ queryKey: ['team-pending-leaves'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['team-processed-approvals'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['team-today-leaves'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['team-today-attendance'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['my-pending-steps'], exact: false });
    } catch (error) {
      console.error('Error updating leave:', error);
      toast({ title: 'Failed to update leave', variant: 'destructive' });
    }
  };

  // handleRegularizationAction: uses approval engine if approvalRequestId present, else legacy
  const handleRegularizationAction = async (
    requestId: string,
    newStatus: 'approved' | 'rejected',
    rejectionReason?: string,
    approvalRequestId?: string
  ) => {
    try {
      if (approvalRequestId) {
        if (newStatus === 'approved') {
          // Parallel: approval is always final, upsert attendance
          const { data: request } = await supabase
            .from('regularization_requests')
            .select('*')
            .eq('id', requestId)
            .maybeSingle();

          if (request) {
            let totalHours = null;
            if (request.requested_check_in_time && request.requested_check_out_time) {
              const checkIn = new Date(request.requested_check_in_time);
              const checkOut = new Date(request.requested_check_out_time);
              totalHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
            }
            await supabase.from('attendance').upsert({
              user_id: request.user_id,
              date: request.attendance_date,
              check_in_time: request.requested_check_in_time,
              check_out_time: request.requested_check_out_time,
              status: 'regularized',
              total_hours: totalHours,
              notes: `Regularized via request #${requestId.slice(0, 8)}`,
              regularized_request_id: requestId,
            }, { onConflict: 'user_id,date' });
          }
        }

        const { data: result, error } = await supabase.rpc('process_approval_step', {
          p_approval_request_id: approvalRequestId,
          p_approver_id: user?.id,
          p_action: newStatus,
          p_reason: rejectionReason || null,
        });
        if (error) throw error;
        const res = result as any;
        if (!res.success) throw new Error(res.message);

        if (newStatus === 'rejected') {
          toast({ title: 'Regularization rejected', variant: 'destructive' });
        } else {
          toast({ title: '✅ Regularization approved' });
        }
      } else {
        // Legacy direct update
        if (newStatus === 'approved') {
          const { data: request, error: fetchError } = await supabase
            .from('regularization_requests')
            .select('*')
            .eq('id', requestId)
            .single();
          if (fetchError) throw fetchError;

          let totalHours = null;
          if (request.requested_check_in_time && request.requested_check_out_time) {
            const checkIn = new Date(request.requested_check_in_time);
            const checkOut = new Date(request.requested_check_out_time);
            totalHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
          }
          const { error: attendanceError } = await supabase.from('attendance').upsert({
            user_id: request.user_id,
            date: request.attendance_date,
            check_in_time: request.requested_check_in_time,
            check_out_time: request.requested_check_out_time,
            status: 'regularized',
            total_hours: totalHours,
            notes: `Regularized via request #${requestId.slice(0, 8)}`,
            regularized_request_id: requestId,
          }, { onConflict: 'user_id,date' });
          if (attendanceError) throw attendanceError;
        }

        const updateData: any = {
          status: newStatus,
          approved_at: newStatus === 'approved' ? new Date().toISOString() : null,
          rejection_reason: rejectionReason || null,
        };
        if (user) updateData.approved_by = user.id;
        const { error } = await supabase.from('regularization_requests').update(updateData).eq('id', requestId);
        if (error) throw error;
        toast({ title: `Regularization ${newStatus} successfully` });
      }

      queryClient.invalidateQueries({ queryKey: ['team-pending-regularizations'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['team-pending-leaves'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['team-processed-approvals'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['team-today-attendance'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['team-monthly-counts'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['my-pending-steps'], exact: false });
    } catch (error) {
      console.error('Error updating regularization:', error);
      toast({ title: 'Failed to update regularization', variant: 'destructive' });
    }
  };

  return {
    profiles,
    teamMembers,
    pendingApprovals,
    presentCount,
    onLeaveCount,
    absentCount,
    totalSubordinates: subordinateIds.length,
    handleLeaveAction,
    handleRegularizationAction,
  };
};

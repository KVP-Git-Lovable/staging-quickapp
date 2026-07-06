import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface ApprovalStep {
  id: string;
  level: number;
  approver_id: string;
  approver_name: string;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  action_taken_at: string | null;
  rejection_reason: string | null;
}

export interface ApprovalRequest {
  id: string;
  entity_type: string;
  entity_id: string;
  requester_id: string;
  current_level: number;
  total_levels: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  final_approved_by: string | null;
  created_at: string;
}

export interface PendingStep {
  // approval_request fields
  approvalRequestId: string;
  entityType: 'leave' | 'regularization' | 'expense' | 'credit_note' | 'order_backdate' | 'order_edit';
  entityId: string;
  currentLevel: number;
  totalLevels: number;
  isFinalLevel: boolean;
  // my step
  stepId: string;
  myLevel: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  performed_by: string;
  performer_name: string;
  level: number | null;
  timestamp: string;
  metadata: Record<string, any> | null;
}

// Hook: get all pending steps for the current user (my turn)
export const useMyPendingSteps = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-pending-steps', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      let data: any[] = [];
      const { data: joinedData, error: joinError } = await supabase
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
        console.warn('[useApprovalEngine] Join failed, using fallback:', joinError.message);
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
          data = rawSteps.map((s: any) => ({
            ...s,
            approval_requests: arMap.get(s.approval_request_id) || null,
          })).filter((s: any) => s.approval_requests);
        }
      } else {
        data = joinedData || [];
      }

      return (data || [])
        .filter((s: any) => {
          // Parallel: show all pending steps for pending requests
          return s.approval_requests?.status === 'pending';
        })
        .map((s: any): PendingStep => ({
          approvalRequestId: s.approval_request_id,
          entityType: s.approval_requests.entity_type as 'leave' | 'regularization' | 'expense' | 'credit_note' | 'order_backdate' | 'order_edit',
          entityId: s.approval_requests.entity_id,
          currentLevel: s.approval_requests.current_level,
          totalLevels: s.approval_requests.total_levels,
          isFinalLevel: s.level >= s.approval_requests.total_levels,
          stepId: s.id,
          myLevel: s.level,
        }));
    },
    enabled: !!user?.id,
    staleTime: 30 * 1000,
  });
};

// Hook: get approval timeline/audit for a specific entity
export const useApprovalTimeline = (entityId: string | null) => {
  return useQuery({
    queryKey: ['approval-timeline', entityId],
    queryFn: async () => {
      if (!entityId) return { request: null, steps: [], auditLog: [] };

      // Get the approval request
      const { data: arData } = await supabase
        .from('approval_requests')
        .select('*')
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!arData) return { request: null, steps: [], auditLog: [] };

      // Get steps with approver names
      const { data: stepsData } = await supabase
        .from('approval_steps')
        .select('id, level, approver_id, status, action_taken_at, rejection_reason')
        .eq('approval_request_id', arData.id)
        .order('level', { ascending: true });

      // Get approver names
      const approverIds = (stepsData || []).map((s: any) => s.approver_id);
      let profileMap = new Map<string, string>();
      if (approverIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', approverIds);
        profiles?.forEach((p: any) => profileMap.set(p.id, p.full_name));
      }

      const steps: ApprovalStep[] = (stepsData || []).map((s: any) => ({
        id: s.id,
        level: s.level,
        approver_id: s.approver_id,
        approver_name: profileMap.get(s.approver_id) || 'Unknown',
        status: s.status,
        action_taken_at: s.action_taken_at,
        rejection_reason: s.rejection_reason,
      }));

      // Get audit log
      const { data: auditData } = await supabase
        .from('approval_audit_log')
        .select('id, action, performed_by, level, timestamp, metadata')
        .eq('approval_request_id', arData.id)
        .order('timestamp', { ascending: true });

      const performerIds = (auditData || []).map((a: any) => a.performed_by);
      let performerMap = new Map<string, string>();
      if (performerIds.length > 0) {
        const { data: performers } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', [...new Set(performerIds)]);
        performers?.forEach((p: any) => performerMap.set(p.id, p.full_name));
      }

      const auditLog: AuditEntry[] = (auditData || []).map((a: any) => ({
        id: a.id,
        action: a.action,
        performed_by: a.performed_by,
        performer_name: performerMap.get(a.performed_by) || 'Unknown',
        level: a.level,
        timestamp: a.timestamp,
        metadata: a.metadata,
      }));

      return { request: arData as ApprovalRequest, steps, auditLog };
    },
    enabled: !!entityId,
    staleTime: 30 * 1000,
  });
};

// Hook: process an approval step action
export const useProcessApprovalStep = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const processStep = async (
    approvalRequestId: string,
    action: 'approved' | 'rejected',
    reason?: string
  ): Promise<{ success: boolean; isFinal: boolean; nextLevel?: number; action?: string }> => {
    if (!user?.id) throw new Error('Not authenticated');

    const { data, error } = await supabase.rpc('process_approval_step', {
      p_approval_request_id: approvalRequestId,
      p_approver_id: user.id,
      p_action: action,
      p_reason: reason || null,
    });

    if (error) throw error;

    const result = data as any;

    if (!result.success) {
      throw new Error(result.message || 'Failed to process approval');
    }

    // Show contextual toast
    if (action === 'rejected') {
      toast({ title: 'Request rejected', variant: 'destructive' });
    } else {
      toast({ title: '✅ Request approved' });
    }

    // Invalidate relevant queries
    queryClient.invalidateQueries({ queryKey: ['my-pending-steps'] });
    queryClient.invalidateQueries({ queryKey: ['team-pending-leaves'] });
    queryClient.invalidateQueries({ queryKey: ['team-pending-regularizations'] });
    queryClient.invalidateQueries({ queryKey: ['team-today-leaves'] });
    queryClient.invalidateQueries({ queryKey: ['team-today-attendance'] });
    queryClient.invalidateQueries({ queryKey: ['team-monthly-counts'] });
    queryClient.invalidateQueries({ queryKey: ['approval-timeline'] });

    return {
      success: true,
      isFinal: result.is_final,
      nextLevel: result.next_level,
      action: result.action,
    };
  };

  return { processStep };
};

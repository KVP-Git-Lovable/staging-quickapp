import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Loader2, CalendarClock } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMyPendingSteps, useProcessApprovalStep } from '@/hooks/useApprovalEngine';
import RejectionReasonDialog from '@/components/RejectionReasonDialog';

interface BackdateRow {
  id: string;
  user_id: string;
  order_date: string;
  reason: string | null;
  created_at: string;
  requester_name?: string;
}

export default function BackdateApprovalsList() {
  const { data: pendingSteps = [], refetch } = useMyPendingSteps();
  const { processStep } = useProcessApprovalStep();

  const bdSteps = useMemo(
    () => pendingSteps.filter((s) => s.entityType === 'order_backdate'),
    [pendingSteps]
  );

  const [rows, setRows] = useState<BackdateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ approvalRequestId: string } | null>(null);

  const stepByEntityId = useMemo(() => {
    const m = new Map<string, string>();
    bdSteps.forEach((s) => m.set(s.entityId, s.approvalRequestId));
    return m;
  }, [bdSteps]);

  const load = useCallback(async () => {
    const ids = bdSteps.map((s) => s.entityId);
    if (ids.length === 0) { setRows([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('order_backdate_requests' as any)
      .select('id, user_id, order_date, reason, created_at')
      .in('id', ids)
      .order('created_at', { ascending: false });
    const list = ((data as any[]) || []) as BackdateRow[];
    const userIds = [...new Set(list.map((r) => r.user_id))];
    if (userIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      const nameMap = new Map((profs || []).map((p: any) => [p.id, p.full_name]));
      list.forEach((r) => { r.requester_name = nameMap.get(r.user_id) || 'User'; });
    }
    setRows(list);
    setLoading(false);
  }, [bdSteps]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (row: BackdateRow) => {
    const arId = stepByEntityId.get(row.id);
    if (!arId) return;
    setActingId(row.id);
    try {
      await processStep(arId, 'approved');
      await refetch();
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to approve');
    } finally {
      setActingId(null);
    }
  };

  const handleConfirmReject = async (reason: string) => {
    if (!rejectTarget) return;
    setActingId(rejectTarget.approvalRequestId);
    try {
      await processStep(rejectTarget.approvalRequestId, 'rejected', reason);
      await refetch();
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to reject');
    } finally {
      setActingId(null);
      setRejectTarget(null);
    }
  };

  if (bdSteps.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No pending backdate requests.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold">Backdate requests ({bdSteps.length})</h3>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {rows.map((row) => {
        const arId = stepByEntityId.get(row.id);
        const busy = actingId === row.id || actingId === arId;
        return (
          <Card key={row.id} className="border shadow-sm rounded-xl">
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{row.requester_name}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">Backdate</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Wants to place order for <strong>{format(new Date(row.order_date), 'MMM dd, yyyy')}</strong>
                  </p>
                  {row.reason && (
                    <p className="text-xs text-muted-foreground mt-0.5">Reason: {row.reason}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-9 text-white bg-green-600 hover:bg-green-700"
                    onClick={() => handleApprove(row)}
                    disabled={busy}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" />Approve</>}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-9"
                    onClick={() => arId && setRejectTarget({ approvalRequestId: arId })}
                    disabled={busy}
                  >
                    <X className="h-4 w-4 mr-1" />Reject
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <RejectionReasonDialog
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleConfirmReject}
        title="Reject backdate request"
        description="Please provide a reason for rejecting this request."
      />
    </div>
  );
}

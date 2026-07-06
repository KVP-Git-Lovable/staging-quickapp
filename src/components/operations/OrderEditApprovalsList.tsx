import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Loader2, PencilLine } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMyPendingSteps, useProcessApprovalStep } from '@/hooks/useApprovalEngine';
import RejectionReasonDialog from '@/components/RejectionReasonDialog';

interface EditRow {
  id: string;
  original_order_id: string;
  replacement_order_id: string;
  edited_by: string;
  reason: string | null;
  old_total: number | null;
  new_total: number | null;
  created_at: string;
  requester_name?: string;
}

export default function OrderEditApprovalsList() {
  const { data: pendingSteps = [], refetch } = useMyPendingSteps();
  const { processStep } = useProcessApprovalStep();

  const editSteps = useMemo(
    () => pendingSteps.filter((s) => s.entityType === 'order_edit'),
    [pendingSteps]
  );

  const [rows, setRows] = useState<EditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ approvalRequestId: string } | null>(null);

  const stepByEntityId = useMemo(() => {
    const m = new Map<string, string>();
    editSteps.forEach((s) => m.set(s.entityId, s.approvalRequestId));
    return m;
  }, [editSteps]);

  const load = useCallback(async () => {
    const ids = editSteps.map((s) => s.entityId);
    if (ids.length === 0) { setRows([]); return; }
    setLoading(true);
    const { data } = await (supabase as any)
      .from('order_edit_requests')
      .select('id, original_order_id, replacement_order_id, edited_by, reason, old_total, new_total, created_at')
      .in('id', ids)
      .order('created_at', { ascending: false });
    const list = ((data as any[]) || []) as EditRow[];
    const userIds = [...new Set(list.map((r) => r.edited_by))];
    if (userIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      const nameMap = new Map((profs || []).map((p: any) => [p.id, p.full_name]));
      list.forEach((r) => { r.requester_name = nameMap.get(r.edited_by) || 'User'; });
    }
    setRows(list);
    setLoading(false);
  }, [editSteps]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (row: EditRow) => {
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

  if (editSteps.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No pending order edit requests.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <PencilLine className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-semibold">Order edit requests ({editSteps.length})</h3>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {rows.map((row) => {
        const arId = stepByEntityId.get(row.id);
        const busy = actingId === row.id || actingId === arId;
        const delta = (row.new_total ?? 0) - (row.old_total ?? 0);
        return (
          <Card key={row.id} className="border shadow-sm rounded-xl">
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{row.requester_name}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">Order edit</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {format(new Date(row.created_at), 'MMM dd, HH:mm')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Old: <strong>₹{(row.old_total ?? 0).toFixed(2)}</strong>
                    {' → '}
                    New: <strong>₹{(row.new_total ?? 0).toFixed(2)}</strong>
                    {' '}
                    <span className={delta >= 0 ? 'text-green-600' : 'text-red-600'}>
                      ({delta >= 0 ? '+' : ''}₹{delta.toFixed(2)})
                    </span>
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
        title="Reject order edit"
        description="Please provide a reason for rejecting this edit."
      />
    </div>
  );
}

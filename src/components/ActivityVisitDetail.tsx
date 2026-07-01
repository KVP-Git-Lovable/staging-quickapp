import { useEffect, useState, useRef, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  CalendarDays, Clock, Timer, LogIn, LogOut, Loader2, Save, CheckCircle2, Play, XCircle, Activity as ActivityIcon,
  Paperclip, Upload, Trash2, FileText, Image as ImageIcon, ExternalLink,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useActivityTypes } from '@/hooks/useActivityTypes';
import { usePermissions } from '@/hooks/usePermissions';
import type { ActivityVisitCardModel } from '@/hooks/useActivityVisits';

const BUCKET = 'activity-attachments';
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,application/pdf';
const ACCEPTED_EXT = /\.(jpe?g|png|webp|pdf)$/i;

interface AttachmentRow {
  id: string;
  file_path: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
}


const COLOR_CLASS: Record<string, string> = {
  rose: 'bg-rose-100 text-rose-800', amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-blue-100 text-blue-800', green: 'bg-green-100 text-green-800',
  purple: 'bg-purple-100 text-purple-800', indigo: 'bg-indigo-100 text-indigo-800',
  teal: 'bg-teal-100 text-teal-800', orange: 'bg-orange-100 text-orange-800',
  gray: 'bg-gray-100 text-gray-800',
};
const humanize = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

async function tryGetPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    const t = setTimeout(() => resolve(null), 6000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { clearTimeout(t); resolve(null); },
      { enableHighAccuracy: true, timeout: 6000 },
    );
  });
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: ActivityVisitCardModel | null;
  onChanged?: () => void;
}

export const ActivityVisitDetail = ({ open, onOpenChange, activity, onChanged }: Props) => {
  const { types } = useActivityTypes();
  const { can } = usePermissions();
  const canReadAttach = can('activity_attachments', 'read');
  const canCreateAttach = can('activity_attachments', 'create');
  const canDeleteAttach = can('activity_attachments', 'delete');
  const [remarks, setRemarks] = useState('');
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [busy, setBusy] = useState<'check_in' | 'complete' | null>(null);
  const [, setTick] = useState(0);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setRemarks(activity?.remarks ?? '');
  }, [activity?.activityEventId, activity?.remarks]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, [open]);

  const loadAttachments = useCallback(async () => {
    if (!activity?.activityEventId || !canReadAttach) {
      setAttachments([]);
      return;
    }
    setAttachLoading(true);
    try {
      const { data, error } = await supabase
        .from('activity_attachments')
        .select('id,file_path,file_name,file_type,file_size,uploaded_by,created_at')
        .eq('activity_event_id', activity.activityEventId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAttachments((data as AttachmentRow[]) ?? []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load attachments');
    } finally {
      setAttachLoading(false);
    }
  }, [activity?.activityEventId, canReadAttach]);

  useEffect(() => {
    if (open) loadAttachments();
  }, [open, loadAttachments]);

  if (!activity) return null;


  const typeRow = (() => {
    const key = activity.activityType;
    if (!key) return null;
    return types.find(t => t.name === key || t.code === key) || null;
  })();
  const meta = {
    label: typeRow?.name ?? (activity.activityType ? humanize(activity.activityType) : 'Other'),
    colorClass: (typeRow?.color && COLOR_CLASS[typeRow.color]) || COLOR_CLASS.gray,
  };
  const photoRequired = !!typeRow?.photo_required;
  const locationRequired = !!typeRow?.location_required;

  const isCancelled = activity.status === 'cancelled';
  const isCompleted = !isCancelled && (!!activity.checkOutTime || activity.status === 'productive' || activity.status === 'completed');
  const isInProgress = !isCancelled && !isCompleted && (!!activity.checkInTime || activity.status === 'in-progress');

  const state = (() => {
    if (isCancelled) return { label: 'Cancelled', Icon: XCircle, cls: 'bg-rose-100 text-rose-800 border-rose-300' };
    if (isCompleted) return { label: 'Completed', Icon: CheckCircle2, cls: 'bg-green-100 text-green-800 border-green-300' };
    if (isInProgress) return { label: 'In progress', Icon: Play, cls: 'bg-blue-100 text-blue-800 border-blue-300' };
    return { label: 'Not started', Icon: CalendarDays, cls: 'bg-amber-100 text-amber-800 border-amber-300' };
  })();

  const title = activity.activityName && activity.activityName !== 'Activity'
    ? activity.activityName
    : meta.label;

  const fmtTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const liveDuration = (() => {
    if (isInProgress && activity.checkInTime) {
      return Math.max(0, Math.round((Date.now() - new Date(activity.checkInTime).getTime()) / 60000));
    }
    return activity.durationMinutes;
  })();

  const fmtDuration = (m: number | null) => {
    if (m == null || m < 0) return '—';
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
  };

  const runAction = async (action: 'check_in' | 'complete') => {
    if (busy) return;

    // Enforce per-sub-type photo requirement:
    //  - check_in requires ≥1 attachment
    //  - complete requires ≥2 (check-in + check-out photo)
    if (photoRequired) {
      const need = action === 'check_in' ? 1 : 2;
      if (attachments.length < need) {
        toast.error(
          action === 'check_in'
            ? 'Upload a check-in photo before checking in'
            : 'Upload a check-out photo before completing'
        );
        return;
      }
    }

    setBusy(action);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const actor = userRes?.user?.id;
      if (!actor) { toast.error('Not signed in'); return; }
      const pos = await tryGetPosition();
      if (locationRequired && !pos) {
        toast.error('GPS location is required for this activity. Enable location and try again.');
        return;
      }
      const { data, error } = await supabase.rpc('activity_visit_action', {
        p_visit_id: activity.visitId,
        p_activity_event_id: activity.activityEventId,
        p_action: action,
        p_actor: actor,
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any)?.error || 'Action failed');
      toast.success(action === 'check_in' ? 'Checked in' : 'Activity completed');
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const saveRemarks = async () => {
    setSavingRemarks(true);
    try {
      const { error } = await supabase
        .from('activity_events')
        .update({ remarks: remarks || null })
        .eq('id', activity.activityEventId);
      if (error) throw error;
      toast.success('Remarks saved');
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save remarks');
    } finally {
      setSavingRemarks(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ACCEPTED_EXT.test(file.name)) {
      toast.error('Only JPG, PNG, WEBP or PDF files are allowed');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('File is larger than 20 MB');
      return;
    }
    setUploading(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id ?? null;
      const safeName = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `${activity.activityEventId}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('activity_attachments').insert({
        activity_event_id: activity.activityEventId,
        file_path: path,
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size,
        uploaded_by: uid,
      });
      if (insErr) {
        // Roll back storage object if the row insert failed (e.g. RLS).
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
        throw insErr;
      }
      toast.success('Attachment uploaded');
      await loadAttachments();
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const openAttachment = async (row: AttachmentRow) => {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(row.file_path, 300);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to open file');
    }
  };

  const deleteAttachment = async (row: AttachmentRow) => {
    if (!confirm(`Delete ${row.file_name ?? 'this file'}?`)) return;
    setDeletingId(row.id);
    try {
      const { error: sErr } = await supabase.storage.from(BUCKET).remove([row.file_path]);
      if (sErr) throw sErr;
      const { error: dErr } = await supabase
        .from('activity_attachments')
        .delete()
        .eq('id', row.id);
      if (dErr) throw dErr;
      toast.success('Attachment deleted');
      setAttachments(prev => prev.filter(a => a.id !== row.id));
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const fmtSize = (n: number | null) => {
    if (!n && n !== 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImage = (row: AttachmentRow) =>
    (row.file_type || '').startsWith('image/') ||
    /\.(jpe?g|png|webp)$/i.test(row.file_name || row.file_path);

  const StateIcon = state.Icon;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ActivityIcon className="h-4 w-4" />
            <span className="truncate">{title}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">Activity</Badge>
            <Badge className={`text-[10px] ${meta.colorClass}`}>{meta.label}</Badge>
            <Badge className={`text-[10px] border flex items-center gap-1 ${state.cls}`}>
              <StateIcon className="h-3 w-3" />
              {state.label}
            </Badge>
          </div>

          <div className="rounded-lg border p-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Date</span>
              <span className="font-medium">{activity.plannedDate}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Check-in</span>
              <span className="font-medium">{fmtTime(activity.checkInTime)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Check-out</span>
              <span className="font-medium">{fmtTime(activity.checkOutTime)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5"><Timer className="h-3.5 w-3.5" /> Total time spent</span>
              <span className="font-medium">
                {fmtDuration(liveDuration)}{isInProgress ? ' (live)' : ''}
              </span>
            </div>
          </div>

          {!isCancelled && !isCompleted && (
            <div className="flex items-center gap-2">
              {!isInProgress ? (
                <Button className="flex-1" onClick={() => runAction('check_in')} disabled={busy !== null}>
                  {busy === 'check_in' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
                  Check-In
                </Button>
              ) : (
                <Button className="flex-1" onClick={() => runAction('complete')} disabled={busy !== null}>
                  {busy === 'complete' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogOut className="h-4 w-4 mr-2" />}
                  Mark Complete
                </Button>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="activity-remarks">Remarks</Label>
            <Textarea
              id="activity-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Add notes about this activity…"
              rows={4}
              disabled={isCancelled}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={saveRemarks}
                disabled={savingRemarks || isCancelled || remarks === (activity.remarks ?? '')}
              >
                {savingRemarks ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-2" />}
                Save
              </Button>
            </div>
          </div>

          {canReadAttach && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5" /> Attachments
                </Label>
                {canCreateAttach && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_TYPES}
                      className="hidden"
                      onChange={handleFileSelected}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 mr-2" />
                      )}
                      Upload
                    </Button>
                  </>
                )}
              </div>

              {attachLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                </div>
              ) : attachments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No attachments yet</p>
              ) : (
                <ul className="space-y-2">
                  {attachments.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center gap-3 rounded-md border p-2 text-sm"
                    >
                      <button
                        type="button"
                        onClick={() => openAttachment(row)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <div className="h-10 w-10 shrink-0 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                          {isImage(row) ? (
                            <ImageIcon className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <FileText className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium flex items-center gap-1">
                            <span className="truncate">{row.file_name ?? row.file_path.split('/').pop()}</span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {fmtSize(row.file_size)} · {new Date(row.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                          </div>
                        </div>
                      </button>
                      {canDeleteAttach && (
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={deletingId === row.id}
                          onClick={() => deleteAttachment(row)}
                          aria-label="Delete attachment"
                        >
                          {deletingId === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Type-specific fields (subordinate, beat, meeting details, etc.) can be edited from the Add Activity form.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ActivityVisitDetail;

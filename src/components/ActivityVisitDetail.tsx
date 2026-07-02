import { useEffect, useState, useRef, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CalendarDays, Clock, Timer, LogIn, LogOut, Loader2, Save, CheckCircle2, Play, XCircle, Activity as ActivityIcon,
  Paperclip, Upload, Trash2, FileText, Image as ImageIcon, ExternalLink, MapPin, Star,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useActivityTypes } from '@/hooks/useActivityTypes';
import { usePermissions } from '@/hooks/usePermissions';
import { useSubordinates } from '@/hooks/useSubordinates';
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

  // ─── Detail form state (per-sub-type) ───────────────────────────
  const { subordinates } = useSubordinates();
  const [form, setForm] = useState<Record<string, any>>({});
  const [savingForm, setSavingForm] = useState(false);
  const [distributorSearch, setDistributorSearch] = useState('');
  const [distributorResults, setDistributorResults] = useState<{ id: string; name: string }[]>([]);
  const setF = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  // Load full activity_events row
  const loadDetail = useCallback(async () => {
    if (!activity?.activityEventId) return;
    const { data } = await supabase
      .from('activity_events')
      .select('*')
      .eq('id', activity.activityEventId)
      .maybeSingle();
    if (data) setForm(data as Record<string, any>);
  }, [activity?.activityEventId]);

  useEffect(() => {
    if (open) loadDetail();
  }, [open, loadDetail]);

  // Distributor search
  useEffect(() => {
    if (!distributorSearch || distributorSearch.length < 2) { setDistributorResults([]); return; }
    const t = setTimeout(async () => {
      const [distRes, userRes] = await Promise.all([
        supabase.from('distributors').select('id, name').ilike('name', `%${distributorSearch}%`).limit(8),
        supabase.from('distributor_users').select('distributor_id, full_name, distributors(id, name)')
          .ilike('full_name', `%${distributorSearch}%`).not('distributor_id', 'is', null).limit(8),
      ]);
      const m = new Map<string, string>();
      ((distRes.data as any) || []).forEach((d: any) => { if (d.id && !m.has(d.id)) m.set(d.id, d.name); });
      ((userRes.data as any) || []).forEach((d: any) => {
        const id = d.distributors?.id || d.distributor_id;
        const name = d.distributors?.name || d.full_name;
        if (id && !m.has(id)) m.set(id, name);
      });
      setDistributorResults(Array.from(m, ([id, name]) => ({ id, name })));
    }, 250);
    return () => clearTimeout(t);
  }, [distributorSearch]);


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

  // ─── Sub-type detection (keyword based, master-driven names) ─────
  const typeKey = (activity.activityType || '').toLowerCase();
  const isJoint       = /joint/.test(typeKey);
  const isSurvey      = /survey|new beat/.test(typeKey);
  const isDistributor = /distributor/.test(typeKey);
  const isMeeting     = /meeting|training/.test(typeKey);

  const expectedMins: number | null = (form as any)?.expected_duration_minutes ?? null;
  const halfDayType: string | null = (form as any)?.half_day_type ?? null;
  const halfDayLabel = halfDayType === 'first_half' ? 'First half'
    : halfDayType === 'second_half' ? 'Second half'
    : 'Full day';

  const saveDetail = async () => {
    setSavingForm(true);
    try {
      // Whitelist per-sub-type fields to update
      const patch: Record<string, any> = {};
      const pick = (keys: string[]) => keys.forEach(k => { if (k in form) patch[k] = form[k] === '' ? null : form[k]; });

      if (isJoint) pick([
        'subordinate_user_id',
        'rep_rating_product_knowledge', 'rep_rating_retailer_relationship',
        'rep_rating_scheme_communication', 'rep_rating_branding', 'rep_rating_market_intel',
        'rep_overall_outcome', 'rep_strengths', 'rep_improvement_areas',
        'rep_action_items', 'rep_followup_date',
      ]);
      if (isSurvey) pick([
        'beat_name', 'survey_total_shops', 'survey_our_stock_shops', 'survey_target_shops',
        'survey_competitor_count', 'survey_estimated_monthly_value', 'survey_market_type',
        'survey_priority', 'survey_suggested_beat_count', 'survey_shops_per_beat',
        'survey_proposed_beat_names', 'survey_competition_brands', 'survey_observations',
        'survey_recommendation',
      ]);
      if (isDistributor) pick([
        'distributor_id', 'distributor_name', 'visit_purpose', 'contact_person', 'outcome',
      ]);
      if (isMeeting) pick(['topic', 'attendee_count']);

      if (Object.keys(patch).length === 0) {
        toast.info('Nothing to save');
        return;
      }
      const { error } = await supabase
        .from('activity_events')
        .update(patch)
        .eq('id', activity.activityEventId);
      if (error) throw error;
      toast.success('Details saved');
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save details');
    } finally {
      setSavingForm(false);
    }
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
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 overflow-hidden flex flex-col !top-14 !h-[calc(100dvh-3.5rem)] rounded-tl-2xl border-l shadow-2xl"
      >
        {/* Prominent header band */}
        <div className="bg-gradient-to-br from-sky-100 via-indigo-50 to-white border-b border-sky-100 px-5 pt-5 pb-4 shrink-0">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-white text-indigo-600 flex items-center justify-center shrink-0 shadow-sm ring-1 ring-indigo-100">
                <ActivityIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-lg font-bold leading-tight truncate text-slate-800">
                  {title}
                </SheetTitle>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {activity.plannedDate}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-3">
            <Badge variant="outline" className="text-[10px] bg-white/80 border-slate-200 text-slate-700">Activity</Badge>
            <Badge className={`text-[10px] ${meta.colorClass}`}>{meta.label}</Badge>
            <Badge className={`text-[10px] border flex items-center gap-1 ${state.cls}`}>
              <StateIcon className="h-3 w-3" />
              {state.label}
            </Badge>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-slate-50/50 to-white">
          {(photoRequired || locationRequired) && !isCancelled && !isCompleted && (
            <p className="text-[11px] text-amber-600 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Required for this type:
              {locationRequired && ' GPS'}
              {locationRequired && photoRequired && ' + '}
              {photoRequired && ' Photo (check-in & check-out)'}
            </p>
          )}



          <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/70 to-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="activity-remarks" className="text-sm font-semibold">Remarks</Label>
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
            <Textarea
              id="activity-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Add notes about this activity…"
              rows={4}
              disabled={isCancelled}
              className="bg-muted/30"
            />
          </div>

          {canReadAttach && (
            <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-sm font-semibold">
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

          {/* ─── Per-sub-type detail form ────────────────── */}
          {(isJoint || isSurvey || isDistributor || isMeeting) && !isCancelled && (
            <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-sky-50/50 to-white p-4 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 rounded-full bg-indigo-500" />
                <Label className="text-sm font-semibold text-slate-800">Activity details</Label>
              </div>


              {isJoint && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Subordinate</Label>
                    <Select
                      value={form.subordinate_user_id ?? ''}
                      onValueChange={(v) => setF('subordinate_user_id', v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Select subordinate" /></SelectTrigger>
                      <SelectContent>
                        {(subordinates || []).map((s: any) => (
                          <SelectItem key={s.subordinate_user_id} value={s.subordinate_user_id}>{s.full_name || s.subordinate_user_id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {[
                    ['rep_rating_product_knowledge', 'Product knowledge'],
                    ['rep_rating_retailer_relationship', 'Retailer relationship'],
                    ['rep_rating_scheme_communication', 'Scheme communication'],
                    ['rep_rating_branding', 'Branding'],
                    ['rep_rating_market_intel', 'Market intel'],
                  ].map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between">
                      <Label className="text-xs">{label}</Label>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(n => {
                          const val = Number(form[key] || 0);
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setF(key, val === n ? 0 : n)}
                              className="p-0.5"
                              aria-label={`${label} ${n} star`}
                            >
                              <Star className={`h-4 w-4 ${n <= val ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground'}`} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div>
                    <Label className="text-xs">Overall outcome</Label>
                    <Textarea rows={2} value={form.rep_overall_outcome ?? ''} onChange={(e) => setF('rep_overall_outcome', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Strengths</Label>
                    <Textarea rows={2} value={form.rep_strengths ?? ''} onChange={(e) => setF('rep_strengths', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Improvement areas</Label>
                    <Textarea rows={2} value={form.rep_improvement_areas ?? ''} onChange={(e) => setF('rep_improvement_areas', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Action items</Label>
                    <Textarea rows={2} value={form.rep_action_items ?? ''} onChange={(e) => setF('rep_action_items', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Follow-up date</Label>
                    <Input type="date" value={form.rep_followup_date ?? ''} onChange={(e) => setF('rep_followup_date', e.target.value)} />
                  </div>
                </div>
              )}

              {isSurvey && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Beat name</Label>
                    <Input value={form.beat_name ?? ''} onChange={(e) => setF('beat_name', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Total shops</Label>
                      <Input type="number" value={form.survey_total_shops ?? ''} onChange={(e) => setF('survey_total_shops', e.target.value ? Number(e.target.value) : null)} />
                    </div>
                    <div>
                      <Label className="text-xs">Our stock shops</Label>
                      <Input type="number" value={form.survey_our_stock_shops ?? ''} onChange={(e) => setF('survey_our_stock_shops', e.target.value ? Number(e.target.value) : null)} />
                    </div>
                    <div>
                      <Label className="text-xs">Target shops</Label>
                      <Input type="number" value={form.survey_target_shops ?? ''} onChange={(e) => setF('survey_target_shops', e.target.value ? Number(e.target.value) : null)} />
                    </div>
                    <div>
                      <Label className="text-xs">Competitor count</Label>
                      <Input type="number" value={form.survey_competitor_count ?? ''} onChange={(e) => setF('survey_competitor_count', e.target.value ? Number(e.target.value) : null)} />
                    </div>
                    <div>
                      <Label className="text-xs">Est. monthly value</Label>
                      <Input type="number" value={form.survey_estimated_monthly_value ?? ''} onChange={(e) => setF('survey_estimated_monthly_value', e.target.value ? Number(e.target.value) : null)} />
                    </div>
                    <div>
                      <Label className="text-xs">Market type</Label>
                      <Input value={form.survey_market_type ?? ''} onChange={(e) => setF('survey_market_type', e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Priority</Label>
                      <Input value={form.survey_priority ?? ''} onChange={(e) => setF('survey_priority', e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Suggested beats</Label>
                      <Input type="number" value={form.survey_suggested_beat_count ?? ''} onChange={(e) => setF('survey_suggested_beat_count', e.target.value ? Number(e.target.value) : null)} />
                    </div>
                    <div>
                      <Label className="text-xs">Shops per beat</Label>
                      <Input type="number" value={form.survey_shops_per_beat ?? ''} onChange={(e) => setF('survey_shops_per_beat', e.target.value ? Number(e.target.value) : null)} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Proposed beat names (comma-separated)</Label>
                    <Input
                      value={Array.isArray(form.survey_proposed_beat_names) ? form.survey_proposed_beat_names.join(', ') : (form.survey_proposed_beat_names ?? '')}
                      onChange={(e) => setF('survey_proposed_beat_names', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Competition brands</Label>
                    <Textarea rows={2} value={form.survey_competition_brands ?? ''} onChange={(e) => setF('survey_competition_brands', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Observations</Label>
                    <Textarea rows={2} value={form.survey_observations ?? ''} onChange={(e) => setF('survey_observations', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Recommendation</Label>
                    <Textarea rows={2} value={form.survey_recommendation ?? ''} onChange={(e) => setF('survey_recommendation', e.target.value)} />
                  </div>
                </div>
              )}

              {isDistributor && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Distributor</Label>
                    {form.distributor_id ? (
                      <div className="flex items-center gap-2">
                        <Input value={form.distributor_name ?? ''} readOnly className="flex-1" />
                        <Button size="sm" variant="ghost" onClick={() => { setF('distributor_id', null); setF('distributor_name', null); }}>Change</Button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Input
                          placeholder="Search distributor (name or contact)…"
                          value={distributorSearch}
                          onChange={(e) => setDistributorSearch(e.target.value)}
                        />
                        {distributorResults.length > 0 && (
                          <ul className="border rounded-md divide-y max-h-40 overflow-auto">
                            {distributorResults.map(d => (
                              <li key={d.id}>
                                <button
                                  type="button"
                                  className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted"
                                  onClick={() => {
                                    setF('distributor_id', d.id);
                                    setF('distributor_name', d.name);
                                    setDistributorSearch('');
                                    setDistributorResults([]);
                                  }}
                                >
                                  {d.name}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Visit purpose</Label>
                    <Input value={form.visit_purpose ?? ''} onChange={(e) => setF('visit_purpose', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Contact person</Label>
                    <Input value={form.contact_person ?? ''} onChange={(e) => setF('contact_person', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Outcome</Label>
                    <Textarea rows={2} value={form.outcome ?? ''} onChange={(e) => setF('outcome', e.target.value)} />
                  </div>
                </div>
              )}

              {isMeeting && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Topic</Label>
                    <Input value={form.topic ?? ''} onChange={(e) => setF('topic', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Attendee count</Label>
                    <Input type="number" value={form.attendee_count ?? ''} onChange={(e) => setF('attendee_count', e.target.value ? Number(e.target.value) : null)} />
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button size="sm" onClick={saveDetail} disabled={savingForm} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  {savingForm ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-2" />}
                  Save details
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ActivityVisitDetail;

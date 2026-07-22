import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { X, Send, Bell, ChevronDown, Info } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface NotificationRuleFormProps {
  rule: {
    id: string;
    name: string;
    event_code: string;
    source_table: string;
    receiver_type: string;
    receiver_role: string | null;
    receiver_user_id: string | null;
    notification_channel: string;
    title_template: string;
    message_template: string;
  } | null;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

const SOURCE_TABLES = [
  { value: 'orders', label: 'Orders' },
  { value: 'leave_applications', label: 'Leave Applications' },
  { value: 'regularization_requests', label: 'Regularization Requests' },
  { value: 'approval_requests', label: 'Approval Requests' },
  { value: 'visits', label: 'Visits' },
  { value: 'activity_events', label: 'Activity Events' },
  { value: 'pm_tasks', label: 'Tasks' },
  { value: 'retailers', label: 'Retailers' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'branding_requests', label: 'Branding Requests' },
];

const RECEIVER_OPTIONS = [
  { value: 'employee', label: 'The person themselves' },
  { value: 'manager', label: 'Their manager' },
  { value: 'hierarchy', label: 'Whole hierarchy up' },
  { value: 'role', label: 'A role' },
  { value: 'specific_user', label: 'Specific people' },
  { value: 'admin', label: 'All admins' },
];

const CHANNELS = [
  { value: 'in_app', label: 'In-app', disabled: false },
  { value: 'push', label: 'Push (coming soon)', disabled: true },
  { value: 'email', label: 'Email (coming soon)', disabled: true },
];

type ModulePreset = {
  title: string;
  message: string;
  tokens: string[];
  sample: Record<string, string>;
};

const now = new Date();
const dateStr = now.toLocaleDateString();
const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const MODULE_PRESETS: Record<string, ModulePreset> = {
  orders: {
    title: 'New order — {record_name}',
    message: '{user_name} placed {record_name} worth {amount} for {retailer} on {date}.',
    tokens: ['{user_name}', '{record_name}', '{retailer}', '{amount}', '{date}', '{time}'],
    sample: { user_name: 'Ajay Kumar', record_name: 'Order #1284', retailer: 'Sri Krishna Stores', amount: '₹4,250', date: dateStr, time: timeStr },
  },
  attendance: {
    title: '{user_name} — attendance {status}',
    message: '{user_name} marked attendance as {status} at {time} on {date}. Beat: {beat}.',
    tokens: ['{user_name}', '{status}', '{beat}', '{date}', '{time}'],
    sample: { user_name: 'Ajay Kumar', status: 'Present', beat: 'Beat 3 — MG Road', date: dateStr, time: timeStr },
  },
  leave_applications: {
    title: 'Leave request — {user_name}',
    message: '{user_name} requested {leave_type} leave from {from_date} to {to_date} ({days} day(s)).',
    tokens: ['{user_name}', '{leave_type}', '{from_date}', '{to_date}', '{days}'],
    sample: { user_name: 'Ajay Kumar', leave_type: 'Casual', from_date: dateStr, to_date: dateStr, days: '1' },
  },
  regularization_requests: {
    title: 'Regularization — {user_name}',
    message: '{user_name} raised a regularization for {date}. Reason: {reason}.',
    tokens: ['{user_name}', '{date}', '{reason}'],
    sample: { user_name: 'Ajay Kumar', date: dateStr, reason: 'Missed check-in' },
  },
  approval_requests: {
    title: 'Approval needed — {record_name}',
    message: '{user_name} raised {record_name} needing your approval on {date}.',
    tokens: ['{user_name}', '{record_name}', '{date}'],
    sample: { user_name: 'Ajay Kumar', record_name: 'Discount request', date: dateStr },
  },
  visits: {
    title: 'Visit logged — {retailer}',
    message: '{user_name} visited {retailer} on {beat} at {time}.',
    tokens: ['{user_name}', '{retailer}', '{beat}', '{date}', '{time}'],
    sample: { user_name: 'Ajay Kumar', retailer: 'Sri Krishna Stores', beat: 'Beat 3 — MG Road', date: dateStr, time: timeStr },
  },
  activity_events: {
    title: 'Activity — {record_name}',
    message: '{user_name} completed {record_name} on {date} at {time}.',
    tokens: ['{user_name}', '{record_name}', '{date}', '{time}'],
    sample: { user_name: 'Ajay Kumar', record_name: 'Merchandising Check', date: dateStr, time: timeStr },
  },
  pm_tasks: {
    title: 'Task — {record_name}',
    message: '{user_name} was assigned {record_name}, due {due_date}.',
    tokens: ['{user_name}', '{record_name}', '{due_date}'],
    sample: { user_name: 'Ajay Kumar', record_name: 'Follow up Sri Krishna Stores', due_date: dateStr },
  },
  retailers: {
    title: 'Retailer — {record_name}',
    message: '{user_name} added {record_name} on {date}.',
    tokens: ['{user_name}', '{record_name}', '{date}'],
    sample: { user_name: 'Ajay Kumar', record_name: 'Sri Krishna Stores', date: dateStr },
  },
  branding_requests: {
    title: 'Branding request — {record_name}',
    message: '{user_name} raised a branding request for {retailer} on {date}.',
    tokens: ['{user_name}', '{retailer}', '{record_name}', '{date}'],
    sample: { user_name: 'Ajay Kumar', retailer: 'Sri Krishna Stores', record_name: 'Poster set', date: dateStr },
  },
};

const DEFAULT_PRESET: ModulePreset = {
  title: '{user_name} — {record_name}',
  message: '{user_name} updated {record_name} on {date} at {time}.',
  tokens: ['{user_name}', '{record_name}', '{date}', '{time}'],
  sample: { user_name: 'Ajay Kumar', record_name: 'Record #1', date: dateStr, time: timeStr },
};

const presetFor = (mod: string): ModulePreset => MODULE_PRESETS[mod] || DEFAULT_PRESET;

const renderTemplate = (tpl: string, ctx: Record<string, string>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? `{${k}}`);

export function NotificationRuleForm({ rule, userId, onClose, onSaved }: NotificationRuleFormProps) {
  const [name, setName] = useState(rule?.name || '');
  const [eventCode, setEventCode] = useState(rule?.event_code || '');
  const [sourceTables, setSourceTables] = useState<string[]>(rule?.source_table ? [rule.source_table] : []);
  const [receiverType, setReceiverType] = useState(rule?.receiver_type || 'employee');
  const [receiverRole, setReceiverRole] = useState(rule?.receiver_role || '');
  const [receiverUserId, setReceiverUserId] = useState(rule?.receiver_user_id || '');
  const [notification_channel, setChannel] = useState(rule?.notification_channel || 'in_app');
  const [titleTemplate, setTitleTemplate] = useState(rule?.title_template || DEFAULT_PRESET.title);
  const [messageTemplate, setMessageTemplate] = useState(rule?.message_template || DEFAULT_PRESET.message);
  const titleTouched = useRef(!!rule?.title_template);
  const messageTouched = useRef(!!rule?.message_template);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const isEdit = !!rule;
  const previewModule = sourceTables[0] || '';
  const preset = useMemo(() => presetFor(previewModule), [previewModule]);
  const previewModuleLabel = SOURCE_TABLES.find((t) => t.value === previewModule)?.label;

  useEffect(() => {
    if (!previewModule) return;
    if (!titleTouched.current) setTitleTemplate(preset.title);
    if (!messageTouched.current) setMessageTemplate(preset.message);
  }, [previewModule, preset]);

  const { data: pickUsers = [], isLoading: pickUsersLoading } = useQuery({
    queryKey: ['notif-pick-users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('notif_pick_users' as any);
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string; role: string | null }>;
    },
    enabled: true,
  });

  const { data: eventTypes = [] } = useQuery({
    queryKey: ['notification-event-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_event_types')
        .select('*')
        .eq('is_active', true)
        .order('event_code');
      if (error) throw error;
      return data as any[];
    },
  });

  const toggleModule = (val: string) => {
    setSourceTables((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val],
    );
  };

  const insertToken = (token: string, target: 'title' | 'message') => {
    if (target === 'title') {
      titleTouched.current = true;
      setTitleTemplate((p) => p + token);
    } else {
      messageTouched.current = true;
      setMessageTemplate((p) => p + token);
    }
  };

  const modulesLabel =
    sourceTables.length === 0
      ? 'pick module(s)'
      : sourceTables.length === 1
        ? SOURCE_TABLES.find((t) => t.value === sourceTables[0])?.label || sourceTables[0]
        : `${sourceTables.length} modules`;

  const handleSave = async () => {
    if (!eventCode || sourceTables.length === 0) {
      toast.error('Please pick an event and at least one module');
      return;
    }
    setSaving(true);
    try {
      const eventLabel = eventTypes.find((e) => e.event_code === eventCode)?.label || eventCode;
      const receiverLabel = RECEIVER_OPTIONS.find((r) => r.value === receiverType)?.label || receiverType;

      const commonPayload = {
        event_code: eventCode,
        receiver_type: receiverType,
        receiver_role: receiverType === 'role' ? receiverRole : null,
        receiver_user_id: receiverType === 'specific_user' ? (receiverUserId || null) : null,
        notification_channel,
        title_template: titleTemplate,
        message_template: messageTemplate,
        updated_at: new Date().toISOString(),
      };

      if (isEdit && rule) {
        const payload = {
          ...commonPayload,
          name: name || `When ${eventLabel} → notify ${receiverLabel}`,
          source_table: sourceTables[0],
        };
        const { error } = await supabase.from('notification_rules').update(payload).eq('id', rule.id);
        if (error) throw error;
        toast.success('Rule updated');
      } else {
        const rows = sourceTables.map((mod) => {
          const modLabel = SOURCE_TABLES.find((t) => t.value === mod)?.label || mod;
          return {
            ...commonPayload,
            name: name
              ? sourceTables.length > 1
                ? `${name} — ${modLabel}`
                : name
              : `When ${eventLabel} on ${modLabel} → notify ${receiverLabel}`,
            source_table: mod,
            created_by: userId,
          };
        });
        const { error } = await supabase.from('notification_rules').insert(rows);
        if (error) throw error;
        toast.success(rows.length > 1 ? `Created ${rows.length} rules` : 'Rule created');
      }
      onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!eventCode || sourceTables.length === 0) {
      toast.error('Pick an event and module first');
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.rpc('notify_send_test' as any, {
        p_event_code: eventCode,
        p_source_table: sourceTables[0],
      });
      if (error) throw error;
      const result: any = Array.isArray(data) ? data[0] : data;
      const count = result?.recipient_count ?? 0;
      const names: string[] = result?.recipients ?? [];
      if (count === 0) {
        toast.warning('Test sent — but no recipients resolved for this rule');
      } else {
        toast.success(
          `Test sent to ${count} ${count === 1 ? 'person' : 'people'}: ${names.slice(0, 5).join(', ')}${names.length > 5 ? '…' : ''}`,
        );
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to send test');
    } finally {
      setTesting(false);
    }
  };

  const previewTitle = renderTemplate(titleTemplate, preset.sample);
  const previewMessage = renderTemplate(messageTemplate, preset.sample);

  // Reusable pill classnames for the inline sentence-builder selects.
  const pillTrigger =
    'h-8 min-w-[160px] w-auto inline-flex bg-white border-slate-200 rounded-lg text-sm font-semibold text-indigo-600 hover:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20';

  return (
    <div className="w-full bg-white rounded-2xl shadow-lg shadow-slate-200/40 border border-slate-100 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 md:px-8 py-5 border-b border-slate-100 flex items-start justify-between bg-white">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {isEdit ? 'Edit notification rule' : 'New notification rule'}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">Define how and when users receive automated alerts.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full h-9 w-9 p-0 text-slate-400 hover:text-slate-700">
          <X size={18} />
        </Button>
      </div>

      <div className="p-6 md:p-8 space-y-8">
        {/* Logic Builder */}
        <section className="space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Logic Builder</div>
          <div className="p-4 md:p-5 bg-indigo-50/40 rounded-xl border border-indigo-100/70 flex flex-wrap items-center gap-x-3 gap-y-3 text-slate-700 leading-relaxed">
            <span className="font-medium">When</span>
            <Select value={eventCode} onValueChange={setEventCode}>
              <SelectTrigger className={pillTrigger}>
                <SelectValue placeholder="pick an event" />
              </SelectTrigger>
              <SelectContent>
                {eventTypes.map((et: any) => (
                  <SelectItem key={et.event_code} value={et.event_code}>{et.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="font-medium">happens on</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-[180px] justify-between font-semibold text-indigo-600 bg-white border-slate-200 rounded-lg hover:border-indigo-300"
                  disabled={isEdit}
                  title={isEdit ? 'Editing an existing rule — change modules by creating new rules' : ''}
                >
                  <span className="truncate">{modulesLabel}</span>
                  <ChevronDown size={14} className="opacity-60 ml-2" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-2">
                <div className="text-xs text-muted-foreground px-2 pb-2">
                  Pick one or more modules — one rule per module.
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {SOURCE_TABLES.map((t) => {
                    const checked = sourceTables.includes(t.value);
                    return (
                      <label key={t.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                        <Checkbox checked={checked} onCheckedChange={() => toggleModule(t.value)} />
                        <span>{t.label}</span>
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            {sourceTables.length > 1 && (
              <div className="w-full flex flex-wrap gap-1 mt-1">
                {sourceTables.map((mod) => {
                  const lbl = SOURCE_TABLES.find((t) => t.value === mod)?.label || mod;
                  const isPreview = mod === previewModule;
                  return (
                    <Badge
                      key={mod}
                      variant={isPreview ? 'default' : 'outline'}
                      className={`cursor-pointer gap-1 text-xs ${isPreview ? 'bg-indigo-600 hover:bg-indigo-700' : ''}`}
                      onClick={() => setSourceTables((prev) => [mod, ...prev.filter((m) => m !== mod)])}
                      title="Click to preview this module"
                    >
                      {lbl}
                      <X size={10} className="opacity-70 hover:opacity-100" onClick={(e) => { e.stopPropagation(); toggleModule(mod); }} />
                    </Badge>
                  );
                })}
              </div>
            )}

            <span className="font-medium">, notify</span>
            <Select value={receiverType} onValueChange={setReceiverType}>
              <SelectTrigger className={pillTrigger}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECEIVER_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {receiverType === 'role' && (
              <Input
                value={receiverRole}
                onChange={(e) => setReceiverRole(e.target.value)}
                placeholder="role name (e.g. admin)"
                className="h-8 w-auto min-w-[140px] inline-flex"
              />
            )}
            {receiverType === 'specific_user' && (
              <Select value={receiverUserId} onValueChange={setReceiverUserId} disabled={pickUsersLoading}>
                <SelectTrigger className={`${pillTrigger} min-w-[200px]`}>
                  <SelectValue placeholder={pickUsersLoading ? 'Loading users…' : 'pick a person'} />
                </SelectTrigger>
                <SelectContent>
                  {pickUsersLoading ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</div>
                  ) : pickUsers.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No active users found</div>
                  ) : (
                    pickUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        <div className="flex flex-col">
                          <span>{u.name}</span>
                          {u.role && <span className="text-xs text-muted-foreground">{u.role}</span>}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}

            <span className="font-medium">via</span>
            <Select value={notification_channel} onValueChange={setChannel}>
              <SelectTrigger className={pillTrigger}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => (
                  <SelectItem key={c.value} value={c.value} disabled={c.disabled}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>.</span>
          </div>

          {/* Who will receive this — live resolver */}
          <RecipientPreview
            receiverType={receiverType}
            receiverRole={receiverRole}
            receiverUserId={receiverUserId}
            pickUsers={pickUsers}
            currentUserId={userId}
          />
        </section>

        {/* Two-column: form (left) + live preview (right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
          {/* LEFT — content editor */}
          <div className="space-y-6">
            {/* Rule name */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">
                Rule name <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Auto-generated from the sentence above"
                className="bg-white border-slate-200 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-400"
              />
              <p className="text-[11px] text-slate-500 flex items-start gap-1">
                <Info size={11} className="mt-0.5 flex-shrink-0 text-slate-400" />
                Leave blank to auto-generate a name from the sentence above. Only admins see this — the recipient sees Title/Message.
              </p>
            </div>

            {/* Module-aware banner */}
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-[12px] text-indigo-900/80 flex items-start gap-2">
              <Info size={13} className="mt-0.5 flex-shrink-0 text-indigo-500" />
              {previewModule ? (
                <span>
                  Showing suggested defaults for <span className="font-semibold">{previewModuleLabel}</span>.
                  Anything in <code className="px-1 py-0.5 rounded bg-white border border-indigo-100 text-indigo-700">{'{curly}'}</code> is replaced with real data at send time — click a token chip below or type your own text.
                </span>
              ) : (
                <span>Pick a module above to load recommended Title/Message defaults for that record type.</span>
              )}
              {(titleTouched.current || messageTouched.current) && previewModule && (
                <button
                  className="ml-auto text-indigo-600 font-medium hover:underline flex-shrink-0"
                  onClick={() => {
                    titleTouched.current = false;
                    messageTouched.current = false;
                    setTitleTemplate(preset.title);
                    setMessageTemplate(preset.message);
                  }}
                >
                  Reset
                </button>
              )}
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-slate-700">Title</Label>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Headline shown to recipient</span>
              </div>
              <Input
                value={titleTemplate}
                onChange={(e) => { titleTouched.current = true; setTitleTemplate(e.target.value); }}
                className="font-medium text-slate-900 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[11px] text-slate-400 self-center mr-1">Insert:</span>
                {preset.tokens.map((t) => (
                  <button
                    key={`t-${t}`}
                    type="button"
                    onClick={() => insertToken(t, 'title')}
                    className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[11px] font-bold cursor-pointer hover:bg-indigo-100 transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-slate-700">Message</Label>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Body of the notification</span>
              </div>
              <Textarea
                value={messageTemplate}
                onChange={(e) => { messageTouched.current = true; setMessageTemplate(e.target.value); }}
                rows={4}
                className="resize-none leading-relaxed focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[11px] text-slate-400 self-center mr-1">Insert:</span>
                {preset.tokens.map((t) => (
                  <button
                    key={`m-${t}`}
                    type="button"
                    onClick={() => insertToken(t, 'message')}
                    className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[11px] font-bold cursor-pointer hover:bg-indigo-100 transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — live preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Live Preview</span>
              <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 uppercase">In-app toast</span>
            </div>
            <div className="relative bg-slate-50/50 rounded-2xl p-6 border border-slate-100 flex items-center justify-center min-h-[240px]">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.02]">
                <div className="w-32 h-32 border-4 border-slate-900 rounded-full" />
              </div>
              <div className="relative bg-white shadow-2xl shadow-slate-300/40 border border-slate-100 rounded-xl p-4 w-full max-w-[340px]">
                <div className="flex gap-3">
                  <div className="shrink-0 w-10 h-10 bg-indigo-400 rounded-lg flex items-center justify-center text-white">
                    <Bell size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900 truncate">{previewTitle}</h4>
                      <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold tracking-tight uppercase flex-shrink-0">Test</span>
                    </div>
                    <p className="text-[13px] text-slate-600 mt-1 leading-snug break-words">{previewMessage}</p>
                    <p className="text-[10px] text-slate-400 mt-2">{formatDistanceToNow(new Date(), { addSuffix: true })}</p>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-center text-slate-400 leading-relaxed">
              {previewModuleLabel ? <>Showing sample data for <span className="font-medium text-slate-500">{previewModuleLabel}</span>.<br /></> : null}
              Tokens in <code className="text-slate-500">{'{curly}'}</code> are replaced with real data at send time.
            </p>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-6 md:px-8 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
        <Button variant="ghost" onClick={onClose} className="text-slate-500 hover:text-slate-800">
          Cancel
        </Button>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleSendTest}
            disabled={testing}
            className="gap-1.5 bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <Send size={14} /> {testing ? 'Sending…' : 'Send test to me'}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200/60"
          >
            {saving
              ? 'Saving…'
              : isEdit
                ? 'Update rule'
                : sourceTables.length > 1
                  ? `Create ${sourceTables.length} rules`
                  : 'Create rule'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// RecipientPreview — resolves who will actually receive the notification
// ============================================================
interface RecipientPreviewProps {
  receiverType: string;
  receiverRole: string;
  receiverUserId: string;
  pickUsers: Array<{ id: string; name: string; role: string | null }>;
  currentUserId: string;
}

function RecipientPreview({
  receiverType,
  receiverRole,
  receiverUserId,
  pickUsers,
  currentUserId,
}: RecipientPreviewProps) {
  const actorDependent = ['employee', 'manager', 'hierarchy_up'].includes(receiverType);
  const [sampleActor, setSampleActor] = useState<string>(currentUserId);

  useEffect(() => {
    if (!sampleActor && currentUserId) setSampleActor(currentUserId);
  }, [currentUserId, sampleActor]);

  const { data, isLoading } = useQuery({
    queryKey: [
      'notif-preview-recipients',
      receiverType,
      receiverRole,
      receiverUserId,
      actorDependent ? sampleActor : null,
    ],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('notif_preview_recipients' as any, {
        p_receiver_type: receiverType,
        p_receiver_role: receiverRole || null,
        p_receiver_user_id: receiverUserId || null,
        p_sample_actor: actorDependent ? sampleActor || null : null,
      });
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string; role: string | null }>;
    },
    enabled: !!receiverType && (!actorDependent || !!sampleActor),
  });

  const recipients = data || [];
  const count = recipients.length;
  const shown = recipients.slice(0, 3).map((r) => r.name).join(', ');
  const extra = count > 3 ? `, +${count - 3} more` : '';

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-600 font-medium">Who will receive this:</span>

      {actorDependent && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">preview as</span>
          <Select value={sampleActor} onValueChange={setSampleActor}>
            <SelectTrigger className="h-7 w-auto min-w-[140px] text-xs bg-white border-indigo-200">
              <SelectValue placeholder="pick a rep" />
            </SelectTrigger>
            <SelectContent>
              {pickUsers.map((u) => (
                <SelectItem key={u.id} value={u.id} className="text-xs">
                  {u.name}{u.role ? ` · ${u.role}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <span className="text-xs text-slate-400">resolving…</span>
      ) : count === 0 ? (
        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
          No one matches yet — pick a role or person.
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className="bg-indigo-600 hover:bg-indigo-700 text-xs">
            {count} {count === 1 ? 'person' : 'people'}
          </Badge>
          <span className="text-slate-700 text-xs">
            {shown}{extra}
          </span>
        </div>
      )}
    </div>
  );
}


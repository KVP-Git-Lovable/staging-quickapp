import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { X, Send, Bell, ChevronDown } from 'lucide-react';
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

/**
 * Module-specific defaults: title template, message template, sample tokens
 * for the preview, and the token chips shown to the admin. Each module
 * documents its own record_name shape so the preview reflects what the
 * recipient will actually see.
 */
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
  // Multi-select modules (create-mode allows fan-out; edit-mode locks to the rule's single source)
  const [sourceTables, setSourceTables] = useState<string[]>(rule?.source_table ? [rule.source_table] : []);
  const [receiverType, setReceiverType] = useState(rule?.receiver_type || 'employee');
  const [receiverRole, setReceiverRole] = useState(rule?.receiver_role || '');
  const [receiverUserId, setReceiverUserId] = useState(rule?.receiver_user_id || '');
  const [notification_channel, setChannel] = useState(rule?.notification_channel || 'in_app');
  const [titleTemplate, setTitleTemplate] = useState(rule?.title_template || DEFAULT_PRESET.title);
  const [messageTemplate, setMessageTemplate] = useState(rule?.message_template || DEFAULT_PRESET.message);
  // Track whether the admin has manually edited templates so we don't clobber their work
  // when they switch modules.
  const titleTouched = useRef(!!rule?.title_template);
  const messageTouched = useRef(!!rule?.message_template);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const isEdit = !!rule;
  // Preview always uses the first selected module so admins immediately see how it
  // will render for that module.
  const previewModule = sourceTables[0] || '';
  const preset = useMemo(() => presetFor(previewModule), [previewModule]);

  // When admin picks their first module (create mode) or switches the preview module
  // and hasn't customised templates, auto-apply that module's preset so the message
  // and preview stay meaningful.
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
    enabled: receiverType === 'specific_user',
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
        // Edit mode: keep it to a single module (the one being edited).
        const payload = {
          ...commonPayload,
          name: name || `When ${eventLabel} → notify ${receiverLabel}`,
          source_table: sourceTables[0],
        };
        const { error } = await supabase.from('notification_rules').update(payload).eq('id', rule.id);
        if (error) throw error;
        toast.success('Rule updated');
      } else {
        // Create mode: fan out to one row per selected module.
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg">{isEdit ? 'Edit notification rule' : 'New notification rule'}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}><X size={16} /></Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sentence builder */}
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Rule</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-3 text-sm leading-relaxed">
            <span>When</span>
            <Select value={eventCode} onValueChange={setEventCode}>
              <SelectTrigger className="h-8 w-auto min-w-[180px] inline-flex">
                <SelectValue placeholder="pick an event" />
              </SelectTrigger>
              <SelectContent>
                {eventTypes.map((et: any) => (
                  <SelectItem key={et.event_code} value={et.event_code}>{et.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>happens on</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-[180px] justify-between font-normal"
                  disabled={isEdit}
                  title={isEdit ? 'Editing an existing rule — change modules by creating new rules' : ''}
                >
                  <span className="truncate">{modulesLabel}</span>
                  <ChevronDown size={14} className="opacity-60 ml-2" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-2">
                <div className="text-xs text-muted-foreground px-2 pb-2">
                  Pick one or more modules — one rule will be created per module.
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {SOURCE_TABLES.map((t) => {
                    const checked = sourceTables.includes(t.value);
                    return (
                      <label
                        key={t.value}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleModule(t.value)}
                        />
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
                      className="cursor-pointer gap-1 text-xs"
                      onClick={() => setSourceTables((prev) => [mod, ...prev.filter((m) => m !== mod)])}
                      title="Click to preview this module"
                    >
                      {lbl}
                      <X
                        size={10}
                        className="opacity-70 hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); toggleModule(mod); }}
                      />
                    </Badge>
                  );
                })}
              </div>
            )}
            <span>, notify</span>
            <Select value={receiverType} onValueChange={setReceiverType}>
              <SelectTrigger className="h-8 w-auto min-w-[180px] inline-flex">
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
                <SelectTrigger className="h-8 w-auto min-w-[200px] inline-flex">
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
            <span>via</span>
            <Select value={notification_channel} onValueChange={setChannel}>
              <SelectTrigger className="h-8 w-auto min-w-[140px] inline-flex">
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
        </div>

        {/* Optional rule name */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Rule name (optional)</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Auto-generated from the sentence above" />
        </div>

        {/* Message — templates auto-adapt to the selected module (until you edit them) */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {previewModule ? (
                <>
                  Showing defaults for <span className="font-medium text-foreground">
                    {SOURCE_TABLES.find((t) => t.value === previewModule)?.label}
                  </span>. Edit the Title/Message to customise — tokens in <code>{'{curly}'}</code> get replaced at send time.
                </>
              ) : (
                <>Pick a module above to load recommended defaults.</>
              )}
            </div>
            {(titleTouched.current || messageTouched.current) && previewModule && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  titleTouched.current = false;
                  messageTouched.current = false;
                  setTitleTemplate(preset.title);
                  setMessageTemplate(preset.message);
                }}
              >
                Reset to defaults
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={titleTemplate}
              onChange={(e) => { titleTouched.current = true; setTitleTemplate(e.target.value); }}
            />
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted-foreground mr-1">Insert:</span>
              {preset.tokens.map((t) => (
                <Badge
                  key={`t-${t}`}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 text-xs"
                  onClick={() => insertToken(t, 'title')}
                >
                  {t}
                </Badge>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={messageTemplate}
              onChange={(e) => { messageTouched.current = true; setMessageTemplate(e.target.value); }}
              rows={3}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground mr-1">Insert:</span>
              {preset.tokens.map((t) => (
                <Badge
                  key={`m-${t}`}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 text-xs"
                  onClick={() => insertToken(t, 'message')}
                >
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Live preview — uses the sample values for the currently-selected preview module */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Preview — what the recipient sees{previewModule ? ` (${SOURCE_TABLES.find((t) => t.value === previewModule)?.label})` : ''}
          </Label>
          <div className="rounded-lg border bg-background p-3 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bell size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">{previewTitle}</p>
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Test</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{previewMessage}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(), { addSuffix: true })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving
              ? 'Saving…'
              : isEdit
                ? 'Update rule'
                : sourceTables.length > 1
                  ? `Create ${sourceTables.length} rules`
                  : 'Create rule'}
          </Button>
          <Button variant="outline" onClick={handleSendTest} disabled={testing} className="gap-1.5">
            <Send size={14} /> {testing ? 'Sending…' : 'Send test to me'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

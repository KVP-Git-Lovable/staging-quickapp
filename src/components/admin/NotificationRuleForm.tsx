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
    timezone?: string | null;
  } | null;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

const TIMEZONES: { value: string; label: string }[] = [
  { value: 'Asia/Kolkata', label: 'IST — Asia/Kolkata' },
  { value: 'Asia/Dubai', label: 'GST — Asia/Dubai' },
  { value: 'Asia/Singapore', label: 'SGT — Asia/Singapore' },
  { value: 'Asia/Bangkok', label: 'ICT — Asia/Bangkok' },
  { value: 'Asia/Dhaka', label: 'BST — Asia/Dhaka' },
  { value: 'Asia/Karachi', label: 'PKT — Asia/Karachi' },
  { value: 'Asia/Colombo', label: 'SLT — Asia/Colombo' },
  { value: 'Europe/London', label: 'GMT/BST — Europe/London' },
  { value: 'America/New_York', label: 'ET — America/New_York' },
  { value: 'America/Los_Angeles', label: 'PT — America/Los_Angeles' },
  { value: 'UTC', label: 'UTC' },
];

const formatInTz = (tz: string) => {
  const d = new Date();
  const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
  const time12 = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true });
  const time24 = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = dateFmt.format(d).replace(/ /g, '-');
  const timeStr = time12.format(d);
  const time24Str = time24.format(d);
  return { dateStr, timeStr, time24Str, timestampStr: `${dateStr} ${timeStr}` };
};

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
  { value: 'push', label: 'In-app + push', disabled: false },
  { value: 'email', label: 'Email (coming soon)', disabled: true },
];

// Module -> Sub-event tree. Each sub-event maps to (source_table, event_code)
// + optional default templates. Only fully-wired modules appear here today;
// other modules fall back to the legacy event picker.
type SubEvent = {
  value: string;
  label: string;
  source_table: string;
  event_code: string;
  title?: string;
  message?: string;
};

const MODULE_SUB_EVENTS: Record<string, SubEvent[]> = {
  attendance: [
    {
      value: 'checked_in',
      label: 'Check-in',
      source_table: 'attendance',
      event_code: 'RECORD_CREATED',
      title: '{user_name} — checked in',
      message: '{user_name} checked in at {time} on {date}.',
    },
    {
      value: 'checked_out',
      label: 'Check-out',
      source_table: 'attendance',
      event_code: 'RECORD_UPDATED',
      title: '{user_name} — checked out',
      message: '{user_name} checked out at {time} on {date}.',
    },
    {
      value: 'leave_applied',
      label: 'Leave applied',
      source_table: 'leave_applications',
      event_code: 'RECORD_CREATED',
      title: 'Leave request — {user_name}',
      message: '{user_name} applied for leave on {date}.',
    },
    {
      value: 'regularization_applied',
      label: 'Regularization applied',
      source_table: 'regularization_requests',
      event_code: 'RECORD_CREATED',
      title: 'Regularization — {user_name}',
      message: '{user_name} raised a regularization for {date}.',
    },
    {
      value: 'approval_requested',
      label: 'Approval requested',
      source_table: 'leave_applications',
      event_code: 'RECORD_UPDATED',
      title: 'Approval needed — {user_name}',
      message: '{user_name} requested approval on {date}.',
    },
    {
      value: 'approval_approved',
      label: 'Approval approved',
      source_table: 'leave_applications',
      event_code: 'RECORD_UPDATED',
      title: 'Approval granted — {user_name}',
      message: 'Approval granted for {user_name} on {date}.',
    },
  ],
};

const MODULE_OPTIONS = [
  { value: 'attendance', label: 'Attendance' },
  { value: 'orders', label: 'Orders' },
  { value: 'visits', label: 'Visits' },
  { value: 'leave_applications', label: 'Leaves' },
  { value: 'regularization_requests', label: 'Regularization' },
  { value: 'approval_requests', label: 'Approvals' },
  { value: 'activity_events', label: 'Activity Events' },
  { value: 'pm_tasks', label: 'Tasks' },
  { value: 'retailers', label: 'Retailers' },
  { value: 'branding_requests', label: 'Branding Requests' },
];

const inferInitialModule = (rule: NotificationRuleFormProps['rule']): string => {
  if (!rule) return '';
  // If source_table maps to a curated module, use that; else fall back to raw source_table.
  const found = Object.entries(MODULE_SUB_EVENTS).find(([, subs]) =>
    subs.some((s) => s.source_table === rule.source_table && s.event_code === rule.event_code),
  );
  return found ? found[0] : rule.source_table || '';
};

const inferInitialSubEvent = (rule: NotificationRuleFormProps['rule'], moduleValue: string): string => {
  if (!rule || !moduleValue) return '';
  const subs = MODULE_SUB_EVENTS[moduleValue];
  if (!subs) return '';
  const match = subs.find((s) => s.source_table === rule.source_table && s.event_code === rule.event_code);
  return match?.value || '';
};

type ModulePreset = {
  title: string;
  message: string;
  tokens: string[];
  sample: Record<string, string>;
};

const now = new Date();
const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
const time24Str = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
const timestampStr = `${dateStr} ${timeStr}`;

const TIMESTAMP_FORMATS: { token: string; label: string; hint: string }[] = [
  { token: '{time}', label: 'Time (12-hour)', hint: 'e.g. 11:07 AM' },
  { token: '{time_24}', label: 'Time (24-hour)', hint: 'e.g. 23:07' },
  { token: '{date}', label: 'Date only', hint: 'e.g. 22-Jul-2026' },
  { token: '{timestamp}', label: 'Date + Time', hint: 'e.g. 22-Jul-2026 11:07 AM' },
];

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
  const [receiverUserIds, setReceiverUserIds] = useState<string[]>(rule?.receiver_user_id ? [rule.receiver_user_id] : []);
  const [notification_channel, setChannel] = useState(rule?.notification_channel || 'in_app');
  const [titleTemplate, setTitleTemplate] = useState(rule?.title_template || DEFAULT_PRESET.title);
  const [messageTemplate, setMessageTemplate] = useState(rule?.message_template || DEFAULT_PRESET.message);
  const [timezone, setTimezone] = useState(rule?.timezone || 'Asia/Kolkata');
  const titleTouched = useRef(!!rule?.title_template);
  const messageTouched = useRef(!!rule?.message_template);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [moduleValue, setModuleValue] = useState(() => inferInitialModule(rule));
  const [subEventValues, setSubEventValues] = useState<string[]>(() => {
    const v = inferInitialSubEvent(rule, inferInitialModule(rule));
    return v ? [v] : [];
  });
  // Per-sub-event editable templates (curated modules only). Keyed by sub-event value.
  type TplState = { title: string; message: string; titleTouched: boolean; messageTouched: boolean };
  const [subEventTemplates, setSubEventTemplates] = useState<Record<string, TplState>>(() => {
    const initMod = inferInitialModule(rule);
    const initSub = inferInitialSubEvent(rule, initMod);
    if (rule && initSub) {
      return {
        [initSub]: {
          title: rule.title_template || DEFAULT_PRESET.title,
          message: rule.message_template || DEFAULT_PRESET.message,
          titleTouched: true,
          messageTouched: true,
        },
      };
    }
    return {};
  });
  const [activeSubEvent, setActiveSubEvent] = useState<string>(() => {
    const initMod = inferInitialModule(rule);
    return inferInitialSubEvent(rule, initMod) || '';
  });

  const isEdit = !!rule;
  const isCuratedModule = !!MODULE_SUB_EVENTS[moduleValue];
  const currentSubEvents = MODULE_SUB_EVENTS[moduleValue] || [];
  const activeSubEventObj = currentSubEvents.find((s) => s.value === activeSubEvent);
  const previewModule = isCuratedModule
    ? (activeSubEventObj?.source_table || moduleValue)
    : sourceTables[0] || '';
  const preset = useMemo(() => presetFor(previewModule), [previewModule]);
  const previewModuleLabel = SOURCE_TABLES.find((t) => t.value === previewModule)?.label
    || MODULE_OPTIONS.find((m) => m.value === previewModule)?.label;

  // Keep subEventTemplates in sync with the selected sub-events; seed defaults on add, prune on remove.
  useEffect(() => {
    if (!isCuratedModule) return;
    setSubEventTemplates((prev) => {
      const next: Record<string, TplState> = {};
      for (const sv of subEventValues) {
        if (prev[sv]) {
          next[sv] = prev[sv];
        } else {
          const s = currentSubEvents.find((x) => x.value === sv);
          next[sv] = {
            title: s?.title || DEFAULT_PRESET.title,
            message: s?.message || DEFAULT_PRESET.message,
            titleTouched: false,
            messageTouched: false,
          };
        }
      }
      return next;
    });
    setActiveSubEvent((cur) => (subEventValues.includes(cur) ? cur : subEventValues[0] || ''));
  }, [isCuratedModule, moduleValue, subEventValues.join('|')]);

  // Mirror the active sub-event into the legacy eventCode/sourceTables state so
  // the "Send test" action and downstream save reflect the tab currently in view.
  useEffect(() => {
    if (!isCuratedModule || !activeSubEventObj) return;
    setEventCode(activeSubEventObj.event_code);
    setSourceTables([activeSubEventObj.source_table]);
  }, [isCuratedModule, activeSubEventObj?.value]);

  // Effective template values shown in the editor + preview.
  const activeTpl = isCuratedModule ? subEventTemplates[activeSubEvent] : undefined;
  const effectiveTitle = isCuratedModule ? (activeTpl?.title ?? '') : titleTemplate;
  const effectiveMessage = isCuratedModule ? (activeTpl?.message ?? '') : messageTemplate;
  const editingDisabled = isCuratedModule && !activeSubEvent;

  const updateActiveTitle = (val: string) => {
    if (isCuratedModule) {
      if (!activeSubEvent) return;
      setSubEventTemplates((prev) => ({
        ...prev,
        [activeSubEvent]: { ...prev[activeSubEvent], title: val, titleTouched: true },
      }));
    } else {
      titleTouched.current = true;
      setTitleTemplate(val);
    }
  };
  const updateActiveMessage = (val: string) => {
    if (isCuratedModule) {
      if (!activeSubEvent) return;
      setSubEventTemplates((prev) => ({
        ...prev,
        [activeSubEvent]: { ...prev[activeSubEvent], message: val, messageTouched: true },
      }));
    } else {
      messageTouched.current = true;
      setMessageTemplate(val);
    }
  };
  const appendToActiveTitle = (token: string) => updateActiveTitle(effectiveTitle + token);
  const appendToActiveMessage = (token: string) => updateActiveMessage(effectiveMessage + token);
  const resetActiveTemplates = () => {
    if (isCuratedModule && activeSubEventObj) {
      setSubEventTemplates((prev) => ({
        ...prev,
        [activeSubEvent]: {
          title: activeSubEventObj.title || DEFAULT_PRESET.title,
          message: activeSubEventObj.message || DEFAULT_PRESET.message,
          titleTouched: false,
          messageTouched: false,
        },
      }));
    } else {
      titleTouched.current = false;
      messageTouched.current = false;
      setTitleTemplate(preset.title);
      setMessageTemplate(preset.message);
    }
  };
  const activeTouched = isCuratedModule
    ? !!(activeTpl?.titleTouched || activeTpl?.messageTouched)
    : (titleTouched.current || messageTouched.current);

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
    // Build the list of (event_code, source_table, label) variants to fan out over.
    // Curated modules with multi-select sub-events produce one variant per sub-event;
    // legacy modules produce one variant per selected source_table using the single eventCode.
    const variants: Array<{ event_code: string; source_table: string; label: string; title: string; message: string }> =
      isCuratedModule
        ? subEventValues
            .map((sv) => currentSubEvents.find((s) => s.value === sv))
            .filter(Boolean)
            .map((s) => {
              const tpl = subEventTemplates[s!.value];
              return {
                event_code: s!.event_code,
                source_table: s!.source_table,
                label: s!.label,
                title: tpl?.title || s!.title || DEFAULT_PRESET.title,
                message: tpl?.message || s!.message || DEFAULT_PRESET.message,
              };
            })
        : sourceTables.map((mod) => ({
            event_code: eventCode,
            source_table: mod,
            label: SOURCE_TABLES.find((t) => t.value === mod)?.label || mod,
            title: titleTemplate,
            message: messageTemplate,
          }));

    if (variants.length === 0) {
      toast.error(isCuratedModule ? 'Please pick at least one sub-event' : 'Please pick an event and at least one module');
      return;
    }
    if (receiverType === 'specific_user' && receiverUserIds.length === 0) {
      toast.error('Please pick at least one person');
      return;
    }
    setSaving(true);
    try {
      const receiverLabel = RECEIVER_OPTIONS.find((r) => r.value === receiverType)?.label || receiverType;

      const commonPayload = {
        receiver_type: receiverType,
        receiver_role: receiverType === 'role' ? receiverRole : null,
        notification_channel,
        timezone,
        updated_at: new Date().toISOString(),
      };

      // For specific_user: fan out one rule per selected user (schema stores single UUID).
      const targetUserIds =
        receiverType === 'specific_user' && receiverUserIds.length > 0 ? receiverUserIds : [null];

      if (isEdit && rule) {
        // Edit only updates the first variant + first user (keeps behaviour predictable).
        const v = variants[0];
        const payload = {
          ...commonPayload,
          event_code: v.event_code,
          source_table: v.source_table,
          title_template: v.title,
          message_template: v.message,
          receiver_user_id: receiverType === 'specific_user' ? (receiverUserIds[0] || null) : null,
          name: name || `When ${v.label} → notify ${receiverLabel}`,
        };
        const { error } = await supabase.from('notification_rules').update(payload).eq('id', rule.id);
        if (error) throw error;
        toast.success('Rule updated');
      } else {
        const rows = variants.flatMap((v) =>
          targetUserIds.map((uid) => {
            const userLabel =
              uid && receiverType === 'specific_user'
                ? pickUsers.find((u) => u.id === uid)?.name || 'user'
                : receiverLabel;
            const multi = variants.length > 1 || targetUserIds.length > 1;
            return {
              ...commonPayload,
              event_code: v.event_code,
              source_table: v.source_table,
              title_template: v.title,
              message_template: v.message,
              receiver_user_id: uid,
              name: name
                ? multi
                  ? `${name} — ${v.label}${uid ? ` — ${userLabel}` : ''}`
                  : name
                : `When ${v.label} → notify ${uid ? userLabel : receiverLabel}`,
              created_by: userId,
            };
          }),
        );
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

  const tzNow = useMemo(() => formatInTz(timezone), [timezone]);
  const sampleCtx: Record<string, string> = { ...preset.sample, timestamp: tzNow.timestampStr, datetime: tzNow.timestampStr, time_24: tzNow.time24Str, date: tzNow.dateStr, time: tzNow.timeStr };
  const previewTitle = renderTemplate(effectiveTitle, sampleCtx);
  const previewMessage = renderTemplate(effectiveMessage, sampleCtx);

  // Reusable pill classnames for the inline sentence-builder selects.
  const pillTrigger =
    'h-8 min-w-[160px] w-auto inline-flex bg-white border-sky-200 rounded-lg text-sm font-semibold text-slate-700 hover:border-sky-400 focus:ring-2 focus:ring-sky-400/30';

  return (
    <div className="w-full bg-white rounded-2xl shadow-lg shadow-sky-200/40 border border-sky-100 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 md:px-8 py-5 border-b border-sky-100 flex items-start justify-between bg-white">
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
          <div className="p-4 md:p-5 bg-sky-50/60 rounded-xl border border-sky-200 flex flex-wrap items-center gap-x-3 gap-y-3 text-slate-700 leading-relaxed">
            <span className="font-medium">When something happens in module</span>
            <Select
              value={moduleValue}
              onValueChange={(v) => {
                setModuleValue(v);
                setSubEventValues([]);
                if (!MODULE_SUB_EVENTS[v]) {
                  // Legacy path: seed sourceTables so downstream save still works.
                  setSourceTables([v]);
                } else {
                  setSourceTables([]);
                  setEventCode('');
                }
              }}
              disabled={isEdit}
            >
              <SelectTrigger className={pillTrigger}>
                <SelectValue placeholder="pick a module" />
              </SelectTrigger>
              <SelectContent>
                {MODULE_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isCuratedModule ? (
              <>
                <span className="font-medium">happens on</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`${pillTrigger} justify-between`}
                    >
                      <span className="truncate">
                        {subEventValues.length === 0
                          ? 'pick sub-event(s)'
                          : subEventValues.length === 1
                            ? currentSubEvents.find((s) => s.value === subEventValues[0])?.label || '1 sub-event'
                            : `${subEventValues.length} sub-events`}
                      </span>
                      <ChevronDown size={14} className="opacity-60 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-2">
                    <div className="text-xs text-muted-foreground px-2 pb-2">
                      Select one or more triggers
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {currentSubEvents.map((s) => {
                        const checked = subEventValues.includes(s.value);
                        return (
                          <label
                            key={s.value}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-sky-50 cursor-pointer"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                setSubEventValues((prev) =>
                                  v ? [...prev, s.value] : prev.filter((x) => x !== s.value),
                                );
                              }}
                            />
                            <span className="text-sm text-slate-700">{s.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </>
            ) : moduleValue ? (
              <>
                <span className="font-medium">when</span>
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
              </>
            ) : null}


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
              <Select value={receiverRole} onValueChange={setReceiverRole} disabled={pickUsersLoading}>
                <SelectTrigger className={`${pillTrigger} min-w-[160px]`}>
                  <SelectValue placeholder={pickUsersLoading ? 'Loading roles…' : 'pick a role'} />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const roles = Array.from(
                      new Set(
                        (pickUsers || [])
                          .map((u) => (u.role || '').trim())
                          .filter((r) => r.length > 0),
                      ),
                    ).sort((a, b) => a.localeCompare(b));
                    if (pickUsersLoading) {
                      return <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</div>;
                    }
                    if (roles.length === 0) {
                      return <div className="px-2 py-1.5 text-sm text-muted-foreground">No roles found</div>;
                    }
                    return roles.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
            )}
            {receiverType === 'specific_user' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 min-w-[200px] justify-between font-semibold text-slate-700 bg-white border-sky-200 rounded-lg hover:border-sky-400"
                    disabled={pickUsersLoading}
                  >
                    <span className="truncate">
                      {pickUsersLoading
                        ? 'Loading users…'
                        : receiverUserIds.length === 0
                          ? 'pick people'
                          : receiverUserIds.length === 1
                            ? pickUsers.find((u) => u.id === receiverUserIds[0])?.name || '1 person'
                            : `${receiverUserIds.length} people`}
                    </span>
                    <ChevronDown size={14} className="opacity-60 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-2">
                  <div className="text-xs text-muted-foreground px-2 pb-2">
                    Select one or more people — one rule per person will be created.
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {pickUsers.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">No active users found</div>
                    ) : (
                      pickUsers.map((u) => {
                        const checked = receiverUserIds.includes(u.id);
                        return (
                          <label
                            key={u.id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() =>
                                setReceiverUserIds((prev) =>
                                  prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id],
                                )
                              }
                            />
                            <div className="flex flex-col">
                              <span>{u.name}</span>
                              {u.role && <span className="text-xs text-muted-foreground">{u.role}</span>}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
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

            <span className="font-medium">in</span>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className={`${pillTrigger} min-w-[220px]`} title="Timezone used for {date}, {time}, {timestamp} tokens">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>.</span>
          </div>

          {/* Who will receive this — live resolver */}
          <RecipientPreview
            receiverType={receiverType}
            receiverRole={receiverRole}
            receiverUserId={receiverUserIds[0] || ''}
            receiverUserIds={receiverUserIds}
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
                className="bg-white border-sky-200 focus-visible:ring-sky-400/30 focus-visible:border-sky-400"
              />
              <p className="text-[11px] text-slate-500 flex items-start gap-1">
                <Info size={11} className="mt-0.5 flex-shrink-0 text-slate-400" />
                Leave blank to auto-generate a name from the sentence above. Only admins see this — the recipient sees Title/Message.
              </p>
            </div>

            {/* Sub-event tabs — one per selected "happens on" event, each with its own Title/Message */}
            {isCuratedModule && subEventValues.length > 0 && (
              <div className="border-b border-sky-100">
                <div className="flex flex-wrap items-end gap-1 -mb-px">
                  {subEventValues.map((sv) => {
                    const s = currentSubEvents.find((x) => x.value === sv);
                    const label = s?.label || sv;
                    const active = activeSubEvent === sv;
                    const edited = subEventTemplates[sv]?.titleTouched || subEventTemplates[sv]?.messageTouched;
                    return (
                      <button
                        key={sv}
                        type="button"
                        onClick={() => setActiveSubEvent(sv)}
                        className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                          active
                            ? 'border-sky-500 text-slate-900'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {label}
                        {edited && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" title="Edited" />}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Each sub-event has its own Title and Message. Switch tabs to configure each one — one rule is created per sub-event on save.
                </p>
              </div>
            )}

            {/* Module-aware banner */}
            <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-[12px] text-slate-700 flex items-start gap-2">
              <Info size={13} className="mt-0.5 flex-shrink-0 text-slate-500" />
              {previewModule ? (
                <span>
                  {isCuratedModule && activeSubEventObj ? (
                    <>Editing <span className="font-semibold">{activeSubEventObj.label}</span> — defaults tuned for <span className="font-semibold">{previewModuleLabel}</span>. </>
                  ) : (
                    <>Showing suggested defaults for <span className="font-semibold">{previewModuleLabel}</span>. </>
                  )}
                  Anything in <code className="px-1 py-0.5 rounded bg-white border border-sky-200 text-slate-800">{'{curly}'}</code> is replaced with real data at send time — click a token chip below or type your own text.
                </span>
              ) : (
                <span>Pick a module above to load recommended Title/Message defaults for that record type.</span>
              )}
              {activeTouched && previewModule && (
                <button
                  className="ml-auto text-slate-700 font-medium hover:underline flex-shrink-0"
                  onClick={resetActiveTemplates}
                >
                  Reset
                </button>
              )}
            </div>

            {editingDisabled ? (
              <div className="rounded-lg border border-dashed border-sky-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                Pick at least one sub-event above to configure its Title and Message.
              </div>
            ) : (
              <>
                {/* Title */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-slate-700">
                      Title
                      {isCuratedModule && activeSubEventObj && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-sky-600 font-bold">
                          {activeSubEventObj.label}
                        </span>
                      )}
                    </Label>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Headline shown to recipient</span>
                  </div>
                  <Input
                    value={effectiveTitle}
                    onChange={(e) => updateActiveTitle(e.target.value)}
                    className="font-medium text-slate-900 focus-visible:ring-sky-400/30 focus-visible:border-sky-500"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-400 self-center mr-1">Insert:</span>
                    {preset.tokens.map((t) => (
                      <button
                        key={`t-${t}`}
                        type="button"
                        onClick={() => appendToActiveTitle(t)}
                        className="px-2 py-1 bg-sky-100 text-slate-700 rounded text-[11px] font-bold cursor-pointer hover:bg-slate-200 transition-colors"
                      >
                        {t}
                      </button>
                    ))}
                    <TimestampPicker onPick={(tok) => appendToActiveTitle(tok)} />
                  </div>
                </div>

                {/* Message */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-slate-700">
                      Message
                      {isCuratedModule && activeSubEventObj && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-sky-600 font-bold">
                          {activeSubEventObj.label}
                        </span>
                      )}
                    </Label>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Body of the notification</span>
                  </div>
                  <Textarea
                    value={effectiveMessage}
                    onChange={(e) => updateActiveMessage(e.target.value)}
                    rows={4}
                    className="resize-none leading-relaxed focus-visible:ring-sky-400/30 focus-visible:border-sky-500"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-400 self-center mr-1">Insert:</span>
                    {preset.tokens.map((t) => (
                      <button
                        key={`m-${t}`}
                        type="button"
                        onClick={() => appendToActiveMessage(t)}
                        className="px-2 py-1 bg-sky-100 text-slate-700 rounded text-[11px] font-bold cursor-pointer hover:bg-slate-200 transition-colors"
                      >
                        {t}
                      </button>
                    ))}
                    <TimestampPicker onPick={(tok) => appendToActiveMessage(tok)} />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* RIGHT — live preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Live Preview
                {isCuratedModule && activeSubEventObj && (
                  <span className="ml-2 text-sky-600">· {activeSubEventObj.label}</span>
                )}
              </span>
              <span className="text-[10px] bg-sky-100 px-1.5 py-0.5 rounded text-slate-500 uppercase">In-app toast</span>
            </div>
            <div className="relative bg-sky-50/50 rounded-2xl p-6 border border-sky-100 flex items-center justify-center min-h-[240px]">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.02]">
                <div className="w-32 h-32 border-4 border-sky-200 rounded-full" />
              </div>
              <div className="relative bg-white shadow-2xl shadow-sky-200/40 border border-sky-100 rounded-xl p-4 w-full max-w-[340px]">
                <div className="flex gap-3">
                  <div className="shrink-0 w-10 h-10 bg-sky-400 rounded-lg flex items-center justify-center text-white">
                    <Bell size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900 truncate">{previewTitle}</h4>
                      <span className="text-[9px] bg-sky-100 px-1.5 py-0.5 rounded text-slate-500 font-bold tracking-tight uppercase flex-shrink-0">Test</span>
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
      <div className="px-6 md:px-8 py-5 bg-white border-t border-sky-100 flex items-center justify-between">
        <Button variant="ghost" onClick={onClose} className="text-slate-500 hover:text-slate-800">
          Cancel
        </Button>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleSendTest}
            disabled={testing}
            className="gap-1.5 bg-white border-sky-200 text-slate-700 hover:bg-sky-50 shadow-sm"
          >
            <Send size={14} /> {testing ? 'Sending…' : 'Send test to me'}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-sky-500 hover:bg-sky-600 text-white shadow-sm shadow-sky-200/60"
          >
            {(() => {
              if (saving) return 'Saving…';
              if (isEdit) return 'Update rule';
              const variantCount = isCuratedModule ? subEventValues.length : sourceTables.length;
              const userCount = receiverType === 'specific_user' ? Math.max(receiverUserIds.length, 1) : 1;
              const total = variantCount * userCount;
              return total > 1 ? `Create ${total} rules` : 'Create rule';
            })()}
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
  receiverUserIds?: string[];
  pickUsers: Array<{ id: string; name: string; role: string | null }>;
  currentUserId: string;
}

function RecipientPreview({
  receiverType,
  receiverRole,
  receiverUserId,
  receiverUserIds,
  pickUsers,
  currentUserId,
}: RecipientPreviewProps) {
  const actorDependent = ['employee', 'manager', 'hierarchy'].includes(receiverType);
  const [sampleActor, setSampleActor] = useState<string>(currentUserId);

  useEffect(() => {
    if (!sampleActor && currentUserId) setSampleActor(currentUserId);
  }, [currentUserId, sampleActor]);

  const isMultiSpecific = receiverType === 'specific_user' && (receiverUserIds?.length || 0) > 1;

  const { data, isLoading } = useQuery({
    queryKey: [
      'notif-preview-recipients',
      receiverType,
      receiverRole,
      receiverUserId,
      (receiverUserIds || []).join(','),
      actorDependent ? sampleActor : null,
    ],
    queryFn: async () => {
      // For multi-select "specific people", resolve locally from pickUsers —
      // avoids N RPC calls and mirrors the fan-out that happens on save.
      if (isMultiSpecific) {
        return (receiverUserIds || [])
          .map((id) => pickUsers.find((u) => u.id === id))
          .filter(Boolean)
          .map((u) => ({ id: u!.id, name: u!.name, role: u!.role })) as Array<{ id: string; name: string; role: string | null }>;
      }
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
            <SelectTrigger className="h-7 w-auto min-w-[140px] text-xs bg-white border-sky-300">
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
          <Badge className="bg-sky-500 hover:bg-sky-600 text-xs">
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


// ============================================================
// TimestampPicker — chip that inserts a chosen timestamp token
// ============================================================
function TimestampPicker({ onPick }: { onPick: (token: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="px-2 py-1 bg-sky-100 text-slate-700 rounded text-[11px] font-bold cursor-pointer hover:bg-slate-200 transition-colors inline-flex items-center gap-1"
          title="Insert a timestamp in your preferred format"
        >
          🕒 Timestamp <ChevronDown size={10} className="opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-2 pt-1 pb-1.5">
          Pick a format (IST)
        </div>
        {TIMESTAMP_FORMATS.map((f) => (
          <button
            key={f.token}
            type="button"
            onClick={() => onPick(f.token)}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-sky-50 flex flex-col"
          >
            <span className="text-sm font-medium text-slate-800">{f.label}</span>
            <span className="text-[11px] text-slate-500">
              <code className="text-slate-600">{f.token}</code> — {f.hint}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

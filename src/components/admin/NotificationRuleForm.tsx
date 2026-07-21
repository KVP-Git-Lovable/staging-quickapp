import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, Send, Bell } from 'lucide-react';
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

const TOKENS = ['{user_name}', '{date}', '{time}', '{beat}', '{record_name}'];

const SAMPLE_CTX: Record<string, string> = {
  user_name: 'Ajay Kumar',
  date: new Date().toLocaleDateString(),
  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  beat: 'Beat 3 – MG Road',
  record_name: 'Order #1284',
  module_name: 'orders',
  points: '50',
};

const renderTemplate = (tpl: string, ctx: Record<string, string> = SAMPLE_CTX) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? `{${k}}`);

export function NotificationRuleForm({ rule, userId, onClose, onSaved }: NotificationRuleFormProps) {
  const [name, setName] = useState(rule?.name || '');
  const [eventCode, setEventCode] = useState(rule?.event_code || '');
  const [sourceTable, setSourceTable] = useState(rule?.source_table || '');
  const [receiverType, setReceiverType] = useState(rule?.receiver_type || 'employee');
  const [receiverRole, setReceiverRole] = useState(rule?.receiver_role || '');
  const [receiverUserId, setReceiverUserId] = useState(rule?.receiver_user_id || '');
  const [notification_channel, setChannel] = useState(rule?.notification_channel || 'in_app');
  const [titleTemplate, setTitleTemplate] = useState(rule?.title_template || '{user_name} – {record_name}');
  const [messageTemplate, setMessageTemplate] = useState(
    rule?.message_template || '{user_name} updated {record_name} on {date} at {time}.'
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

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

  const insertToken = (token: string, target: 'title' | 'message') => {
    if (target === 'title') setTitleTemplate((p) => p + token);
    else setMessageTemplate((p) => p + token);
  };

  const handleSave = async () => {
    if (!eventCode || !sourceTable) {
      toast.error('Please pick an event and a module');
      return;
    }
    setSaving(true);
    try {
      const eventLabel = eventTypes.find((e) => e.event_code === eventCode)?.label || eventCode;
      const receiverLabel = RECEIVER_OPTIONS.find((r) => r.value === receiverType)?.label || receiverType;
      const autoName = name || `When ${eventLabel} → notify ${receiverLabel}`;

      const payload = {
        name: autoName,
        event_code: eventCode,
        source_table: sourceTable,
        receiver_type: receiverType,
        receiver_role: receiverType === 'role' ? receiverRole : null,
        notification_channel,
        title_template: titleTemplate,
        message_template: messageTemplate,
        updated_at: new Date().toISOString(),
        ...(rule ? {} : { created_by: userId }),
      };

      if (rule) {
        const { error } = await supabase.from('notification_rules').update(payload).eq('id', rule.id);
        if (error) throw error;
        toast.success('Rule updated');
      } else {
        const { error } = await supabase.from('notification_rules').insert(payload);
        if (error) throw error;
        toast.success('Rule created');
      }
      onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!eventCode || !sourceTable) {
      toast.error('Pick an event and module first');
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.rpc('notify_send_test' as any, {
        p_event_code: eventCode,
        p_source_table: sourceTable,
      });
      if (error) throw error;
      const result: any = Array.isArray(data) ? data[0] : data;
      const count = result?.recipient_count ?? 0;
      const names: string[] = result?.recipients ?? [];
      if (count === 0) {
        toast.warning('Test sent — but no recipients resolved for this rule');
      } else {
        toast.success(`Test sent to ${count} ${count === 1 ? 'person' : 'people'}: ${names.slice(0, 5).join(', ')}${names.length > 5 ? '…' : ''}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to send test');
    } finally {
      setTesting(false);
    }
  };

  const previewTitle = renderTemplate(titleTemplate);
  const previewMessage = renderTemplate(messageTemplate);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg">{rule ? 'Edit notification rule' : 'New notification rule'}</CardTitle>
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
            <Select value={sourceTable} onValueChange={setSourceTable}>
              <SelectTrigger className="h-8 w-auto min-w-[160px] inline-flex">
                <SelectValue placeholder="pick a module" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TABLES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

        {/* Message */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={titleTemplate} onChange={(e) => setTitleTemplate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea value={messageTemplate} onChange={(e) => setMessageTemplate(e.target.value)} rows={3} />
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground mr-1">Insert:</span>
              {TOKENS.map((t) => (
                <Badge
                  key={t}
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

        {/* Live preview */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Preview — what the recipient sees</Label>
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
            {saving ? 'Saving…' : rule ? 'Update rule' : 'Create rule'}
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

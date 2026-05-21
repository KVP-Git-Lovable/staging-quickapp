import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Plus, Pencil, Trash2, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { NotificationRuleForm } from '@/components/admin/NotificationRuleForm';
import { BannerHistorySection } from '@/components/admin/BannerHistorySection';
import { useAuth } from '@/hooks/useAuth';

interface NotificationRule {
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
  is_active: boolean;
  created_at: string;
}

const NotificationRulesAdmin = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<NotificationRule | null>(null);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['notification-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_rules')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as NotificationRule[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('notification_rules')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
      toast.success('Rule updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notification_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
      toast.success('Rule deleted');
    },
  });

  const handleEdit = (rule: NotificationRule) => {
    setEditingRule(rule);
    setShowForm(true);
  };

  const handleClose = () => {
    setShowForm(false);
    setEditingRule(null);
  };

  const receiverLabel = (rule: NotificationRule) => {
    if (rule.receiver_type === 'role') return `Role: ${rule.receiver_role}`;
    if (rule.receiver_type === 'specific_user') return 'Specific User';
    return rule.receiver_type.charAt(0).toUpperCase() + rule.receiver_type.slice(1);
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle p-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Button onClick={() => navigate('/admin')} variant="ghost" size="sm" className="p-2">
              <ArrowLeft size={20} />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">Notification Rules</h1>
              <p className="text-muted-foreground text-sm">Configure event-based notification rules</p>
            </div>
            <Button onClick={() => { setEditingRule(null); setShowForm(true); }} className="gap-2">
              <Plus size={16} /> Add Rule
            </Button>
          </div>

          {showForm && (
            <NotificationRuleForm
              rule={editingRule}
              userId={user?.id || ''}
              onClose={handleClose}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
                handleClose();
              }}
            />
          )}

          <BannerHistorySection />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bell size={18} /> Active Rules ({rules.filter(r => r.is_active).length} / {rules.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : rules.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Bell className="mx-auto h-12 w-12 mb-3 opacity-30" />
                  <p>No notification rules configured yet</p>
                  <p className="text-xs mt-1">Create your first rule to start sending automated notifications</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Receiver</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{rule.event_code}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{rule.source_table}</TableCell>
                        <TableCell className="text-sm">{receiverLabel(rule)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{rule.notification_channel}</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={rule.is_active}
                            onCheckedChange={(checked) => toggleMutation.mutate({ id: rule.id, is_active: checked })}
                          />
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(rule)}>
                            <Pencil size={14} />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(rule.id)}>
                            <Trash2 size={14} className="text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default NotificationRulesAdmin;

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Trash2, 
  ArrowLeft, 
  Loader2,
  Settings,
  FileText,
  Calendar,
  User,
  Database,
  Save
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAdminAccess } from "@/hooks/useAdminAccess";

interface RecycleBinConfig {
  id: string;
  auto_delete_days: number;
  is_enabled: boolean;
  show_deletion_log_to_users: boolean;
  require_confirmation: boolean;
}

interface DeletionLog {
  id: string;
  original_table: string;
  original_id: string;
  record_data: any;
  module_name: string;
  record_name: string | null;
  deleted_from_bin_by: string;
  deleted_from_bin_at: string;
  original_deleted_by: string;
  original_deleted_at: string;
  deleted_by_name?: string;
  original_deleted_by_name?: string;
}

const RecycleBinAdmin = () => {
  const navigate = useNavigate();
  const { hasAdminAccess } = useAdminAccess();
  const [config, setConfig] = useState<RecycleBinConfig | null>(null);
  const [deletionLogs, setDeletionLogs] = useState<DeletionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!hasAdminAccess) {
      navigate('/dashboard');
      return;
    }
    fetchData();
  }, [hasAdminAccess]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch config
      const { data: configData, error: configError } = await supabase
        .from('recycle_bin_config')
        .select('*')
        .limit(1)
        .single();

      if (configError && configError.code !== 'PGRST116') throw configError;
      setConfig(configData);

      // Fetch deletion logs
      const { data: logsData, error: logsError } = await supabase
        .from('permanent_deletion_log')
        .select('*')
        .order('deleted_from_bin_at', { ascending: false })
        .limit(100);

      if (logsError) throw logsError;

      // Get unique user IDs
      const userIds = [...new Set([
        ...(logsData || []).map(log => log.deleted_from_bin_by),
        ...(logsData || []).map(log => log.original_deleted_by)
      ])];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, username')
        .in('id', userIds);

      const profileMap = new Map(
        (profiles || []).map(p => [p.id, p.full_name || p.username || 'Unknown'])
      );

      const logsWithNames = (logsData || []).map(log => ({
        ...log,
        deleted_by_name: profileMap.get(log.deleted_from_bin_by) || 'Unknown',
        original_deleted_by_name: profileMap.get(log.original_deleted_by) || 'Unknown'
      }));

      setDeletionLogs(logsWithNames);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load recycle bin settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('recycle_bin_config')
        .update({
          auto_delete_days: config.auto_delete_days,
          is_enabled: config.is_enabled,
          show_deletion_log_to_users: config.show_deletion_log_to_users,
          require_confirmation: config.require_confirmation,
          updated_at: new Date().toISOString()
        })
        .eq('id', config.id);

      if (error) throw error;
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const filteredLogs = deletionLogs.filter(log => 
    (log.record_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    log.module_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.original_table.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 space-y-4 pb-20">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Recycle Bin Master
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure recycle bin settings and view deletion logs
            </p>
          </div>
        </div>

        <Tabs defaultValue="settings" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="settings" className="flex items-center gap-1">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              Deletion Logs
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recycle Bin Configuration</CardTitle>
                <CardDescription>
                  Control how the recycle bin behaves across the application
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {config && (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Enable Recycle Bin</Label>
                        <p className="text-sm text-muted-foreground">
                          When enabled, deleted items go to recycle bin instead of permanent deletion
                        </p>
                      </div>
                      <Switch
                        checked={config.is_enabled}
                        onCheckedChange={(checked) => setConfig({ ...config, is_enabled: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Require Confirmation</Label>
                        <p className="text-sm text-muted-foreground">
                          Show confirmation dialog before moving items to recycle bin
                        </p>
                      </div>
                      <Switch
                        checked={config.require_confirmation}
                        onCheckedChange={(checked) => setConfig({ ...config, require_confirmation: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Show Deletion Log to Users</Label>
                        <p className="text-sm text-muted-foreground">
                          Allow non-admin users to view the permanent deletion log
                        </p>
                      </div>
                      <Switch
                        checked={config.show_deletion_log_to_users}
                        onCheckedChange={(checked) => setConfig({ ...config, show_deletion_log_to_users: checked })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Auto-Delete After (Days)</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically permanently delete items after this many days (0 = never)
                      </p>
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        value={config.auto_delete_days}
                        onChange={(e) => setConfig({ ...config, auto_delete_days: parseInt(e.target.value) || 0 })}
                        className="w-32"
                      />
                    </div>

                    <Button onClick={handleSaveConfig} disabled={saving}>
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Save className="h-4 w-4 mr-1" />
                      )}
                      Save Settings
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Deletion Logs Tab */}
          <TabsContent value="logs" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Permanent Deletion Log
                </CardTitle>
                <CardDescription>
                  Audit trail of all permanently deleted items ({deletionLogs.length} records)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <Input
                    placeholder="Search logs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="max-w-sm"
                  />
                </div>

                {filteredLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No deletion logs found</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Record</TableHead>
                          <TableHead>Module</TableHead>
                          <TableHead>Originally Deleted</TableHead>
                          <TableHead>Permanently Deleted</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{log.record_name || 'Unknown'}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Database className="h-3 w-3" />
                                  {log.original_table}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{log.module_name}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <p className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {log.original_deleted_by_name}
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(log.original_deleted_at), 'MMM d, yyyy h:mm a')}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <p className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {log.deleted_by_name}
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(log.deleted_from_bin_at), 'MMM d, yyyy h:mm a')}
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default RecycleBinAdmin;

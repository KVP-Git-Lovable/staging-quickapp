import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Save, Info, Plus, Trash2, Edit, Check, ChevronsUpDown, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { usePermissions } from "@/hooks/usePermissions";


interface CreditConfig {
  id: string;
  config_name: string;
  is_enabled: boolean;
  is_active: boolean;
  scoring_mode: 'manual' | 'ai_driven';
  lookback_period_months: number;
  new_retailer_starting_score: number;
  payment_term_days: number;
  credit_multiplier: number;
  target_growth_rate_percent: number;
  target_order_frequency: number;
  weight_growth_rate: number;
  weight_repayment_dso: number;
  weight_order_frequency: number;
  territory_ids: string[];
}

interface Territory {
  id: string;
  name: string;
  region: string;
  zone?: string;
}

export const CreditManagementConfig = () => {
  const queryClient = useQueryClient();
  const { can, loading: permsLoading } = usePermissions();
  const canEditCnSettings = can('credit_note_settings', 'edit');

  // ---- Credit Note approval toggle (credit_note_config) ----
  const { data: cnConfig, isLoading: cnConfigLoading } = useQuery({
    queryKey: ['credit-note-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_note_config')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // ---- Credit Note approver config (approval_config WHERE entity_type='credit_note') ----
  const { data: cnApprovalConfig, isLoading: cnApprovalLoading } = useQuery({
    queryKey: ['approval-config', 'credit_note'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_config')
        .select('*')
        .eq('entity_type', 'credit_note')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // ---- Active users for "specific approver" picker (paginated, capped) ----
  const { data: activeUsers } = useQuery({
    queryKey: ['profiles-active-for-cn-approver'],
    queryFn: async () => {
      const all: Array<{ id: string; full_name: string | null }> = [];
      const pageSize = 500;
      for (let from = 0; from < 5000; from += pageSize) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('is_active', true)
          .order('full_name', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
      }
      return all;
    },
  });

  // Local UI state for approver mode + picker
  const [approverMode, setApproverMode] = useState<'manager' | 'specific'>('manager');
  const [specificApproverId, setSpecificApproverId] = useState<string | null>(null);
  const [approverPickerOpen, setApproverPickerOpen] = useState(false);

  useEffect(() => {
    if (cnApprovalConfig) {
      const mode = (cnApprovalConfig.approval_mode === 'specific' ? 'specific' : 'manager') as 'manager' | 'specific';
      setApproverMode(mode);
      setSpecificApproverId(cnApprovalConfig.specific_approver_id ?? null);
    }
  }, [cnApprovalConfig?.id, cnApprovalConfig?.approval_mode, cnApprovalConfig?.specific_approver_id]);

  const updateCnConfig = useMutation({
    mutationFn: async (requires_approval: boolean) => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      if (cnConfig?.id) {
        const { error } = await supabase
          .from('credit_note_config')
          .update({ requires_approval, updated_at: new Date().toISOString(), updated_by: uid })
          .eq('id', cnConfig.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('credit_note_config')
          .insert({ requires_approval, updated_by: uid });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-note-config'] });
      toast.success('Setting saved');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save setting'),
  });

  const saveApproverConfig = useMutation({
    mutationFn: async () => {
      const payload =
        approverMode === 'specific'
          ? { approval_mode: 'specific', use_full_hierarchy: false, specific_approver_id: specificApproverId, max_levels: 1 }
          : { approval_mode: 'manager', use_full_hierarchy: true, specific_approver_id: null, max_levels: 1 };
      if (cnApprovalConfig?.id) {
        const { error } = await supabase
          .from('approval_config')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', cnApprovalConfig.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('approval_config')
          .insert({ entity_type: 'credit_note', ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-config', 'credit_note'] });
      toast.success('Approver settings saved');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save approver settings'),
  });

  const requiresApproval = !!cnConfig?.requires_approval;
  const specificMissing = requiresApproval && approverMode === 'specific' && !specificApproverId;
  const selectedApproverName = useMemo(
    () => activeUsers?.find((u) => u.id === specificApproverId)?.full_name ?? null,
    [activeUsers, specificApproverId]
  );




  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<Partial<CreditConfig> | null>(null);
  const [territoryPopoverOpen, setTerritoryPopoverOpen] = useState(false);
  const [selectAllTerritories, setSelectAllTerritories] = useState(false);

  // Fetch all configurations
  const { data: configs, isLoading: configsLoading } = useQuery({
    queryKey: ['credit-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_management_config')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as CreditConfig[];
    }
  });

  // Fetch territories
  const { data: territories, isLoading: territoriesLoading } = useQuery({
    queryKey: ['territories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('territories')
        .select('id, name, region, zone')
        .order('name');
      
      if (error) throw error;
      return data as Territory[];
    }
  });

  // Get assigned territories across all configs (excluding current)
  const getAssignedTerritories = () => {
    if (!configs) return new Set<string>();
    const assigned = new Set<string>();
    configs.forEach(config => {
      if (config.id !== editingConfig?.id) {
        config.territory_ids?.forEach(tid => assigned.add(tid));
      }
    });
    return assigned;
  };

  const createConfigMutation = useMutation({
    mutationFn: async (newConfig: Partial<CreditConfig>) => {
      const { data, error } = await supabase
        .from('credit_management_config')
        .insert([{
          ...newConfig,
          is_enabled: newConfig.is_enabled ?? false,
          is_active: newConfig.is_active ?? true,
          territory_ids: newConfig.territory_ids ?? []
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-configs'] });
      toast.success("Configuration created successfully");
      setDialogOpen(false);
      setEditingConfig(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to create configuration: ${error.message}`);
    }
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (updatedConfig: Partial<CreditConfig> & { id: string }) => {
      const { data, error } = await supabase
        .from('credit_management_config')
        .update(updatedConfig)
        .eq('id', updatedConfig.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-configs'] });
      toast.success("Configuration updated successfully");
      setDialogOpen(false);
      setEditingConfig(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to update configuration: ${error.message}`);
    }
  });

  const deleteConfigMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('credit_management_config')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-configs'] });
      toast.success("Configuration deleted successfully");
    },
    onError: (error: any) => {
      toast.error(`Failed to delete configuration: ${error.message}`);
    }
  });

  const handleSave = () => {
    if (!editingConfig) return;

    // Validate config name
    if (!editingConfig.config_name?.trim()) {
      toast.error("Configuration name is required");
      return;
    }

    // Validate territory selection
    if (!editingConfig.territory_ids || editingConfig.territory_ids.length === 0) {
      toast.error("Please select at least one territory");
      return;
    }

    // Validate weights for AI mode
    if (editingConfig.scoring_mode === 'ai_driven') {
      const totalWeight = (editingConfig.weight_growth_rate || 0) + 
                         (editingConfig.weight_repayment_dso || 0) + 
                         (editingConfig.weight_order_frequency || 0);
      
      if (totalWeight !== 10) {
        toast.error("Total weight must equal 10 points");
        return;
      }
    }

    if (editingConfig.id) {
      updateConfigMutation.mutate(editingConfig as CreditConfig);
    } else {
      createConfigMutation.mutate(editingConfig);
    }
  };

  const handleOpenDialog = (config?: CreditConfig) => {
    if (config) {
      setEditingConfig({ ...config });
      setSelectAllTerritories(config.territory_ids?.length === territories?.length);
    } else {
      setEditingConfig({
        config_name: '',
        is_enabled: false,
        is_active: true,
        scoring_mode: 'manual',
        lookback_period_months: 3,
        new_retailer_starting_score: 6.0,
        payment_term_days: 30,
        credit_multiplier: 1.5,
        target_growth_rate_percent: 10.0,
        target_order_frequency: 2.0,
        weight_growth_rate: 4.0,
        weight_repayment_dso: 4.0,
        weight_order_frequency: 2.0,
        territory_ids: []
      });
      setSelectAllTerritories(false);
    }
    setDialogOpen(true);
  };

  const handleToggleTerritory = (territoryId: string) => {
    if (!editingConfig) return;
    
    const currentTerritories = editingConfig.territory_ids || [];
    const newTerritories = currentTerritories.includes(territoryId)
      ? currentTerritories.filter(id => id !== territoryId)
      : [...currentTerritories, territoryId];
    
    setEditingConfig({ ...editingConfig, territory_ids: newTerritories });
    setSelectAllTerritories(newTerritories.length === territories?.length);
  };

  const handleSelectAllTerritories = (checked: boolean) => {
    if (!editingConfig || !territories) return;
    
    setSelectAllTerritories(checked);
    if (checked) {
      const allTerritoryIds = territories.map(t => t.id);
      setEditingConfig({ ...editingConfig, territory_ids: allTerritoryIds });
    } else {
      setEditingConfig({ ...editingConfig, territory_ids: [] });
    }
  };

  const totalWeight = (editingConfig?.weight_growth_rate || 0) + 
                      (editingConfig?.weight_repayment_dso || 0) + 
                      (editingConfig?.weight_order_frequency || 0);

  const assignedTerritories = getAssignedTerritories();

  if (configsLoading || territoriesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Credit Management Configurations</h2>
          <p className="text-muted-foreground">Manage territory-specific credit scoring configurations</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Add Configuration
        </Button>
      </div>

      {!permsLoading && (can('credit_note_settings', 'read') || canEditCnSettings) && (
        <Card>
          <CardHeader>
            <CardTitle>Credit Note Settings</CardTitle>
            <CardDescription>
              When approval is ON, a credit note is held as Pending Approval and does not reduce the retailer's balance until it is approved. When OFF, credit notes post immediately.
              {!canEditCnSettings && (
                <span className="block mt-1 text-xs italic">
                  You don't have permission to change these settings (read-only view).
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="cn-requires-approval" className="font-medium">
                Require approval for credit notes
              </Label>
              <Switch
                id="cn-requires-approval"
                checked={requiresApproval}
                disabled={!canEditCnSettings || cnConfigLoading || updateCnConfig.isPending}
                onCheckedChange={(v) => updateCnConfig.mutate(v)}
              />
            </div>

            {requiresApproval && (
              <div className="space-y-4 border-t pt-4">
                <div>
                  <Label className="font-medium">Who approves credit notes</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Choose how approvers are determined when a credit note is submitted.
                  </p>
                </div>

                <RadioGroup
                  value={approverMode}
                  onValueChange={(v) => canEditCnSettings && setApproverMode(v as 'manager' | 'specific')}
                  disabled={!canEditCnSettings}
                  className="space-y-2"
                >
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="manager" id="appr-mode-manager" disabled={!canEditCnSettings} />
                    <div className="space-y-0.5">
                      <Label htmlFor="appr-mode-manager" className="font-normal cursor-pointer">
                        Manager hierarchy
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Route the request through the submitter's reporting chain.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="specific" id="appr-mode-specific" disabled={!canEditCnSettings} />
                    <div className="space-y-0.5 w-full">
                      <Label htmlFor="appr-mode-specific" className="font-normal cursor-pointer">
                        Specific person
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Always send the approval request to one designated user.
                      </p>
                    </div>
                  </div>
                </RadioGroup>

                {approverMode === 'specific' && (
                  <div className="space-y-2 pl-6">
                    <Label className="text-sm">Approver</Label>
                    <Popover open={approverPickerOpen} onOpenChange={(o) => canEditCnSettings && setApproverPickerOpen(o)}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          disabled={!canEditCnSettings}
                          className="w-full md:w-96 justify-between"
                        >
                          {selectedApproverName || 'Select a user…'}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[24rem] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search user…" />
                          <CommandList>
                            <CommandEmpty>No users found.</CommandEmpty>
                            <CommandGroup>
                              {(activeUsers ?? []).map((u) => (
                                <CommandItem
                                  key={u.id}
                                  value={`${u.full_name ?? ''} ${u.id}`}
                                  onSelect={() => {
                                    setSpecificApproverId(u.id);
                                    setApproverPickerOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      specificApproverId === u.id ? 'opacity-100' : 'opacity-0'
                                    )}
                                  />
                                  {u.full_name || '(no name)'}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                {specificMissing && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Please select a specific approver before saving — credit notes will be blocked otherwise.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end">
                  <Button
                    onClick={() => saveApproverConfig.mutate()}
                    disabled={
                      !canEditCnSettings ||
                      cnApprovalLoading ||
                      saveApproverConfig.isPending ||
                      specificMissing
                    }
                  >
                    {saveApproverConfig.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save approver settings
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}


      <Card>

        <CardHeader>
          <CardTitle>Active Configurations</CardTitle>
          <CardDescription>
            Configure credit management settings for different territories
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Configuration Name</TableHead>
                <TableHead>Territories</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs && configs.length > 0 ? (
                configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">{config.config_name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {config.territory_ids?.length > 0 ? (
                          config.territory_ids.slice(0, 2).map(tid => {
                            const territory = territories?.find(t => t.id === tid);
                            return territory ? (
                              <Badge key={tid} variant="secondary" className="text-xs">
                                {territory.name}
                              </Badge>
                            ) : null;
                          })
                        ) : (
                          <span className="text-muted-foreground text-sm">No territories</span>
                        )}
                        {config.territory_ids?.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{config.territory_ids.length - 2} more
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={config.scoring_mode === 'ai_driven' ? 'default' : 'secondary'}>
                        {config.scoring_mode === 'ai_driven' ? 'AI Driven' : 'Manual'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {config.is_enabled ? (
                        <Badge variant="default" className="bg-green-600">Enabled</Badge>
                      ) : (
                        <Badge variant="secondary">Disabled</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {config.is_active ? (
                        <Badge variant="default">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(config)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this configuration?")) {
                            deleteConfigMutation.mutate(config.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No configurations found. Create your first configuration to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Configuration Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingConfig?.id ? 'Edit Configuration' : 'Add Configuration'}
            </DialogTitle>
            <DialogDescription>
              Configure credit management settings for specific territories
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Configuration Name */}
            <div className="space-y-2">
              <Label htmlFor="config_name">Configuration Name *</Label>
              <Input
                id="config_name"
                value={editingConfig?.config_name || ''}
                onChange={(e) => setEditingConfig({ ...editingConfig, config_name: e.target.value })}
                placeholder="e.g., North Region Credit Config"
              />
            </div>

            {/* Territory Selection */}
            <div className="space-y-2">
              <Label>Territories *</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="select-all-territories"
                    checked={selectAllTerritories}
                    onCheckedChange={handleSelectAllTerritories}
                  />
                  <label
                    htmlFor="select-all-territories"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Select All Territories
                  </label>
                </div>
                <Popover open={territoryPopoverOpen} onOpenChange={setTerritoryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={territoryPopoverOpen}
                      className="w-full justify-between"
                    >
                      {editingConfig?.territory_ids && editingConfig.territory_ids.length > 0
                        ? `${editingConfig.territory_ids.length} territories selected`
                        : "Select territories..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Search territories..." />
                      <CommandList>
                        <CommandEmpty>No territories found.</CommandEmpty>
                        <CommandGroup>
                          {territories?.map((territory) => {
                            const isSelected = editingConfig?.territory_ids?.includes(territory.id);
                            const isAssigned = assignedTerritories.has(territory.id);
                            return (
                              <CommandItem
                                key={territory.id}
                                value={territory.name}
                                onSelect={() => handleToggleTerritory(territory.id)}
                                disabled={isAssigned}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    isSelected ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex-1">
                                  <div>{territory.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {territory.region} {territory.zone && `• ${territory.zone}`}
                                  </div>
                                </div>
                                {isAssigned && (
                                  <Badge variant="secondary" className="text-xs">
                                    Assigned
                                  </Badge>
                                )}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {editingConfig?.territory_ids && editingConfig.territory_ids.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {editingConfig.territory_ids.map(tid => {
                      const territory = territories?.find(t => t.id === tid);
                      return territory ? (
                        <Badge key={tid} variant="secondary">
                          {territory.name}
                          <button
                            className="ml-1 hover:text-destructive"
                            onClick={() => handleToggleTerritory(tid)}
                          >
                            ×
                          </button>
                        </Badge>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Status Toggles */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="is_enabled">Enable Feature</Label>
                  <p className="text-sm text-muted-foreground">
                    Activate credit scoring
                  </p>
                </div>
                <Switch
                  id="is_enabled"
                  checked={editingConfig?.is_enabled || false}
                  onCheckedChange={(checked) => setEditingConfig({ ...editingConfig, is_enabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="is_active">Active Status</Label>
                  <p className="text-sm text-muted-foreground">
                    Use in calculations
                  </p>
                </div>
                <Switch
                  id="is_active"
                  checked={editingConfig?.is_active ?? true}
                  onCheckedChange={(checked) => setEditingConfig({ ...editingConfig, is_active: checked })}
                />
              </div>
            </div>

            {/* Scoring Mode */}
            <div className="space-y-2">
              <Label>Scoring Mode</Label>
              <div className="grid grid-cols-2 gap-4">
                <Card 
                  className={cn(
                    "cursor-pointer transition-all",
                    editingConfig?.scoring_mode === 'manual' && "border-primary"
                  )}
                  onClick={() => setEditingConfig({ ...editingConfig, scoring_mode: 'manual' })}
                >
                  <CardHeader>
                    <CardTitle className="text-base">Manual Scoring</CardTitle>
                    <CardDescription>Set credit scores manually</CardDescription>
                  </CardHeader>
                </Card>
                <Card 
                  className={cn(
                    "cursor-pointer transition-all",
                    editingConfig?.scoring_mode === 'ai_driven' && "border-primary"
                  )}
                  onClick={() => setEditingConfig({ ...editingConfig, scoring_mode: 'ai_driven' })}
                >
                  <CardHeader>
                    <CardTitle className="text-base">AI-Driven Scoring</CardTitle>
                    <CardDescription>Automatic score calculation</CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>

            {/* AI Configuration */}
            {editingConfig?.scoring_mode === 'ai_driven' && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="text-lg font-semibold">AI Scoring Parameters</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lookback_period">Lookback Period (Months)</Label>
                    <Input
                      id="lookback_period"
                      type="number"
                      value={editingConfig?.lookback_period_months || 3}
                      onChange={(e) => setEditingConfig({ ...editingConfig, lookback_period_months: parseInt(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new_retailer_score">New Retailer Starting Score</Label>
                    <Input
                      id="new_retailer_score"
                      type="number"
                      step="0.1"
                      value={editingConfig?.new_retailer_starting_score || 6.0}
                      onChange={(e) => setEditingConfig({ ...editingConfig, new_retailer_starting_score: parseFloat(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="payment_terms">Payment Terms (Days)</Label>
                    <Input
                      id="payment_terms"
                      type="number"
                      value={editingConfig?.payment_term_days || 30}
                      onChange={(e) => setEditingConfig({ ...editingConfig, payment_term_days: parseInt(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="credit_multiplier">Credit Multiplier</Label>
                    <Input
                      id="credit_multiplier"
                      type="number"
                      step="0.1"
                      value={editingConfig?.credit_multiplier || 1.5}
                      onChange={(e) => setEditingConfig({ ...editingConfig, credit_multiplier: parseFloat(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="target_growth_rate">Growth Rate in %</Label>
                    <Input
                      id="target_growth_rate"
                      type="number"
                      step="0.1"
                      value={editingConfig?.target_growth_rate_percent || 10.0}
                      onChange={(e) => setEditingConfig({ ...editingConfig, target_growth_rate_percent: parseFloat(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">Growth over the look back period</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="target_order_frequency">Order per Visit Frequency</Label>
                    <Input
                      id="target_order_frequency"
                      type="number"
                      step="0.1"
                      value={editingConfig?.target_order_frequency || 2.0}
                      onChange={(e) => setEditingConfig({ ...editingConfig, target_order_frequency: parseFloat(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">Order every X number of visits - for example: 1 order every 2 visits - then enter 2 in order frequency</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Scoring Weights (Total must be 10)</Label>
                    <Badge variant={totalWeight === 10 ? "default" : "destructive"}>
                      Total: {totalWeight} / 10
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="weight_growth">Growth Rate Weight</Label>
                      <Input
                        id="weight_growth"
                        type="number"
                        step="0.1"
                        value={editingConfig?.weight_growth_rate || 4.0}
                        onChange={(e) => setEditingConfig({ ...editingConfig, weight_growth_rate: parseFloat(e.target.value) })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="weight_dso">Repayment DSO Weight</Label>
                      <Input
                        id="weight_dso"
                        type="number"
                        step="0.1"
                        value={editingConfig?.weight_repayment_dso || 4.0}
                        onChange={(e) => setEditingConfig({ ...editingConfig, weight_repayment_dso: parseFloat(e.target.value) })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="weight_frequency">Order Frequency Weight</Label>
                      <Input
                        id="weight_frequency"
                        type="number"
                        step="0.1"
                        value={editingConfig?.weight_order_frequency || 2.0}
                        onChange={(e) => setEditingConfig({ ...editingConfig, weight_order_frequency: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Only active configurations will be used in credit score calculations. 
                Territories can only be assigned to one configuration at a time.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={createConfigMutation.isPending || updateConfigMutation.isPending}
            >
              {(createConfigMutation.isPending || updateConfigMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <Save className="mr-2 h-4 w-4" />
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
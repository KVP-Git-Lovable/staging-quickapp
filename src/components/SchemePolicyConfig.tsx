import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Settings, Layers, Scale, Shield, Zap, Loader2, Info } from 'lucide-react';

interface PolicyConfig {
  max_schemes_per_order: { value: number };
  allow_scheme_stacking: { value: boolean; same_type_stacking: boolean };
  priority_resolution: { method: 'highest_discount' | 'most_specific' | 'priority' | 'first_applied' };
  auto_apply_best_scheme: { value: boolean };
}

interface SchemePolicyConfigProps {
  trigger?: React.ReactNode;
  inline?: boolean;
}

export const SchemePolicyConfig = ({ trigger, inline = false }: SchemePolicyConfigProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policies, setPolicies] = useState<PolicyConfig>({
    max_schemes_per_order: { value: 5 },
    allow_scheme_stacking: { value: true, same_type_stacking: false },
    priority_resolution: { method: 'highest_discount' },
    auto_apply_best_scheme: { value: true }
  });

  useEffect(() => {
    if (open || inline) {
      fetchPolicies();
    }
  }, [open, inline]);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('scheme_policy_config')
        .select('policy_name, policy_value')
        .eq('is_active', true);

      if (error) throw error;

      if (data) {
        const policyMap = data.reduce((acc, policy) => {
          acc[policy.policy_name] = policy.policy_value;
          return acc;
        }, {} as Record<string, any>);

        setPolicies({
          max_schemes_per_order: policyMap.max_schemes_per_order || { value: 5 },
          allow_scheme_stacking: policyMap.allow_scheme_stacking || { value: true, same_type_stacking: false },
          priority_resolution: policyMap.priority_resolution || { method: 'highest_discount' },
          auto_apply_best_scheme: policyMap.auto_apply_best_scheme || { value: true }
        });
      }
    } catch (error) {
      console.error('Error fetching policies:', error);
      toast.error('Failed to load policy settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Update each policy
      const updates = Object.entries(policies).map(([name, value]) =>
        supabase
          .from('scheme_policy_config')
          .update({ policy_value: value, updated_at: new Date().toISOString() })
          .eq('policy_name', name)
      );

      const results = await Promise.all(updates);
      const hasError = results.some(r => r.error);

      if (hasError) {
        throw new Error('Failed to update some policies');
      }

      toast.success('Policy settings saved successfully');
      setOpen(false);
    } catch (error) {
      console.error('Error saving policies:', error);
      toast.error('Failed to save policy settings');
    } finally {
      setSaving(false);
    }
  };

  const policyContent = (
    <div className="space-y-6">
      {/* Stacking Rules */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Stacking Rules
          </CardTitle>
          <CardDescription className="text-xs">
            Control how multiple schemes can be combined
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Max schemes per order</Label>
              <p className="text-xs text-muted-foreground">Maximum number of schemes that can apply</p>
            </div>
            <Input
              type="number"
              value={policies.max_schemes_per_order.value}
              onChange={(e) => setPolicies({
                ...policies,
                max_schemes_per_order: { value: parseInt(e.target.value) || 1 }
              })}
              className="w-20"
              min={1}
              max={10}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label>Allow multiple schemes</Label>
              <p className="text-xs text-muted-foreground">Allow stacking different schemes</p>
            </div>
            <Switch
              checked={policies.allow_scheme_stacking.value}
              onCheckedChange={(checked) => setPolicies({
                ...policies,
                allow_scheme_stacking: { ...policies.allow_scheme_stacking, value: checked }
              })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Stack same-type schemes</Label>
              <p className="text-xs text-muted-foreground">e.g., two percentage discounts</p>
            </div>
            <Switch
              checked={policies.allow_scheme_stacking.same_type_stacking}
              onCheckedChange={(checked) => setPolicies({
                ...policies,
                allow_scheme_stacking: { ...policies.allow_scheme_stacking, same_type_stacking: checked }
              })}
              disabled={!policies.allow_scheme_stacking.value}
            />
          </div>
        </CardContent>
      </Card>

      {/* Conflict Resolution */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            Conflict Resolution
          </CardTitle>
          <CardDescription className="text-xs">
            How to choose when multiple schemes compete
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={policies.priority_resolution.method}
            onValueChange={(value) => setPolicies({
              ...policies,
              priority_resolution: { method: value as any }
            })}
            className="space-y-3"
          >
            <div className="flex items-start space-x-3 p-2 border rounded-lg hover:bg-muted/50">
              <RadioGroupItem value="highest_discount" id="highest_discount" className="mt-1" />
              <div>
                <Label htmlFor="highest_discount" className="cursor-pointer">Highest Discount Value</Label>
                <p className="text-xs text-muted-foreground">Apply the scheme that gives maximum savings</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3 p-2 border rounded-lg hover:bg-muted/50">
              <RadioGroupItem value="most_specific" id="most_specific" className="mt-1" />
              <div>
                <Label htmlFor="most_specific" className="cursor-pointer">Most Specific First</Label>
                <p className="text-xs text-muted-foreground">Retailer → Beat → Territory → Global</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3 p-2 border rounded-lg hover:bg-muted/50">
              <RadioGroupItem value="priority" id="priority" className="mt-1" />
              <div>
                <Label htmlFor="priority" className="cursor-pointer">Manual Priority</Label>
                <p className="text-xs text-muted-foreground">Based on priority number set per scheme</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3 p-2 border rounded-lg hover:bg-muted/50">
              <RadioGroupItem value="first_applied" id="first_applied" className="mt-1" />
              <div>
                <Label htmlFor="first_applied" className="cursor-pointer">User's Choice</Label>
                <p className="text-xs text-muted-foreground">Let salesperson select which to apply</p>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Auto Application */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Auto-Application
          </CardTitle>
          <CardDescription className="text-xs">
            Automatic scheme behavior during order entry
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-apply best scheme</Label>
              <p className="text-xs text-muted-foreground">Automatically select and apply the best available scheme</p>
            </div>
            <Switch
              checked={policies.auto_apply_best_scheme.value}
              onCheckedChange={(checked) => setPolicies({
                ...policies,
                auto_apply_best_scheme: { value: checked }
              })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Info Note */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-muted-foreground">
          These settings affect how schemes are evaluated and applied during order entry for all salespersons.
        </p>
      </div>
    </div>
  );

  // Inline mode - render directly without dialog
  if (inline) {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {policyContent}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Settings
          </Button>
        </div>
      </div>
    );
  }

  // Dialog mode
  const defaultTrigger = (
    <Button variant="outline" size="sm">
      <Settings className="h-4 w-4 mr-2" />
      Policy Settings
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Scheme Policy Settings
          </DialogTitle>
          <DialogDescription>
            Configure how schemes are applied and resolved when multiple schemes are available
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="h-[60vh] pr-4">
            {policyContent}
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

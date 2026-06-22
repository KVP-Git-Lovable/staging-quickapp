import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, FileEdit } from 'lucide-react';

interface OrderEditPolicyRow {
  id: string;
  edit_enabled: boolean;
  editable_until: string;
}

export const OrderEditPolicyConfig = ({ inline = false }: { inline?: boolean }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policy, setPolicy] = useState<OrderEditPolicyRow | null>(null);

  useEffect(() => {
    void fetchPolicy();
  }, []);

  const fetchPolicy = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('order_edit_policy')
        .select('id, edit_enabled, editable_until')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setPolicy(data ?? null);
    } catch (err) {
      console.error('Failed to load order edit policy', err);
      toast.error('Failed to load order edit policy');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!policy) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('order_edit_policy')
        .update({
          edit_enabled: policy.edit_enabled,
          editable_until: policy.editable_until,
          updated_at: new Date().toISOString(),
        })
        .eq('id', policy.id);
      if (error) throw error;
      toast.success('Order edit policy saved');
    } catch (err) {
      console.error('Failed to save order edit policy', err);
      toast.error('Failed to save order edit policy');
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <div className="space-y-6">
      {loading || !policy ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Allow editing of orders</Label>
              <p className="text-xs text-muted-foreground">
                When off, the Edit Order action is disabled for everyone — regardless of permissions.
              </p>
            </div>
            <Switch
              checked={policy.edit_enabled}
              onCheckedChange={(v) => setPolicy({ ...policy, edit_enabled: v })}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Editable until</Label>
            <p className="text-xs text-muted-foreground">
              Defines the latest point in the order lifecycle at which edits are still allowed.
            </p>
            <RadioGroup
              value={policy.editable_until}
              onValueChange={(v) => setPolicy({ ...policy, editable_until: v })}
              className="pt-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="invoice_generated" id="edit-until-invoice" />
                <Label htmlFor="edit-until-invoice" className="font-normal">
                  Before invoice is generated <span className="text-muted-foreground">(default)</span>
                </Label>
              </div>
              {/* Future-ready: more options can be added without schema changes */}
            </RadioGroup>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Policy
            </Button>
          </div>
        </>
      )}
    </div>
  );

  if (inline) return content;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileEdit className="h-5 w-5" />
          Order Edit Policy
        </CardTitle>
        <CardDescription>
          Control whether — and how long — orders can be edited after creation.
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
};

export default OrderEditPolicyConfig;

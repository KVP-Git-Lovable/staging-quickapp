import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowRight, Loader2, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';


type OpsConfig = {
  id: number;
  backdate_enabled: boolean;
  backdate_mode: 'direct' | 'approval';
  backdate_max_days: number;
  backdate_require_reason: boolean;
  on_behalf_enabled: boolean;
  oob_enabled: boolean;
  oob_visibility: 'today_beat' | 'assigned_retailers' | 'assigned_territory' | 'all_retailers';
  oob_require_reason: boolean;
  oob_require_gps: boolean;
  oob_notify_manager: boolean;
  oob_allow_offline: boolean;
  oob_credit_rule: 'collector' | 'owner';
  edit_enabled: boolean;
  edit_lock_point: 'until_invoiced' | 'until_dispatched' | 'same_day' | 'hours';
  edit_lock_hours: number;
  edit_who: 'own' | 'own_team' | 'anyone';
  edit_require_reason: boolean;
  edit_require_approval: boolean;
  edit_approval_threshold: number;
  edit_lock_price: boolean;
  edit_max_edits: number;
  edit_visible_in_visit_card: boolean;
  entry_price_edit_enabled: boolean;
  entry_price_edit_direction: 'higher_only' | 'both';
  auto_cancel_enabled: boolean;
  eod_cutoff_time: string;
  carry_forward_enabled: boolean;
};

const OBJECTS = ['order_backdate', 'order_on_behalf', 'order_out_of_beat', 'order_edit'] as const;

const OperationsConfig: React.FC = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<OpsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number | null>>({});

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('operations_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) {
        toast.error('Failed to load configuration');
      } else if (data) {
        setConfig(data as any);
      }
      setLoading(false);
    })();

    (async () => {
      const { data, error } = await supabase
        .from('profile_object_permissions')
        .select('object_name, profile_id')
        .in('object_name', OBJECTS as unknown as string[]);
      if (error || !data) {
        setCounts({});
        return;
      }
      const map: Record<string, Set<string>> = {};
      for (const row of data as any[]) {
        (map[row.object_name] ||= new Set()).add(row.profile_id);
      }
      const out: Record<string, number> = {};
      for (const k of OBJECTS) out[k] = map[k]?.size || 0;
      setCounts(out);
    })();
  }, []);

  const save = async <K extends keyof OpsConfig>(field: K, value: OpsConfig[K]) => {
    if (!config) return;
    const prev = config[field];
    setConfig({ ...config, [field]: value });
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('operations_config')
      .update({ [field]: value, updated_at: new Date().toISOString(), updated_by: authData.user?.id ?? null } as any)
      .eq('id', 1);
    if (error) {
      setConfig((c) => (c ? { ...c, [field]: prev } : c));
      toast.error('Save failed');
    } else {
      toast.success('Saved');
    }
  };

  const FooterAccess: React.FC<{ object: (typeof OBJECTS)[number] }> = ({ object }) => {
    const n = counts[object];
    return (
      <CardFooter className="flex items-center justify-between border-t pt-4">
        {typeof n === 'number' ? (
          <Badge variant="secondary">{n} {n === 1 ? 'profile has' : 'profiles have'} access</Badge>
        ) : <span />}
        <Button variant="link" className="px-0" onClick={() => navigate('/security-management')}>
          Manage who can use this <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </CardFooter>
    );
  };
  const InfoPopover: React.FC<{
    what: string;
    enable: string;
    happens: string;
    pros: string;
    cons: string;
  }> = ({ what, enable, happens, pros, cons }) => (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="More info"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 text-sm space-y-2">
        <div><span className="font-semibold">What it does: </span>{what}</div>
        <div><span className="font-semibold">How to enable: </span>{enable}</div>
        <div><span className="font-semibold">What happens: </span>{happens}</div>
        <div><span className="font-semibold text-green-600">Pros: </span>{pros}</div>
        <div><span className="font-semibold text-amber-600">Cons: </span>{cons}</div>
      </PopoverContent>
    </Popover>
  );


  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading configuration…
      </div>
    );
  }

  const c = config;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Backdated orders */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-1.5">
              Backdated orders
              <InfoPopover
                what="Place an order dated to a past day within the allowed window."
                enable="Toggle on, set max backdate days, and grant the order_backdate permission."
                happens="Order flagged is_backdated, GPS skipped, reason required, may need manager approval."
                pros="Capture genuinely missed orders."
                cons="Can distort daily/attendance reports if abused — keep the day-limit tight and always require a reason."
              />
            </CardTitle>

            <p className="text-sm text-muted-foreground mt-1">Backdated orders skip GPS.</p>
          </div>
          <Switch checked={c.backdate_enabled} onCheckedChange={(v) => save('backdate_enabled', v)} />
        </CardHeader>
        {c.backdate_enabled && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select value={c.backdate_mode} onValueChange={(v) => save('backdate_mode', v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">Direct</SelectItem>
                    <SelectItem value="approval">Approval</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Max days back</Label>
                <Input
                  type="number"
                  min={0}
                  value={c.backdate_max_days}
                  onChange={(e) => setConfig({ ...c, backdate_max_days: Math.max(0, Number(e.target.value) || 0) })}
                  onBlur={(e) => save('backdate_max_days', Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Require reason</Label>
              <Switch checked={c.backdate_require_reason} onCheckedChange={(v) => save('backdate_require_reason', v)} />
            </div>
          </CardContent>
        )}
        <FooterAccess object="order_backdate" />
      </Card>

      {/* On behalf */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-1.5">
              Order on behalf
              <InfoPopover
                what="Place an order for another rep's retailer."
                enable="Toggle on and grant the order_on_behalf permission."
                happens="Order is credited to the target rep (owner); placed_by records you."
                pros="Cover for absent teammates."
                cons="Muddies credit attribution if misused; limited to your team/downline."
              />
            </CardTitle>

            <p className="text-sm text-muted-foreground mt-1">
              Credited to the selected user; recorded against whoever places it.
            </p>
          </div>
          <Switch checked={c.on_behalf_enabled} onCheckedChange={(v) => save('on_behalf_enabled', v)} />
        </CardHeader>
        <FooterAccess object="order_on_behalf" />
      </Card>

      {/* Out of beat */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-1.5">
              Out-of-beat orders
              <InfoPopover
                what="Order for a retailer outside your assigned beat."
                enable="Toggle on, set the visibility level + credit rule, and grant the permission."
                happens="Warning shown, reason + GPS captured, credit assigned per the rule, manager notified."
                pros="Capture opportunistic sales."
                cons="Erodes beat discipline — needs manager visibility."
              />
            </CardTitle>

            <p className="text-sm text-muted-foreground mt-1">Allow reps to place orders outside today's beat.</p>
          </div>
          <Switch checked={c.oob_enabled} onCheckedChange={(v) => save('oob_enabled', v)} />
        </CardHeader>
        {c.oob_enabled && (
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Retailer visibility</Label>
              <RadioGroup
                value={c.oob_visibility}
                onValueChange={(v) => save('oob_visibility', v as any)}
                className="gap-2"
              >
                {[
                  { v: 'today_beat', l: "Today's beat" },
                  { v: 'assigned_retailers', l: 'Assigned retailers' },
                  { v: 'assigned_territory', l: 'Assigned territory' },
                  { v: 'all_retailers', l: 'All retailers (managers only)' },
                ].map((o) => (
                  <div key={o.v} className="flex items-center gap-2">
                    <RadioGroupItem id={`oob-${o.v}`} value={o.v} />
                    <Label htmlFor={`oob-${o.v}`} className="font-normal">{o.l}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {([
              ['oob_require_reason', 'Require reason'],
              ['oob_require_gps', 'Require GPS'],
              ['oob_notify_manager', 'Notify manager'],
            ] as const).map(([k, l]) => (
              <div key={k} className="flex items-center justify-between">
                <Label>{l}</Label>
                <Switch checked={c[k] as boolean} onCheckedChange={(v) => save(k, v as any)} />
              </div>
            ))}

            <div className="flex items-center justify-between">
              <div>
                <Label>Allow offline</Label>
                <p className="text-xs text-muted-foreground mt-1">All-retailers search is online only.</p>
              </div>
              <Switch checked={c.oob_allow_offline} onCheckedChange={(v) => save('oob_allow_offline', v)} />
            </div>

            <div className="space-y-2">
              <Label>Credit rule</Label>
              <Select value={c.oob_credit_rule} onValueChange={(v) => save('oob_credit_rule', v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="collector">Collector</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        )}
        <FooterAccess object="order_out_of_beat" />
      </Card>

      {/* Edit policy */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-1.5">
              Order edit policy
              <InfoPopover
                what="Edit a confirmed order."
                enable="Toggle on, set the lock point (invoiced/dispatched), who can edit (own/team), price-lock, and grant order_edit."
                happens="Creates a linked replacement order (original cancelled, replaces/replaced_by), collects/refunds the delta, requires approval over limits."
                pros="Fix mistakes without cancel-and-re-enter."
                cons="Adds audit complexity; lock rules intentionally block edits after fulfillment."
              />
            </CardTitle>

            <p className="text-sm text-muted-foreground mt-1">Control if and when placed orders can be edited.</p>
          </div>
          <Switch checked={c.edit_enabled} onCheckedChange={(v) => save('edit_enabled', v)} />
        </CardHeader>
        {c.edit_enabled && (
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Label>Show in Visit Card</Label>
                <p className="text-xs text-muted-foreground">Show the "Edit Order" button on My Visit's visit cards. Turning this off only hides that one entry point — editing stays available wherever else it's exposed (e.g. the admin Operations table).</p>
              </div>
              <Switch checked={c.edit_visible_in_visit_card} onCheckedChange={(v) => save('edit_visible_in_visit_card', v)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Lock point</Label>
                <Select value={c.edit_lock_point} onValueChange={(v) => save('edit_lock_point', v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="until_invoiced">Until invoiced</SelectItem>
                    <SelectItem value="until_dispatched">Until dispatched</SelectItem>
                    <SelectItem value="same_day">Same day</SelectItem>
                    <SelectItem value="hours">Within X hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {c.edit_lock_point === 'hours' && (
                <div className="space-y-2">
                  <Label>Lock hours</Label>
                  <Input
                    type="number"
                    min={0}
                    value={c.edit_lock_hours}
                    onChange={(e) => setConfig({ ...c, edit_lock_hours: Math.max(0, Number(e.target.value) || 0) })}
                    onBlur={(e) => save('edit_lock_hours', Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Who can edit</Label>
                <Select value={c.edit_who} onValueChange={(v) => save('edit_who', v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="own">Own</SelectItem>
                    <SelectItem value="own_team">Own + team</SelectItem>
                    <SelectItem value="anyone">Anyone with permission</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Require reason</Label>
              <Switch checked={c.edit_require_reason} onCheckedChange={(v) => save('edit_require_reason', v)} />
            </div>

            <div className="flex items-center justify-between">
              <Label>Require approval</Label>
              <Switch checked={c.edit_require_approval} onCheckedChange={(v) => save('edit_require_approval', v)} />
            </div>
            {c.edit_require_approval && (
              <div className="space-y-2">
                <Label>Approval threshold (amount)</Label>
                <Input
                  type="number"
                  min={0}
                  value={c.edit_approval_threshold}
                  onChange={(e) => setConfig({ ...c, edit_approval_threshold: Math.max(0, Number(e.target.value) || 0) })}
                  onBlur={(e) => save('edit_approval_threshold', Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label>Lock price changes</Label>
              <Switch checked={c.edit_lock_price} onCheckedChange={(v) => save('edit_lock_price', v)} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Allow price edit in Order Entry</Label>
                <p className="text-xs text-muted-foreground">Lets reps edit a line's price (incl. GST) while placing a NEW order, before it's submitted — separate from editing an already-placed order above.</p>
              </div>
              <Switch checked={c.entry_price_edit_enabled} onCheckedChange={(v) => save('entry_price_edit_enabled', v)} />
            </div>

            {c.entry_price_edit_enabled && (
              <div className="space-y-2 pl-3 border-l-2 border-border">
                <Label>Direction</Label>
                <RadioGroup
                  value={c.entry_price_edit_direction}
                  onValueChange={(v) => save('entry_price_edit_direction', v as any)}
                  className="space-y-2"
                >
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem id="entry-price-higher" value="higher_only" className="mt-1" />
                    <Label htmlFor="entry-price-higher" className="font-normal cursor-pointer">
                      Higher only — reps can raise the price above catalog, not lower it
                    </Label>
                  </div>
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem id="entry-price-both" value="both" className="mt-1" />
                    <Label htmlFor="entry-price-both" className="font-normal cursor-pointer">
                      Both — reps can raise or lower the price
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            <div className="space-y-2">
              <Label>Max edits per order</Label>
              <Input
                type="number"
                min={0}
                value={c.edit_max_edits}
                onChange={(e) => setConfig({ ...c, edit_max_edits: Math.max(0, Number(e.target.value) || 0) })}
                onBlur={(e) => save('edit_max_edits', Math.max(0, Number(e.target.value) || 0))}
              />
              <p className="text-xs text-muted-foreground">0 = unlimited</p>
            </div>
          </CardContent>
        )}
        <FooterAccess object="order_edit" />
      </Card>

      {/* Beat journey */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-1.5">
            Beat journey
            <InfoPopover
              what="Automatically cancels a rep's un-visited planned retailers at end-of-day, and lets those cancelled retailers be carried forward into the next day's plan."
              enable="Turn on Auto-cancel, set the EOD cutoff time, and turn on Carry-forward."
              happens="At the cutoff, planned-but-unvisited visits are marked cancelled (cancel_source='eod_auto'); carry-forward surfaces them as a banner to re-add the next day."
              pros="Keeps journey plans clean — no stale 'planned' visits, and missed retailers aren't forgotten."
              cons="If the cutoff is too early, genuine late visits get auto-cancelled — set it to match real field hours."
            />
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            At the cutoff, retailers still planned (not visited) are marked cancelled, ready to carry forward.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <Label>Auto-cancel unvisited retailers at day end</Label>
            <Switch
              checked={c.auto_cancel_enabled}
              onCheckedChange={(v) => save('auto_cancel_enabled', v)}
            />
          </div>

          <div className="space-y-2">
            <Label>End-of-day cutoff</Label>
            <Input
              type="time"
              value={(c.eod_cutoff_time || '20:00:00').slice(0, 5)}
              onChange={(e) => setConfig({ ...c, eod_cutoff_time: `${e.target.value}:00` })}
              onBlur={(e) => save('eod_cutoff_time', `${e.target.value}:00`)}
              className="max-w-[180px]"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Carry unvisited retailers to the next day</Label>
            <Switch
              checked={c.carry_forward_enabled}
              onCheckedChange={(v) => save('carry_forward_enabled', v)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OperationsConfig;

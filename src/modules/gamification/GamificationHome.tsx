import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Settings, Star, Trophy, Loader2 } from "lucide-react";
import { categoryMeta, AWARD_MODES } from "./constants";
import { useActivities, useGamSettings, usePointsIssuedYtd, usePrograms, useUpdateGamSettings } from "./hooks";
import { ProgramForm } from "./ProgramForm";

function GlobalSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: settings } = useGamSettings();
  const update = useUpdateGamSettings();
  if (!settings) return null;
  const patch = (p: any) => update.mutate({ id: settings.id, ...p });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-pixel text-sm text-orange-600">GLOBAL SETTINGS</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="mb-0">Rewards engine</Label>
              <p className="text-xs text-muted-foreground">Turn off to pause all awarding instantly</p>
            </div>
            <Switch checked={settings.engine_enabled} onCheckedChange={(v) => patch({ engine_enabled: v })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Points name</Label>
              <Input defaultValue={settings.currency_name} onBlur={(e) => patch({ currency_name: e.target.value })} />
            </div>
            <div>
              <Label>1 point = ₹</Label>
              <Input type="number" defaultValue={settings.point_conversion} onBlur={(e) => patch({ point_conversion: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label>Default award mode</Label>
            <Select value={settings.default_award_mode} onValueChange={(v) => patch({ default_award_mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AWARD_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label className="mb-0">Leaderboards enabled</Label>
            <Switch checked={settings.leaderboard_enabled} onCheckedChange={(v) => patch({ leaderboard_enabled: v })} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label className="mb-0">Reward notifications</Label>
            <Switch checked={settings.notifications_enabled} onCheckedChange={(v) => patch({ notifications_enabled: v })} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GamificationHome() {
  const navigate = useNavigate();
  const { data: programs = [], isLoading } = usePrograms();
  const { data: allActivities = [] } = useActivities();
  const { data: settings } = useGamSettings();
  const { data: pointsYtd = 0 } = usePointsIssuedYtd();
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeActivities = allActivities.filter((a: any) => a.is_enabled).length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-[#fdf8ef] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-pixel text-base text-orange-600">REWARDS &amp; RECOGNITION</h1>
            <p className="text-sm text-muted-foreground mt-3 max-w-xl">
              Build programs, define the activities that earn points, and let the engine reward your field team automatically.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Badge variant="secondary">{programs.length} programs</Badge>
              <Badge variant="secondary">{activeActivities} active activities</Badge>
              <Badge variant="secondary">{pointsYtd.toLocaleString()} points issued YTD</Badge>
              <Badge className={settings?.engine_enabled ? "bg-emerald-600" : "bg-slate-500"}>
                Engine {settings?.engine_enabled ? "on" : "off"}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/gamification-admin/focus-products")}>
              <Star className="h-4 w-4 mr-1" /> Focus products
            </Button>
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4 mr-1" /> Global settings
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New program
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((p: any) => {
            const cat = categoryMeta(p.category);
            const acts = allActivities.filter((a: any) => a.game_id === p.id);
            return (
              <Card
                key={p.id}
                onClick={() => navigate(`/gamification-admin/program/${p.id}`)}
                className={`p-5 cursor-pointer border ${cat.border} ${cat.tint} hover:shadow-md transition-shadow`}
              >
                <div className="flex items-start justify-between gap-2">
                  <Trophy className={`h-5 w-5 ${cat.text}`} />
                  <Badge className={p.is_active ? "bg-emerald-600" : "bg-slate-400"}>
                    {p.is_active ? "Active" : "Draft"}
                  </Badge>
                </div>
                <h3 className={`font-pixel text-[11px] mt-4 leading-5 ${cat.text}`}>{p.name?.toUpperCase()}</h3>
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{p.description || cat.label}</p>
                <p className="text-xs mt-4 text-muted-foreground">
                  {acts.filter((a: any) => a.is_enabled).length}/{acts.length} activities active
                </p>
              </Card>
            );
          })}
          {!programs.length && (
            <Card className="p-8 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
              No programs yet — create your first reward program.
            </Card>
          )}
        </div>
      )}

      <ProgramForm open={createOpen} onOpenChange={setCreateOpen} />
      <GlobalSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

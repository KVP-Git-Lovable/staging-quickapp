import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Award, Pencil, Target } from "lucide-react";

const BADGE_COLOR_STYLES: Record<string, { tint: string; bar: string; iconBg: string; accent: string; ring: string }> = {
  gold:   { tint: "bg-amber-50",   bar: "bg-amber-200",   iconBg: "bg-amber-100 text-amber-600",   accent: "text-amber-700",   ring: "ring-amber-100" },
  silver: { tint: "bg-slate-50",   bar: "bg-slate-200",   iconBg: "bg-slate-100 text-slate-600",   accent: "text-slate-700",   ring: "ring-slate-100" },
  blue:   { tint: "bg-blue-50",    bar: "bg-blue-200",    iconBg: "bg-blue-100 text-blue-600",     accent: "text-blue-700",    ring: "ring-blue-100" },
  green:  { tint: "bg-emerald-50", bar: "bg-emerald-200", iconBg: "bg-emerald-100 text-emerald-600", accent: "text-emerald-700", ring: "ring-emerald-100" },
  purple: { tint: "bg-violet-50",  bar: "bg-violet-200",  iconBg: "bg-violet-100 text-violet-600", accent: "text-violet-700",  ring: "ring-violet-100" },
  red:    { tint: "bg-rose-50",    bar: "bg-rose-200",    iconBg: "bg-rose-100 text-rose-600",     accent: "text-rose-700",    ring: "ring-rose-100" },
  orange: { tint: "bg-orange-50",  bar: "bg-orange-200",  iconBg: "bg-orange-100 text-orange-600", accent: "text-orange-700",  ring: "ring-orange-100" },
};
const DEFAULT_BADGE_STYLE = BADGE_COLOR_STYLES.blue;


interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  criteria_type: string;
  criteria_value: number;
  badge_color: string;
}

const CRITERIA_TYPES = [
  { value: "order_count", label: "Order Count" },
  { value: "retailer_count", label: "Retailer Count" },
  { value: "revenue", label: "Revenue Amount" },
  { value: "insights_count", label: "Competition Insights" },
  { value: "rank_top", label: "Top Rank Position" },
  { value: "top_10_months", label: "Months in Top 10" }
];

const BADGE_COLORS = ["gold", "silver", "blue", "green", "purple", "red", "orange"];

export function BadgeManagement() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingBadge, setEditingBadge] = useState<Badge | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "🏆",
    criteria_type: "order_count",
    criteria_value: "0",
    badge_color: "blue"
  });

  useEffect(() => {
    fetchBadges();
  }, []);

  const fetchBadges = async () => {
    const { data } = await supabase
      .from("badges")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (data) setBadges(data);
  };

  const createBadge = async () => {
    if (!formData.name || !formData.criteria_value) {
      toast.error("Please fill in all required fields");
      return;
    }

    const { error } = await supabase
      .from("badges")
      .insert({
        name: formData.name,
        description: formData.description,
        icon: formData.icon,
        criteria_type: formData.criteria_type,
        criteria_value: parseFloat(formData.criteria_value),
        badge_color: formData.badge_color
      });

    if (error) {
      toast.error("Failed to create badge");
    } else {
      toast.success("Badge created successfully");
      setShowCreateDialog(false);
      setFormData({
        name: "",
        description: "",
        icon: "🏆",
        criteria_type: "order_count",
        criteria_value: "0",
        badge_color: "blue"
      });
      fetchBadges();
    }
  };

  const openEditDialog = (badge: Badge) => {
    setEditingBadge(badge);
    setFormData({
      name: badge.name,
      description: badge.description || "",
      icon: badge.icon,
      criteria_type: badge.criteria_type,
      criteria_value: badge.criteria_value.toString(),
      badge_color: badge.badge_color
    });
    setShowEditDialog(true);
  };

  const updateBadge = async () => {
    if (!editingBadge || !formData.name || !formData.criteria_value) {
      toast.error("Please fill in all required fields");
      return;
    }

    const { error } = await supabase
      .from("badges")
      .update({
        name: formData.name,
        description: formData.description,
        icon: formData.icon,
        criteria_type: formData.criteria_type,
        criteria_value: parseFloat(formData.criteria_value),
        badge_color: formData.badge_color
      })
      .eq("id", editingBadge.id);

    if (error) {
      toast.error("Failed to update badge");
    } else {
      toast.success("Badge updated successfully");
      setShowEditDialog(false);
      setEditingBadge(null);
      setFormData({
        name: "",
        description: "",
        icon: "🏆",
        criteria_type: "order_count",
        criteria_value: "0",
        badge_color: "blue"
      });
      fetchBadges();
    }
  };

  const deleteBadge = async (id: string) => {
    if (!confirm("Are you sure you want to delete this badge?")) return;

    const { error } = await supabase
      .from("badges")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete badge");
    } else {
      toast.success("Badge deleted");
      fetchBadges();
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-50 via-white to-amber-50/40 p-6 sm:p-8 shadow-sm">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-100/50 blur-3xl" />
        <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-indigo-100/40 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="hidden sm:flex h-14 w-14 items-center justify-center rounded-xl bg-white ring-1 ring-amber-100 shadow-sm">
              <Award className="h-7 w-7 text-amber-500" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Badge Management</h2>
              <p className="text-slate-500 text-sm sm:text-base mt-1">Create and manage achievement badges</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white ring-1 ring-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                  <Award className="h-3 w-3 text-amber-500" /> {badges.length} Total Badges
                </span>
              </div>
            </div>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="lg" className="bg-indigo-600 text-white hover:bg-indigo-700 font-semibold shadow-sm">
                <Plus className="mr-2 h-4 w-4" />
                Create Badge
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Badge</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Badge Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Century Maker"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Complete 100 orders"
                />
              </div>
              <div>
                <Label htmlFor="icon">Icon (Emoji)</Label>
                <Input
                  id="icon"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="🏆"
                />
              </div>
              <div>
                <Label htmlFor="criteria_type">Criteria Type *</Label>
                <Select value={formData.criteria_type} onValueChange={(v) => setFormData({ ...formData, criteria_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRITERIA_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="criteria_value">Criteria Value *</Label>
                <Input
                  id="criteria_value"
                  type="number"
                  value={formData.criteria_value}
                  onChange={(e) => setFormData({ ...formData, criteria_value: e.target.value })}
                  placeholder="100"
                />
              </div>
              <div>
                <Label htmlFor="badge_color">Badge Color</Label>
                <Select value={formData.badge_color} onValueChange={(v) => setFormData({ ...formData, badge_color: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BADGE_COLORS.map(color => (
                      <SelectItem key={color} value={color}>{color}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={createBadge} className="w-full">Create Badge</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>


      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Badge</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Badge Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Century Maker"
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Complete 100 orders"
              />
            </div>
            <div>
              <Label htmlFor="edit-icon">Icon (Emoji)</Label>
              <Input
                id="edit-icon"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                placeholder="🏆"
              />
            </div>
            <div>
              <Label htmlFor="edit-criteria_type">Criteria Type *</Label>
              <Select value={formData.criteria_type} onValueChange={(v) => setFormData({ ...formData, criteria_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRITERIA_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-criteria_value">Criteria Value *</Label>
              <Input
                id="edit-criteria_value"
                type="number"
                value={formData.criteria_value}
                onChange={(e) => setFormData({ ...formData, criteria_value: e.target.value })}
                placeholder="100"
              />
            </div>
            <div>
              <Label htmlFor="edit-badge_color">Badge Color</Label>
              <Select value={formData.badge_color} onValueChange={(v) => setFormData({ ...formData, badge_color: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BADGE_COLORS.map(color => (
                    <SelectItem key={color} value={color}>{color}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={updateBadge} className="w-full">Update Badge</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {badges.map(badge => (
          <Card key={badge.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="text-3xl">{badge.icon}</span>
                  {badge.name}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditDialog(badge)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteBadge(badge.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">{badge.description}</p>
              <div className="text-xs space-y-1">
                <p><strong>Type:</strong> {CRITERIA_TYPES.find(t => t.value === badge.criteria_type)?.label}</p>
                <p><strong>Target:</strong> {badge.criteria_value}</p>
                <p><strong>Color:</strong> {badge.badge_color}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

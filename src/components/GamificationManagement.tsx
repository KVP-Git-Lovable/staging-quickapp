import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Pencil, Trophy, UserPlus, Target, Star, CheckCircle2, Repeat, TrendingUp, Search, MessageSquare, Megaphone, Footprints, Sparkles, Gift, Award, Coins } from "lucide-react";
import { BadgeManagement } from "./BadgeManagement";
import { MetricConfigFields } from "./MetricConfigFields";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const METRIC_VISUALS: Record<string, { icon: any; gradient: string; iconBg: string; accent: string }> = {
  first_order_new_retailer: { icon: UserPlus,     gradient: "from-fuchsia-500 to-pink-500",   iconBg: "bg-fuchsia-100 text-fuchsia-700",   accent: "text-fuchsia-600" },
  daily_target:             { icon: Target,       gradient: "from-blue-500 to-indigo-500",    iconBg: "bg-blue-100 text-blue-700",         accent: "text-blue-600" },
  focused_product_sales:    { icon: Star,         gradient: "from-amber-500 to-orange-500",   iconBg: "bg-amber-100 text-amber-700",       accent: "text-amber-600" },
  productive_visit:         { icon: CheckCircle2, gradient: "from-emerald-500 to-teal-500",   iconBg: "bg-emerald-100 text-emerald-700",   accent: "text-emerald-600" },
  order_frequency:          { icon: Repeat,       gradient: "from-violet-500 to-purple-500",  iconBg: "bg-violet-100 text-violet-700",     accent: "text-violet-600" },
  beat_growth:              { icon: TrendingUp,   gradient: "from-green-500 to-lime-500",     iconBg: "bg-green-100 text-green-700",       accent: "text-green-600" },
  competition_insight:      { icon: Search,       gradient: "from-rose-500 to-red-500",       iconBg: "bg-rose-100 text-rose-700",         accent: "text-rose-600" },
  retailer_feedback:        { icon: MessageSquare,gradient: "from-cyan-500 to-sky-500",       iconBg: "bg-cyan-100 text-cyan-700",         accent: "text-cyan-600" },
  branding_request:         { icon: Megaphone,    gradient: "from-orange-500 to-rose-500",    iconBg: "bg-orange-100 text-orange-700",     accent: "text-orange-600" },
  total_visits:             { icon: Footprints,   gradient: "from-indigo-500 to-blue-500",    iconBg: "bg-indigo-100 text-indigo-700",     accent: "text-indigo-600" },
};
const DEFAULT_VISUAL = { icon: Sparkles, gradient: "from-slate-500 to-slate-700", iconBg: "bg-slate-100 text-slate-700", accent: "text-slate-600" };

interface Game {
  id: string;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  territories: string[];
  is_all_territories: boolean;
  baseline_target: number;
  is_active: boolean;
  points_to_rupee_conversion: number;
}

interface GameStats {
  participants: number;
  total_points: number;
  active_actions: number;
}

interface GameAction {
  id: string;
  game_id: string;
  action_type: string;
  action_name: string;
  points: number;
  is_enabled: boolean;
  metadata: any;
  max_awardable_activities?: number | null;
  base_daily_target?: number | null;
  focused_products?: string[] | null;
  max_daily_awards?: number | null;
  consecutive_orders_required?: number | null;
  min_growth_percentage?: number | null;
  target_type?: string | null;
}

interface Redemption {
  id: string;
  user_id: string;
  game_id: string;
  points_redeemed: number;
  voucher_amount: number;
  status: string;
  requested_at: string;
  profiles: {
    full_name: string;
  };
}

interface Achievement {
  user_id: string;
  full_name: string;
  total_points: number;
  action_count: number;
}

const METRIC_TYPES = [
  {
    value: "first_order_new_retailer",
    label: "First orders from a new retailer",
    defaultPoints: 5,
    configType: "max_activities",
    description: "Awarded only on the first order ever placed by a newly acquired retailer"
  },
  {
    value: "daily_target",
    label: "Meeting daily target",
    defaultPoints: 15,
    configType: "daily_threshold",
    description: "Awarded once per day when the user meets their assigned daily target from My Target (Quantity/Revenue/Visits)"
  },
  {
    value: "focused_product_sales",
    label: "Focused product sales",
    defaultPoints: 5,
    configType: "product_selection",
    description: "Awarded for each order containing a focused product"
  },
  {
    value: "productive_visit",
    label: "Productive visits (visits with orders)",
    defaultPoints: 5,
    configType: "daily_limit",
    description: "Awarded for any check-in/visit that results in an order"
  },
  {
    value: "order_frequency",
    label: "Frequency of orders from the retailer",
    defaultPoints: 2,
    configType: "consecutive_orders",
    description: "Sequential bonus: Awarded on consecutive orders from the same retailer"
  },
  {
    value: "beat_growth",
    label: "Average growth of business in a beat",
    defaultPoints: 5,
    configType: "growth_percentage",
    description: "Requires calculation of sales growth vs. prior period within the user's beat"
  },
  {
    value: "competition_insight",
    label: "Capturing competition intelligence",
    defaultPoints: 2,
    configType: "unlimited",
    description: "Awarded upon successful submission of a Competition Intelligence form"
  },
  {
    value: "retailer_feedback",
    label: "Capturing retailer feedback",
    defaultPoints: 2,
    configType: "unlimited",
    description: "Awarded upon successful submission of a Retailer Feedback form"
  },
  {
    value: "branding_request",
    label: "Capturing branding request",
    defaultPoints: 2,
    configType: "unlimited",
    description: "Awarded upon successful submission of a Branding Request form"
  },
  {
    value: "total_visits",
    label: "Total Visits",
    defaultPoints: 20,
    configType: "visit_threshold",
    description: "Awarded once per day when user completes the daily visit target (50+ visits required, no partial points)"
  }
];

export function GamificationManagement() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [actions, setActions] = useState<GameAction[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [territories, setTerritories] = useState<string[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingAction, setEditingAction] = useState<GameAction | null>(null);
  const [gameStats, setGameStats] = useState<Map<string, GameStats>>(new Map());
  const [achievementPeriod, setAchievementPeriod] = useState<"day" | "week" | "month">("month");

  // Form states
  const [gameDescription, setGameDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedTerritories, setSelectedTerritories] = useState<string[]>([]);
  const [isAllTerritories, setIsAllTerritories] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState("");
  const [rewardPoints, setRewardPoints] = useState("");
  const [metricConfig, setMetricConfig] = useState<any>({});
  const [isActive, setIsActive] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [actionToDelete, setActionToDelete] = useState<GameAction | null>(null);
  const [pointsToRupeeConversion, setPointsToRupeeConversion] = useState("1");

  useEffect(() => {
    fetchActions();
    fetchTerritories();
  }, []);

  useEffect(() => {
    if (selectedGame) {
      fetchAchievements(selectedGame.id);
    }
  }, [selectedGame, achievementPeriod]);

  const fetchTerritories = async () => {
    const { data } = await supabase.from("territories").select("name");
    if (data) setTerritories(data.map((t) => t.name));
  };

  const fetchActions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("gamification_actions")
      .select("*, gamification_games(*)")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load actions");
    } else {
      setActions(data || []);
    }
    setLoading(false);
  };

  const fetchRedemptions = async () => {
    const { data: redemptionsData, error } = await supabase
      .from("gamification_redemptions")
      .select("*")
      .order("requested_at", { ascending: false });

    if (error) {
      toast.error("Failed to load redemptions");
      return;
    }

    const userIds = redemptionsData.map((r) => r.user_id);
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);

    const profilesMap = new Map(profilesData?.map((p) => [p.id, p]) || []);
    const redemptionsWithProfiles = redemptionsData.map((r) => ({
      ...r,
      profiles: profilesMap.get(r.user_id) || { full_name: "Unknown" },
    }));

    setRedemptions(redemptionsWithProfiles || []);
  };

  const fetchAchievements = async (gameId: string) => {
    let dateFilter = "";
    const now = new Date();

    if (achievementPeriod === "day") {
      dateFilter = now.toISOString().split("T")[0];
    } else if (achievementPeriod === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      dateFilter = weekAgo.toISOString().split("T")[0];
    } else {
      const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFilter = monthAgo.toISOString().split("T")[0];
    }

    const { data, error } = await supabase
      .from("gamification_points")
      .select("user_id, points, profiles(full_name)")
      .eq("game_id", gameId)
      .gte("earned_at", dateFilter);

    if (error) {
      toast.error("Failed to load achievements");
      return;
    }

    const aggregated = data.reduce((acc: any, curr: any) => {
      const userId = curr.user_id;
      if (!acc[userId]) {
        acc[userId] = {
          user_id: userId,
          full_name: curr.profiles?.full_name || "Unknown",
          total_points: 0,
          action_count: 0,
        };
      }
      acc[userId].total_points += curr.points;
      acc[userId].action_count += 1;
      return acc;
    }, {});

    const sorted = Object.values(aggregated).sort((a: any, b: any) => b.total_points - a.total_points);
    setAchievements(sorted as Achievement[]);
  };

  const createActivity = async () => {
    if (!selectedActivity || !rewardPoints) {
      toast.error("Please fill in Activity Name and Reward Points");
      return;
    }

    const activity = METRIC_TYPES.find((a) => a.value === selectedActivity);
    const activityConfigType = activity?.configType;

    // Only validate configuration when activity is being created as active
    if (isActive) {
      if (activityConfigType === "max_activities" && !metricConfig.max_awardable_activities) {
        toast.error("Please configure maximum awardable activities");
        return;
      }
      if (activityConfigType === "daily_threshold" && !metricConfig.target_type) {
        toast.error("Please select a target type");
        return;
      }
      if (activityConfigType === "product_selection" && (!metricConfig.focused_products || metricConfig.focused_products.length === 0)) {
        toast.error("Please select focused products");
        return;
      }
      if (activityConfigType === "daily_limit" && !metricConfig.max_daily_awards) {
        toast.error("Please configure maximum daily awards");
        return;
      }
      if (activityConfigType === "consecutive_orders" && !metricConfig.consecutive_orders_required) {
        toast.error("Please configure consecutive orders required");
        return;
      }
      if (activityConfigType === "growth_percentage" && !metricConfig.min_growth_percentage) {
        toast.error("Please configure minimum growth percentage");
        return;
      }
      if (activityConfigType === "visit_threshold" && !metricConfig.daily_visit_target) {
        toast.error("Please configure daily visit target");
        return;
      }
    }

    if (selectedTerritories.length === 0 && !isAllTerritories) {
      toast.error("Please select at least one territory");
      return;
    }

    // Generate a game name from activity and timestamp
    const generatedGameName = `${activity?.label} - ${new Date().toLocaleDateString()}`;

    const { data: gameData, error: gameError } = await supabase
      .from("gamification_games")
      .insert({
        name: generatedGameName,
        description: gameDescription,
        start_date: startDate || new Date().toISOString().split('T')[0],
        end_date: endDate || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
        territories: isAllTerritories ? [] : selectedTerritories,
        is_all_territories: isAllTerritories,
        is_active: isActive,
        baseline_target: 0,
        points_to_rupee_conversion: parseFloat(pointsToRupeeConversion) || 1,
      })
      .select()
      .single();

    if (gameError) {
      toast.error("Failed to create game");
      return;
    }

    const { error: actionsError } = await supabase.from("gamification_actions").insert({
      game_id: gameData.id,
      action_type: selectedActivity,
      action_name: activity?.label || selectedActivity,
      points: parseFloat(rewardPoints),
      is_enabled: isActive,
      max_awardable_activities: metricConfig.max_awardable_activities || null,
      base_daily_target: metricConfig.base_daily_target || null,
      focused_products: metricConfig.focused_products || null,
      max_daily_awards: metricConfig.max_daily_awards || null,
      consecutive_orders_required: metricConfig.consecutive_orders_required || null,
      min_growth_percentage: metricConfig.min_growth_percentage || null,
      target_type: metricConfig.target_type || null,
      metadata: {
        daily_visit_target: metricConfig.daily_visit_target || null,
      },
    });

    if (actionsError) {
      toast.error("Failed to create action");
    } else {
      toast.success("Activity created successfully");
      setShowCreateDialog(false);
      resetForm();
      fetchActions();
    }
  };

  const updateActivity = async () => {
    if (!editingAction) return;
    
    if (!selectedActivity || !rewardPoints) {
      toast.error("Please fill in Activity Name and Reward Points");
      return;
    }

    const activity = METRIC_TYPES.find((a) => a.value === selectedActivity);
    const activityConfigType = activity?.configType;

    // Only validate configuration when activity is being set to active
    if (isActive) {
      if (activityConfigType === "max_activities" && !metricConfig.max_awardable_activities) {
        toast.error("Please configure maximum awardable activities");
        return;
      }
      if (activityConfigType === "daily_threshold" && !metricConfig.target_type) {
        toast.error("Please select a target type");
        return;
      }
      if (activityConfigType === "product_selection" && (!metricConfig.focused_products || metricConfig.focused_products.length === 0)) {
        toast.error("Please select focused products");
        return;
      }
      if (activityConfigType === "daily_limit" && !metricConfig.max_daily_awards) {
        toast.error("Please configure maximum daily awards");
        return;
      }
      if (activityConfigType === "consecutive_orders" && !metricConfig.consecutive_orders_required) {
        toast.error("Please configure consecutive orders required");
        return;
      }
      if (activityConfigType === "growth_percentage" && !metricConfig.min_growth_percentage) {
        toast.error("Please configure minimum growth percentage");
        return;
      }
      if (activityConfigType === "visit_threshold" && !metricConfig.daily_visit_target) {
        toast.error("Please configure daily visit target");
        return;
      }
    }

    if (selectedTerritories.length === 0 && !isAllTerritories) {
      toast.error("Please select at least one territory");
      return;
    }

    // Update the game
    const generatedGameName = `${activity?.label} - ${new Date().toLocaleDateString()}`;
    const { error: gameError } = await supabase
      .from("gamification_games")
      .update({
        name: generatedGameName,
        description: gameDescription,
        start_date: startDate,
        end_date: endDate,
        territories: isAllTerritories ? [] : selectedTerritories,
        is_all_territories: isAllTerritories,
        is_active: isActive,
        points_to_rupee_conversion: parseFloat(pointsToRupeeConversion) || 1,
      })
      .eq("id", editingAction.game_id);

    if (gameError) {
      toast.error("Failed to update game");
      return;
    }

    // Update the action
    const { error: actionError } = await supabase
      .from("gamification_actions")
      .update({
        action_type: selectedActivity,
        action_name: activity?.label || selectedActivity,
        points: parseFloat(rewardPoints),
        is_enabled: isActive,
        max_awardable_activities: metricConfig.max_awardable_activities || null,
        base_daily_target: metricConfig.base_daily_target || null,
        focused_products: metricConfig.focused_products || null,
        max_daily_awards: metricConfig.max_daily_awards || null,
        consecutive_orders_required: metricConfig.consecutive_orders_required || null,
        min_growth_percentage: metricConfig.min_growth_percentage || null,
        target_type: metricConfig.target_type || null,
        metadata: {
          daily_visit_target: metricConfig.daily_visit_target || null,
        },
      })
      .eq("id", editingAction.id);

    if (actionError) {
      toast.error("Failed to update activity");
    } else {
      toast.success("Activity updated successfully");
      setShowEditDialog(false);
      resetForm();
      fetchActions();
    }
  };

  const updateAction = async (actionId: string, updates: Partial<GameAction>) => {
    const { error } = await supabase
      .from("gamification_actions")
      .update(updates)
      .eq("id", actionId);

    if (error) {
      toast.error("Failed to update action");
    } else {
      toast.success("Action updated");
      fetchActions();
    }
  };

  const processRedemption = async (
    redemptionId: string,
    status: string,
    voucherCode?: string,
    rejectionReason?: string
  ) => {
    const { error } = await supabase
      .from("gamification_redemptions")
      .update({
        status,
        voucher_code: voucherCode,
        rejection_reason: rejectionReason,
        processed_at: new Date().toISOString(),
      })
      .eq("id", redemptionId);

    if (error) {
      toast.error("Failed to process redemption");
    } else {
      toast.success(`Redemption ${status}`);
      fetchRedemptions();
    }
  };

  const openEditDialog = async (action: GameAction) => {
    setEditingAction(action);
    
    // Find associated game
    const { data } = await supabase
      .from("gamification_games")
      .select("*")
      .eq("id", action.game_id)
      .single();

    if (data) {
      setGameDescription(data.description);
      setStartDate(data.start_date);
      setEndDate(data.end_date);
      setSelectedTerritories(data.territories);
      setIsAllTerritories(data.is_all_territories);
      setPointsToRupeeConversion(data.points_to_rupee_conversion?.toString() || "1");
    }

    setSelectedActivity(action.action_type);
    setRewardPoints(action.points.toString());
    setIsActive(action.is_enabled);
    // Extract daily_visit_target from metadata if present
    const metadata = action.metadata as Record<string, any> | null;
    
    setMetricConfig({
      max_awardable_activities: action.max_awardable_activities,
      base_daily_target: action.base_daily_target,
      focused_products: action.focused_products,
      max_daily_awards: action.max_daily_awards,
      consecutive_orders_required: action.consecutive_orders_required,
      min_growth_percentage: action.min_growth_percentage,
      target_type: action.target_type,
      daily_visit_target: metadata?.daily_visit_target || null,
    });
    setShowEditDialog(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setShowCreateDialog(true);
  };

  const deleteActivity = async () => {
    if (!actionToDelete) return;

    // Delete the action
    const { error: actionError } = await supabase
      .from("gamification_actions")
      .delete()
      .eq("id", actionToDelete.id);

    if (actionError) {
      toast.error("Failed to delete activity");
      return;
    }

    // Check if there are other actions for this game
    const { data: otherActions } = await supabase
      .from("gamification_actions")
      .select("id")
      .eq("game_id", actionToDelete.game_id);

    // If no other actions, delete the game too
    if (!otherActions || otherActions.length === 0) {
      await supabase
        .from("gamification_games")
        .delete()
        .eq("id", actionToDelete.game_id);
    }

    toast.success("Activity deleted successfully");
    setShowDeleteDialog(false);
    setActionToDelete(null);
    fetchActions();
  };

  const resetForm = () => {
    setGameDescription("");
    setStartDate("");
    setEndDate("");
    setSelectedTerritories([]);
    setIsAllTerritories(true);
    setSelectedActivity("");
    setRewardPoints("");
    setMetricConfig({});
    setIsActive(true);
    setPointsToRupeeConversion("1");
  };

  const getConfigSummary = (action: GameAction) => {
    const activity = METRIC_TYPES.find((a) => a.value === action.action_type);
    if (!activity) return "-";

    // Check metadata for visit_threshold config
    const metadata = action.metadata as Record<string, any> | null;

    switch (activity.configType) {
      case "max_activities":
        return `Max ${action.max_awardable_activities || 0} activities`;
      case "daily_threshold":
        const targetLabel = action.target_type === 'revenue' ? 'Revenue' : action.target_type === 'visits' ? 'Visits' : 'Quantity';
        return `Target: ${targetLabel} (from My Target)`;
      case "product_selection":
        return `${action.focused_products?.length || 0} products`;
      case "daily_limit":
        return `Max ${action.max_daily_awards || 0}/day`;
      case "consecutive_orders":
        return `${action.consecutive_orders_required || 0} consecutive`;
      case "growth_percentage":
        return `Min ${action.min_growth_percentage || 0}% growth`;
      case "visit_threshold":
        return `${metadata?.daily_visit_target || 50} visits/day`;
      case "unlimited":
        return "Unlimited";
      default:
        return "-";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-amber-300/20 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="hidden sm:flex h-14 w-14 items-center justify-center rounded-xl bg-white/15 backdrop-blur ring-1 ring-white/25">
              <Trophy className="h-7 w-7 text-amber-300" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Gamification Management</h2>
              <p className="text-white/80 text-sm sm:text-base mt-1">Configure activities, badges & rewards to keep your team engaged</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
                  <Sparkles className="h-3 w-3" /> {actions.length} Total
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/25 px-3 py-1 text-xs font-medium backdrop-blur">
                  <CheckCircle2 className="h-3 w-3" /> {actions.filter(a => a.is_enabled).length} Active
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
                  {actions.filter(a => !a.is_enabled).length} Inactive
                </span>
              </div>
            </div>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog} size="lg" className="bg-white text-indigo-700 hover:bg-white/90 font-semibold shadow-lg">
                <Plus className="mr-2 h-4 w-4" />
                Create New Activity
              </Button>
            </DialogTrigger>

          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Activity</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="activityName">Activity Name *</Label>
                <Select value={selectedActivity} onValueChange={(value) => {
                  setSelectedActivity(value);
                  const activity = METRIC_TYPES.find(a => a.value === value);
                  setRewardPoints(activity?.defaultPoints.toString() || "");
                }}>
                  <SelectTrigger id="activityName">
                    <SelectValue placeholder="Select an activity" />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    {METRIC_TYPES.map((activity) => (
                      <SelectItem key={activity.value} value={activity.value}>
                        {activity.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="rewardPoints">Reward Points per Activity *</Label>
                <Input
                  id="rewardPoints"
                  type="number"
                  value={rewardPoints}
                  onChange={(e) => setRewardPoints(e.target.value)}
                  placeholder="Enter points"
                  min="0"
                />
              </div>

              {selectedActivity && (
                <MetricConfigFields
                  metricType={selectedActivity}
                  config={metricConfig}
                  onConfigChange={setMetricConfig}
                />
              )}

              <div className="flex items-center space-x-2">
                <Switch
                  id="gameActive"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
                <Label htmlFor="gameActive">Game Active</Label>
              </div>

              <div>
                <Label htmlFor="gameDescription">Description</Label>
                <Textarea
                  id="gameDescription"
                  value={gameDescription}
                  onChange={(e) => setGameDescription(e.target.value)}
                  placeholder="Describe the activity objectives..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="pointsConversion">Points to Rupee Conversion</Label>
                <Input
                  id="pointsConversion"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={pointsToRupeeConversion}
                  onChange={(e) => setPointsToRupeeConversion(e.target.value)}
                  placeholder="1 point = ? rupees (e.g., 1 or 0.5)"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Set how many rupees equals 1 point (e.g., 1 point = ₹{pointsToRupeeConversion || "1"})
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="allTerritories"
                  checked={isAllTerritories}
                  onCheckedChange={setIsAllTerritories}
                />
                <Label htmlFor="allTerritories">Apply to all territories</Label>
              </div>

              {!isAllTerritories && (
                <div>
                  <Label>Select Territories *</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {territories.map((territory) => (
                      <div key={territory} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`territory-${territory}`}
                          checked={selectedTerritories.includes(territory)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTerritories([...selectedTerritories, territory]);
                            } else {
                              setSelectedTerritories(
                                selectedTerritories.filter((t) => t !== territory)
                              );
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                        <Label htmlFor={`territory-${territory}`} className="font-normal">
                          {territory}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={createActivity} className="flex-1">
                  Create Activity
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Activity</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="editActivityName">Activity Name *</Label>
                <Select value={selectedActivity} onValueChange={(value) => {
                  setSelectedActivity(value);
                  const activity = METRIC_TYPES.find(a => a.value === value);
                  setRewardPoints(activity?.defaultPoints.toString() || "");
                }}>
                  <SelectTrigger id="editActivityName">
                    <SelectValue placeholder="Select an activity" />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    {METRIC_TYPES.map((activity) => (
                      <SelectItem key={activity.value} value={activity.value}>
                        {activity.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="editRewardPoints">Reward Points per Activity *</Label>
                <Input
                  id="editRewardPoints"
                  type="number"
                  value={rewardPoints}
                  onChange={(e) => setRewardPoints(e.target.value)}
                  placeholder="Enter points"
                  min="0"
                />
              </div>

              {selectedActivity && (
                <MetricConfigFields
                  metricType={selectedActivity}
                  config={metricConfig}
                  onConfigChange={setMetricConfig}
                />
              )}

              <div className="flex items-center space-x-2">
                <Switch
                  id="editGameActive"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
                <Label htmlFor="editGameActive">Game Active</Label>
              </div>

              <div>
                <Label htmlFor="editGameDescription">Description</Label>
                <Textarea
                  id="editGameDescription"
                  value={gameDescription}
                  onChange={(e) => setGameDescription(e.target.value)}
                  placeholder="Describe the activity objectives..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editStartDate">Start Date</Label>
                  <Input
                    id="editStartDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="editEndDate">End Date</Label>
                  <Input
                    id="editEndDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="editPointsConversion">Points to Rupee Conversion</Label>
                <Input
                  id="editPointsConversion"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={pointsToRupeeConversion}
                  onChange={(e) => setPointsToRupeeConversion(e.target.value)}
                  placeholder="1 point = ? rupees (e.g., 1 or 0.5)"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Set how many rupees equals 1 point (e.g., 1 point = ₹{pointsToRupeeConversion || "1"})
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="editAllTerritories"
                  checked={isAllTerritories}
                  onCheckedChange={setIsAllTerritories}
                />
                <Label htmlFor="editAllTerritories">Apply to all territories</Label>
              </div>

              {!isAllTerritories && (
                <div>
                  <Label>Select Territories *</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {territories.map((territory) => (
                      <div key={territory} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`edit-territory-${territory}`}
                          checked={selectedTerritories.includes(territory)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTerritories([...selectedTerritories, territory]);
                            } else {
                              setSelectedTerritories(
                                selectedTerritories.filter((t) => t !== territory)
                              );
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                        <Label htmlFor={`edit-territory-${territory}`} className="font-normal">
                          {territory}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={updateActivity} className="flex-1">
                  Update Activity
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p>Are you sure you want to delete "{actionToDelete?.action_name}"?</p>
              <p className="text-sm text-muted-foreground">
                This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={deleteActivity} className="flex-1">
                  Delete
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setActionToDelete(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </Dialog>
          </div>
        </div>
      </div>


      <Tabs defaultValue="activities" className="space-y-4">
        <TabsList>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="badges">Badges</TabsTrigger>
          <TabsTrigger value="redemptions" onClick={() => fetchRedemptions()}>
            Redemptions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activities" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Activities</CardTitle>
              <CardDescription>Click on an activity to edit</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity Name</TableHead>
                    <TableHead>Game</TableHead>
                    <TableHead>Reward</TableHead>
                    <TableHead>Points to Rs.</TableHead>
                    <TableHead>Configuration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actions.map((action) => {
                    const game = games.find(g => g.id === action.game_id);
                    return (
                    <TableRow
                      key={action.id}
                      className="cursor-pointer hover:bg-muted"
                      onClick={() => openEditDialog(action)}
                    >
                      <TableCell className="font-medium">{action.action_name}</TableCell>
                      <TableCell className="text-sm">
                        {game?.name || "N/A"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">{action.points} points</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">1 pt = ₹{game?.points_to_rupee_conversion || 1}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {getConfigSummary(action)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={action.is_enabled ? "default" : "secondary"}>
                          {action.is_enabled ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(action);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionToDelete(action);
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="badges" className="space-y-4">
          <BadgeManagement />
        </TabsContent>

        <TabsContent value="redemptions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Redemption Requests</CardTitle>
              <CardDescription>Review and process user redemption requests</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {redemptions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No redemption requests
                  </p>
                ) : (
                  redemptions.map((redemption) => (
                    <div
                      key={redemption.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{redemption.profiles.full_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {redemption.points_redeemed} points → ₹{redemption.voucher_amount}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(redemption.requested_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {redemption.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => {
                                const code = prompt("Enter voucher code:");
                                if (code) processRedemption(redemption.id, "approved", code);
                              }}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                const reason = prompt("Enter rejection reason:");
                                if (reason)
                                  processRedemption(redemption.id, "rejected", undefined, reason);
                              }}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {redemption.status !== "pending" && (
                          <Badge
                            variant={
                              redemption.status === "approved" ? "default" : "destructive"
                            }
                          >
                            {redemption.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

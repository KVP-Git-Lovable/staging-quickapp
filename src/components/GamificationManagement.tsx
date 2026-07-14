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

const METRIC_VISUALS: Record<string, { icon: any; tint: string; bar: string; iconBg: string; accent: string; ring: string }> = {
  first_order_new_retailer: { icon: UserPlus,     tint: "bg-fuchsia-50",  bar: "bg-fuchsia-200",  iconBg: "bg-fuchsia-100 text-fuchsia-600",   accent: "text-fuchsia-600", ring: "ring-fuchsia-100" },
  daily_target:             { icon: Target,       tint: "bg-blue-50",     bar: "bg-blue-200",     iconBg: "bg-blue-100 text-blue-600",         accent: "text-blue-600",    ring: "ring-blue-100" },
  focused_product_sales:    { icon: Star,         tint: "bg-amber-50",    bar: "bg-amber-200",    iconBg: "bg-amber-100 text-amber-600",       accent: "text-amber-600",   ring: "ring-amber-100" },
  productive_visit:         { icon: CheckCircle2, tint: "bg-emerald-50",  bar: "bg-emerald-200",  iconBg: "bg-emerald-100 text-emerald-600",   accent: "text-emerald-600", ring: "ring-emerald-100" },
  order_frequency:          { icon: Repeat,       tint: "bg-violet-50",   bar: "bg-violet-200",   iconBg: "bg-violet-100 text-violet-600",     accent: "text-violet-600",  ring: "ring-violet-100" },
  beat_growth:              { icon: TrendingUp,   tint: "bg-green-50",    bar: "bg-green-200",    iconBg: "bg-green-100 text-green-600",       accent: "text-green-600",   ring: "ring-green-100" },
  competition_insight:      { icon: Search,       tint: "bg-rose-50",     bar: "bg-rose-200",     iconBg: "bg-rose-100 text-rose-600",         accent: "text-rose-600",    ring: "ring-rose-100" },
  retailer_feedback:        { icon: MessageSquare,tint: "bg-cyan-50",     bar: "bg-cyan-200",     iconBg: "bg-cyan-100 text-cyan-600",         accent: "text-cyan-600",    ring: "ring-cyan-100" },
  branding_request:         { icon: Megaphone,    tint: "bg-orange-50",   bar: "bg-orange-200",   iconBg: "bg-orange-100 text-orange-600",     accent: "text-orange-600",  ring: "ring-orange-100" },
  total_visits:             { icon: Footprints,   tint: "bg-indigo-50",   bar: "bg-indigo-200",   iconBg: "bg-indigo-100 text-indigo-600",     accent: "text-indigo-600",  ring: "ring-indigo-100" },
};
const DEFAULT_VISUAL = { icon: Sparkles, tint: "bg-slate-50", bar: "bg-slate-200", iconBg: "bg-slate-100 text-slate-600", accent: "text-slate-600", ring: "ring-slate-100" };



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
  const [activityFilter, setActivityFilter] = useState<'all' | 'active' | 'inactive'>('all');

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
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-6 sm:p-8 shadow-sm">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-indigo-100/50 blur-3xl" />
        <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-amber-100/40 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="hidden sm:flex h-14 w-14 items-center justify-center rounded-xl bg-white ring-1 ring-indigo-100 shadow-sm">
              <Trophy className="h-7 w-7 text-amber-500" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Gamification Management</h2>
              <p className="text-slate-500 text-sm sm:text-base mt-1">Configure activities, badges & rewards to keep your team engaged</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setActivityFilter('all')}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${activityFilter === 'all' ? 'bg-indigo-600 text-white ring-1 ring-indigo-600 shadow-sm' : 'bg-white ring-1 ring-slate-200 text-slate-700 hover:ring-indigo-300'}`}
                >
                  <Sparkles className={`h-3 w-3 ${activityFilter === 'all' ? 'text-white' : 'text-indigo-500'}`} /> {actions.length} Total
                </button>
                <button
                  type="button"
                  onClick={() => setActivityFilter('active')}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${activityFilter === 'active' ? 'bg-emerald-600 text-white ring-1 ring-emerald-600 shadow-sm' : 'bg-emerald-50 ring-1 ring-emerald-200 text-emerald-700 hover:ring-emerald-400'}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${activityFilter === 'active' ? 'bg-white' : 'bg-emerald-500'}`} />
                  {actions.filter(a => a.is_enabled).length} Active
                </button>
                <button
                  type="button"
                  onClick={() => setActivityFilter('inactive')}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${activityFilter === 'inactive' ? 'bg-slate-700 text-white ring-1 ring-slate-700 shadow-sm' : 'bg-slate-50 ring-1 ring-slate-200 text-slate-600 hover:ring-slate-400'}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${activityFilter === 'inactive' ? 'bg-white' : 'bg-slate-400'}`} />
                  {actions.filter(a => !a.is_enabled).length} Inactive
                </button>

              </div>
            </div>

          </div>
          <div className="hidden lg:flex flex-1 items-center justify-center pointer-events-none select-none" aria-hidden="true">
            <div className="relative h-24 w-64">
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-6xl animate-party-shake drop-shadow-md">🎉</span>
              <span className="absolute left-4 top-2 h-2 w-2 rounded-full bg-pink-400 animate-confetti-1" />
              <span className="absolute left-12 top-8 h-2 w-2 rounded-sm bg-amber-400 animate-confetti-2" />
              <span className="absolute right-10 top-3 h-2 w-2 rounded-full bg-indigo-500 animate-confetti-3" />
              <span className="absolute right-4 top-10 h-2 w-2 rounded-sm bg-emerald-500 animate-confetti-4" />
              <span className="absolute left-20 bottom-2 h-2 w-2 rounded-full bg-sky-500 animate-confetti-5" />
              <span className="absolute right-16 bottom-1 h-2 w-2 rounded-sm bg-rose-500 animate-confetti-6" />
            </div>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog} size="lg" className="bg-indigo-600 text-white hover:bg-indigo-700 font-semibold shadow-sm">
                <Plus className="mr-2 h-4 w-4" />
                Create New Activity
              </Button>
            </DialogTrigger>

          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 bg-slate-50">
            <DialogHeader className="px-6 pt-6 pb-4 bg-gradient-to-r from-indigo-50 to-sky-50 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-white border border-indigo-100 flex items-center justify-center shadow-sm">
                  <Plus className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold text-slate-800">Create New Activity</DialogTitle>
                  <p className="text-xs text-slate-500 mt-0.5">Configure a new gamification activity for your team</p>
                </div>
              </div>
            </DialogHeader>
            <div className="p-6 space-y-4">
              <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Activity Details</div>
                <div>
                  <Label htmlFor="activityName" className="text-slate-700">Activity Name *</Label>
                  <Select value={selectedActivity} onValueChange={(value) => {
                    setSelectedActivity(value);
                    const activity = METRIC_TYPES.find(a => a.value === value);
                    setRewardPoints(activity?.defaultPoints.toString() || "");
                  }}>
                    <SelectTrigger id="activityName" className="mt-1 bg-white">
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
                  <Label htmlFor="gameDescription" className="text-slate-700">Description</Label>
                  <Textarea
                    id="gameDescription"
                    value={gameDescription}
                    onChange={(e) => setGameDescription(e.target.value)}
                    placeholder="Describe the activity objectives..."
                    className="mt-1 bg-white"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                  <div>
                    <Label htmlFor="gameActive" className="text-slate-700 font-medium">Game Active</Label>
                    <p className="text-xs text-slate-500">Enable this activity for participants</p>
                  </div>
                  <Switch id="gameActive" checked={isActive} onCheckedChange={setIsActive} />
                </div>
              </div>

              <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rewards & Conversion</div>
                <div>
                  <Label htmlFor="rewardPoints" className="text-slate-700">Reward Points per Activity *</Label>
                  <Input
                    id="rewardPoints"
                    type="number"
                    value={rewardPoints}
                    onChange={(e) => setRewardPoints(e.target.value)}
                    placeholder="Enter points"
                    min="0"
                    className="mt-1 bg-white"
                  />
                </div>
                <div>
                  <Label htmlFor="pointsConversion" className="text-slate-700">Points to Rupee Conversion</Label>
                  <Input
                    id="pointsConversion"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={pointsToRupeeConversion}
                    onChange={(e) => setPointsToRupeeConversion(e.target.value)}
                    placeholder="1 point = ? rupees (e.g., 1 or 0.5)"
                    className="mt-1 bg-white"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    1 point = ₹{pointsToRupeeConversion || "1"}
                  </p>
                </div>
              </div>

              {selectedActivity && (
                <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Metric Configuration</div>
                  <MetricConfigFields
                    metricType={selectedActivity}
                    config={metricConfig}
                    onConfigChange={setMetricConfig}
                  />
                </div>
              )}

              <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate" className="text-slate-700">Start Date</Label>
                    <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 bg-white" />
                  </div>
                  <div>
                    <Label htmlFor="endDate" className="text-slate-700">End Date</Label>
                    <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 bg-white" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Territory Scope</div>
                <div className="flex items-center justify-between rounded-lg bg-sky-50 border border-sky-100 px-3 py-2">
                  <Label htmlFor="allTerritories" className="text-slate-700 font-medium">Apply to all territories</Label>
                  <Switch id="allTerritories" checked={isAllTerritories} onCheckedChange={setIsAllTerritories} />
                </div>
                {!isAllTerritories && (
                  <div>
                    <Label className="text-slate-700">Select Territories *</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {territories.map((territory) => (
                        <div key={territory} className="flex items-center space-x-2 rounded-md border border-slate-200 px-2 py-1.5 bg-slate-50">
                          <input
                            type="checkbox"
                            id={`territory-${territory}`}
                            checked={selectedTerritories.includes(territory)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTerritories([...selectedTerritories, territory]);
                              } else {
                                setSelectedTerritories(selectedTerritories.filter((t) => t !== territory));
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                          <Label htmlFor={`territory-${territory}`} className="font-normal text-sm">{territory}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={createActivity} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white">
                  Create Activity
                </Button>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 bg-slate-50">
            <DialogHeader className="px-6 pt-6 pb-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-white border border-amber-100 flex items-center justify-center shadow-sm">
                  <Pencil className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold text-slate-800">Edit Activity</DialogTitle>
                  <p className="text-xs text-slate-500 mt-0.5">Update the configuration for this activity</p>
                </div>
              </div>
            </DialogHeader>
            <div className="p-6 space-y-4">
              <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Activity Details</div>
                <div>
                  <Label htmlFor="editActivityName" className="text-slate-700">Activity Name *</Label>
                  <Select value={selectedActivity} onValueChange={(value) => {
                    setSelectedActivity(value);
                    const activity = METRIC_TYPES.find(a => a.value === value);
                    setRewardPoints(activity?.defaultPoints.toString() || "");
                  }}>
                    <SelectTrigger id="editActivityName" className="mt-1 bg-white">
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
                  <Label htmlFor="editGameDescription" className="text-slate-700">Description</Label>
                  <Textarea
                    id="editGameDescription"
                    value={gameDescription}
                    onChange={(e) => setGameDescription(e.target.value)}
                    placeholder="Describe the activity objectives..."
                    className="mt-1 bg-white"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                  <div>
                    <Label htmlFor="editGameActive" className="text-slate-700 font-medium">Game Active</Label>
                    <p className="text-xs text-slate-500">Enable this activity for participants</p>
                  </div>
                  <Switch id="editGameActive" checked={isActive} onCheckedChange={setIsActive} />
                </div>
              </div>

              <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rewards & Conversion</div>
                <div>
                  <Label htmlFor="editRewardPoints" className="text-slate-700">Reward Points per Activity *</Label>
                  <Input
                    id="editRewardPoints"
                    type="number"
                    value={rewardPoints}
                    onChange={(e) => setRewardPoints(e.target.value)}
                    placeholder="Enter points"
                    min="0"
                    className="mt-1 bg-white"
                  />
                </div>
                <div>
                  <Label htmlFor="editPointsConversion" className="text-slate-700">Points to Rupee Conversion</Label>
                  <Input
                    id="editPointsConversion"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={pointsToRupeeConversion}
                    onChange={(e) => setPointsToRupeeConversion(e.target.value)}
                    placeholder="1 point = ? rupees (e.g., 1 or 0.5)"
                    className="mt-1 bg-white"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    1 point = ₹{pointsToRupeeConversion || "1"}
                  </p>
                </div>
              </div>

              {selectedActivity && (
                <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Metric Configuration</div>
                  <MetricConfigFields
                    metricType={selectedActivity}
                    config={metricConfig}
                    onConfigChange={setMetricConfig}
                  />
                </div>
              )}

              <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="editStartDate" className="text-slate-700">Start Date</Label>
                    <Input id="editStartDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 bg-white" />
                  </div>
                  <div>
                    <Label htmlFor="editEndDate" className="text-slate-700">End Date</Label>
                    <Input id="editEndDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 bg-white" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Territory Scope</div>
                <div className="flex items-center justify-between rounded-lg bg-sky-50 border border-sky-100 px-3 py-2">
                  <Label htmlFor="editAllTerritories" className="text-slate-700 font-medium">Apply to all territories</Label>
                  <Switch id="editAllTerritories" checked={isAllTerritories} onCheckedChange={setIsAllTerritories} />
                </div>
                {!isAllTerritories && (
                  <div>
                    <Label className="text-slate-700">Select Territories *</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {territories.map((territory) => (
                        <div key={territory} className="flex items-center space-x-2 rounded-md border border-slate-200 px-2 py-1.5 bg-slate-50">
                          <input
                            type="checkbox"
                            id={`edit-territory-${territory}`}
                            checked={selectedTerritories.includes(territory)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTerritories([...selectedTerritories, territory]);
                              } else {
                                setSelectedTerritories(selectedTerritories.filter((t) => t !== territory));
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                          <Label htmlFor={`edit-territory-${territory}`} className="font-normal text-sm">{territory}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={updateActivity} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">
                  Update Activity
                </Button>
                <Button variant="outline" onClick={() => setShowEditDialog(false)} className="flex-1">
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
          {actions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-4">
                  <Trophy className="h-8 w-8 text-indigo-500" />
                </div>
                <h3 className="text-lg font-semibold">No activities yet</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Create your first gamification activity to start rewarding your team.
                </p>
                <Button onClick={openCreateDialog} className="mt-4">
                  <Plus className="mr-2 h-4 w-4" /> Create Activity
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {actions.filter(a => activityFilter === 'all' ? true : activityFilter === 'active' ? a.is_enabled : !a.is_enabled).map((action) => {
                const visual = METRIC_VISUALS[action.action_type] || DEFAULT_VISUAL;
                const Icon = visual.icon;
                const game = games.find(g => g.id === action.game_id);
                const conversion = game?.points_to_rupee_conversion || 1;
                return (
                  <div
                    key={action.id}
                    onClick={() => openEditDialog(action)}
                    className={`group relative overflow-hidden rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all cursor-pointer ${
                      action.is_enabled ? "border-slate-200" : "border-dashed border-slate-200 bg-slate-50/50"
                    }`}
                  >
                    {/* Top tint bar */}
                    <div className={`h-1.5 ${action.is_enabled ? visual.bar : "bg-slate-200"}`} />

                    {/* Status ribbon */}
                    <div className="absolute top-4 right-4 z-10">
                      {action.is_enabled ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-xs font-semibold ring-1 ring-emerald-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-2.5 py-1 text-xs font-semibold ring-1 ring-slate-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          Inactive
                        </span>
                      )}
                    </div>

                    <div className="p-5 pt-4">
                      <div className="flex items-start gap-3">
                        <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${visual.iconBg} ring-1 ${visual.ring} shrink-0`}>
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="min-w-0 pr-16">
                          <h3 className="font-semibold text-base leading-tight truncate text-slate-900">{action.action_name}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {getConfigSummary(action)}
                          </p>
                        </div>
                      </div>

                      {/* Reward pills */}
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className={`rounded-xl ${visual.tint} ring-1 ${visual.ring} p-3`}>
                          <div className={`flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium ${visual.accent}`}>
                            <Award className="h-3 w-3" /> Reward
                          </div>
                          <div className={`text-xl font-bold leading-tight mt-0.5 ${visual.accent}`}>
                            {action.points} <span className="text-xs font-medium">pts</span>
                          </div>
                        </div>

                        <div className="rounded-xl bg-muted/60 p-3">
                          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                            <Coins className="h-3 w-3" /> Value
                          </div>
                          <div className={`text-xl font-bold leading-tight mt-0.5 ${visual.accent}`}>
                            ₹{conversion}
                            <span className="text-xs font-medium text-muted-foreground"> /pt</span>
                          </div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="mt-4 flex items-center justify-between pt-3 border-t">
                        <span className="text-xs text-muted-foreground truncate max-w-[60%]">
                          {game?.name?.split(" - ")[0] || "Standalone"}
                        </span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(action);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionToDelete(action);
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </TabsContent>

        <TabsContent value="badges" className="space-y-4">

          <BadgeManagement />
        </TabsContent>

        <TabsContent value="redemptions" className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 p-6 shadow-sm">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-100/40 blur-3xl" />
            <div className="relative flex items-start gap-4">
              <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-xl bg-white ring-1 ring-emerald-100 shadow-sm">
                <Gift className="h-6 w-6 text-emerald-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-slate-900">Redemption Requests</h3>
                <p className="text-slate-500 text-sm mt-0.5">Review and process user reward redemptions</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white ring-1 ring-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                    {redemptions.length} Total
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 ring-1 ring-amber-200 px-3 py-1 text-xs font-medium text-amber-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                    {redemptions.filter(r => r.status === "pending").length} Pending
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 ring-1 ring-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
                    {redemptions.filter(r => r.status === "approved").length} Approved
                  </span>
                </div>
              </div>
            </div>
          </div>

          {redemptions.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-white py-16 flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4 ring-1 ring-emerald-100">
                <Gift className="h-8 w-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">No redemption requests</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">Approved redemptions will appear here once users start converting points.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {redemptions.map((redemption) => {
                const isPending = redemption.status === "pending";
                const isApproved = redemption.status === "approved";
                const statusStyle = isPending
                  ? { bar: "bg-amber-200", tint: "bg-amber-50", ring: "ring-amber-100", accent: "text-amber-700", pill: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500 animate-pulse" }
                  : isApproved
                  ? { bar: "bg-emerald-200", tint: "bg-emerald-50", ring: "ring-emerald-100", accent: "text-emerald-700", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" }
                  : { bar: "bg-rose-200", tint: "bg-rose-50", ring: "ring-rose-100", accent: "text-rose-700", pill: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" };
                return (
                  <div
                    key={redemption.id}
                    className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all"
                  >
                    <div className={`h-1.5 ${statusStyle.bar}`} />
                    <div className="absolute top-4 right-4 z-10">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 capitalize ${statusStyle.pill}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                        {redemption.status}
                      </span>
                    </div>

                    <div className="p-5">
                      <div className="flex items-start gap-3">
                        <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${statusStyle.tint} ring-1 ${statusStyle.ring} shrink-0`}>
                          <Gift className={`h-6 w-6 ${statusStyle.accent}`} />
                        </div>
                        <div className="min-w-0 pr-20">
                          <h3 className="font-semibold text-base leading-tight text-slate-900 truncate">
                            {redemption.profiles.full_name}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(redemption.requested_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 p-3">
                          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium text-slate-500">
                            <Coins className="h-3 w-3" /> Points
                          </div>
                          <div className="text-xl font-bold leading-tight mt-0.5 text-slate-800">
                            {redemption.points_redeemed}
                          </div>
                        </div>
                        <div className={`rounded-xl ${statusStyle.tint} ring-1 ${statusStyle.ring} p-3`}>
                          <div className={`flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium ${statusStyle.accent}`}>
                            <Award className="h-3 w-3" /> Voucher
                          </div>
                          <div className={`text-xl font-bold leading-tight mt-0.5 ${statusStyle.accent}`}>
                            ₹{redemption.voucher_amount}
                          </div>
                        </div>
                      </div>

                      {isPending && (
                        <div className="mt-4 flex gap-2 pt-3 border-t">
                          <Button
                            size="sm"
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => {
                              const code = prompt("Enter voucher code:");
                              if (code) processRedemption(redemption.id, "approved", code);
                            }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => {
                              const reason = prompt("Enter rejection reason:");
                              if (reason) processRedemption(redemption.id, "rejected", undefined, reason);
                            }}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

      </Tabs>
    </div>
  );
}

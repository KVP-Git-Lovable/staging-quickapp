import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LeaderboardTimeFilters } from "@/components/LeaderboardTimeFilters";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Trophy, Award, Gift, Info, Loader2, Medal, TrendingUp, Target, Star, FileSpreadsheet } from "lucide-react";
import { ModuleHelpButton } from "@/components/help/ModuleHelpButton";
import { BadgesDisplay } from "@/components/BadgesDisplay";
import { PointsDetailsModal } from "@/components/PointsDetailsModal";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface UserPoints {
  user_id: string;
  total_points: number;
  profiles: { full_name: string; profile_picture_url: string | null };
}

interface MyPoints {
  today: number;
  week: number;
  month: number;
  quarter: number;
  year: number;
  total: number;
}

interface Redemption {
  id: string;
  points_redeemed: number;
  voucher_amount: number;
  status: string;
  requested_at: string;
  voucher_code: string | null;
  rejection_reason: string | null;
}

interface GameWithPoints {
  id: string;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  activity_name: string;
  earned_points: number;
  total_possible_points: number;
  action_type: string;
}

interface PointsBreakdown {
  activity_name: string;
  points: number;
  count: number;
}

export default function Leaderboard() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [leaderboard, setLeaderboard] = useState<UserPoints[]>([]);
  const [myPoints, setMyPoints] = useState<MyPoints>({ today: 0, week: 0, month: 0, quarter: 0, year: 0, total: 0 });
  const [availableToRedeem, setAvailableToRedeem] = useState(0);
  const [totalRedeemed, setTotalRedeemed] = useState(0);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [games, setGames] = useState<GameWithPoints[]>([]);
  const [pointsBreakdown, setPointsBreakdown] = useState<PointsBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<"today" | "yesterday" | "week" | "month" | "quarter" | "year" | "custom">("today");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  const [showRedeemDialog, setShowRedeemDialog] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState("");
  const [conversionRate, setConversionRate] = useState(1);

  useEffect(() => {
    fetchLeaderboardData();
    fetchMyPoints();
    fetchRedemptions();
    fetchGames();
    fetchPointsBreakdown();
    fetchConversionRate();
  }, [timeFilter, customStartDate, customEndDate]);

  const fetchLeaderboardData = async () => {
    setLoading(true);
    
    // Get date range based on timeFilter (use BOTH start and end so e.g.
    // "Yesterday" doesn't accidentally include today's points).
    const { startDate, endDate } = getDateRange();
    
    const { data, error } = await supabase
      .from("gamification_points")
      .select("user_id, points, earned_at")
      .gte("earned_at", startDate.toISOString())
      .lte("earned_at", endDate.toISOString())
      .order("earned_at", { ascending: false });

    if (error) {
      toast.error("Failed to load leaderboard");
      setLoading(false);
      return;
    }

    // Aggregate points by user
    const userPointsMap = new Map<string, number>();
    data?.forEach(item => {
      const current = userPointsMap.get(item.user_id) || 0;
      userPointsMap.set(item.user_id, current + Number(item.points || 0));
    });

    // Get user profiles
    const userIds = Array.from(userPointsMap.keys());
    if (userIds.length === 0) {
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name, profile_picture_url, is_active, user_status")
      .in("id", userIds);

    const profilesById = new Map(
      (profilesData || [])
        .filter((p: any) => p.is_active !== false && (p.user_status ?? "active") !== "inactive")
        .map(p => [p.id, p] as const)
    );

    // Drop users whose profile didn't come back or who are inactive.

    const missingProfiles = userIds.filter(id => !profilesById.has(id));
    if (missingProfiles.length > 0) {
      console.warn('[Leaderboard] Skipping points rows with no matching profile:', missingProfiles);
    }

    const leaderboardData: UserPoints[] = userIds
      .filter(userId => profilesById.has(userId))
      .map(userId => {
        const profile = profilesById.get(userId)!;
        return {
          user_id: userId,
          total_points: userPointsMap.get(userId) || 0,
          profiles: {
            full_name: profile.full_name || "Unknown User",
            profile_picture_url: profile.profile_picture_url || null
          }
        };
      })
      .sort((a, b) => b.total_points - a.total_points)
      .slice(0, 50);

    setLeaderboard(leaderboardData);
    setLoading(false);
  };

  const getDateRange = () => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (timeFilter === "custom") {
      if (customStartDate && customEndDate) {
        startDate = new Date(customStartDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(customEndDate);
        endDate.setHours(23, 59, 59, 999);
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      }
    } else {
      switch (timeFilter) {
        case "today":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          break;
        case "yesterday":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
          break;
        case "week":
          startDate = new Date(now);
          startDate.setDate(now.getDate() - now.getDay());
          startDate.setHours(0, 0, 0, 0);
          break;
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          break;
        case "quarter":
          const currentQuarter = Math.floor(now.getMonth() / 3);
          startDate = new Date(now.getFullYear(), currentQuarter * 3, 1, 0, 0, 0, 0);
          break;
        case "year":
          startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      }
    }

    return { startDate, endDate };
  };

  const fetchConversionRate = async () => {
    const { data } = await supabase
      .from("gamification_games")
      .select("points_to_rupee_conversion")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setConversionRate(data.points_to_rupee_conversion || 1);
    }
  };

  const fetchMyPoints = async () => {
    if (!userProfile?.id) return;

    const now = new Date();
    
    // Calculate time ranges
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const startOfQuarter = new Date(now.getFullYear(), currentQuarter * 3, 1, 0, 0, 0, 0);
    const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);

    // Fetch earned points
    const { data } = await supabase
      .from("gamification_points")
      .select("points, earned_at")
      .eq("user_id", userProfile.id)
      .order("earned_at", { ascending: false });

    // Fetch approved and pending redemptions to subtract from available points
    const { data: redemptionsData } = await supabase
      .from("gamification_redemptions")
      .select("points_redeemed, status")
      .eq("user_id", userProfile.id)
      .in("status", ["approved", "pending"]); // Include both approved and pending redemptions

    // Calculate total redeemed points (approved + pending)
    const totalRedeemedPoints = redemptionsData?.reduce((sum, r) => sum + (r.points_redeemed || 0), 0) || 0;

    if (data) {
      const points: MyPoints = { today: 0, week: 0, month: 0, quarter: 0, year: 0, total: 0 };
      data.forEach(item => {
        const earnedDate = new Date(item.earned_at);
        const pointsValue = Number(item.points) || 0;
        
        points.total += pointsValue;
        if (earnedDate >= startOfToday) points.today += pointsValue;
        if (earnedDate >= startOfWeek) points.week += pointsValue;
        if (earnedDate >= startOfMonth) points.month += pointsValue;
        if (earnedDate >= startOfQuarter) points.quarter += pointsValue;
        if (earnedDate >= startOfYear) points.year += pointsValue;
      });
      
      // Calculate available to redeem (total earned - total redeemed)
      const availableBalance = Math.max(0, points.total - totalRedeemedPoints);
      setAvailableToRedeem(availableBalance);
      
      // Keep points.total as lifetime earned (do NOT subtract redemptions)
      setMyPoints(points);
    }
  };

  const fetchRedemptions = async () => {
    if (!userProfile?.id) return;
    const { data } = await supabase
      .from("gamification_redemptions")
      .select("*")
      .eq("user_id", userProfile.id)
      .order("requested_at", { ascending: false });

    if (data) setRedemptions(data);
  };

  const fetchGames = async () => {
    if (!userProfile?.id) return;
    
    const { data: gamesData } = await supabase
      .from("gamification_games")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (!gamesData) return;

    const gamesWithPoints: GameWithPoints[] = await Promise.all(
      gamesData.map(async (game) => {
        const { data: actionsData } = await supabase
          .from("gamification_actions")
          .select("action_name, action_type, points")
          .eq("game_id", game.id)
          .eq("is_enabled", true)
          .limit(1);

        const { data: pointsData } = await supabase
          .from("gamification_points")
          .select("points")
          .eq("game_id", game.id)
          .eq("user_id", userProfile.id);

        const earnedPoints = pointsData?.reduce((sum, p) => sum + p.points, 0) || 0;
        const activityName = actionsData?.[0]?.action_name || "N/A";
        const actionType = actionsData?.[0]?.action_type || "";
        const basePoints = actionsData?.[0]?.points || 0;
        
        // Estimate possible points (this is a simplified calculation)
        const totalPossiblePoints = basePoints * 100; // Estimate

        return {
          ...game,
          activity_name: activityName,
          action_type: actionType,
          earned_points: earnedPoints,
          total_possible_points: totalPossiblePoints
        };
      })
    );

    setGames(gamesWithPoints);
  };

  const fetchPointsBreakdown = async () => {
    if (!userProfile?.id) return;

    const { startDate, endDate } = getDateRange();

    const { data } = await supabase
      .from("gamification_points")
      .select("action_id, points, gamification_actions(action_name)")
      .eq("user_id", userProfile.id)
      .gte("earned_at", startDate.toISOString())
      .lte("earned_at", endDate.toISOString());

    if (data) {
      const breakdown = new Map<string, { points: number; count: number }>();
      
      data.forEach((item: any) => {
        const activityName = item.gamification_actions?.action_name || "Unknown";
        const current = breakdown.get(activityName) || { points: 0, count: 0 };
        breakdown.set(activityName, {
          points: current.points + item.points,
          count: current.count + 1
        });
      });

      const breakdownArray: PointsBreakdown[] = Array.from(breakdown.entries())
        .map(([activity_name, data]) => ({
          activity_name,
          points: data.points,
          count: data.count
        }))
        .sort((a, b) => b.points - a.points);

      setPointsBreakdown(breakdownArray);
    }
  };

  const requestRedemption = async () => {
    if (!userProfile?.id) return;
    const points = parseFloat(redeemPoints);
    if (isNaN(points) || points <= 0) {
      toast.error("Please enter valid points");
      return;
    }

    if (points > availableToRedeem) {
      toast.error("Insufficient points");
      return;
    }

    if (points < 100) {
      toast.error("Minimum redemption is 100 points");
      return;
    }

    // Fetch active game to get conversion rate
    const { data: gamesData } = await supabase
      .from("gamification_games")
      .select("points_to_rupee_conversion")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const conversionRate = gamesData?.points_to_rupee_conversion || 1;

    const { error } = await supabase.from("gamification_redemptions").insert({
      user_id: userProfile.id,
      points_redeemed: points,
      voucher_amount: points * conversionRate,
      status: "pending",
    });

    if (error) {
      toast.error("Failed to submit redemption request");
    } else {
      toast.success("Redemption request submitted successfully");
      setShowRedeemDialog(false);
      setRedeemPoints("");
      fetchRedemptions();
      fetchMyPoints();
    }
  };

  const getDisplayPoints = () => {
    switch (timeFilter) {
      case "today": return myPoints.today;
      case "week": return myPoints.week;
      case "month": return myPoints.month;
      case "quarter": return myPoints.quarter;
      case "year": return myPoints.year;
      default: return myPoints.total;
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-600">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        {/* Header Section */}
        <div className="relative overflow-hidden bg-gradient-primary text-primary-foreground">
          <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-transparent"></div>
          <div className="relative p-4 sm:p-6">
            <div className="flex items-center gap-4 mb-4">
              <Button 
                variant="ghost" 
                onClick={() => navigate(-1)}
                className="text-primary-foreground hover:bg-primary-foreground/20 p-2"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex-1 flex items-center gap-2">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold">Leaderboard</h1>
                  <p className="text-primary-foreground/80 text-sm sm:text-base mt-1">Track performance, earn points, and compete</p>
                </div>
                <ModuleHelpButton categoryId="gamification" variant="onDark" />
              </div>
            </div>
            
            {/* Quick Action Buttons - Mobile Friendly */}
            <div className="flex flex-wrap gap-2">
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => navigate("/activities-info")}
                className="bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-primary-foreground/30 text-xs sm:text-sm"
              >
                <Trophy className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Game Config</span>
                <span className="sm:hidden">Config</span>
              </Button>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => navigate("/badges-info")}
                className="bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-primary-foreground/30 text-xs sm:text-sm"
              >
                <Award className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                Badges
              </Button>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => navigate("/game-policy")}
                className="bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-primary-foreground/30 text-xs sm:text-sm"
              >
                <Info className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                Policy
              </Button>
            </div>
          </div>
        </div>

        {/* My Points Summary Cards - Overlapping Header */}
        <div className="p-4 -mt-6 relative z-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <Card className="bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border-yellow-200 shadow-lg">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-2">
                  <Trophy className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-600" />
                  <LeaderboardTimeFilters 
                    timeFilter={timeFilter} 
                    onFilterChange={(v: any) => setTimeFilter(v)}
                    customStartDate={customStartDate}
                    customEndDate={customEndDate}
                    onCustomStartDateChange={setCustomStartDate}
                    onCustomEndDateChange={setCustomEndDate}
                  />
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">My Points</p>
                <p className="text-2xl sm:text-4xl font-bold text-yellow-700">{getDisplayPoints()}</p>
                <div className="flex flex-col gap-2 mt-3">
                  <p className="text-xs text-muted-foreground">Total: {myPoints.total}</p>
                  <Button
                    size="sm"
                    variant="default"
                    className="w-full font-semibold text-xs sm:text-sm"
                    onClick={() => setShowDetailsModal(true)}
                  >
                    <FileSpreadsheet className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-green-500/10 to-green-600/10 border-green-200 shadow-lg">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
                  <p className="text-xs sm:text-sm text-muted-foreground">My Rank</p>
                </div>
                <p className="text-2xl sm:text-4xl font-bold text-green-700">
                  #{leaderboard.findIndex(l => l.user_id === userProfile?.id) + 1 || "N/A"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">of {leaderboard.length} participants</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-blue-500/10 to-blue-600/10 border-blue-200 shadow-lg">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                  <p className="text-xs sm:text-sm text-muted-foreground">Active Games</p>
                </div>
                <p className="text-2xl sm:text-4xl font-bold text-blue-700">{games.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Currently participating</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-purple-500/10 to-purple-600/10 border-purple-200 shadow-lg">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Gift className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600" />
                  <p className="text-xs sm:text-sm text-muted-foreground">Available to Redeem</p>
                </div>
                <p className="text-2xl sm:text-4xl font-bold text-purple-700">{availableToRedeem}</p>
                <Button className="w-full mt-3 text-xs sm:text-sm" size="sm" onClick={() => setShowRedeemDialog(true)}>
                  Redeem Now
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Activity Performance */}
          {pointsBreakdown.length > 0 && (
            <Card className="mb-6 shadow-lg">
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">Activity Performance ({timeFilter})</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Your points breakdown by activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pointsBreakdown.map((item, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          <span className="text-xs sm:text-sm font-medium">{item.activity_name}</span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4">
                          <span className="text-[10px] sm:text-xs text-muted-foreground">{item.count} activities</span>
                          <Badge variant="secondary" className="text-xs">{item.points} pts</Badge>
                        </div>
                      </div>
                      <Progress value={(item.points / myPoints.total) * 100} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="games" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
              <TabsTrigger value="games" className="text-xs sm:text-sm">
                <Award className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">My Games</span>
                <span className="sm:hidden">Games</span>
              </TabsTrigger>
              <TabsTrigger value="badges" className="text-xs sm:text-sm">
                <Medal className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                Badges
              </TabsTrigger>
              <TabsTrigger value="leaderboard" className="text-xs sm:text-sm">
                <Trophy className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Rankings</span>
                <span className="sm:hidden">Rank</span>
              </TabsTrigger>
              <TabsTrigger value="redemptions" className="text-xs sm:text-sm">
                <Gift className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Redemptions</span>
                <span className="sm:hidden">Redeem</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="leaderboard" className="space-y-4">
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">Top Performers</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Rankings for {timeFilter}</CardDescription>
                </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {leaderboard.slice(0, 3).map((item, index) => (
                    <div key={item.user_id} className={`flex items-center gap-4 p-4 rounded-lg ${
                      item.user_id === userProfile?.id 
                        ? "bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-950/20 dark:to-purple-950/20 border-2 border-blue-500" 
                        : "bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/10 dark:to-orange-950/10"
                    }`}>
                      <div className="text-3xl">{getRankIcon(index + 1)}</div>
                      <Avatar className="h-12 w-12">
                        <AvatarFallback>{item.profiles.full_name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-semibold">{item.profiles.full_name}</p>
                        <p className="text-sm text-muted-foreground">{item.total_points} points</p>
                      </div>
                      {item.user_id === userProfile?.id && (
                        <Badge variant="default">You</Badge>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-6 space-y-2">
                  <p className="text-sm font-medium">All Participants</p>
                  {leaderboard.slice(3).map((item, index) => (
                    <div key={item.user_id} className={`flex items-center gap-3 p-3 rounded-md ${
                      item.user_id === userProfile?.id 
                        ? "bg-blue-100 dark:bg-blue-950/20 border border-blue-500" 
                        : "bg-muted/50"
                    }`}>
                      <span className="text-sm font-medium w-8">#{index + 4}</span>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">{item.profiles.full_name[0]}</AvatarFallback>
                      </Avatar>
                      <p className="flex-1 text-sm">{item.profiles.full_name}</p>
                      <Badge variant="outline">{item.total_points} pts</Badge>
                      {item.user_id === userProfile?.id && (
                        <Badge variant="default" className="text-xs">You</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="games" className="space-y-4">
              {games.length === 0 ? (
                <Card className="shadow-lg">
                  <CardContent className="p-8 sm:p-12 text-center">
                  <Award className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No active games at the moment</p>
                </CardContent>
              </Card>
            ) : (
              games.map((game) => (
                <Card key={game.id} className="shadow-lg">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{game.activity_name}</CardTitle>
                        <CardDescription>{game.description || "No description"}</CardDescription>
                      </div>
                      <Badge variant={game.is_active ? "default" : "secondary"}>
                        {game.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Your Progress</span>
                      <span className="font-semibold">{game.earned_points} / {game.total_possible_points} points</span>
                    </div>
                    <Progress 
                      value={(game.earned_points / game.total_possible_points) * 100} 
                      className="h-3"
                    />
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{game.earned_points}</p>
                        <p className="text-xs text-muted-foreground">Points Earned</p>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {Math.round((game.earned_points / game.total_possible_points) * 100)}%
                        </p>
                        <p className="text-xs text-muted-foreground">Completion</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
            </TabsContent>

            <TabsContent value="badges">
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">My Badges</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Achievements and milestones</CardDescription>
                </CardHeader>
              <CardContent>
                <BadgesDisplay />
              </CardContent>
            </Card>
            </TabsContent>

            <TabsContent value="redemptions" className="space-y-4">
              {redemptions.length === 0 ? (
                <Card className="shadow-lg">
                  <CardContent className="p-8 sm:p-12 text-center">
                  <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No redemption requests yet</p>
                  <Button className="mt-4" onClick={() => setShowRedeemDialog(true)}>
                    Redeem Points Now
                  </Button>
                </CardContent>
              </Card>
            ) : (
              redemptions.map((redemption) => (
                <Card key={redemption.id} className="shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{redemption.points_redeemed} Points</p>
                          <Badge variant="outline">₹{redemption.voucher_amount}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Requested: {new Date(redemption.requested_at).toLocaleDateString()}
                        </p>
                        {redemption.status === "approved" && redemption.voucher_code && (
                          <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-md border border-green-200 dark:border-green-800">
                            <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">Voucher Code</p>
                            <p className="text-lg font-mono font-bold text-green-600 dark:text-green-400">
                              {redemption.voucher_code}
                            </p>
                          </div>
                        )}
                        {redemption.status === "rejected" && redemption.rejection_reason && (
                          <div className="bg-red-50 dark:bg-red-950/20 p-3 rounded-md border border-red-200 dark:border-red-800">
                            <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">Rejection Reason</p>
                            <p className="text-sm text-red-600 dark:text-red-400">{redemption.rejection_reason}</p>
                          </div>
                        )}
                      </div>
                      {getStatusBadge(redemption.status)}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
        </div>
      </div>

      {/* Redeem Points Dialog */}
      <Dialog open={showRedeemDialog} onOpenChange={setShowRedeemDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redeem Points</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-600 dark:text-blue-400">
                <strong>Available Points:</strong> {myPoints.total}
              </p>
              <p className="text-sm text-blue-600 dark:text-blue-400">
                <strong>Conversion Rate:</strong> 1 point = ₹{conversionRate}
              </p>
              <p className="text-sm text-blue-600 dark:text-blue-400">
                <strong>Minimum:</strong> 100 points
              </p>
            </div>
            <div>
              <Label htmlFor="redeemPoints">Points to Redeem</Label>
              <Input
                id="redeemPoints"
                type="number"
                value={redeemPoints}
                onChange={(e) => setRedeemPoints(e.target.value)}
                placeholder="Enter points"
                min="100"
                max={myPoints.total}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Available: {myPoints.total} points
              </p>
            </div>
            {redeemPoints && parseFloat(redeemPoints) >= 100 && (
              <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-600 dark:text-green-400">
                  You will receive: <strong>₹{(parseFloat(redeemPoints) * conversionRate).toFixed(2)}</strong> voucher
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  (Conversion: 1 point = ₹{conversionRate})
                </p>
              </div>
            )}
            <Button onClick={requestRedemption} className="w-full">Submit Request</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Points Details Modal */}
      {userProfile?.id && (
        <PointsDetailsModal
          open={showDetailsModal}
          onOpenChange={setShowDetailsModal}
          userId={userProfile.id}
          timeFilter={timeFilter}
        />
      )}
    </Layout>
  );
}

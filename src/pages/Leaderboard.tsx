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
import { ArrowLeft, Trophy, Award, Gift, Info, Loader2, Medal, TrendingUp, Target, Star, FileSpreadsheet, Sparkles } from "lucide-react";
import { ModuleHelpButton } from "@/components/help/ModuleHelpButton";
import { BadgesDisplay } from "@/components/BadgesDisplay";
import { PointsDetailsModal } from "@/components/PointsDetailsModal";
import { TrophyMark } from "@/components/gamification/TrophyMark";
import { TrophyStage } from "@/components/gamification/TrophyStage";
import { CelebrationOverlay } from "@/components/gamification/CelebrationOverlay";

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
  const [celebration, setCelebration] = useState<{ title: string; subtitle?: string } | null>(null);


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
    setTotalRedeemed(totalRedeemedPoints);

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
      setCelebration({
        title: "REWARD UNLOCKED",
        subtitle: `${points.toLocaleString()} pts on their way — ₹${(points * conversionRate).toLocaleString()} voucher requested.`,
      });
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
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-3 sm:p-5 space-y-4">
        {/* ===== HERO BAND (matches Gamification admin hero) ===== */}
        <div
          className="relative overflow-hidden rounded-[20px] px-5 sm:px-7 py-4 sm:py-5"
          style={{ background: "linear-gradient(120deg,#2B1E72 0%,#4526AE 55%,#5A2DD8 100%)" }}
        >
          <div
            className="pointer-events-none absolute -top-[90px] -left-[60px] w-[240px] h-[240px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,.16) 0%, rgba(255,255,255,0) 70%)" }}
          />
          <div
            className="pointer-events-none absolute -bottom-[120px] right-[26%] w-[300px] h-[300px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(124,58,237,.55) 0%, rgba(124,58,237,0) 70%)" }}
          />
          <Sparkles className="pointer-events-none absolute h-3.5 w-3.5 text-white/40 animate-pulse" style={{ left: "48%", top: "16%" }} />
          <Star className="pointer-events-none absolute h-3 w-3 text-amber-300/70 animate-pulse" style={{ left: "60%", top: "72%" }} />

          <div className="relative flex flex-row items-start sm:items-center gap-3 sm:gap-6">
            <div className="flex-1 min-w-0">

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate(-1)}
                  className="h-7 w-7 text-white hover:bg-white/20 shrink-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/70">My rewards</div>
                <ModuleHelpButton categoryId="gamification" variant="onDark" />
              </div>

              <h1
                className="font-pixel text-[17px] sm:text-[21px] xl:text-[24px] leading-none mt-1.5 text-white"
                style={{ textShadow: "2px 2px 0 rgba(124,58,237,.75), 0 0 16px rgba(167,139,250,.5)" }}
              >
                LEADERBOARD
              </h1>
              <p className="text-[11.5px] xl:text-[12.5px] mt-2 max-w-[560px] leading-snug text-white/75">
                Track your performance, earn points and redeem rewards.
              </p>

              {/* glass stat chips — full-width stacked rows on phones */}
              <div className="mt-3 flex flex-col sm:flex-row sm:flex-wrap gap-2">
                {[
                  {
                    icon: TrendingUp,
                    bg: "#14b8a6",
                    value: `#${(leaderboard.findIndex(l => l.user_id === userProfile?.id) + 1) || "-"}`,
                    label: `of ${leaderboard.length} participants`,
                  },
                  { icon: Target, bg: "#3b82f6", value: games.length, label: "Active games" },
                  { icon: Star, bg: "#f59e0b", value: getDisplayPoints(), label: `Points (${timeFilter})` },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="flex items-center gap-2.5 rounded-[12px] px-3 py-2 bg-white/10 backdrop-blur-md min-w-0 w-full sm:w-auto"
                    style={{ border: "1px solid rgba(255,255,255,.16)" }}
                  >

                    <div className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center text-white shrink-0" style={{ background: s.bg }}>
                      <s.icon className="h-[13px] w-[13px]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] font-extrabold leading-none text-white">{s.value}</div>
                      <div className="text-[9px] mt-1 text-white/65 truncate">{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>

            </div>

            {/* trophy: large illustration on the right, on phones too */}
            <TrophyStage className="shrink-0 w-[120px] xs:w-[140px] sm:w-[170px] xl:w-[210px] self-center" />
          </div>

          <div className="relative mt-3 -mx-1 px-1 flex gap-2 overflow-x-auto sm:overflow-visible sm:flex-wrap">
            {[
              { icon: Trophy, label: "Game Config", to: "/activities-info" },
              { icon: Award, label: "Badges", to: "/badges-info" },
              { icon: Info, label: "Policy", to: "/game-policy" },
            ].map((b) => (
              <button
                key={b.label}
                onClick={() => navigate(b.to)}
                className="shrink-0 text-[11px] font-semibold text-white rounded-[10px] px-3 py-1.5 inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 transition-colors"
                style={{ border: "1px solid rgba(255,255,255,.16)" }}
              >
                <b.icon className="h-3.5 w-3.5" /> {b.label}
              </button>
            ))}
          </div>

        </div>

        {/* ===== POINTS WALLET — the main highlight ===== */}
        <Card className="overflow-hidden shadow-[0_18px_40px_-28px_rgba(28,36,64,.5)] border-0">
          <div className="flex flex-col lg:flex-row">
            {/* Available — hero segment */}
            <div
              className="relative flex-1 p-5 sm:p-6 text-white"
              style={{ background: "linear-gradient(135deg,#1c2440 0%,#3b2a86 60%,#5A2DD8 100%)" }}
            >
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-amber-300" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">Available points</span>
              </div>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-4xl sm:text-5xl font-extrabold leading-none tabular-nums">
                  {availableToRedeem.toLocaleString()}
                </span>
                <span className="text-[11px] pb-1 text-white/60">pts</span>
              </div>
              <p className="text-[11px] mt-2 text-white/70">
                ≈ ₹{(availableToRedeem * conversionRate).toLocaleString()} redeemable value
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                <Button
                  size="sm"
                  className="bg-amber-400 text-[#1c2440] hover:bg-amber-300 font-bold text-xs"
                  onClick={() => setShowRedeemDialog(true)}
                >
                  <Gift className="h-3.5 w-3.5 mr-1.5" /> Redeem Now
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/15 text-xs"
                  onClick={() => setShowDetailsModal(true)}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> View Details
                </Button>
              </div>
            </div>

            {/* Earned / Redeemed breakdown */}
            <div className="flex-1 grid grid-cols-2 divide-x bg-card">
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Earned till date
                  </span>
                </div>
                <p className="text-3xl sm:text-4xl font-extrabold mt-2 tabular-nums text-foreground">
                  {myPoints.total.toLocaleString()}
                </p>
                <p className="text-[11px] mt-2 text-muted-foreground">Lifetime points earned</p>
                <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${myPoints.total ? Math.min(100, (availableToRedeem / myPoints.total) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-[10px] mt-1.5 text-muted-foreground">
                  {myPoints.total ? Math.round((availableToRedeem / myPoints.total) * 100) : 0}% still available
                </p>
              </div>

              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <Medal className="h-4 w-4 text-violet-500" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Redeemed points
                  </span>
                </div>
                <p className="text-3xl sm:text-4xl font-extrabold mt-2 tabular-nums text-foreground">
                  {totalRedeemed.toLocaleString()}
                </p>
                <p className="text-[11px] mt-2 text-muted-foreground">Approved + pending requests</p>
                <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-violet-500"
                    style={{ width: `${myPoints.total ? Math.min(100, (totalRedeemed / myPoints.total) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-[10px] mt-1.5 text-muted-foreground">
                  {redemptions.length} redemption{redemptions.length === 1 ? "" : "s"} so far
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Period selector for the period-scoped sections below */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[12px] text-muted-foreground">
            Showing period performance:{" "}
            <span className="font-semibold text-foreground capitalize">{timeFilter}</span>
          </div>
          <LeaderboardTimeFilters
            timeFilter={timeFilter}
            onFilterChange={(v: any) => setTimeFilter(v)}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onCustomStartDateChange={setCustomStartDate}
            onCustomEndDateChange={setCustomEndDate}
          />
        </div>

        <div className="relative z-10">


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
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto p-1.5 rounded-[16px] bg-white shadow-[0_14px_34px_-26px_rgba(28,36,64,.55)] border">
              {[
                { value: "games", icon: Award, long: "My Games", short: "Games" },
                { value: "badges", icon: Medal, long: "Badges", short: "Badges" },
                { value: "leaderboard", icon: Trophy, long: "Rankings", short: "Rank" },
                { value: "redemptions", icon: Gift, long: "Redemptions", short: "Redeem" },
              ].map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="rounded-[12px] py-2 text-[11.5px] sm:text-[12.5px] font-semibold data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:bg-[linear-gradient(135deg,#2B1E72_0%,#5A2DD8_100%)]"
                >
                  <t.icon className="mr-1.5 h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t.long}</span>
                  <span className="sm:hidden">{t.short}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ================= RANKINGS ================= */}
            <TabsContent value="leaderboard" className="space-y-4">
              <Card className="border-0 overflow-hidden shadow-[0_18px_40px_-28px_rgba(28,36,64,.5)]">
                <div
                  className="px-5 py-4 text-white"
                  style={{ background: "linear-gradient(120deg,#2B1E72 0%,#4526AE 60%,#5A2DD8 100%)" }}
                >
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-300" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">Top performers</span>
                  </div>
                  <p className="text-[12px] mt-1 text-white/70 capitalize">Rankings for {timeFilter}</p>
                </div>
                <CardContent className="p-4 sm:p-5">
                  {/* podium */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {leaderboard.slice(0, 3).map((item, index) => {
                      const isMe = item.user_id === userProfile?.id;
                      const accent = ["#f59e0b", "#94a3b8", "#b45309"][index];
                      return (
                        <div
                          key={item.user_id}
                          className="relative rounded-[16px] p-4 overflow-hidden bg-card transition-transform hover:-translate-y-0.5"
                          style={{ border: `1.5px solid ${isMe ? "#5A2DD8" : accent + "55"}` }}
                        >
                          <div
                            className="pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full"
                            style={{ background: `radial-gradient(circle, ${accent}33 0%, transparent 70%)` }}
                          />
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{getRankIcon(index + 1)}</span>
                            <Avatar className="h-11 w-11 ring-2 ring-offset-2" style={{ ["--tw-ring-color" as any]: accent }}>
                              <AvatarFallback className="font-bold">{item.profiles.full_name[0]}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-sm truncate">{item.profiles.full_name}</p>
                              <p className="text-[11px] text-muted-foreground">Rank #{index + 1}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex items-end justify-between">
                            <div>
                              <p className="text-2xl font-extrabold tabular-nums leading-none">{item.total_points.toLocaleString()}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">points</p>
                            </div>
                            {isMe && <Badge className="bg-[#5A2DD8] hover:bg-[#5A2DD8] text-[10px]">You</Badge>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-2">
                      All participants
                    </p>
                    <div className="space-y-1.5">
                      {leaderboard.slice(3).map((item, index) => {
                        const isMe = item.user_id === userProfile?.id;
                        return (
                          <div
                            key={item.user_id}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-[12px] transition-colors ${
                              isMe ? "bg-[#5A2DD8]/10 border border-[#5A2DD8]/40" : "bg-muted/50 hover:bg-muted"
                            }`}
                          >
                            <span className="text-[12px] font-bold w-8 text-muted-foreground tabular-nums">#{index + 4}</span>
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-[11px]">{item.profiles.full_name[0]}</AvatarFallback>
                            </Avatar>
                            <p className="flex-1 text-[13px] font-medium truncate">{item.profiles.full_name}</p>
                            {isMe && <Badge className="bg-[#5A2DD8] hover:bg-[#5A2DD8] text-[10px]">You</Badge>}
                            <span className="text-[12px] font-bold tabular-nums">{item.total_points.toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ================= MY GAMES ================= */}
            <TabsContent value="games" className="space-y-4">
              {games.length === 0 ? (
                <Card className="border-0 shadow-[0_18px_40px_-28px_rgba(28,36,64,.5)]">
                  <CardContent className="p-10 text-center">
                    <TrophyMark float className="w-[92px] h-auto mx-auto opacity-80" />
                    <p className="mt-3 font-semibold">No active games right now</p>
                    <p className="text-[12px] text-muted-foreground mt-1">
                      New reward programs will show up here as soon as they go live.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {games.map((game) => {
                    const pct = game.total_possible_points
                      ? Math.min(100, Math.round((game.earned_points / game.total_possible_points) * 100))
                      : 0;
                    return (
                      <Card
                        key={game.id}
                        className="border-0 overflow-hidden shadow-[0_18px_40px_-28px_rgba(28,36,64,.5)] transition-transform hover:-translate-y-0.5"
                      >
                        <div
                          className="relative px-5 py-4 text-white"
                          style={{ background: "linear-gradient(135deg,#1c2440 0%,#3b2a86 60%,#5A2DD8 100%)" }}
                        >
                          <div
                            className="pointer-events-none absolute -top-12 -right-8 w-32 h-32 rounded-full"
                            style={{ background: "radial-gradient(circle, rgba(255,255,255,.14) 0%, transparent 70%)" }}
                          />
                          <div className="relative flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">Game</p>
                              <p className="font-bold text-[14px] mt-1 truncate">{game.activity_name}</p>
                              <p className="text-[11px] text-white/70 mt-1 line-clamp-2">
                                {game.description || "No description"}
                              </p>
                            </div>
                            <Badge
                              className={`shrink-0 text-[10px] ${
                                game.is_active
                                  ? "bg-emerald-400 text-[#1c2440] hover:bg-emerald-400"
                                  : "bg-white/20 hover:bg-white/20"
                              }`}
                            >
                              {game.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        </div>
                        <CardContent className="p-5 space-y-3">
                          <div className="flex items-center justify-between text-[12px]">
                            <span className="text-muted-foreground">Your progress</span>
                            <span className="font-bold tabular-nums">
                              {game.earned_points} / {game.total_possible_points} pts
                            </span>
                          </div>
                          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, background: "linear-gradient(90deg,#f59e0b,#5A2DD8)" }}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3 pt-1">
                            <div className="rounded-[12px] p-3 text-center bg-amber-500/10">
                              <p className="text-xl font-extrabold text-amber-600 tabular-nums">{game.earned_points}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">Points earned</p>
                            </div>
                            <div className="rounded-[12px] p-3 text-center bg-[#5A2DD8]/10">
                              <p className="text-xl font-extrabold text-[#5A2DD8] tabular-nums">{pct}%</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">Completion</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ================= BADGES ================= */}
            <TabsContent value="badges">
              <Card className="border-0 overflow-hidden shadow-[0_18px_40px_-28px_rgba(28,36,64,.5)]">
                <div
                  className="px-5 py-4 text-white flex items-center justify-between gap-4"
                  style={{ background: "linear-gradient(120deg,#2B1E72 0%,#4526AE 60%,#5A2DD8 100%)" }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Medal className="h-4 w-4 text-amber-300" />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">My badges</span>
                    </div>
                    <p className="text-[12px] mt-1 text-white/70">Achievements and milestones you have unlocked</p>
                  </div>
                  <TrophyMark float className="w-[58px] h-auto hidden sm:block" />
                </div>
                <CardContent className="p-4 sm:p-5">
                  <BadgesDisplay />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ================= REDEMPTIONS ================= */}
            <TabsContent value="redemptions" className="space-y-4">
              {redemptions.length === 0 ? (
                <Card className="border-0 shadow-[0_18px_40px_-28px_rgba(28,36,64,.5)]">
                  <CardContent className="p-10 text-center">
                    <div className="w-14 h-14 rounded-[16px] mx-auto flex items-center justify-center bg-[#5A2DD8]/10">
                      <Gift className="h-7 w-7 text-[#5A2DD8]" />
                    </div>
                    <p className="mt-3 font-semibold">No redemption requests yet</p>
                    <p className="text-[12px] text-muted-foreground mt-1">
                      Turn your points into vouchers whenever you are ready.
                    </p>
                    <Button
                      className="mt-4 bg-amber-400 text-[#1c2440] hover:bg-amber-300 font-bold"
                      onClick={() => setShowRedeemDialog(true)}
                    >
                      <Gift className="h-4 w-4 mr-1.5" /> Redeem points now
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {redemptions.map((redemption) => (
                    <Card
                      key={redemption.id}
                      className="border-0 overflow-hidden shadow-[0_18px_40px_-28px_rgba(28,36,64,.5)]"
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-[12px] shrink-0 flex items-center justify-center bg-[#5A2DD8]/10">
                              <Gift className="h-5 w-5 text-[#5A2DD8]" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-extrabold text-[15px] tabular-nums">
                                {redemption.points_redeemed.toLocaleString()} pts
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                ₹{redemption.voucher_amount.toLocaleString()} ·{" "}
                                {new Date(redemption.requested_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          {getStatusBadge(redemption.status)}
                        </div>

                        {redemption.status === "approved" && redemption.voucher_code && (
                          <div className="mt-4 rounded-[12px] p-3 bg-emerald-500/10 border border-emerald-500/25">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                              Voucher code
                            </p>
                            <p className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                              {redemption.voucher_code}
                            </p>
                          </div>
                        )}
                        {redemption.status === "rejected" && redemption.rejection_reason && (
                          <div className="mt-4 rounded-[12px] p-3 bg-destructive/10 border border-destructive/25">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-destructive">
                              Rejection reason
                            </p>
                            <p className="text-[12.5px] text-destructive mt-1">{redemption.rejection_reason}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
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

      {/* Victory celebration */}
      <CelebrationOverlay
        open={!!celebration}
        title={celebration?.title ?? ""}
        subtitle={celebration?.subtitle}
        onDone={() => setCelebration(null)}
      />
    </Layout>

  );
}

import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trophy, Loader2 } from "lucide-react";
import { TrophyMark } from "@/components/gamification/TrophyMark";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BadgeInfo {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  criteria_type: string;
  criteria_value: number;
  badge_color: string | null;
}

export default function BadgesInfo() {
  const navigate = useNavigate();
  const [badges, setBadges] = useState<BadgeInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBadges();
  }, []);

  const fetchBadges = async () => {
    const { data, error } = await supabase
      .from("badges")
      .select("*")
      .order("criteria_value", { ascending: true });

    if (error) {
      toast.error("Failed to load badges");
      setLoading(false);
      return;
    }

    setBadges(data || []);
    setLoading(false);
  };

  const getCriteriaText = (badge: BadgeInfo) => {
    switch (badge.criteria_type) {
      case "total_points":
        return `Earn ${badge.criteria_value} total points`;
      case "consecutive_days":
        return `Active for ${badge.criteria_value} consecutive days`;
      case "orders_count":
        return `Complete ${badge.criteria_value} orders`;
      case "retailers_count":
        return `Acquire ${badge.criteria_value} retailers`;
      case "visits_count":
        return `Complete ${badge.criteria_value} visits`;
      default:
        return `Achieve ${badge.criteria_value} ${badge.criteria_type}`;
    }
  };

  const getColorClass = (color: string | null) => {
    switch (color) {
      case "gold":
        return "from-yellow-500 to-orange-500";
      case "silver":
        return "from-gray-400 to-gray-500";
      case "bronze":
        return "from-orange-600 to-orange-700";
      case "blue":
        return "from-blue-500 to-blue-600";
      case "green":
        return "from-green-500 to-green-600";
      case "purple":
        return "from-purple-500 to-purple-600";
      default:
        return "from-primary to-primary";
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-6">
        <div
          className="relative overflow-hidden rounded-[20px] px-5 sm:px-7 py-4 sm:py-5 text-white"
          style={{ background: "linear-gradient(120deg,#2B1E72 0%,#4526AE 55%,#5A2DD8 100%)" }}
        >
          <div
            className="pointer-events-none absolute -top-[90px] -left-[60px] w-[240px] h-[240px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,.16) 0%, rgba(255,255,255,0) 70%)" }}
          />
          <div className="relative flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20 shrink-0"
              onClick={() => navigate("/leaderboard")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/70">My rewards</div>
              <h1
                className="font-pixel text-[15px] sm:text-[19px] leading-none mt-1.5"
                style={{ textShadow: "2px 2px 0 rgba(124,58,237,.75), 0 0 16px rgba(167,139,250,.5)" }}
              >
                BADGES
              </h1>
              <p className="text-[11.5px] mt-2 text-white/75">
                Complete criteria to unlock badges and showcase your achievements
              </p>
            </div>
            <TrophyMark float className="w-[74px] h-auto hidden sm:block" />
          </div>
        </div>

        {badges.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <TrophyMark float className="w-[92px] h-auto mx-auto opacity-80" />
              <p className="text-lg text-muted-foreground mt-3">No badges configured yet</p>
              <p className="text-sm text-muted-foreground mt-2">Contact your admin to set up badges</p>
            </CardContent>
          </Card>
        ) : (

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {badges.map((badge) => (
              <Card key={badge.id} className="relative overflow-hidden">
                <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${getColorClass(badge.badge_color)} opacity-20 rounded-bl-full`} />
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-3 rounded-full bg-gradient-to-br ${getColorClass(badge.badge_color)}`}>
                      <span className="text-3xl">{badge.icon}</span>
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg">{badge.name}</CardTitle>
                    </div>
                  </div>
                  <CardDescription className="text-sm">
                    {badge.description || "Complete the criteria to unlock this badge"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Unlock Criteria:</div>
                    <Badge variant="outline" className="text-xs">
                      {getCriteriaText(badge)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

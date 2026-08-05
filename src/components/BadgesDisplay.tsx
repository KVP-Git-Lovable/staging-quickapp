import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Award, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { CelebrationOverlay } from "@/components/gamification/CelebrationOverlay";
import { TrophyMark } from "@/components/gamification/TrophyMark";

interface BadgeData {
  id: string;
  name: string;
  description: string;
  icon: string;
  criteria_type: string;
  criteria_value: number;
  badge_color: string;
}

interface UserBadge extends BadgeData {
  earned_at: string;
  is_earned: boolean;
}

const SEEN_KEY = "gam_seen_badges_v1";

export function BadgesDisplay() {
  const { userProfile } = useAuth();
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [celebrateBadge, setCelebrateBadge] = useState<UserBadge | null>(null);

  useEffect(() => {
    if (userProfile?.id) {
      fetchBadges();
    }
  }, [userProfile]);

  const fetchBadges = async () => {
    if (!userProfile?.id) return;

    // Fetch all badges
    const { data: allBadges } = await supabase
      .from("badges")
      .select("*")
      .order("criteria_value", { ascending: true });

    // Fetch user's earned badges
    const { data: earnedBadges } = await supabase
      .from("user_badges")
      .select("badge_id, earned_at")
      .eq("user_id", userProfile.id);

    const earnedMap = new Map(earnedBadges?.map(b => [b.badge_id, b.earned_at]) || []);

    const badgesWithStatus: UserBadge[] = (allBadges || []).map(badge => ({
      ...badge,
      earned_at: earnedMap.get(badge.id) || "",
      is_earned: earnedMap.has(badge.id)
    }));

    setBadges(badgesWithStatus);
    setLoading(false);

    // Presentation-only: celebrate a badge the user has not seen yet.
    try {
      const storageKey = `${SEEN_KEY}:${userProfile.id}`;
      const seen: string[] = JSON.parse(localStorage.getItem(storageKey) || "[]");
      const earnedIds = badgesWithStatus.filter(b => b.is_earned).map(b => b.id);
      const fresh = earnedIds.filter(id => !seen.includes(id));
      if (fresh.length && seen.length >= 0) {
        const newest = badgesWithStatus.find(b => b.id === fresh[fresh.length - 1]) || null;
        if (newest && seen.length > 0) setCelebrateBadge(newest);
      }
      localStorage.setItem(storageKey, JSON.stringify(earnedIds));
    } catch {
      /* storage unavailable — celebration is optional */
    }
  };

  const earnedBadges = badges.filter(b => b.is_earned);
  const lockedBadges = badges.filter(b => !b.is_earned);

  const getAccent = (color: string) => {
    const colors: Record<string, string> = {
      gold: "#f59e0b",
      silver: "#94a3b8",
      bronze: "#b45309",
      blue: "#3b82f6",
      green: "#10b981",
      purple: "#5A2DD8",
    };
    return colors[color] || "#5A2DD8";
  };

  const BadgeCard = ({ badge }: { badge: UserBadge }) => {
    const accent = getAccent(badge.badge_color);
    return (
      <Card
        className="relative overflow-hidden border-0 rounded-[16px] transition-transform hover:-translate-y-0.5 shadow-[0_16px_36px_-28px_rgba(28,36,64,.55)]"
        style={{ border: `1.5px solid ${badge.is_earned ? accent + "66" : "hsl(var(--border))"}` }}
      >
        {badge.is_earned && (
          <div
            className="pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full"
            style={{ background: `radial-gradient(circle, ${accent}33 0%, transparent 70%)` }}
          />
        )}
        <CardContent className="relative p-4 text-center">
          <div
            className="w-12 h-12 mx-auto rounded-[14px] flex items-center justify-center text-2xl"
            style={{
              background: badge.is_earned ? `${accent}1f` : "hsl(var(--muted))",
              border: `1px solid ${badge.is_earned ? accent + "44" : "transparent"}`,
            }}
          >
            {badge.is_earned ? (
              <span>{badge.icon}</span>
            ) : (
              <Lock className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <h3 className="font-bold text-[13px] mt-3">{badge.name}</h3>
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{badge.description}</p>
          {badge.is_earned ? (
            <Badge
              className="mt-3 text-[10px] border-0"
              style={{ background: `${accent}22`, color: accent }}
            >
              Earned {new Date(badge.earned_at).toLocaleDateString()}
            </Badge>
          ) : (
            <Badge variant="outline" className="mt-3 text-[10px]">
              {badge.criteria_value} {badge.criteria_type.replace(/_/g, " ")}
            </Badge>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return <div className="text-center py-8 text-sm text-muted-foreground">Loading badges...</div>;
  }

  return (
    <>
      <Tabs defaultValue="earned" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto p-1.5 rounded-[14px]">
          <TabsTrigger
            value="earned"
            className="rounded-[10px] text-[12px] font-semibold data-[state=active]:text-white data-[state=active]:bg-[linear-gradient(135deg,#2B1E72_0%,#5A2DD8_100%)]"
          >
            <Award className="mr-1.5 h-3.5 w-3.5" />
            Earned ({earnedBadges.length})
          </TabsTrigger>
          <TabsTrigger
            value="locked"
            className="rounded-[10px] text-[12px] font-semibold data-[state=active]:text-white data-[state=active]:bg-[linear-gradient(135deg,#2B1E72_0%,#5A2DD8_100%)]"
          >
            <Lock className="mr-1.5 h-3.5 w-3.5" />
            Locked ({lockedBadges.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="earned" className="mt-4">
          {earnedBadges.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {earnedBadges.map(badge => (
                <BadgeCard key={badge.id} badge={badge} />
              ))}
            </div>
          ) : (
            <Card className="border-0 rounded-[16px]">
              <CardContent className="py-10 text-center">
                <TrophyMark float className="w-[84px] h-auto mx-auto opacity-80" />
                <p className="mt-3 font-semibold text-sm">No badges earned yet</p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  Complete activities to unlock your first achievement.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="locked" className="mt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {lockedBadges.map(badge => (
              <BadgeCard key={badge.id} badge={badge} />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <CelebrationOverlay
        open={!!celebrateBadge}
        title="BADGE UNLOCKED"
        subtitle={celebrateBadge ? `${celebrateBadge.name} — ${celebrateBadge.description}` : undefined}
        onDone={() => setCelebrateBadge(null)}
      />
    </>
  );
}

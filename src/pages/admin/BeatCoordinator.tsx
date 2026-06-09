import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Calendar as CalendarIcon, Users as UsersIcon, UserMinus, Sparkles } from "lucide-react";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { usePermissions } from "@/hooks/usePermissions";

import { CalendarTab } from "@/components/admin/beat-coordinator/CalendarTab";
import { BeatAssignmentTab } from "@/components/admin/beat-coordinator/BeatAssignmentTab";
import { LeaveCoverageTab } from "@/components/admin/beat-coordinator/LeaveCoverageTab";
import { AIRoutePlanTab } from "@/components/admin/beat-coordinator/AIRoutePlanTab";

const BeatCoordinator = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasAdminAccess, loading: adminLoading } = useAdminAccess();
  const { can, loading: permLoading } = usePermissions();
  const loading = adminLoading || permLoading;
  const canAccessCoordinator = hasAdminAccess || can('module_beat_coordinator', 'read');

  const urlTab = searchParams.get("tab");
  const urlDate = searchParams.get("date") || undefined;
  const urlRep = searchParams.get("rep");

  const [tab, setTab] = useState<"calendar" | "assign" | "leave" | "ai">(
    (["calendar", "assign", "leave", "ai"].includes(urlTab as string) ? urlTab : "calendar") as any,
  );

  // Pre-fill context for tabs jumped to from Calendar pills / notifications
  const [presetRepId, setPresetRepId] = useState<string | null>(urlRep);
  const [presetDate, setPresetDate] = useState<string | undefined>(urlDate);

  // Keep URL in sync when user switches tabs manually
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }
  if (!hasAdminAccess) return <Navigate to="/dashboard" replace />;

  const jumpTo = (
    next: "assign" | "leave" | "ai",
    repId?: string | null,
    date?: string,
  ) => {
    if (repId !== undefined) setPresetRepId(repId);
    if (date !== undefined) setPresetDate(date);
    setTab(next);
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle">
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
          <div className="max-w-[1400px] mx-auto px-3 py-3 flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin-controls")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-base md:text-xl font-bold truncate">Beat Coordinator</h1>
              <p className="text-xs text-muted-foreground truncate">
                Plan beats, cover leave, and optimise routes for your team.
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto p-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full sm:w-auto mb-3">
              <TabsTrigger value="calendar" className="gap-1.5">
                <CalendarIcon className="h-3.5 w-3.5" /> Calendar
              </TabsTrigger>
              <TabsTrigger value="assign" className="gap-1.5">
                <UsersIcon className="h-3.5 w-3.5" /> Beat assign
              </TabsTrigger>
              <TabsTrigger value="leave" className="gap-1.5">
                <UserMinus className="h-3.5 w-3.5" /> Leave coverage
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> AI route
              </TabsTrigger>
            </TabsList>

            <TabsContent value="calendar" className="mt-0">
              <CalendarTab
                onOpenAssign={(repId) => jumpTo("assign", repId ?? null)}
                onOpenLeaveCover={(repId, date) => jumpTo("leave", repId, date)}
                onOpenAIRoute={(repId, date) => jumpTo("ai", repId, date)}
              />
            </TabsContent>
            <TabsContent value="assign" className="mt-0">
              <BeatAssignmentTab
                initialRepId={presetRepId || undefined}
                initialDate={presetDate}
                restrictToOwnerId={presetRepId || undefined}
              />
            </TabsContent>
            <TabsContent value="leave" className="mt-0">
              <LeaveCoverageTab initialDate={presetDate} initialRepId={presetRepId || undefined} />
            </TabsContent>
            <TabsContent value="ai" className="mt-0">
              <AIRoutePlanTab initialRepId={presetRepId || undefined} initialDate={presetDate} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
};

export default BeatCoordinator;

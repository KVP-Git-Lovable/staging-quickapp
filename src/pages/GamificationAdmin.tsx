import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { Navigate, Route, Routes } from "react-router-dom";
import { BarChart3, Gift, Loader2, Trophy } from "lucide-react";
import { GamificationHome } from "@/modules/gamification/GamificationHome";
import { ProgramDetail } from "@/modules/gamification/ProgramDetail";
import { FocusProducts } from "@/modules/gamification/FocusProducts";
import { GamificationHero } from "@/modules/gamification/GamificationHero";
import { GamificationTabs } from "@/modules/gamification/GamificationTabs";
import { GlobalConfigBar } from "@/modules/gamification/GlobalConfigBar";
import { SectionPlaceholder } from "@/modules/gamification/SectionPlaceholder";
import { ActivitiesList } from "@/modules/gamification/ActivitiesList";
import { PointsLedger } from "@/modules/gamification/PointsLedger";


export default function GamificationAdmin() {
  const { hasAdminAccess, loading } = useAdminAccess();
  const [configOpen, setConfigOpen] = useState(false);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!hasAdminAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <Layout>
      <div className="w-full -mx-0 px-3 sm:px-5 xl:px-7 py-5 min-h-screen" style={{ background: "#eef0f4" }}>
        {/* No flex gap here on purpose — the sticky tab bar carries its own padding so
            content scrolls underneath it without showing through a transparent band. */}
        <div className="mx-auto w-full max-w-[1600px] flex flex-col">
          <div className="mb-3">
            <GamificationHero />
          </div>

          <GamificationTabs
            settingsOpen={configOpen}
            onToggleSettings={() => setConfigOpen((o) => !o)}
          />

          <div className="mb-3">
            <GlobalConfigBar open={configOpen} onOpenChange={setConfigOpen} />
          </div>

          <div className="min-w-0">
            <Routes>
              <Route index element={<GamificationHome />} />
              <Route path="programs" element={<GamificationHome />} />
              <Route path="program/:programId" element={<ProgramDetail />} />
              <Route path="focus-products" element={<FocusProducts />} />
              <Route path="activities" element={<ActivitiesList />} />
              <Route path="points" element={<PointsLedger />} />
              <Route
                path="rewards"
                element={
                  <SectionPlaceholder
                    icon={Gift}
                    title="Rewards"
                    description="The reward catalogue and redemption queue. Focus products already lives here and stays fully available in the meantime."
                    link={{ label: "Focus products", to: "/gamification-admin/focus-products" }}
                  />
                }
              />
              <Route
                path="leaderboard"
                element={
                  <SectionPlaceholder
                    icon={Trophy}
                    title="Leaderboard"
                    description="Rankings across teams and periods, driven by the same points data the field app already shows to reps."
                  />
                }
              />
              <Route
                path="reports"
                element={
                  <SectionPlaceholder
                    icon={BarChart3}
                    title="Reports"
                    description="Scheduled and ad-hoc reporting on points issued, redemption rates and program performance over time."
                  />
                }
              />
              <Route path="*" element={<Navigate to="/gamification-admin" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </Layout>
  );
}

import { Layout } from "@/components/Layout";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { GamificationHome } from "@/modules/gamification/GamificationHome";
import { ProgramDetail } from "@/modules/gamification/ProgramDetail";
import { FocusProducts } from "@/modules/gamification/FocusProducts";
import { GamificationSidebar } from "@/modules/gamification/GamificationSidebar";


export default function GamificationAdmin() {
  const { hasAdminAccess, loading } = useAdminAccess();

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
        <div className="flex gap-5 items-start">
          <GamificationSidebar />
          <div className="min-w-0 flex-1">
            <Routes>
              <Route index element={<GamificationHome />} />
              <Route path="program/:programId" element={<ProgramDetail />} />
              <Route path="focus-products" element={<FocusProducts />} />
              <Route path="*" element={<Navigate to="/gamification-admin" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </Layout>
  );
}


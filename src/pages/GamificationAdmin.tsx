import { Layout } from "@/components/Layout";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { GamificationHome } from "@/modules/gamification/GamificationHome";
import { ProgramDetail } from "@/modules/gamification/ProgramDetail";
import { FocusProducts } from "@/modules/gamification/FocusProducts";

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
      <div className="w-full px-2 sm:px-4 py-4 sm:py-6">
        <Routes>
          <Route index element={<GamificationHome />} />
          <Route path="program/:programId" element={<ProgramDetail />} />
          <Route path="focus-products" element={<FocusProducts />} />
          <Route path="*" element={<Navigate to="/gamification-admin" replace />} />
        </Routes>
      </div>
    </Layout>
  );
}

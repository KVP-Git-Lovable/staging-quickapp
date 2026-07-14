import { Layout } from "@/components/Layout";
import { GamificationManagement } from "@/components/GamificationManagement";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

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
      <div className="container mx-auto p-4 sm:p-6">
        <GamificationManagement />
      </div>
    </Layout>
  );
}

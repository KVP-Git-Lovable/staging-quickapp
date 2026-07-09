import { useAdminAccess } from '@/hooks/useAdminAccess';
import { Navigate, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { SchemeMaster } from '@/components/SchemeMaster';

const SchemeMasterPage = () => {
  const { hasAdminAccess, loading } = useAdminAccess();
  const navigate = useNavigate();

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  if (!hasAdminAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle p-4">
        <div className="w-full space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground">Scheme Master</h1>
              <p className="text-muted-foreground">Create and manage promotional schemes, offers, and discounts</p>
            </div>
          </div>

          {/* Scheme Master Component */}
          <SchemeMaster />
        </div>
      </div>
    </Layout>
  );
};

export default SchemeMasterPage;

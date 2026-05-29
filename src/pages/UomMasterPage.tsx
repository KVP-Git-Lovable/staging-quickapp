import React from 'react';
import { Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { UomMasterPageContent } from '@/components/admin/uom/UomMasterPage';

const UomMasterPage = () => {
  const { hasAdminAccess, loading } = useAdminAccess();

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
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
        <div className="max-w-7xl mx-auto space-y-6">
          <AdminPageHeader
            title="Unit of Measure Master"
            subtitle="Manage which units appear in dropdowns, set per-category defaults, and reorder them"
            backPath="/admin-controls"
          />
          <UomMasterPageContent />
        </div>
      </div>
    </Layout>
  );
};

export default UomMasterPage;

import React from 'react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings, BarChart3, Receipt, Wallet } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Layout } from '@/components/Layout';
import ExpensePolicyConfig from '@/components/expenses/ExpensePolicyConfig';
import ProductivityTracking from '@/components/ProductivityTracking';
import PettyCashAdmin from '@/components/expenses/PettyCashAdmin';

const AdminExpenseManagement = () => {
  const { hasAdminAccess, loading: authLoading } = useAdminAccess();
  const navigate = useNavigate();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return <Navigate to="/" replace />;
  }

  return (
    <Layout>
    <div className="min-h-screen bg-gradient-subtle">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b">
        <div className="w-full px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="hidden sm:flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 shrink-0">
                <Receipt className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground truncate">
                  Expense Master
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                  Manage expense policies, approvals & team productivity
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="w-full px-3 sm:px-6 py-4 sm:py-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-10 mb-4 sm:mb-6">
            <TabsTrigger value="overview" className="text-xs sm:text-sm gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="configuration" className="text-xs sm:text-sm gap-1.5">
              <Settings className="h-4 w-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="petty-cash" className="text-xs sm:text-sm gap-1.5">
              <Wallet className="h-4 w-4" />
              Petty Cash
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0 space-y-4">
            <ProductivityTracking />
          </TabsContent>

          <TabsContent value="configuration" className="mt-0 space-y-4">
            <ExpensePolicyConfig />
          </TabsContent>

          <TabsContent value="petty-cash" className="mt-0 space-y-4">
            <PettyCashAdmin />
          </TabsContent>
        </Tabs>
      </div>
    </div>
    </Layout>
  );
};

export default AdminExpenseManagement;

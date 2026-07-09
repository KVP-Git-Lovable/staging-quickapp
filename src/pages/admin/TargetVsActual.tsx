import React, { useState, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Target, BarChart3, Settings, Users } from 'lucide-react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { useSubordinates } from '@/hooks/useSubordinates';
import { TeamTargetDashboard } from '@/components/admin/TeamTargetDashboard';
import { TargetConfigTab } from '@/components/admin/TargetConfigTab';
import { HierarchyAllocationTab } from '@/components/admin/HierarchyAllocationTab';
import { useAllUserIds } from '@/hooks/useAllUserIds';

export type UserScope = 'self' | 'single' | 'multiple' | 'team' | 'all';

// Get current FY year
const getCurrentFY = () => {
  const now = new Date();
  return now.getMonth() < 3 ? now.getFullYear() : now.getFullYear() + 1;
};

// Generate FY options
const generateFYOptions = () => {
  const currentFY = getCurrentFY();
  const options = [];
  for (let i = -2; i <= 2; i++) {
    const year = currentFY + i;
    options.push({
      value: year,
      label: `FY ${year - 1}-${String(year).slice(-2)}`,
    });
  }
  return options;
};

const TargetVsActual = () => {
  const { hasAdminAccess, loading, user } = useAdminAccess();
  const { subordinates, isManager, isLoading: subordinatesLoading } = useSubordinates();
  const { allUserIds, isLoading: allUsersLoading } = useAllUserIds();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'targets' | 'hierarchy' | 'dashboard'>('targets');
  const [fyYear, setFYYear] = useState(getCurrentFY());
  const [selectedPlanId, setSelectedPlanId] = useState<string | undefined>(undefined);
  
  // Dashboard tab state - default to 'all' for admins
  const [userScope, setUserScope] = useState<UserScope>(hasAdminAccess ? 'all' : 'team');
  const [selectedUserId, setSelectedUserId] = useState<string>('self');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const fyOptions = useMemo(() => generateFYOptions(), []);

  // Get effective user IDs based on scope
  const effectiveUserIds = useMemo(() => {
    switch (userScope) {
      case 'self':
        return user?.id ? [user.id] : [];
      case 'single':
        if (selectedUserId === 'self' || !selectedUserId) {
          return user?.id ? [user.id] : [];
        }
        return [selectedUserId];
      case 'multiple':
        return selectedUserIds;
      case 'team':
        return subordinates.map(s => s.subordinate_user_id);
      case 'all':
        return allUserIds;
      default:
        return [];
    }
  }, [userScope, user?.id, selectedUserId, selectedUserIds, subordinates, allUserIds]);

  if (loading || subordinatesLoading || allUsersLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  // Only admin, System Administrator, or managers can access
  if (!hasAdminAccess && !isManager) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleLockedAndAssign = () => {
    setActiveTab('hierarchy');
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle p-4">
        <div className="w-full space-y-4">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">Target Management</h1>
              <p className="text-muted-foreground text-sm">Configure, assign, and track team targets</p>
            </div>
            
            {/* FY Selector in Header */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:inline">FY:</span>
              <Select value={String(fyYear)} onValueChange={(v) => setFYYear(parseInt(v))}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fyOptions.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Main Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="grid w-full grid-cols-3 max-w-lg">
              <TabsTrigger value="targets" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Targets</span>
              </TabsTrigger>
              <TabsTrigger value="hierarchy" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Hierarchy</span>
              </TabsTrigger>
              <TabsTrigger value="dashboard" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Target vs Actual</span>
              </TabsTrigger>
            </TabsList>

            {/* Targets Tab - Create/Edit Configuration */}
            <TabsContent value="targets" className="mt-6">
              <TargetConfigTab 
                fyYear={fyYear} 
                onLockedAndAssign={handleLockedAndAssign}
                selectedPlanId={selectedPlanId}
                onPlanChange={setSelectedPlanId}
              />
            </TabsContent>

            {/* Hierarchy Tab - Allocate to Users */}
            <TabsContent value="hierarchy" className="mt-6">
              <HierarchyAllocationTab fyYear={fyYear} selectedPlanId={selectedPlanId} />
            </TabsContent>

            {/* Dashboard Tab - Target vs Actual */}
            <TabsContent value="dashboard" className="mt-6">
              <TeamTargetDashboard 
                userScope={userScope}
                onUserScopeChange={setUserScope}
                effectiveUserIds={effectiveUserIds}
                fyYear={fyYear}
                hasAdminAccess={hasAdminAccess}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
};

export default TargetVsActual;

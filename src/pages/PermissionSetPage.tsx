import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Shield, Users, Loader2 } from 'lucide-react';
import { RolePermissionsTab } from '@/components/security/RolePermissionsTab';
import { PermissionSetGroupsTab } from '@/components/security/PermissionSetGroupsTab';

export default function PermissionSetPage() {
  const navigate = useNavigate();
  const { user, userRole, securityProfileName, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('role-permissions');

  const hasAdminAccess = userRole === 'admin' || securityProfileName === 'System Administrator';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (userRole !== null && !hasAdminAccess) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button onClick={() => navigate('/security-management')} variant="ghost" size="sm" className="p-2">
              <ArrowLeft size={20} />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Permission Set</h1>
              <p className="text-sm text-muted-foreground">Configure module access for roles and permission set groups</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="role-permissions" className="gap-2">
              <Shield className="h-4 w-4" />
              Role Permissions
            </TabsTrigger>
            <TabsTrigger value="permission-set-groups" className="gap-2">
              <Users className="h-4 w-4" />
              Permission Set Groups
            </TabsTrigger>
          </TabsList>

          <TabsContent value="role-permissions" className="mt-6">
            <div className="bg-card border rounded-xl p-6">
              <RolePermissionsTab />
            </div>
          </TabsContent>

          <TabsContent value="permission-set-groups" className="mt-6">
            <div className="bg-card border rounded-xl p-6">
              <PermissionSetGroupsTab />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

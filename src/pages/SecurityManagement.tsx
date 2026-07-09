import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfilePermissions } from '@/hooks/useProfilePermissions';
import { Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Shield, Lock, Loader2, Users, UserCog, ShieldCheck } from 'lucide-react';
import { RolePermissionsTab } from '@/components/security/RolePermissionsTab';
import { PermissionSetGroupsTab } from '@/components/security/PermissionSetGroupsTab';
import { ProfileManagement } from '@/components/security/ProfileManagement';
import { grantAllToSystemAdmin } from '@/utils/grantAllToSystemAdmin';
import { toast } from 'sonner';

export default function SecurityManagement() {
  const navigate = useNavigate();
  const { loading, user } = useAuth();
  const { hasModuleAccess, isLoading: permLoading } = useProfilePermissions();
  const [activeTab, setActiveTab] = useState('profiles');
  const [granting, setGranting] = useState(false);
  const autoSyncedRef = useRef(false);

  const canManageSecurity =
    !loading && !permLoading && !!user && hasModuleAccess('admin_security_');

  const runGrant = async (silent = false) => {
    try {
      setGranting(true);
      const res = await grantAllToSystemAdmin();
      if (!res.profileId) {
        if (!silent) toast.error('System Administrator profile not found');
        return;
      }
      if (!silent) {
        toast.success(
          res.granted > 0
            ? `Granted ${res.granted} object(s) to System Administrator`
            : 'System Administrator already has all permissions',
        );
      }
    } catch (e: any) {
      if (!silent) toast.error(e?.message || 'Failed to grant permissions');
      // eslint-disable-next-line no-console
      console.warn('[grantAllToSystemAdmin]', e);
    } finally {
      setGranting(false);
    }
  };

  // Idempotent auto-sync on load for users who can manage security.
  useEffect(() => {
    if (!canManageSecurity || autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    void runGrant(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageSecurity]);

  // Show loading while auth/permissions are being determined
  if (loading || permLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If not logged in, redirect to auth
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // DB-driven: always check permission (no bypass for missing profile)
  if (!hasModuleAccess('admin_security_')) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <Layout>
    <div className="min-h-screen bg-gradient-subtle p-4 pt-2">
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Shield className="h-8 w-8 text-primary" />
              Security & Access Control
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage user profiles, permissions, and data access
            </p>
          </div>
          <Button
            onClick={() => runGrant(false)}
            disabled={granting}
            variant="outline"
            className="gap-2"
          >
            {granting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Grant all modules to System Administrator
          </Button>
        </div>

        {/* Info Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lock className="h-5 w-5" />
              How Security Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p><strong className="text-foreground">Role Permissions:</strong> Control what modules each role can access (View, Create, Edit, Delete)</p>
            <p><strong className="text-foreground">Permission Set Groups:</strong> Override role permissions for specific users when needed</p>
            <p><strong className="text-foreground">Manager Hierarchy:</strong> Managers automatically see their team's data based on reporting structure</p>
          </CardContent>
        </Card>

        {/* Permission Set Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="profiles" className="flex items-center gap-2">
              <UserCog className="h-4 w-4" />
              Profiles
            </TabsTrigger>
            <TabsTrigger value="role-permissions" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Role Permissions
            </TabsTrigger>
            <TabsTrigger value="permission-set-groups" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Permission Set Groups
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profiles" className="mt-6">
            <ProfileManagement />
          </TabsContent>

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
    </Layout>
  );
}

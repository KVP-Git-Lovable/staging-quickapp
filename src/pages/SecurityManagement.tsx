import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Shield, Lock, Loader2, User, KeyRound } from 'lucide-react';
import { ProfileManagement } from '@/components/security/ProfileManagement';
import { ObjectPermissions } from '@/components/security/ObjectPermissions';
import { UserObjectPermissions } from '@/components/security/UserObjectPermissions';

export default function SecurityManagement() {
  const navigate = useNavigate();
  const { userRole, securityProfileName, loading, user } = useAuth();
  const [activeTab, setActiveTab] = useState('profiles');

  // Check if user has admin access - either through role OR System Administrator profile
  const hasAdminAccess = userRole === 'admin' || securityProfileName === 'System Administrator';

  // Show loading while auth is being determined
  if (loading) {
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

  // Wait a bit for role to load if user exists but role is null
  // This handles the race condition where user is set but role fetch is still pending
  if (userRole === null && securityProfileName === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Only redirect if we have confirmed the user doesn't have admin access
  if (!hasAdminAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button 
            onClick={() => navigate('/admin-controls')} 
            variant="ghost" 
            size="sm"
            className="p-2"
          >
            <ArrowLeft size={20} />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Shield className="h-8 w-8 text-primary" />
              Security & Access Control
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage user profiles, permissions, and data access
            </p>
          </div>
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
            <p><strong className="text-foreground">Profiles:</strong> Define baseline permissions for users (e.g., Sales Manager, Field Sales Executive)</p>
            <p><strong className="text-foreground">Profile Permissions:</strong> Control what objects (tables) each profile can read, create, edit, or delete</p>
            <p><strong className="text-foreground">User Permissions:</strong> Override profile permissions for specific users when needed</p>
            <p><strong className="text-foreground">Manager Hierarchy:</strong> Managers automatically see their team's data based on reporting structure</p>
          </CardContent>
        </Card>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profiles" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Profiles
            </TabsTrigger>
            <TabsTrigger value="permissions" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Profile Permissions
            </TabsTrigger>
            <TabsTrigger value="user-permissions" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              User Permissions
            </TabsTrigger>
            <TabsTrigger value="permission-set" className="flex items-center gap-2" onClick={() => navigate('/permission-set')}>
              <KeyRound className="h-4 w-4" />
              Permission Set
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profiles" className="mt-6">
            <ProfileManagement />
          </TabsContent>

          <TabsContent value="permissions" className="mt-6">
            <ObjectPermissions />
          </TabsContent>

          <TabsContent value="user-permissions" className="mt-6">
            <UserObjectPermissions />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

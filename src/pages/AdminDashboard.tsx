import { useState, useEffect, useMemo } from 'react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { Layout } from '@/components/Layout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SignedAvatarImage } from '@/components/ui/signed-image';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Users, UserPlus, Shield, BarChart3, Settings, Database, ArrowLeft, Pencil, Search, Columns3, X, LogIn } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Navigate, useNavigate } from 'react-router-dom';
import { clearUserScopedCaches } from '@/utils/userScopedCache';

import { CreateUserWizard } from '@/components/admin/create-user';
import UserInvitationForm from '@/components/UserInvitationForm';
import ApproverManagement from '@/components/ApproverManagement';
import UserHierarchy from '@/components/admin/UserHierarchy';
import SecurityRolesDisplay from '@/components/admin/SecurityRolesDisplay';
import EditUserDialog from '@/components/admin/EditUserDialog';
import UserPhotoDialog from '@/components/admin/UserPhotoDialog';
import UserDetailSheet from '@/components/admin/UserDetailSheet';
import { SortableTableHeader, useTableSort, useTableFilters } from '@/components/admin/SortableTableHeader';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

interface User {
  id: string;
  email: string;
  username: string;
  full_name: string;
  phone_number: string;
  recovery_email: string;
  role: 'admin' | 'user';
  assigned_at: string;
  created_at: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
  profile?: {
    id: string;
    username: string;
    full_name: string;
    created_at: string;
    profile_picture_url?: string;
    user_status?: string;
  };
  securityProfile?: {
    id: string;
    name: string;
  };
}

// Available columns configuration
const allColumns = [
  { key: 'photo', label: 'Photo', default: true },
  { key: 'username', label: 'User Name', default: true },
  { key: 'email', label: 'Email', default: true },
  { key: 'role', label: 'Role', default: true },
  { key: 'manager', label: 'Reporting Manager', default: true },
  { key: 'active', label: 'Active', default: true },
  { key: 'status', label: 'Email Status', default: false },
  { key: 'action', label: 'Action', default: true },
  { key: 'full_name', label: 'Full Name', default: false },
  { key: 'phone', label: 'Phone', default: false },
  { key: 'joined', label: 'Joined Date', default: false },
  { key: 'last_login', label: 'Last Login', default: false },
];

// Helper functions for sorting and filtering
const getUserColumnValue = (
  user: User, 
  key: string, 
  managers: Record<string, { full_name: string; username: string }>
): string => {
  switch (key) {
    case 'username':
      return user.username || user.profile?.username || '';
    case 'email':
      return user.email || '';
    case 'full_name':
      return user.full_name || user.profile?.full_name || '';
    case 'phone':
      return user.phone_number || '';
    case 'role':
      return user.securityProfile?.name || 'Not Assigned';
    case 'manager':
      return managers[user.id]?.full_name || managers[user.id]?.username || '';
    case 'status':
      return user.email_confirmed_at ? 'Verified' : 'Pending';
    case 'active':
      const userStatus = user.profile?.user_status || 'active';
      return userStatus === 'inactive' ? 'Inactive' : 'Active';
    default:
      return '';
  }
};

const getSortValue = (
  user: User, 
  key: string, 
  managers: Record<string, { full_name: string; username: string }>
): string | Date | null => {
  switch (key) {
    case 'username':
      return user.username || user.profile?.username || '';
    case 'email':
      return user.email || '';
    case 'full_name':
      return user.full_name || user.profile?.full_name || '';
    case 'phone':
      return user.phone_number || '';
    case 'role':
      return user.securityProfile?.name || '';
    case 'manager':
      return managers[user.id]?.full_name || managers[user.id]?.username || '';
    case 'joined':
      return user.created_at ? new Date(user.created_at) : null;
    case 'last_login':
      return user.last_sign_in_at ? new Date(user.last_sign_in_at) : null;
    case 'status':
      return user.email_confirmed_at ? 'Verified' : 'Pending';
    default:
      return '';
  }
};

export const AdminDashboard = () => {
  const { hasAdminAccess, loading } = useAdminAccess();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isRoleChangeOpen, setIsRoleChangeOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isUserDetailOpen, setIsUserDetailOpen] = useState(false);
  const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);
  const [selectedPhotoUser, setSelectedPhotoUser] = useState<{ photoUrl?: string; name: string } | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    allColumns.filter(c => c.default).map(c => c.key)
  );
  const [managers, setManagers] = useState<Record<string, { full_name: string; username: string }>>({});
  
  // Sort and filter hooks
  const { sortKey, sortDirection, handleSort, sortData } = useTableSort<User>();
  const { filters, handleFilter, hasActiveFilters, clearAllFilters } = useTableFilters();

  // Form states
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    username: '',
    fullName: '',
    role: 'user' as 'admin' | 'user'
  });

  useEffect(() => {
    if (!loading && hasAdminAccess) {
      fetchUsers();
    }
  }, [hasAdminAccess, loading]);

  // Set up real-time subscription for automatic updates
  useEffect(() => {
    if (hasAdminAccess) {
      const profilesChannel = supabase
        .channel('profiles-changes')
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'profiles' },
          () => {
            console.log('Profile change detected, refreshing user list...');
            fetchUsers();
          }
        )
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'user_roles' },
          () => {
            console.log('User role change detected, refreshing user list...');
            fetchUsers();
          }
        )
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'employees' },
          () => {
            console.log('Employee change detected, refreshing user list...');
            fetchUsers();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(profilesChannel);
      };
    }
  }, [hasAdminAccess]);

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      
      // Use secure function that only returns limited profile data for admins
      const { data: limitedProfiles, error: profileError } = await supabase.rpc('get_limited_profiles_for_admin');
      
      if (profileError) {
        console.error('Error fetching limited profiles:', profileError);
        toast.error('Failed to fetch user profiles: ' + profileError.message);
        return;
      }

      // Fetch security profile assignments
      const { data: userProfileAssignments, error: assignmentError } = await supabase
        .from('user_profiles')
        .select(`
          user_id,
          profile_id,
          security_profiles:profile_id (id, name)
        `);

      if (assignmentError) {
        console.error('Error fetching security profile assignments:', assignmentError);
      }

      // Call the edge function to get user authentication data
      const { data, error } = await supabase.functions.invoke('admin-get-users');
      
      if (error) {
        console.error('Error calling admin-get-users function:', error);
        toast.error('Failed to fetch users: ' + error.message);
        return;
      }

      // Merge limited profile data to ensure sensitive data is not exposed
      if (data?.users && limitedProfiles) {
        const secureUsers = data.users.map((user: any) => {
          const limitedProfile = limitedProfiles.find((p: any) => p.id === user.id);
          const securityAssignment = userProfileAssignments?.find((a: any) => a.user_id === user.id);
          return {
            ...user,
            // Override with limited profile data to prevent sensitive data exposure
            profile: limitedProfile || {
              id: user.id,
              username: 'Unknown',
              full_name: 'Unknown User',
              created_at: new Date().toISOString()
            },
            securityProfile: securityAssignment?.security_profiles ? {
              id: (securityAssignment.security_profiles as any).id,
              name: (securityAssignment.security_profiles as any).name
            } : null
          };
        });
        setUsers(secureUsers);

        // Fetch managers data for the Reporting Manager column
        const { data: employees } = await supabase
          .from('employees')
          .select('user_id, manager_id');
        
        if (employees) {
          const managerIds = [...new Set(employees.map(e => e.manager_id).filter(Boolean))];
          if (managerIds.length > 0) {
            const { data: managerProfiles } = await supabase
              .from('profiles')
              .select('id, full_name, username')
              .in('id', managerIds);
            
            if (managerProfiles) {
              const managerMap: Record<string, { full_name: string; username: string }> = {};
              managerProfiles.forEach(m => {
                managerMap[m.id] = { full_name: m.full_name || '', username: m.username || '' };
              });
              
              // Also map user_id to manager_id
              const userManagerMap: Record<string, string> = {};
              employees.forEach(e => {
                if (e.manager_id) userManagerMap[e.user_id] = e.manager_id;
              });
              
              // Store managers with user mapping
              const enrichedManagers: Record<string, { full_name: string; username: string }> = {};
              employees.forEach(e => {
                if (e.manager_id && managerMap[e.manager_id]) {
                  enrichedManagers[e.user_id] = managerMap[e.manager_id];
                }
              });
              setManagers(enrichedManagers);
            }
          }
        }
      } else {
        setUsers([]);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const createUser = async () => {
    try {
      // Since we can't use admin.createUser from client, we'll just update the form message
      toast.error('User creation from admin dashboard requires server-side implementation. Users can register normally through the signup page.');
      return;
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error('Failed to create user');
    }
  };

  const changeUserRole = async (userId: string, newRole: 'admin' | 'user') => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', userId);

      if (error) {
        toast.error('Failed to update user role');
        return;
      }

      toast.success(`User role updated to ${newRole}`);
      setIsRoleChangeOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error changing user role:', error);
      toast.error('Failed to update user role');
    }
  };

  const toggleUserActiveStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'inactive' ? 'active' : 'inactive';
    const newIsActive = newStatus === 'active';

    // Optimistically update local state for immediate UI feedback
    setUsers(prev => prev.map(u =>
      u.id === userId
        ? { ...u, profile: { ...u.profile, user_status: newStatus, is_active: newIsActive } as any }
        : u
    ));

    const { data, error } = await supabase
      .from('profiles')
      .update({ user_status: newStatus, is_active: newIsActive })
      .eq('id', userId)
      .select('user_status')
      .single();

    if (error || !data) {
      // Revert optimistic update on failure
      setUsers(prev => prev.map(u =>
        u.id === userId
          ? { ...u, profile: { ...u.profile, user_status: currentStatus, is_active: currentStatus !== 'inactive' } as any }
          : u
      ));
      toast.error('Failed to update user status: ' + (error?.message || 'Update failed'));
      return;
    }

    // Verify the update actually happened
    if (data.user_status !== newStatus) {
      // Revert if DB didn't update
      setUsers(prev => prev.map(u =>
        u.id === userId
          ? { ...u, profile: { ...u.profile, user_status: currentStatus, is_active: currentStatus !== 'inactive' } as any }
          : u
      ));
      toast.error('Failed to update user status - permission denied');
      return;
    }

    // Best-effort sync to distributor_users (if linked)
    try {
      await supabase
        .from('distributor_users')
        .update({ is_active: newIsActive, user_status: newStatus as any })
        .eq('auth_user_id', userId);
    } catch (e) {
      console.warn('distributor_users sync skipped:', e);
    }

    // On deactivation — revoke beat access (best-effort)
    if (!newIsActive) {
      const today = new Date().toISOString().slice(0, 10);
      try {
        await supabase
          .from('beat_user_access')
          .update({ is_active: false })
          .eq('user_id', userId);
        await supabase
          .from('beat_coverage_assignments')
          .update({ is_active: false })
          .eq('coverage_user_id', userId)
          .gte('end_date', today);
      } catch (e) {
        console.warn('beat access revoke skipped:', e);
      }
      toast.success('User deactivated and beat access revoked');
    } else {
      toast.success('User activated successfully');
    }
  };

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
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button 
            onClick={() => navigate('/')} 
            variant="ghost" 
            size="sm"
            className="p-2"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">User Management</h1>
            <p className="text-muted-foreground">Manage users, roles, and team hierarchy</p>
          </div>
        </div>

        {/* Role Counts from Security Profiles */}
        <SecurityRolesDisplay />

        {/* Admin Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users & Roles
            </TabsTrigger>
            <TabsTrigger value="create-user" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Create User
            </TabsTrigger>
            <TabsTrigger value="invite-user" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Invite User
            </TabsTrigger>
            <TabsTrigger value="approvers" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Approvers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* User Hierarchy */}
            <UserHierarchy />
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Users & Roles Management</CardTitle>
                <CardDescription>
                  View and manage all user accounts and their assigned roles
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      {(() => {
                        const activeCount = users.filter(u => (u.profile?.user_status || 'active') !== 'inactive').length;
                        const inactiveCount = users.length - activeCount;
                        return (
                          <h4 className="text-lg font-semibold">
                            Active Users: {activeCount}
                            <span className="text-muted-foreground text-xs ml-2 font-normal">
                              ({inactiveCount} inactive)
                            </span>
                          </h4>
                        );
                      })()}
                      <p className="text-sm text-muted-foreground">
                        {users.filter(u => u.securityProfile).length} users with security profiles assigned
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 mr-2">
                        <Switch
                          id="show-inactive-users"
                          checked={showInactive}
                          onCheckedChange={setShowInactive}
                        />
                        <Label htmlFor="show-inactive-users" className="text-sm text-muted-foreground cursor-pointer">
                          Show inactive users
                        </Label>
                      </div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Columns3 className="h-4 w-4 mr-2" />
                            Columns
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 bg-background border shadow-lg z-50" align="end">
                          <div className="space-y-2">
                            <h4 className="font-semibold text-sm mb-3">Choose columns</h4>
                            <ScrollArea className="h-[280px]">
                              <div className="space-y-2 pr-2">
                                {allColumns.map((col) => (
                                  <div key={col.key} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`col-${col.key}`}
                                      checked={visibleColumns.includes(col.key)}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setVisibleColumns([...visibleColumns, col.key]);
                                        } else {
                                          setVisibleColumns(visibleColumns.filter(c => c !== col.key));
                                        }
                                      }}
                                      disabled={col.key === 'photo' || col.key === 'action'}
                                    />
                                    <label
                                      htmlFor={`col-${col.key}`}
                                      className={`text-sm cursor-pointer ${col.key === 'photo' || col.key === 'action' ? 'text-muted-foreground' : ''}`}
                                    >
                                      {col.label}
                                    </label>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Button onClick={fetchUsers} variant="outline" size="sm">
                        Refresh
                      </Button>
                      {hasActiveFilters && (
                        <Button onClick={clearAllFilters} variant="ghost" size="sm" className="text-destructive">
                          <X className="h-4 w-4 mr-1" />
                          Clear Filters
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, email, username, or role..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                {loadingUsers ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          {visibleColumns.includes('photo') && (
                            <TableHead className="text-[11px] font-medium text-muted-foreground py-2 h-8">Photo</TableHead>
                          )}
                          {visibleColumns.includes('username') && (
                            <SortableTableHeader
                              label="User Name"
                              columnKey="username"
                              sortKey={sortKey}
                              sortDirection={sortDirection}
                              onSort={handleSort}
                              filterValue={filters['username'] || ''}
                              onFilter={handleFilter}
                            />
                          )}
                          {visibleColumns.includes('email') && (
                            <SortableTableHeader
                              label="Email"
                              columnKey="email"
                              sortKey={sortKey}
                              sortDirection={sortDirection}
                              onSort={handleSort}
                              filterValue={filters['email'] || ''}
                              onFilter={handleFilter}
                            />
                          )}
                          {visibleColumns.includes('full_name') && (
                            <SortableTableHeader
                              label="Full Name"
                              columnKey="full_name"
                              sortKey={sortKey}
                              sortDirection={sortDirection}
                              onSort={handleSort}
                              filterValue={filters['full_name'] || ''}
                              onFilter={handleFilter}
                            />
                          )}
                          {visibleColumns.includes('phone') && (
                            <SortableTableHeader
                              label="Phone"
                              columnKey="phone"
                              sortKey={sortKey}
                              sortDirection={sortDirection}
                              onSort={handleSort}
                              filterValue={filters['phone'] || ''}
                              onFilter={handleFilter}
                            />
                          )}
                          {visibleColumns.includes('role') && (
                            <SortableTableHeader
                              label="Role"
                              columnKey="role"
                              sortKey={sortKey}
                              sortDirection={sortDirection}
                              onSort={handleSort}
                              filterValue={filters['role'] || ''}
                              onFilter={handleFilter}
                              filterType="select"
                              filterOptions={[...new Set(users.map(u => u.securityProfile?.name).filter(Boolean) as string[])]}
                            />
                          )}
                          {visibleColumns.includes('manager') && (
                            <SortableTableHeader
                              label="Reporting Manager"
                              columnKey="manager"
                              sortKey={sortKey}
                              sortDirection={sortDirection}
                              onSort={handleSort}
                              filterValue={filters['manager'] || ''}
                              onFilter={handleFilter}
                              filterType="select"
                              filterOptions={[...new Set(Object.values(managers).map(m => m.full_name || m.username).filter(Boolean))]}
                            />
                          )}
                          {visibleColumns.includes('active') && (
                            <SortableTableHeader
                              label="Active"
                              columnKey="active"
                              sortKey={sortKey}
                              sortDirection={sortDirection}
                              onSort={handleSort}
                              filterValue={filters['active'] || ''}
                              onFilter={handleFilter}
                              filterType="select"
                              filterOptions={['Active', 'Inactive']}
                            />
                          )}
                          {visibleColumns.includes('joined') && (
                            <SortableTableHeader
                              label="Joined"
                              columnKey="joined"
                              sortKey={sortKey}
                              sortDirection={sortDirection}
                              onSort={handleSort}
                              filterable={false}
                            />
                          )}
                          {visibleColumns.includes('last_login') && (
                            <SortableTableHeader
                              label="Last Login"
                              columnKey="last_login"
                              sortKey={sortKey}
                              sortDirection={sortDirection}
                              onSort={handleSort}
                              filterable={false}
                            />
                          )}
                          {visibleColumns.includes('status') && (
                            <SortableTableHeader
                              label="Status"
                              columnKey="status"
                              sortKey={sortKey}
                              sortDirection={sortDirection}
                              onSort={handleSort}
                              filterValue={filters['status'] || ''}
                              onFilter={handleFilter}
                              filterType="select"
                              filterOptions={['Verified', 'Pending']}
                            />
                          )}
                          {visibleColumns.includes('action') && (
                            <TableHead className="text-[11px] font-medium text-muted-foreground py-2 h-8">Actions</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortData(
                          users.filter(user => {
                            // Hide inactive users unless toggle is on
                            const status = user.profile?.user_status || 'active';
                            if (!showInactive && status === 'inactive') return false;

                            // Global search
                            if (userSearchQuery.trim()) {
                              const query = userSearchQuery.toLowerCase();
                              const matchesSearch = 
                                user.email?.toLowerCase().includes(query) ||
                                user.username?.toLowerCase().includes(query) ||
                                user.full_name?.toLowerCase().includes(query) ||
                                user.phone_number?.toLowerCase().includes(query) ||
                                user.securityProfile?.name?.toLowerCase().includes(query);
                              if (!matchesSearch) return false;
                            }
                            
                            // Column filters
                            for (const [key, value] of Object.entries(filters)) {
                              if (!value) continue;
                              const userValue = getUserColumnValue(user, key, managers);
                              if (!userValue.toLowerCase().includes(value.toLowerCase())) {
                                return false;
                              }
                            }
                            return true;
                          }),
                          (user, key) => getSortValue(user, key, managers)
                        ).map((user) => (
                          <TableRow key={user.id} className="hover:bg-muted/30">
                            {visibleColumns.includes('photo') && (
                              <TableCell className="py-1.5">
                                <Avatar 
                                  className="w-7 h-7 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                                  onClick={() => {
                                    setSelectedPhotoUser({
                                      photoUrl: user.profile?.profile_picture_url,
                                      name: user.profile?.full_name || user.username || 'User'
                                    });
                                    setIsPhotoDialogOpen(true);
                                  }}
                                >
                                  <SignedAvatarImage src={user.profile?.profile_picture_url} />
                                  <AvatarFallback className="text-[10px]">{user.profile?.full_name?.charAt(0) || 'U'}</AvatarFallback>
                                </Avatar>
                              </TableCell>
                            )}
                            {visibleColumns.includes('username') && (
                              <TableCell
                                className="text-xs font-medium text-primary cursor-pointer hover:underline py-1.5"
                                onClick={() => {
                                  setSelectedUser(user);
                                  setIsUserDetailOpen(true);
                                }}
                              >
                                {user.username || user.profile?.username || '-'}
                              </TableCell>
                            )}
                            {visibleColumns.includes('email') && (
                              <TableCell className="text-xs text-muted-foreground py-1.5 max-w-[180px] truncate">
                                {user.email}
                              </TableCell>
                            )}
                            {visibleColumns.includes('full_name') && (
                              <TableCell className="text-xs py-1.5">{user.full_name || user.profile?.full_name || '-'}</TableCell>
                            )}
                            {visibleColumns.includes('phone') && (
                              <TableCell className="text-xs text-muted-foreground py-1.5">{user.phone_number || '-'}</TableCell>
                            )}
                            {visibleColumns.includes('role') && (
                              <TableCell className="text-xs py-1.5">
                                {user.securityProfile?.name || 'Not Assigned'}
                              </TableCell>
                            )}
                            {visibleColumns.includes('manager') && (
                              <TableCell className="text-xs text-muted-foreground py-1.5">
                                {managers[user.id] 
                                  ? (managers[user.id].full_name || managers[user.id].username || '-') 
                                  : '-'}
                              </TableCell>
                            )}
                            {visibleColumns.includes('active') && (
                              <TableCell className="text-xs py-1.5">
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={user.profile?.user_status !== 'inactive'}
                                    onCheckedChange={() => toggleUserActiveStatus(
                                      user.id, 
                                      user.profile?.user_status || 'active'
                                    )}
                                    className="scale-75"
                                  />
                                  <span className={user.profile?.user_status === 'inactive' ? 'text-destructive' : 'text-green-600'}>
                                    {user.profile?.user_status === 'inactive' ? 'Inactive' : 'Active'}
                                  </span>
                                </div>
                              </TableCell>
                            )}
                            {visibleColumns.includes('joined') && (
                              <TableCell className="text-xs text-muted-foreground py-1.5">
                                {new Date(user.created_at).toLocaleDateString()}
                              </TableCell>
                            )}
                            {visibleColumns.includes('last_login') && (
                              <TableCell className="text-xs text-muted-foreground py-1.5">
                                {user.last_sign_in_at 
                                  ? new Date(user.last_sign_in_at).toLocaleDateString()
                                  : 'Never'
                                }
                              </TableCell>
                            )}
                            {visibleColumns.includes('status') && (
                              <TableCell className="text-xs py-1.5">
                                <span className={user.email_confirmed_at ? 'text-green-600' : 'text-muted-foreground'}>
                                  {user.email_confirmed_at ? 'Verified' : 'Pending'}
                                </span>
                              </TableCell>
                            )}
                            {visibleColumns.includes('action') && (
                              <TableCell className="py-1.5">
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs px-2"
                                    onClick={() => {
                                      setSelectedUser(user);
                                      setIsEditDialogOpen(true);
                                    }}
                                  >
                                    <Pencil className="h-3 w-3 mr-1" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs px-2 text-primary hover:text-primary"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        toast.loading('Generating login session...', { id: 'login-as-user' });
                                        const response = await supabase.functions.invoke('admin-login-as-user', {
                                          body: { targetUserId: user.id }
                                        });
                                        
                                        if (response.error) {
                                          throw new Error(response.error.message || 'Failed to login as user');
                                        }
                                        
                                        if (response.data?.session) {
                                          const previousUserId = localStorage.getItem('cached_user_id');
                                          await clearUserScopedCaches({ previousUserId, preserveUnsynced: true });

                                          // Set the new session using the tokens from the edge function
                                          const { error: setSessionError } = await supabase.auth.setSession({
                                            access_token: response.data.session.access_token,
                                            refresh_token: response.data.session.refresh_token,
                                          });
                                          
                                          if (setSessionError) {
                                            throw new Error(setSessionError.message || 'Failed to set session');
                                          }
                                          
                                          toast.success(`Logged in as ${response.data.user?.email || user.email}`, { id: 'login-as-user' });
                                          // Redirect to dashboard
                                          window.location.href = '/dashboard';
                                        } else {
                                          throw new Error(response.data?.error || 'No session received');
                                        }
                                      } catch (error: any) {
                                        console.error('Login as user error:', error);
                                        toast.error(error.message || 'Failed to login as user', { id: 'login-as-user' });
                                      }
                                    }}
                                  >
                                    <LogIn className="h-3 w-3 mr-1" />
                                    Login
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="create-user" className="space-y-6">
            <CreateUserWizard onSuccess={fetchUsers} />
          </TabsContent>

          <TabsContent value="invite-user" className="space-y-6">
            <UserInvitationForm />
          </TabsContent>

          <TabsContent value="approvers" className="space-y-6">
            <ApproverManagement />
          </TabsContent>


          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>System Settings</CardTitle>
                <CardDescription>
                  Configure system-wide settings and preferences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>User Registration</Label>
                      <p className="text-sm text-muted-foreground">
                        Allow new users to register accounts
                      </p>
                    </div>
                    <Badge variant="default">Enabled</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Email Verification</Label>
                      <p className="text-sm text-muted-foreground">
                        Require email verification for new accounts
                      </p>
                    </div>
                    <Badge variant="secondary">Optional</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Database Status</Label>
                      <p className="text-sm text-muted-foreground">
                        Current database connection status
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-green-600" />
                      <Badge variant="default">Connected</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Role Change Dialog - Removed: Roles are now managed via Security & Access Control */}

        {/* Edit User Dialog */}
        <EditUserDialog
          user={selectedUser}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onSuccess={fetchUsers}
        />

        {/* User Detail Sheet */}
        <UserDetailSheet
          user={selectedUser}
          open={isUserDetailOpen}
          onOpenChange={setIsUserDetailOpen}
          onEditClick={() => setIsEditDialogOpen(true)}
          managers={managers}
        />

        {/* Photo Full View Dialog */}
        <UserPhotoDialog
          open={isPhotoDialogOpen}
          onOpenChange={setIsPhotoDialogOpen}
          photoUrl={selectedPhotoUser?.photoUrl}
          userName={selectedPhotoUser?.name}
        />
      </div>
    </div>
    </Layout>
  );
};
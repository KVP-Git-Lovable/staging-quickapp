import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Plus, User, Mail, Phone, Shield, CheckCircle, XCircle, 
  Send, Edit, Trash2, LogIn, Clock, AlertCircle, UserX, Key, Eye, EyeOff 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface DistributorUser {
  id: string;
  distributor_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  designation: string | null;
  user_level: string | null;
  is_active: boolean;
  can_deliver: boolean;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  last_login_at: string | null;
  user_status: 'initiated' | 'active' | 'inactive' | 'deactivated';
  auth_user_id: string | null;
  email_sent_at: string | null;
}

interface DistributorOwnerInfo {
  id: string;
  full_name: string | null;
}

interface DistributorPortalUsersProps {
  distributorId: string;
  distributorName: string;
}

const PORTAL_ROLES = [
  { value: 'owner', label: 'Owner', description: 'Full access to all features' },
  { value: 'manager', label: 'Manager', description: 'Manage orders, inventory, and staff' },
  { value: 'warehouse', label: 'Warehouse Staff', description: 'Inventory and dispatch' },
  { value: 'accounts', label: 'Accounts', description: 'Payments and claims' },
  { value: 'sales', label: 'Sales Staff', description: 'View orders and retailers' },
];

const USER_LEVELS = [
  { value: 'senior', label: 'Senior' },
  { value: 'mid', label: 'Mid-Level' },
  { value: 'junior', label: 'Junior' },
  { value: 'staff', label: 'Staff' },
];

const USER_STATUSES = [
  { value: 'initiated', label: 'Initiated', icon: Clock, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { value: 'active', label: 'Active', icon: CheckCircle, color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  { value: 'inactive', label: 'Inactive', icon: AlertCircle, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  { value: 'deactivated', label: 'Deactivated', icon: UserX, color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
];

export function DistributorPortalUsers({ distributorId, distributorName }: DistributorPortalUsersProps) {
  const [users, setUsers] = useState<DistributorUser[]>([]);
  const [owner, setOwner] = useState<DistributorOwnerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingUser, setEditingUser] = useState<DistributorUser | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<DistributorUser | null>(null);
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<DistributorUser | null>(null);
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' });
  const [settingPassword, setSettingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    role: 'sales',
    designation: '',
    user_level: 'staff',
    user_status: 'initiated' as 'initiated' | 'active' | 'inactive' | 'deactivated',
    password: '',
    confirmPassword: '',
  });
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [showFormConfirmPassword, setShowFormConfirmPassword] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [distributorId]);

  const loadUsers = async () => {
    try {
      const [{ data, error }, { data: distData }] = await Promise.all([
        supabase
          .from('distributor_users')
          .select('*')
          .eq('distributor_id', distributorId)
          .order('created_at', { ascending: false }),
        supabase
          .from('distributors')
          .select('owner_id, owner_name, profiles:owner_id(id, full_name)')
          .eq('id', distributorId)
          .maybeSingle(),
      ]);

      if (error) throw error;
      setUsers((data || []) as DistributorUser[]);
      const p: any = (distData as any)?.profiles;
      if (p?.id) {
        setOwner({ id: p.id, full_name: p.full_name ?? (distData as any)?.owner_name ?? null });
      } else if ((distData as any)?.owner_id) {
        setOwner({ id: (distData as any).owner_id, full_name: (distData as any).owner_name ?? null });
      } else {
        setOwner(null);
      }
    } catch (error: any) {
      toast.error("Failed to load portal users: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleCanDeliver = async (userId: string, current: boolean) => {
    // Optimistic update
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, can_deliver: !current } : u));
    const { error } = await supabase
      .from('distributor_users')
      .update({ can_deliver: !current } as any)
      .eq('id', userId);
    if (error) {
      // Revert
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, can_deliver: current } : u));
      toast.error("Failed to update delivery access: " + error.message);
    } else {
      toast.success(!current ? "Delivery access granted" : "Delivery access removed");
    }
  };

  const resetForm = () => {
    setFormData({
      full_name: '',
      email: '',
      phone: '',
      role: 'sales',
      designation: '',
      user_level: 'staff',
      user_status: 'initiated',
      password: '',
      confirmPassword: '',
    });
    setEditingUser(null);
    setShowFormPassword(false);
    setShowFormConfirmPassword(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.full_name) {
      toast.error("Name and email are required");
      return;
    }

    // Validate password fields if provided
    if (formData.password) {
      if (formData.password.length < 6) {
        toast.error("Password must be at least 6 characters");
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        toast.error("Passwords do not match");
        return;
      }
    }

    setSaving(true);
    try {
      if (editingUser) {
        // Update existing user
        const { error } = await supabase
          .from('distributor_users')
          .update({
            email: formData.email,
            full_name: formData.full_name,
            phone: formData.phone || null,
            role: formData.role,
            designation: formData.designation || null,
            user_level: formData.user_level,
            user_status: formData.user_status,
          })
          .eq('id', editingUser.id);

        if (error) throw error;

        // If password was provided, reset it
        if (formData.password) {
          const { data: pwData, error: pwError } = await supabase.functions.invoke('set-distributor-portal-password', {
            body: {
              distributorUserId: editingUser.id,
              password: formData.password,
            }
          });

          if (pwError || !pwData?.success) {
            toast.warning("User updated but password reset failed: " + (pwData?.error || pwError?.message || 'Unknown error'));
          } else {
            toast.success("User updated and password reset successfully!");
          }
        } else {
          toast.success("User updated successfully");
        }
      } else {
        // Create new user
        const { data: insertedData, error } = await supabase
          .from('distributor_users')
          .insert([{
            distributor_id: distributorId,
            email: formData.email,
            full_name: formData.full_name,
            phone: formData.phone || null,
            role: formData.role,
            designation: formData.designation || null,
            user_level: formData.user_level,
            user_status: formData.user_status,
            is_active: false,
          }])
          .select('id')
          .single();

        if (error) throw error;

        // If password was provided, set it immediately
        if (formData.password && insertedData?.id) {
          const { data: pwData, error: pwError } = await supabase.functions.invoke('set-distributor-portal-password', {
            body: {
              distributorUserId: insertedData.id,
              password: formData.password,
            }
          });

          if (pwError || !pwData?.success) {
            toast.warning("User created but password setup failed: " + (pwData?.error || pwError?.message || 'Unknown error'));
          } else {
            toast.success("Portal user created with login credentials!");
          }
        } else {
          toast.success("Portal user created successfully");
        }
      }

      setDialogOpen(false);
      resetForm();
      loadUsers();
    } catch (error: any) {
      toast.error("Failed to save user: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (user: DistributorUser) => {
    setEditingUser(user);
    setFormData({
      full_name: user.full_name,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      designation: user.designation || '',
      user_level: user.user_level || 'staff',
      user_status: user.user_status || 'initiated',
      password: '',
      confirmPassword: '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!userToDelete) return;

    try {
      // If user has auth account, delete it first
      if (userToDelete.auth_user_id) {
        // Note: This requires service role, so we'll just mark as deactivated
        const { error: updateError } = await supabase
          .from('distributor_users')
          .update({ user_status: 'deactivated', is_active: false })
          .eq('id', userToDelete.id);
        
        if (updateError) throw updateError;
        toast.success("User deactivated (auth account preserved)");
      } else {
        // No auth account, safe to delete
        const { error } = await supabase
          .from('distributor_users')
          .delete()
          .eq('id', userToDelete.id);

        if (error) throw error;
        toast.success("User deleted successfully");
      }
      
      loadUsers();
    } catch (error: any) {
      toast.error("Failed to delete user: " + error.message);
    } finally {
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
    }
  };

  const sendInviteEmail = async (user: DistributorUser) => {
    setSendingInvite(user.id);
    try {
      const { data, error } = await supabase.functions.invoke('send-distributor-portal-invite', {
        body: {
          distributorUserId: user.id,
          distributorName: distributorName,
        }
      });

      if (error) throw error;
      
      if (data?.success) {
        toast.success("Invitation email sent successfully!");
        loadUsers();
      } else {
        throw new Error(data?.error || 'Failed to send invitation');
      }
    } catch (error: any) {
      console.error('Error sending invite:', error);
      toast.error("Failed to send invitation: " + error.message);
    } finally {
      setSendingInvite(null);
    }
  };

  const loginAsUser = async (user: DistributorUser) => {
    setImpersonating(user.id);
    try {
      // Verify admin is logged in
      const { data: { session: adminSession } } = await supabase.auth.getSession();
      if (!adminSession) {
        toast.error("Admin session required");
        setImpersonating(null);
        return;
      }

      // Verify admin role via security_profiles
      const { data: adminCheck } = await supabase
        .from('user_profiles')
        .select('security_profiles!inner(is_system)')
        .eq('user_id', adminSession.user.id)
        .maybeSingle();

      if (!(adminCheck?.security_profiles as any)?.is_system) {
        toast.error("Only admins can login as users");
        setImpersonating(null);
        return;
      }

      // Fetch the distributor user data with distributor info
      const { data: distributorUser, error } = await supabase
        .from('distributor_users')
        .select('*, distributors(name)')
        .eq('id', user.id)
        .single();

      if (error || !distributorUser) {
        toast.error("Failed to load distributor user");
        setImpersonating(null);
        return;
      }

      // Store impersonation data in localStorage before opening new tab
      const impersonationData = {
        adminUserId: adminSession.user.id,
        returnUrl: `/distributor/${distributorId}`,
        impersonatedUser: distributorUser.full_name,
        distributorUser: {
          ...distributorUser,
          is_impersonated: true,
          admin_user_id: adminSession.user.id,
        },
        distributorId: distributorUser.distributor_id,
        timestamp: Date.now(),
      };
      
      localStorage.setItem('pending_impersonation', JSON.stringify(impersonationData));

      // Wait for localStorage to be written before opening new tab
      await new Promise(resolve => setTimeout(resolve, 150));

      // Open distributor portal dashboard directly
      window.open('/distributor-portal/dashboard?impersonate=true', '_blank');
      
      toast.success(`Opening portal as ${user.full_name}`, {
        description: 'Admin viewing mode',
      });
    } catch (error: any) {
      console.error('Error impersonating user:', error);
      toast.error("Failed to login as user: " + error.message);
    } finally {
      setImpersonating(null);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const updateData: any = {
        is_active: !currentStatus,
      };

      if (!currentStatus) {
        updateData.approved_at = new Date().toISOString();
        updateData.approved_by = user?.id;
      }

      const { error } = await supabase
        .from('distributor_users')
        .update(updateData)
        .eq('id', userId);

      if (error) throw error;

      toast.success(currentStatus ? "User disabled" : "User enabled");
      loadUsers();
    } catch (error: any) {
      toast.error("Failed to update user: " + error.message);
    }
  };

  const handleSetPassword = async () => {
    if (!passwordUser) return;
    if (!passwordForm.password || passwordForm.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setSettingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke('set-distributor-portal-password', {
        body: {
          distributorUserId: passwordUser.id,
          password: passwordForm.password,
        }
      });

      if (error) throw error;
      if (data?.success) {
        toast.success(`Password set for ${passwordUser.full_name}`);
        setPasswordDialogOpen(false);
        setPasswordUser(null);
        setPasswordForm({ password: '', confirmPassword: '' });
        setShowPassword(false);
        loadUsers();
      } else {
        throw new Error(data?.error || 'Failed to set password');
      }
    } catch (error: any) {
      toast.error("Failed to set password: " + error.message);
    } finally {
      setSettingPassword(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'manager': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'warehouse': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'accounts': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = USER_STATUSES.find(s => s.value === status) || USER_STATUSES[0];
    const Icon = statusConfig.icon;
    return (
      <Badge className={statusConfig.color}>
        <Icon className="h-3 w-3 mr-1" />
        {statusConfig.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-10 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {owner && (
        <Card className="border-dashed border-primary/40 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                {(owner.full_name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Distributor Owner (Company)
                </p>
                <p className="text-sm font-semibold truncate">{owner.full_name || 'Unnamed user'}</p>
                <p className="text-xs text-muted-foreground">
                  Manages this distributor's users, logins & delivery access.
                </p>
              </div>
              <Badge variant="outline" className="text-[10px]">PROFILES</Badge>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Portal Users
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8">
                <Plus className="h-3 w-3 mr-1" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>{editingUser ? 'Edit Portal User' : 'Add Portal User'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 pr-1">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                    placeholder="Enter full name"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Enter email address"
                    required
                    disabled={!!editingUser?.auth_user_id}
                  />
                  {editingUser?.auth_user_id && (
                    <p className="text-xs text-muted-foreground">Email cannot be changed after account creation</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Enter phone number"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="designation">Designation</Label>
                  <Input
                    id="designation"
                    value={formData.designation}
                    onChange={(e) => setFormData(prev => ({ ...prev, designation: e.target.value }))}
                    placeholder="e.g., Sales Executive, Warehouse Supervisor"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Portal Role</Label>
                    <Select
                      value={formData.role}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PORTAL_ROLES.map(role => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Level</Label>
                    <Select
                      value={formData.user_level}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, user_level: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {USER_LEVELS.map(level => (
                          <SelectItem key={level.value} value={level.value}>
                            {level.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>User Status</Label>
                  <Select
                    value={formData.user_status}
                    onValueChange={(value: 'initiated' | 'active' | 'inactive' | 'deactivated') => 
                      setFormData(prev => ({ ...prev, user_status: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {USER_STATUSES.map(status => (
                        <SelectItem key={status.value} value={status.value}>
                          <div className="flex items-center gap-2">
                            <status.icon className="h-4 w-4" />
                            {status.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Initiated = Email sent, Active = Using portal, Inactive = 1 month no login, Deactivated = 2 months no login
                  </p>
                </div>

                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">{editingUser ? 'Reset Password' : 'Set Login Password'}</Label>
                    <span className="text-xs text-muted-foreground">(Optional)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {editingUser 
                      ? 'Set a new password for this user.' 
                      : 'If set, the user can log in immediately after creation.'}
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="form_password">Password</Label>
                    <div className="relative">
                      <Input
                        id="form_password"
                        type={showFormPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Min 6 characters"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowFormPassword(!showFormPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showFormPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {formData.password && (
                    <div className="space-y-2">
                      <Label htmlFor="form_confirmPassword">Confirm Password</Label>
                      <div className="relative">
                        <Input
                          id="form_confirmPassword"
                          type={showFormConfirmPassword ? 'text' : 'password'}
                          value={formData.confirmPassword}
                          onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                          placeholder="Confirm password"
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowFormConfirmPassword(!showFormConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showFormConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => {
                    setDialogOpen(false);
                    resetForm();
                  }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving...' : (editingUser ? 'Update User' : 'Create User')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No portal users yet</p>
            <p className="text-xs mt-1">Add users to give them access to the distributor portal</p>
          </div>
        ) : (
          <div className="space-y-3">
            {users.map((user) => (
              <div 
                key={user.id} 
                className="border rounded-lg p-3 bg-card hover:shadow-sm transition-shadow"
              >
                {/* User Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{user.full_name}</p>
                      <Badge className={getRoleBadgeColor(user.role)}>
                        {PORTAL_ROLES.find(r => r.value === user.role)?.label || user.role}
                      </Badge>
                    </div>
                    {user.designation && (
                      <p className="text-xs text-muted-foreground mt-0.5">{user.designation}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Active</span>
                      <Switch
                        checked={user.is_active}
                        onCheckedChange={() => toggleUserStatus(user.id, user.is_active)}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Can Deliver</span>
                      <Switch
                        checked={!!user.can_deliver}
                        onCheckedChange={() => toggleCanDeliver(user.id, !!user.can_deliver)}
                      />
                    </div>
                  </div>
                </div>

                {/* Contact Info */}
                <div className="space-y-1 mb-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </p>
                  {user.phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Phone className="h-3 w-3 shrink-0" />
                      {user.phone}
                    </p>
                  )}
                </div>

                {/* Status Row */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {getStatusBadge(user.user_status || 'initiated')}
                  {user.is_active ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                      Enabled
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800">
                      Pending
                    </Badge>
                  )}
                  {user.user_level && (
                    <span className="text-xs text-muted-foreground">
                      {USER_LEVELS.find(l => l.value === user.user_level)?.label || user.user_level}
                    </span>
                  )}
                </div>

                {/* Meta Info */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 flex-wrap">
                  {user.email_sent_at && (
                    <span>Email sent: {format(new Date(user.email_sent_at), 'MMM d')}</span>
                  )}
                  {user.last_login_at && (
                    <span>Last login: {format(new Date(user.last_login_at), 'MMM d')}</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 flex-1"
                    onClick={() => sendInviteEmail(user)}
                    disabled={sendingInvite === user.id}
                  >
                    <Send className={`h-3.5 w-3.5 ${sendingInvite === user.id ? 'animate-pulse' : ''}`} />
                    <span className="hidden xs:inline">Send Invite</span>
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 flex-1"
                    onClick={() => loginAsUser(user)}
                    disabled={impersonating === user.id}
                  >
                    <LogIn className={`h-3.5 w-3.5 ${impersonating === user.id ? 'animate-pulse' : ''}`} />
                    <span className="hidden xs:inline">Portal</span>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => handleEdit(user)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => {
                      setUserToDelete(user);
                      setDeleteConfirmOpen(true);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Portal User</AlertDialogTitle>
            <AlertDialogDescription>
              {userToDelete?.auth_user_id ? (
                <>
                  This user has an active portal account. They will be <strong>deactivated</strong> instead of deleted.
                  Their login will be disabled but their data will be preserved.
                </>
              ) : (
                <>
                  Are you sure you want to delete <strong>{userToDelete?.full_name}</strong>? 
                  This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUserToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {userToDelete?.auth_user_id ? 'Deactivate' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Set Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={(open) => {
        setPasswordDialogOpen(open);
        if (!open) {
          setPasswordUser(null);
          setPasswordForm({ password: '', confirmPassword: '' });
          setShowPassword(false);
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Portal Password</DialogTitle>
          </DialogHeader>
          {passwordUser && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Set login password for <strong>{passwordUser.full_name}</strong> ({passwordUser.email})
              </p>
              <div className="space-y-2">
                <Label htmlFor="set-password">Password</Label>
                <div className="relative">
                  <Input
                    id="set-password"
                    type={showPassword ? 'text' : 'password'}
                    value={passwordForm.password}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Min 6 characters"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="Re-enter password"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSetPassword} disabled={settingPassword}>
                  {settingPassword ? 'Setting...' : 'Set Password'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
    </div>
  );
}

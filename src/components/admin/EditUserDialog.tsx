import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, Copy, Key, Check, AlertTriangle, ChevronsUpDown, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
interface User {
  id: string;
  email: string;
  username: string;
  full_name: string;
  phone_number: string;
  role: 'admin' | 'user';
}

interface SecurityProfile {
  id: string;
  name: string;
}

interface Manager {
  id: string;
  full_name: string;
  username: string;
}

interface EmployeeData {
  hq: string;
  address: string;
  education: string;
  monthly_salary: string;
  daily_da_allowance: string;
  date_of_joining: string;
  date_of_exit: string;
  emergency_contact_number: string;
  manager_id: string;
  secondary_manager_id: string;
}

interface EditUserDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const EditUserDialog: React.FC<EditUserDialogProps> = ({ user, open, onOpenChange, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [securityProfiles, setSecurityProfiles] = useState<SecurityProfile[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [formData, setFormData] = useState({
    full_name: '',
    username: '',
    phone_number: '',
  });
  const [employeeData, setEmployeeData] = useState<EmployeeData>({
    hq: '',
    address: '',
    education: '',
    monthly_salary: '',
    daily_da_allowance: '',
    date_of_joining: '',
    date_of_exit: '',
    emergency_contact_number: '',
    manager_id: '',
    secondary_manager_id: '',
  });

  // Manager search state
  const [primaryManagerSearch, setPrimaryManagerSearch] = useState('');
  const [primaryManagerOpen, setPrimaryManagerOpen] = useState(false);
  const [secondaryManagerSearch, setSecondaryManagerSearch] = useState('');
  const [secondaryManagerOpen, setSecondaryManagerOpen] = useState(false);

  // Password reset state
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  useEffect(() => {
    if (open && user) {
      fetchData();
      // Reset password state when dialog opens
      setNewPassword('');
      setShowPassword(false);
      setRequirePasswordChange(true);
      setCopiedPassword(false);
    }
  }, [open, user]);

  const fetchData = async () => {
    if (!user) return;

    try {
      // Fetch security profiles
      const { data: profiles } = await supabase
        .from('security_profiles')
        .select('id, name')
        .order('name');
      
      setSecurityProfiles(profiles || []);

      // Fetch managers
      const { data: managerList } = await supabase
        .from('profiles')
        .select('id, full_name, username')
        .neq('id', user.id)
        .order('full_name');
      
      setManagers(managerList || []);

      // Fetch user's current profile assignment
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('profile_id')
        .eq('user_id', user.id)
        .single();
      
      setSelectedProfileId(userProfile?.profile_id || '');

      // Fetch employee data
      const { data: empData } = await supabase
        .from('employees')
        .select('*')
        .eq('user_id', user.id)
        .single();

      setFormData({
        full_name: user.full_name || '',
        username: user.username || '',
        phone_number: user.phone_number || '',
      });

      setEmployeeData({
        hq: empData?.hq || '',
        address: empData?.address || '',
        education: empData?.education || '',
        monthly_salary: empData?.monthly_salary?.toString() || '',
        daily_da_allowance: empData?.daily_da_allowance?.toString() || '',
        date_of_joining: empData?.date_of_joining || '',
        date_of_exit: empData?.date_of_exit || '',
        emergency_contact_number: empData?.emergency_contact_number || '',
        manager_id: empData?.manager_id || '',
        secondary_manager_id: empData?.secondary_manager_id || '',
      });
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const generateTemporaryPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const specialChars = '!@#$%&*';
    let password = '';
    
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    password += specialChars.charAt(Math.floor(Math.random() * specialChars.length));
    for (let i = 0; i < 3; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    setNewPassword(password);
    setShowPassword(true);
    setCopiedPassword(false);
  };

  const copyPasswordToClipboard = async () => {
    if (!newPassword) return;
    try {
      await navigator.clipboard.writeText(newPassword);
      setCopiedPassword(true);
      toast.success('Password copied to clipboard');
      setTimeout(() => setCopiedPassword(false), 3000);
    } catch (error) {
      toast.error('Failed to copy password');
    }
  };

  const handleResetPassword = async () => {
    if (!user || !newPassword) {
      toast.error('Please enter or generate a password');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setResettingPassword(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          new_password: newPassword,
          require_password_change: requirePasswordChange,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      toast.success('Password reset successfully! Share the new password with the user.');
      setNewPassword('');
      setShowPassword(false);
    } catch (error: any) {
      console.error('Error resetting password:', error);
      toast.error(error.message || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Update profile - exclude sensitive fields (phone_number) to avoid
      // trigger blocking admin access to sensitive profile data
      const profileUpdate: Record<string, any> = {
        full_name: formData.full_name,
        username: formData.username,
      };
      
      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', user.id);

      if (profileError) throw profileError;

      // If a manager is selected, ensure the manager has an employee record
      if (employeeData.manager_id) {
        const { data: managerEmp } = await supabase
          .from('employees')
          .select('user_id')
          .eq('user_id', employeeData.manager_id)
          .single();
        
        // Create employee record for manager if it doesn't exist
        if (!managerEmp) {
          await supabase
            .from('employees')
            .insert({ user_id: employeeData.manager_id });
        }
      }

      // If secondary manager is selected, ensure they have an employee record
      if (employeeData.secondary_manager_id) {
        const { data: secondaryManagerEmp } = await supabase
          .from('employees')
          .select('user_id')
          .eq('user_id', employeeData.secondary_manager_id)
          .single();
        
        if (!secondaryManagerEmp) {
          await supabase
            .from('employees')
            .insert({ user_id: employeeData.secondary_manager_id });
        }
      }

      // Update employee data for the current user
      const { error: empError } = await supabase
        .from('employees')
        .upsert({
          user_id: user.id,
          hq: employeeData.hq || null,
          address: employeeData.address || null,
          education: employeeData.education || null,
          monthly_salary: employeeData.monthly_salary ? parseFloat(employeeData.monthly_salary) : null,
          daily_da_allowance: employeeData.daily_da_allowance ? parseFloat(employeeData.daily_da_allowance) : null,
          date_of_joining: employeeData.date_of_joining || null,
          date_of_exit: employeeData.date_of_exit || null,
          emergency_contact_number: employeeData.emergency_contact_number || null,
          manager_id: employeeData.manager_id || null,
          secondary_manager_id: employeeData.secondary_manager_id || null,
        }, { onConflict: 'user_id' });

      if (empError) throw empError;

      // Update security profile assignment
      if (selectedProfileId) {
        // First delete existing assignment
        await supabase
          .from('user_profiles')
          .delete()
          .eq('user_id', user.id);

        // Then insert new assignment
        const { error: upError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: user.id,
            profile_id: selectedProfileId,
          });

        if (upError) throw upError;
      }

      toast.success('User updated successfully');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast.error(error.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit User: {user.full_name || user.username}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="managers">Managers</TabsTrigger>
            <TabsTrigger value="password">Reset Password</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={formData.full_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={formData.username}
                  onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input
                  value={formData.phone_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone_number: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user.email} disabled className="bg-muted" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Role (Security Profile)</Label>
              <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {securityProfiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>


          <TabsContent value="managers" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Primary Manager (Reports To)</Label>
                <Popover open={primaryManagerOpen} onOpenChange={setPrimaryManagerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      {employeeData.manager_id
                        ? (managers.find(m => m.id === employeeData.manager_id)?.full_name || managers.find(m => m.id === employeeData.manager_id)?.username || 'Selected')
                        : "No Manager"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[9999]" align="start">
                    <div className="flex items-center border-b px-3">
                      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                      <input
                        className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                        placeholder="Search manager..."
                        value={primaryManagerSearch}
                        onChange={(e) => setPrimaryManagerSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-[200px] overflow-y-auto p-1">
                      <div
                        className={cn(
                          "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                          !employeeData.manager_id && "bg-accent"
                        )}
                        onClick={() => {
                          setEmployeeData(prev => ({ ...prev, manager_id: '' }));
                          setPrimaryManagerOpen(false);
                          setPrimaryManagerSearch('');
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", !employeeData.manager_id ? "opacity-100" : "opacity-0")} />
                        No Manager
                      </div>
                      {managers
                        .filter(m => `${m.full_name} ${m.username}`.toLowerCase().includes(primaryManagerSearch.toLowerCase()))
                        .map((manager) => (
                          <div
                            key={manager.id}
                            className={cn(
                              "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                              employeeData.manager_id === manager.id && "bg-accent"
                            )}
                            onClick={() => {
                              setEmployeeData(prev => ({ ...prev, manager_id: manager.id }));
                              setPrimaryManagerOpen(false);
                              setPrimaryManagerSearch('');
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", employeeData.manager_id === manager.id ? "opacity-100" : "opacity-0")} />
                            {manager.full_name || manager.username}
                          </div>
                        ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">This determines the user's position in the org hierarchy</p>
              </div>

              <div className="space-y-2">
                <Label>Secondary Manager</Label>
                <Popover open={secondaryManagerOpen} onOpenChange={setSecondaryManagerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      {employeeData.secondary_manager_id
                        ? (managers.find(m => m.id === employeeData.secondary_manager_id)?.full_name || managers.find(m => m.id === employeeData.secondary_manager_id)?.username || 'Selected')
                        : "No Secondary Manager"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[9999]" align="start">
                    <div className="flex items-center border-b px-3">
                      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                      <input
                        className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                        placeholder="Search manager..."
                        value={secondaryManagerSearch}
                        onChange={(e) => setSecondaryManagerSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-[200px] overflow-y-auto p-1">
                      <div
                        className={cn(
                          "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                          !employeeData.secondary_manager_id && "bg-accent"
                        )}
                        onClick={() => {
                          setEmployeeData(prev => ({ ...prev, secondary_manager_id: '' }));
                          setSecondaryManagerOpen(false);
                          setSecondaryManagerSearch('');
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", !employeeData.secondary_manager_id ? "opacity-100" : "opacity-0")} />
                        No Secondary Manager
                      </div>
                      {managers
                        .filter(m => `${m.full_name} ${m.username}`.toLowerCase().includes(secondaryManagerSearch.toLowerCase()))
                        .map((manager) => (
                          <div
                            key={manager.id}
                            className={cn(
                              "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                              employeeData.secondary_manager_id === manager.id && "bg-accent"
                            )}
                            onClick={() => {
                              setEmployeeData(prev => ({ ...prev, secondary_manager_id: manager.id }));
                              setSecondaryManagerOpen(false);
                              setSecondaryManagerSearch('');
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", employeeData.secondary_manager_id === manager.id ? "opacity-100" : "opacity-0")} />
                            {manager.full_name || manager.username}
                          </div>
                        ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">Optional dotted-line reporting relationship</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="password" className="space-y-4 mt-4">
            <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-600">
                This will replace the user's current password. Make sure to share the new password with them securely.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>New Password</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setCopiedPassword(false);
                      }}
                      placeholder="Enter new password or generate one"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={copyPasswordToClipboard}
                    disabled={!newPassword}
                    title="Copy password"
                  >
                    {copiedPassword ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={generateTemporaryPassword}
                    title="Generate password"
                  >
                    <Key className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Password must be at least 6 characters long
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="requirePasswordChange"
                  checked={requirePasswordChange}
                  onCheckedChange={(checked) => setRequirePasswordChange(checked === true)}
                />
                <Label htmlFor="requirePasswordChange" className="text-sm font-normal cursor-pointer">
                  Require password change on first login
                </Label>
              </div>

              <Button 
                onClick={handleResetPassword}
                disabled={resettingPassword || !newPassword}
                className="w-full"
              >
                {resettingPassword && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Reset Password
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-6 flex justify-end">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditUserDialog;

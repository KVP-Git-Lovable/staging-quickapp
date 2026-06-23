import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Users, Building, Mail, Phone, Calendar, Truck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface PortalUser {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  user_level: string;
  user_status: string;
  is_active: boolean;
  can_deliver: boolean;
  last_login_at: string | null;
  created_at: string;
  distributor_id: string;
  distributor_name?: string;
}

interface PortalUsersTabProps {
  searchQuery: string;
}

export const PortalUsersTab = ({ searchQuery }: PortalUsersTabProps) => {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [distributorFilter, setDistributorFilter] = useState('all');
  const [distributors, setDistributors] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load distributors for filter
      const { data: distributorData } = await supabase
        .from('distributors')
        .select('id, name')
        .order('name');
      
      setDistributors(distributorData || []);

      // Load users with distributor names
      const { data: userData, error } = await supabase
        .from('distributor_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Map distributor names
      const usersWithDistributors = (userData || []).map(user => ({
        ...user,
        distributor_name: distributorData?.find(d => d.id === user.distributor_id)?.name || 'Unknown'
      }));

      setUsers(usersWithDistributors);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string, isActive: boolean) => {
    if (!isActive) return <Badge variant="outline" className="bg-gray-100 text-gray-600">Inactive</Badge>;
    
    const config: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      initiated: 'bg-blue-100 text-blue-700',
      pending: 'bg-yellow-100 text-yellow-700',
    };
    return <Badge className={config[status] || 'bg-gray-100'}>{status}</Badge>;
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.phone?.includes(searchQuery) ||
      user.distributor_name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || user.user_status === statusFilter;
    const matchesDistributor = distributorFilter === 'all' || user.distributor_id === distributorFilter;
    
    return matchesSearch && matchesStatus && matchesDistributor;
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="initiated">Initiated</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>

          <Select value={distributorFilter} onValueChange={setDistributorFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Distributor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Distributors</SelectItem>
              {distributors.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto text-sm text-muted-foreground">
            {filteredUsers.length} users found
          </div>
        </div>

        {/* Table */}
        {filteredUsers.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Distributor</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">
                    <span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> Can Deliver</span>
                  </TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{user.full_name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {user.email}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {user.phone}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{user.distributor_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(user.user_status, user.is_active)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(user.user_status, user.is_active)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={!!user.can_deliver}
                        onCheckedChange={async (checked) => {
                          // Optimistic
                          setUsers(prev => prev.map(u => u.id === user.id ? { ...u, can_deliver: checked } : u));
                          const { error } = await supabase
                            .from('distributor_users')
                            .update({ can_deliver: checked } as any)
                            .eq('id', user.id);
                          if (error) {
                            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, can_deliver: !checked } : u));
                            toast.error('Failed to update delivery access');
                          } else {
                            toast.success(checked ? 'Delivery access granted' : 'Delivery access removed');
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {user.last_login_at ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(user.last_login_at), 'dd MMM, HH:mm')}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(user.created_at), 'dd MMM yyyy')}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

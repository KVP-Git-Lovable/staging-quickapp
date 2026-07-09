import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { 
  ArrowLeft, 
  Users, 
  Package, 
  ClipboardList, 
  AlertCircle, 
  Lightbulb, 
  HelpCircle,
  TrendingUp,
  Search,
  Building,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

// Sub-components
import { PortalUsersTab } from '@/components/admin/distributor-portal/PortalUsersTab';
import { PortalOrdersTab } from '@/components/admin/distributor-portal/PortalOrdersTab';
import { PortalInventoryTab } from '@/components/admin/distributor-portal/PortalInventoryTab';
import { PortalClaimsTab } from '@/components/admin/distributor-portal/PortalClaimsTab';
import { PortalSupportTab } from '@/components/admin/distributor-portal/PortalSupportTab';
import { PortalIdeasTab } from '@/components/admin/distributor-portal/PortalIdeasTab';

interface DashboardStats {
  totalDistributors: number;
  activeUsers: number;
  pendingOrders: number;
  pendingClaims: number;
  openSupport: number;
  pendingIdeas: number;
  totalInventoryValue: number;
}

const DistributorPortalAdmin = () => {
  const navigate = useNavigate();
  const { hasAdminAccess, loading: authLoading } = useAdminAccess();
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState<DashboardStats>({
    totalDistributors: 0,
    activeUsers: 0,
    pendingOrders: 0,
    pendingClaims: 0,
    openSupport: 0,
    pendingIdeas: 0,
    totalInventoryValue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!authLoading && !hasAdminAccess) {
      navigate('/dashboard');
      return;
    }
    loadStats();
  }, [authLoading, hasAdminAccess, navigate]);

  const loadStats = async () => {
    setLoading(true);
    try {
      // Load all stats in parallel
      const [
        distributorsRes,
        usersRes,
        ordersRes,
        claimsRes,
        supportRes,
        ideasRes,
        inventoryRes,
      ] = await Promise.all([
        supabase.from('distributors').select('id', { count: 'exact', head: true }),
        supabase.from('distributor_users').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('primary_orders').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'confirmed', 'processing']),
        supabase.from('distributor_claims').select('id', { count: 'exact', head: true }).in('status', ['pending', 'under_review']),
        supabase.from('distributor_support_requests').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
        supabase.from('distributor_ideas').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'under_review']),
        supabase.from('distributor_inventory').select('total_value'),
      ]);

      const totalInventoryValue = inventoryRes.data?.reduce((sum, item) => sum + (item.total_value || 0), 0) || 0;

      setStats({
        totalDistributors: distributorsRes.count || 0,
        activeUsers: usersRes.count || 0,
        pendingOrders: ordersRes.count || 0,
        pendingClaims: claimsRes.count || 0,
        openSupport: supportRes.count || 0,
        pendingIdeas: ideasRes.count || 0,
        totalInventoryValue,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
      toast.error('Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </Layout>
    );
  }

  const statCards = [
    { label: 'Total Distributors', value: stats.totalDistributors, icon: Building, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Active Users', value: stats.activeUsers, icon: Users, color: 'text-green-600', bg: 'bg-green-100' },
    { label: 'Pending Orders', value: stats.pendingOrders, icon: Package, color: 'text-orange-600', bg: 'bg-orange-100' },
    { label: 'Pending Claims', value: stats.pendingClaims, icon: ClipboardList, color: 'text-purple-600', bg: 'bg-purple-100' },
    { label: 'Open Support', value: stats.openSupport, icon: HelpCircle, color: 'text-red-600', bg: 'bg-red-100' },
    { label: 'Pending Ideas', value: stats.pendingIdeas, icon: Lightbulb, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  ];

  return (
    <Layout>
      <div className="min-h-screen bg-background p-4">
        <div className="w-full space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Distributor Portal Admin</h1>
                <p className="text-muted-foreground">Manage all distributor portal activities</p>
              </div>
            </div>
            <Button variant="outline" onClick={loadStats} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {statCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.label} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${stat.bg}`}>
                        <Icon className={`h-5 w-5 ${stat.color}`} />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{stat.value}</p>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Inventory Value Card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Inventory Value (All Distributors)</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      ₹{stats.totalInventoryValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs for different sections */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <TabsList className="grid grid-cols-3 lg:grid-cols-6 w-full lg:w-auto">
                <TabsTrigger value="users" className="text-xs sm:text-sm">
                  <Users className="h-4 w-4 mr-1 hidden sm:inline" />
                  Users
                </TabsTrigger>
                <TabsTrigger value="orders" className="text-xs sm:text-sm">
                  <Package className="h-4 w-4 mr-1 hidden sm:inline" />
                  Orders
                </TabsTrigger>
                <TabsTrigger value="inventory" className="text-xs sm:text-sm">
                  <ClipboardList className="h-4 w-4 mr-1 hidden sm:inline" />
                  Inventory
                </TabsTrigger>
                <TabsTrigger value="claims" className="text-xs sm:text-sm">
                  <AlertCircle className="h-4 w-4 mr-1 hidden sm:inline" />
                  Claims
                </TabsTrigger>
                <TabsTrigger value="support" className="text-xs sm:text-sm">
                  <HelpCircle className="h-4 w-4 mr-1 hidden sm:inline" />
                  Support
                </TabsTrigger>
                <TabsTrigger value="ideas" className="text-xs sm:text-sm">
                  <Lightbulb className="h-4 w-4 mr-1 hidden sm:inline" />
                  Ideas
                </TabsTrigger>
              </TabsList>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <TabsContent value="users">
              <PortalUsersTab searchQuery={searchQuery} />
            </TabsContent>

            <TabsContent value="orders">
              <PortalOrdersTab searchQuery={searchQuery} />
            </TabsContent>

            <TabsContent value="inventory">
              <PortalInventoryTab searchQuery={searchQuery} />
            </TabsContent>

            <TabsContent value="claims">
              <PortalClaimsTab searchQuery={searchQuery} />
            </TabsContent>

            <TabsContent value="support">
              <PortalSupportTab searchQuery={searchQuery} />
            </TabsContent>

            <TabsContent value="ideas">
              <PortalIdeasTab searchQuery={searchQuery} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
};

export default DistributorPortalAdmin;

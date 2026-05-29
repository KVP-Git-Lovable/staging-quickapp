import React, { useState } from 'react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { Navigate, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Package, ArrowLeft, CalendarDays, MapPin, DollarSign, BarChart3, MessageSquareText, Navigation, Store, Truck, Flag, Trophy, FileText, CreditCard, Lock, Bell, Trash2, Building2, Gift, Target, Map, Percent, Database, Ruler, Route } from 'lucide-react';
import { SearchInput } from '@/components/SearchInput';

const AdminControls = () => {
  const { hasAdminAccess, permittedAdminPaths, loading } = useAdminAccess();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

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

  const adminModules = [
    { title: "Price Book Management", description: "Create and manage price books for distributors and territories", icon: DollarSign, color: "emerald", path: "/admin/price-books" },
    { title: "User Management", description: "Manage user accounts, roles, and permissions", icon: Users, color: "orange", path: "/admin#users" },
    { title: "Attendance Management", description: "Manage user attendance, holidays, and leave approvals", icon: CalendarDays, color: "purple", path: "/attendance-management" },
    { title: "Products", description: "Manage your product catalog, categories, and SKUs", icon: Package, color: "blue", path: "/product-management" },
    { title: "Unit of Measure Master", description: "Manage measurement units, defaults, and ordering for the product catalog", icon: Ruler, color: "sky", path: "/admin/uom-master" },
    { title: "Beat Coordinator", description: "Plan beats, cover leave, and optimise routes for your team", icon: Route, color: "indigo", path: "/admin/beat-coordinator" },
    { title: "Scheme Master", description: "Create and manage promotional schemes, offers, and discounts", icon: Gift, color: "amber", path: "/scheme-management" },
    { title: "Vendors", description: "Manage vendor relationships and approvals", icon: Users, color: "green", path: "/vendors" },
    { title: "Territories & Distributors", description: "Manage territory assignments and distributor network", icon: MapPin, color: "indigo", path: "/territories-and-distributors" },
    { title: "Expense Management", description: "Track team productivity and expense analytics", icon: DollarSign, color: "yellow", path: "/admin-expense-management" },
    { title: "Feedback Management", description: "View retailer feedback, competition insights, and branding requests", icon: MessageSquareText, color: "purple", path: "/feedback-management" },
    { title: "Operations", description: "Monitor real-time operations, check-ins, orders, and stock data", icon: BarChart3, color: "red", path: "/operations" },
    { title: "GPS Track Management", description: "Monitor live locations and track user movements from login to logout", icon: Navigation, color: "cyan", path: "/gps-track-management" },
    { title: "Retail Management", description: "Verify and manage all retailers across the system", icon: Store, color: "teal", path: "/retail-management" },
    { title: "Van Sales Management", description: "Manage vans, drivers, and van-based sales operations", icon: Truck, color: "emerald", path: "/van-sales-management" },
    { title: "Security & Access", description: "Manage user profiles, permissions, and data access control", icon: Lock, color: "indigo", path: "/security-management" },
    { title: "Feature Management", description: "Control which features are visible and active for users", icon: Flag, color: "violet", path: "/feature-management" },
    { title: "Gamification", description: "Configure games, points, actions, and manage redemptions", icon: Trophy, color: "amber", path: "/gamification-admin" },
    { title: "Retailer Loyalty", description: "Manage retailer loyalty programs, points, and redemptions", icon: Trophy, color: "pink", path: "/retailer-loyalty-admin" },
    { title: "Company Profile", description: "Manage company details, bank information, and header branding", icon: Building2, color: "blue", path: "/company-profile" },
    { title: "Invoice Management", description: "Create and manage GST invoices with templates", icon: FileText, color: "cyan", path: "/invoice-management" },
    { title: "Credit Management", description: "Configure retailer credit scoring and limit management system", icon: CreditCard, color: "emerald", path: "/credit-management" },
    
    { title: "Notification Rules", description: "Configure event-based notification rules and triggers", icon: Bell, color: "rose", path: "/admin/notification-rules" },
    { title: "Recycle Bin Master", description: "Configure recycle bin settings and view permanent deletion logs", icon: Trash2, color: "rose", path: "/admin/recycle-bin" },
    { title: "Distributor Portal Admin", description: "Manage distributor portal users, orders, claims, support, and ideas", icon: Building2, color: "cyan", path: "/admin/distributor-portal" },
    { title: "Target Management", description: "Configure, assign, and track team targets with hierarchy cascade", icon: Target, color: "blue", path: "/admin/target-vs-actual" },
    { title: "Pincode Master", description: "Import and manage India PIN code reference data", icon: Map, color: "teal", path: "/admin/pincode-master" },
    { title: "Tax Master", description: "Configure GST/IGST tax rates and map to product SKUs", icon: Percent, color: "violet", path: "/admin/tax-master" },
    { title: "Retailer External Database", description: "Browse external grocery retailer data by state and city", icon: Database, color: "orange", path: "/admin/retailer-external-db" },
  ];

  // Filter modules based on permissions only - no special bypass
  const accessibleModules = adminModules.filter(module => permittedAdminPaths.has(module.path));

  const filteredModules = accessibleModules.filter(module => 
    module.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    module.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle p-4">
        <div className="max-w-6xl mx-auto space-y-6">
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
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">Admin Controls</h1>
            <p className="text-muted-foreground">Manage different aspects of your system</p>
          </div>
        </div>

        {/* Search */}
        <div className="max-w-md">
          <SearchInput 
            placeholder="Search admin modules..."
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </div>

        {/* Admin Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredModules.map((module) => {
            const Icon = module.icon;
            return (
              <Card 
                key={module.path}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate(module.path)}
              >
                <CardHeader className="text-center">
                  <div className={`mx-auto mb-4 p-4 bg-${module.color}-100 rounded-full w-16 h-16 flex items-center justify-center`}>
                    <Icon className={`h-8 w-8 text-${module.color}-600`} />
                  </div>
                  <CardTitle>{module.title}</CardTitle>
                  <CardDescription>{module.description}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}

          {filteredModules.length === 0 && (
            <div className="col-span-full text-center py-12">
              <p className="text-muted-foreground">No modules found matching "{searchQuery}"</p>
            </div>
          )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AdminControls;
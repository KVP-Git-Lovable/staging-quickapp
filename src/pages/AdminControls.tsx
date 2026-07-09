import React, { useState, useMemo } from 'react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { Navigate, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Package, CalendarDays, MapPin, DollarSign, BarChart3, MessageSquareText, Navigation, Store, Truck, Flag, Trophy, FileText, CreditCard, Lock, Bell, Trash2, Building2, Gift, Target, Map as MapIcon, Percent, Database, Ruler, Route, Activity, ChevronDown, Folder } from 'lucide-react';
import { SearchInput } from '@/components/SearchInput';
import { NavCustomizeDialog } from '@/components/navigation/NavCustomizeDialog';
import { useNavCustomization, NavItem } from '@/hooks/useNavCustomization';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const COLOR_TO_GRADIENT: Record<string, string> = {
  emerald: 'from-emerald-500 to-emerald-600',
  orange: 'from-orange-500 to-orange-600',
  purple: 'from-purple-500 to-purple-600',
  blue: 'from-blue-500 to-blue-600',
  sky: 'from-sky-500 to-sky-600',
  indigo: 'from-indigo-500 to-indigo-600',
  amber: 'from-amber-500 to-amber-600',
  green: 'from-green-500 to-green-600',
  yellow: 'from-yellow-500 to-yellow-600',
  red: 'from-red-500 to-red-600',
  cyan: 'from-cyan-500 to-cyan-600',
  teal: 'from-teal-500 to-teal-600',
  violet: 'from-violet-500 to-violet-600',
  rose: 'from-rose-500 to-rose-600',
  pink: 'from-pink-500 to-pink-600',
};

const AdminControls = () => {
  const { hasAdminAccess, permittedAdminPaths, loading } = useAdminAccess();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const adminModules = useMemo(() => [
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
    { title: "Pincode Master", description: "Import and manage India PIN code reference data", icon: MapIcon, color: "teal", path: "/admin/pincode-master" },
    { title: "Tax Master", description: "Configure GST/IGST tax rates and map to product SKUs", icon: Percent, color: "violet", path: "/admin/tax-master" },
    { title: "Activity Type Master", description: "Configure activity types, weights, and productivity settings", icon: Activity, color: "teal", path: "/admin/activity-types" },
    { title: "Activity Coordinator", description: "View team activities and assign new ones", icon: Activity, color: "teal", path: "/admin/activity-coordinator" },
    { title: "Retailer External Database", description: "Browse external grocery retailer data by state and city", icon: Database, color: "orange", path: "/admin/retailer-external-db" },
  ], []);

  const ALWAYS_VISIBLE_FOR_ADMIN = new Set(['/admin/uom-master', '/admin/beat-coordinator']);

  const accessibleModules = useMemo(
    () => adminModules.filter(m => permittedAdminPaths.has(m.path) || ALWAYS_VISIBLE_FOR_ADMIN.has(m.path)),
    [adminModules, permittedAdminPaths]
  );

  const descriptionByPath = useMemo(() => {
    const m = new Map<string, string>();
    accessibleModules.forEach(mod => m.set(mod.path, mod.description));
    return m;
  }, [accessibleModules]);

  // Build NavItem list for customization hook (id === path)
  const navItems: NavItem[] = useMemo(
    () => accessibleModules.map(m => ({
      id: m.path,
      label: m.title,
      href: m.path,
      icon: m.icon,
      color: COLOR_TO_GRADIENT[m.color] ?? 'from-slate-500 to-slate-600',
    })),
    [accessibleModules]
  );

  const {
    customization,
    createGroup,
    deleteGroup,
    renameGroup,
    moveItemToGroup,
    reorderItems,
    reorderGroups,
    resetToDefault,
    getOrganizedItems,
  } = useNavCustomization(navItems);

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

  const organized = getOrganizedItems();
  const q = searchQuery.toLowerCase().trim();
  const matches = (item: NavItem) =>
    !q ||
    item.label.toLowerCase().includes(q) ||
    (descriptionByPath.get(item.id) ?? '').toLowerCase().includes(q);

  const filteredGroups = organized.groups
    .map(g => ({ ...g, items: g.items.filter(matches) }))
    .filter(g => g.items.length > 0);
  const filteredUngrouped = organized.ungroupedItems.filter(matches);
  const totalVisible = filteredGroups.reduce((n, g) => n + g.items.length, 0) + filteredUngrouped.length;

  const renderCard = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <Card
        key={item.id}
        className="cursor-pointer hover:shadow-lg transition-shadow"
        onClick={() => navigate(item.href)}
      >
        <CardHeader className="text-center">
          <div className={`mx-auto mb-4 rounded-full w-16 h-16 flex items-center justify-center bg-gradient-to-r ${item.color} shadow-md`}>
            <Icon className="h-8 w-8 text-white" />
          </div>
          <CardTitle>{item.label}</CardTitle>
          <CardDescription>{descriptionByPath.get(item.id)}</CardDescription>
        </CardHeader>
      </Card>
    );
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle p-4">
        <div className="w-full space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground">Admin Controls</h1>
              <p className="text-muted-foreground">Manage different aspects of your system</p>
            </div>
            <NavCustomizeDialog
              defaultItems={navItems}
              customization={customization}
              onCreateGroup={createGroup}
              onDeleteGroup={deleteGroup}
              onRenameGroup={renameGroup}
              onMoveItemToGroup={moveItemToGroup}
              onReorderItems={reorderItems}
              onReorderGroups={reorderGroups}
              onResetToDefault={resetToDefault}
              getOrganizedItems={getOrganizedItems}
            />
          </div>

          {/* Search */}
          <div className="max-w-md">
            <SearchInput
              placeholder="Search admin modules..."
              value={searchQuery}
              onChange={setSearchQuery}
            />
          </div>

          {/* Groups */}
          {filteredGroups.map(group => (
            <Collapsible key={group.id} defaultOpen={group.isExpanded}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors group">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-r from-slate-500 to-slate-600 shadow-sm">
                  <Folder className="h-4 w-4 text-white" />
                </div>
                <span className="text-base font-semibold flex-1 text-left">{group.name}</span>
                <span className="text-xs text-muted-foreground mr-1">{group.items.length}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6 pt-4">
                  {group.items.map(renderCard)}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}

          {/* Ungrouped */}
          {filteredUngrouped.length > 0 && (
            <div className="space-y-4">
              {filteredGroups.length > 0 && (
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Ungrouped</h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
                {filteredUngrouped.map(renderCard)}
              </div>
            </div>
          )}

          {totalVisible === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No modules found matching "{searchQuery}"</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default AdminControls;

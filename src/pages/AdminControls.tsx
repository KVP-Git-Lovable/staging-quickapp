import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('common');
  const { hasAdminAccess, permittedAdminPaths, loading } = useAdminAccess();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);

  const adminModules = useMemo(() => [
    { title: t('adminModules.priceBooks.title'), description: t('adminModules.priceBooks.desc'), icon: DollarSign, color: "emerald", path: "/admin/price-books" },
    { title: t('adminModules.admin.title'), description: t('adminModules.admin.desc'), icon: Users, color: "orange", path: "/admin#users" },
    { title: t('adminModules.attendanceManagement.title'), description: t('adminModules.attendanceManagement.desc'), icon: CalendarDays, color: "purple", path: "/attendance-management" },
    { title: t('adminModules.productManagement.title'), description: t('adminModules.productManagement.desc'), icon: Package, color: "blue", path: "/product-management" },
    { title: t('adminModules.uomMaster.title'), description: t('adminModules.uomMaster.desc'), icon: Ruler, color: "sky", path: "/admin/uom-master" },
    { title: t('adminModules.beatCoordinator.title'), description: t('adminModules.beatCoordinator.desc'), icon: Route, color: "indigo", path: "/admin/beat-coordinator" },
    { title: t('adminModules.schemeManagement.title'), description: t('adminModules.schemeManagement.desc'), icon: Gift, color: "amber", path: "/scheme-management" },
    { title: t('adminModules.vendors.title'), description: t('adminModules.vendors.desc'), icon: Users, color: "green", path: "/vendors" },
    { title: t('adminModules.territoriesAndDistributors.title'), description: t('adminModules.territoriesAndDistributors.desc'), icon: MapPin, color: "indigo", path: "/territories-and-distributors" },
    { title: t('adminModules.adminExpenseManagement.title'), description: t('adminModules.adminExpenseManagement.desc'), icon: DollarSign, color: "yellow", path: "/admin-expense-management" },
    { title: t('adminModules.feedbackManagement.title'), description: t('adminModules.feedbackManagement.desc'), icon: MessageSquareText, color: "purple", path: "/feedback-management" },
    { title: t('adminModules.operations.title'), description: t('adminModules.operations.desc'), icon: BarChart3, color: "red", path: "/operations" },
    { title: t('adminModules.gpsTrackManagement.title'), description: t('adminModules.gpsTrackManagement.desc'), icon: Navigation, color: "cyan", path: "/gps-track-management" },
    { title: t('adminModules.retailManagement.title'), description: t('adminModules.retailManagement.desc'), icon: Store, color: "teal", path: "/retail-management" },
    { title: t('adminModules.vanSalesManagement.title'), description: t('adminModules.vanSalesManagement.desc'), icon: Truck, color: "emerald", path: "/van-sales-management" },
    { title: t('adminModules.securityManagement.title'), description: t('adminModules.securityManagement.desc'), icon: Lock, color: "indigo", path: "/security-management" },
    { title: t('adminModules.featureManagement.title'), description: t('adminModules.featureManagement.desc'), icon: Flag, color: "violet", path: "/feature-management" },
    { title: t('adminModules.gamificationAdmin.title'), description: t('adminModules.gamificationAdmin.desc'), icon: Trophy, color: "amber", path: "/gamification-admin" },
    { title: t('adminModules.retailerLoyaltyAdmin.title'), description: t('adminModules.retailerLoyaltyAdmin.desc'), icon: Trophy, color: "pink", path: "/retailer-loyalty-admin" },
    { title: t('adminModules.companyProfile.title'), description: t('adminModules.companyProfile.desc'), icon: Building2, color: "blue", path: "/company-profile" },
    { title: t('adminModules.invoiceManagement.title'), description: t('adminModules.invoiceManagement.desc'), icon: FileText, color: "cyan", path: "/invoice-management" },
    { title: t('adminModules.creditManagement.title'), description: t('adminModules.creditManagement.desc'), icon: CreditCard, color: "emerald", path: "/credit-management" },
    { title: t('adminModules.notificationRules.title'), description: t('adminModules.notificationRules.desc'), icon: Bell, color: "rose", path: "/admin/notification-rules" },
    { title: t('adminModules.recycleBin.title'), description: t('adminModules.recycleBin.desc'), icon: Trash2, color: "rose", path: "/admin/recycle-bin" },
    { title: t('adminModules.distributorPortal.title'), description: t('adminModules.distributorPortal.desc'), icon: Building2, color: "cyan", path: "/admin/distributor-portal" },
    { title: t('adminModules.targetVsActual.title'), description: t('adminModules.targetVsActual.desc'), icon: Target, color: "blue", path: "/admin/target-vs-actual" },
    { title: t('adminModules.pincodeMaster.title'), description: t('adminModules.pincodeMaster.desc'), icon: MapIcon, color: "teal", path: "/admin/pincode-master" },
    { title: t('adminModules.taxMaster.title'), description: t('adminModules.taxMaster.desc'), icon: Percent, color: "violet", path: "/admin/tax-master" },
    { title: t('adminModules.activityTypes.title'), description: t('adminModules.activityTypes.desc'), icon: Activity, color: "teal", path: "/admin/activity-types" },
    { title: t('adminModules.activityCoordinator.title'), description: t('adminModules.activityCoordinator.desc'), icon: Activity, color: "teal", path: "/admin/activity-coordinator" },
    { title: t('adminModules.retailerExternalDb.title'), description: t('adminModules.retailerExternalDb.desc'), icon: Database, color: "orange", path: "/admin/retailer-external-db" },
    { title: t('adminModules.syncHealth.title'), description: t('adminModules.syncHealth.desc'), icon: Activity, color: "red", path: "/admin/sync-health" },
  ], [t]);

  const ALWAYS_VISIBLE_FOR_ADMIN = new Set(['/admin/uom-master', '/admin/beat-coordinator', '/admin/sync-health']);

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

  const handleDropReorder = (
    groupId: string | null,
    items: NavItem[],
    fromId: string,
    toId: string
  ) => {
    if (fromId === toId) return;
    const ids = items.map(i => i.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from === -1 || to === -1) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    reorderItems(groupId, ids);
  };

  const renderCard = (item: NavItem, groupId: string | null, items: NavItem[]) => {
    const Icon = item.icon;
    const isDragged = draggedId === item.id;
    const isOver = dragOverId === item.id && draggedId !== item.id;
    return (
      <div
        key={item.id}
        draggable
        onDragStart={(e) => {
          setDraggedId(item.id);
          setDraggedGroupId(groupId);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', item.id);
        }}
        onDragOver={(e) => {
          if (draggedGroupId === groupId) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDragOverId(item.id);
          }
        }}
        onDragLeave={() => setDragOverId(prev => (prev === item.id ? null : prev))}
        onDrop={(e) => {
          e.preventDefault();
          if (draggedId && draggedGroupId === groupId) {
            handleDropReorder(groupId, items, draggedId, item.id);
          }
          setDraggedId(null);
          setDragOverId(null);
          setDraggedGroupId(null);
        }}
        onDragEnd={() => {
          setDraggedId(null);
          setDragOverId(null);
          setDraggedGroupId(null);
        }}
        className={`transition-all ${isDragged ? 'opacity-40 scale-95' : ''} ${isOver ? 'ring-2 ring-primary ring-offset-2 rounded-lg' : ''}`}
      >
        <Card
          className="cursor-pointer hover:shadow-lg transition-shadow h-full"
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
      </div>
    );
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle p-4">
        <div className="w-full space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground">{t('nav.adminControls')}</h1>
              <p className="text-muted-foreground">{t('adminControls.dragHint')}</p>
            </div>
          </div>

          {/* Search + Customize */}
          <div className="flex items-center gap-2 max-w-md">
            <div className="flex-1">
              <SearchInput
                placeholder={t('adminControls.searchPlaceholder')}
                value={searchQuery}
                onChange={setSearchQuery}
              />
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
                  {group.items.map(item => renderCard(item, group.id, group.items))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}

          {/* Ungrouped */}
          {filteredUngrouped.length > 0 && (
            <div className="space-y-4">
              {filteredGroups.length > 0 && (
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('adminControls.ungrouped')}</h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
                {filteredUngrouped.map(item => renderCard(item, null, filteredUngrouped))}
              </div>
            </div>
          )}



          {totalVisible === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">{t('adminControls.noModules', { query: searchQuery })}</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default AdminControls;

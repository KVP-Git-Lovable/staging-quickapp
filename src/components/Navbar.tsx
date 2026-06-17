import { Menu, X, LogOut, ArrowLeft, Wifi, WifiOff, AlertTriangle } from "lucide-react";


import { toast } from 'sonner';
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useMemo, useCallback, memo, useRef } from "react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { Button } from "@/components/ui/button";
import { NetworkBadge } from "@/components/NetworkBadge";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";
import { useConnectivity } from "@/hooks/useConnectivity";
import { NotificationBell } from "@/components/NotificationBell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SignedAvatarImage } from "@/components/ui/signed-image";
import { useTranslation } from 'react-i18next';
import { useActivePerformanceModule } from "@/hooks/useActivePerformanceModule";
import { usePackingListModule, useDeliveryAgentApp } from "@/hooks/useD1Delivery";
import { useCompanyData } from "@/hooks/useCompanyData";
import { Building2 as DefaultLogoIcon } from "lucide-react";
import { useNavCustomization, NavItem } from "@/hooks/useNavCustomization";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { NavSearch } from "@/components/navigation/NavSearch";
import { NavCustomizeDialog } from "@/components/navigation/NavCustomizeDialog";
import { NavGroupSection } from "@/components/navigation/NavGroupSection";
import { DraggableNavGrid } from "@/components/navigation/DraggableNavGrid";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  UserCheck, 
  Car, 
  Route, 
  Users,
  Gift,
  CreditCard,
  Trophy,
  Target,
  TrendingUp,
  Shield,
  Store,
  Package,
  Paintbrush,
  Factory,
  MapPin,
  Navigation2,
  Building2,
  Trash2,
  ShoppingCart,
  BarChart3,
  ClipboardList,
  Truck,
  FolderKanban,
  HelpCircle,
  CalendarDays,
} from "lucide-react";

// Memoized Navbar component for better performance
export const Navbar = memo(() => {
  const { signOut, userProfile, userRole, securityProfileName } = useAuth();
  const { hasAdminAccess } = useAdminAccess();
  const navigate = useNavigate();
  const location = useLocation();
  const connectivityStatus = useConnectivity();
  const { t } = useTranslation('common');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const { isGamificationActive } = useActivePerformanceModule();
  const { isEnabled: isPackingListEnabled } = usePackingListModule();
  const { isEnabled: isDeliveryAgentEnabled } = useDeliveryAgentApp();
  const { headerName, headerLogo } = useCompanyData();
  const { isNavItemEnabled } = useFeatureFlags();
  
  // Company name and logo - no hardcoded fallbacks, uses cache
  const companyName = headerName || '';
  const companyLogo = headerLogo;
  
  // Hide back button on home/dashboard
  const showBackButton = location.pathname !== '/dashboard' && location.pathname !== '/';

  // Build navigation items dynamically based on active module - now with IDs for customization
  const navigationItems: NavItem[] = useMemo(() => {
    const baseItems: NavItem[] = [
      { id: 'attendance', icon: UserCheck, label: t('nav.attendance'), href: "/attendance", color: "from-blue-500 to-blue-600" },
      { id: 'my-visit', icon: Car, label: t('nav.myVisit'), href: "/visits/retailers", color: "from-green-500 to-green-600" },
      { id: 'counter', icon: Store, label: t('nav.counter'), href: "/counter-sales", color: "from-orange-500 to-orange-600" },
      { id: 'event', icon: CalendarDays, label: t('nav.event'), href: "/event-create", color: "from-pink-500 to-pink-600" },
      { id: 'all-retailers', icon: Store, label: t('nav.allRetailers'), href: "/my-retailers", color: "from-emerald-500 to-emerald-600" },
      { id: 'my-target', icon: Target, label: t('nav.target'), href: "/my-target", color: "from-cyan-500 to-cyan-600" },
      { id: 'performance', icon: TrendingUp, label: t('nav.targetVsActual'), href: "/performance-dashboard", color: "from-emerald-500 to-emerald-600" },
      { id: 'analytics', icon: BarChart3, label: t('nav.analytics'), href: "/analytics", color: "from-violet-500 to-violet-600" },
      
      { id: 'distributor-master', icon: Factory, label: t('nav.distributorMaster'), href: "/distributor-master", color: "from-cyan-500 to-cyan-600" },
      { id: 'primary-orders', icon: ShoppingCart, label: t('nav.primaryOrders'), href: "/primary-orders", color: "from-rose-500 to-rose-600" },
      { id: 'territories', icon: MapPin, label: t('nav.territories'), href: "/territories-and-distributors", color: "from-amber-500 to-amber-600" },
      { id: 'gps-track', icon: Navigation2, label: t('nav.gpsTrack'), href: "/gps-track", color: "from-purple-500 to-purple-600" },
      { id: 'my-beats', icon: Users, label: t('nav.beats'), href: "/my-beats", color: "from-orange-500 to-orange-600" },
      { id: 'competition-master', icon: Trophy, label: t('nav.competitionMaster'), href: "/competition-master", color: "from-slate-500 to-slate-600" },
      { id: 'schemes', icon: Gift, label: t('nav.schemes'), href: "/schemes", color: "from-pink-500 to-pink-600" },
      { id: 'expenses', icon: CreditCard, label: t('nav.expenses'), href: "/expenses", color: "from-indigo-500 to-indigo-600" },
    ];

    // Add Leaderboard only if gamification is active
    if (isGamificationActive) {
      baseItems.push({ id: 'leaderboard', icon: Trophy, label: t('nav.gamification'), href: "/leaderboard", color: "from-yellow-500 to-yellow-600" });
    }

    // Add Packing List Management if enabled (admin module for creating/managing packing lists)
    if (isPackingListEnabled) {
      baseItems.push({ id: 'packing-list', icon: ClipboardList, label: t('nav.packingList'), href: "/packing-list-management", color: "from-teal-500 to-teal-600" });
    }

    // Add My Deliveries as separate module (visible when delivery agent app is enabled)
    if (isDeliveryAgentEnabled || isPackingListEnabled) {
      baseItems.push({ id: 'my-deliveries', icon: Truck, label: t('nav.deliveries'), href: "/my-deliveries", color: "from-orange-500 to-orange-600" });
    }

    // Add remaining items
    baseItems.push(
      // { id: 'projects', icon: FolderKanban, label: 'Projects', href: "/projects", color: "from-sky-500 to-sky-600" }, // ARCHIVED: Projects module hidden
      { id: 'my-competency', icon: Target, label: t('nav.competency'), href: "/competency-dashboard", color: "from-indigo-500 to-indigo-600" },
      { id: 'help-center', icon: HelpCircle, label: 'Help Center', href: "/help-center", color: "from-teal-500 to-teal-600" },
      { id: 'usage-report', icon: BarChart3, label: t('nav.usageReport'), href: "/usage-report", color: "from-sky-500 to-sky-600" },
      { id: 'recycle-bin', icon: Trash2, label: t('nav.recycleBin'), href: "/recycle-bin", color: "from-rose-500 to-rose-600" },
    );

    // Filter by feature flags
    return baseItems.filter(item => isNavItemEnabled(item.id));
  }, [t, isGamificationActive, isPackingListEnabled, isDeliveryAgentEnabled, isNavItemEnabled]);

  // Nav customization hook
  const {
    customization,
    isCustomized,
    createGroup,
    deleteGroup,
    renameGroup,
    toggleGroupExpansion,
    moveItemToGroup,
    reorderItems,
    reorderGroups,
    resetToDefault,
    getOrganizedItems,
  } = useNavCustomization(navigationItems);

  // Admin-only navigation items
  const adminNavigationItems = [
    { icon: Shield, label: t('nav.adminControls'), href: "/admin-controls", color: "from-emerald-500 to-emerald-600" },
  ];

  // Get user display name and initials
  const displayName = userProfile?.full_name || userProfile?.username || 'User';
  const userInitials = displayName.split(' ').map(n => n[0]).join('').toUpperCase() || 'U';

  const handleMenuItemClick = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  // Handle back navigation with debounce to prevent double-click issues
  const isNavigatingRef = useRef(false);
  const handleBackClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent double navigation
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    
    // Check if there's history to go back to
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      // Fallback to dashboard if no history
      navigate('/dashboard');
    }
    
    // Reset after navigation completes
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 300);
  }, [navigate]);

  return (
    <>
      {/* Navbar - positioned below safe area top */}
      <nav className="navbar-safe-area bg-gradient-primary text-white shadow-lg z-50">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
            {showBackButton && (
                <button
                  onClick={handleBackClick}
                  className="p-1 rounded-lg hover:bg-white/10 transition-colors text-white"
                  title="Go back"
                >
                  <ArrowLeft size={16} />
                </button>
              )}
              
              <NavLink to="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity text-white">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden bg-white p-0.5">
                  {companyLogo ? (
                    <img 
                      src={companyLogo} 
                      alt={companyName || 'Company'} 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <DefaultLogoIcon className="w-6 h-6 text-primary" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <h1 className="text-base font-semibold text-white">{companyName}</h1>
                    <SyncStatusIndicator />
                  </div>
                  <div className="flex items-center gap-0.5 text-white">
                    {connectivityStatus === 'online' ? (
                      <Wifi className="h-2.5 w-2.5 opacity-80" />
                    ) : connectivityStatus === 'offline' ? (
                      <>
                        <WifiOff className="h-2.5 w-2.5 opacity-80" />
                        <p className="text-[10px] opacity-80">No Connection</p>
                      </>
                    ) : null}
                  </div>
                </div>
              </NavLink>
            </div>
            
            <div className="flex items-center gap-1">
              <NotificationBell />
              <button 
                onClick={() => setIsMenuOpen(true)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white"
              >
                <Menu size={20} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Spacer for navbar height */}
      <div className="navbar-spacer" />

      <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto menu-below-navbar">
          {/* User Profile Section */}
          <SheetHeader className="pb-3 border-b bg-gradient-primary text-primary-foreground rounded-lg -mx-6 -mt-6 px-6 pt-4 mb-6 pr-12">
            <div className="flex items-start justify-between gap-3">
              <button 
                onClick={() => {
                  navigate('/profile');
                  handleMenuItemClick();
                }}
                className="flex items-center gap-3 hover:opacity-80 transition-opacity"
              >
                <Avatar className="h-12 w-12 border-2 border-primary-foreground/30">
                  <SignedAvatarImage src={userProfile?.profile_picture_url || ""} />
                  <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start flex-1 min-w-0">
                  <SheetTitle className="text-lg font-bold text-primary-foreground truncate w-full text-left">
                    {displayName}
                  </SheetTitle>
                  {hasAdminAccess && (
                    <div className="flex items-center gap-1.5 text-xs opacity-90 text-primary-foreground mt-1">
                      <Shield className="h-3.5 w-3.5" />
                      <span className="font-medium">Admin</span>
                    </div>
                  )}
                </div>
              </button>
            </div>
          </SheetHeader>

          {/* Admin Controls Section */}
          {hasAdminAccess && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 px-1">{t('nav.adminControls')}</h3>
              <div className="grid grid-cols-3 gap-3">
                {adminNavigationItems.map((item) => (
                  <NavLink 
                    key={item.href}
                    to={item.href}
                    onClick={handleMenuItemClick}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors"
                  >
                    <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-r ${item.color} shadow-md`}>
                      <item.icon className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          )}

          {/* Navigation Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground px-1">{t('nav.navigation')}</h3>
              <div className="flex items-center gap-1">
                <NavSearch items={navigationItems} onItemClick={handleMenuItemClick} />
                <NavCustomizeDialog
                  defaultItems={navigationItems}
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
            </div>

            {/* Custom Groups */}
            {getOrganizedItems().groups.map((group) => (
              <NavGroupSection
                key={group.id}
                name={group.name}
                items={group.items}
                isExpanded={group.isExpanded}
                onItemClick={handleMenuItemClick}
              />
            ))}

            {/* Ungrouped Items - Draggable */}
            <DraggableNavGrid
              items={getOrganizedItems().ungroupedItems}
              onReorder={(newItemIds) => reorderItems(null, newItemIds)}
              onItemClick={handleMenuItemClick}
            />
          </div>

          {/* Logout Button */}
          <div className="mt-6 pt-4 border-t space-y-1">
            <button
              onClick={() => setIsLogoutDialogOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-colors group"
            >
              <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center group-hover:bg-destructive/20 transition-colors">
                <LogOut className="h-4 w-4 text-destructive" />
              </div>
              <span className="text-sm font-medium">{t('nav.logout')}</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Logout
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to log out? You will need to sign in again to access the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                signOut();
                setIsLogoutDialogOpen(false);
                handleMenuItemClick();
              }}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

Navbar.displayName = 'Navbar';
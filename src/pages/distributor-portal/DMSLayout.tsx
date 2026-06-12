import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Home,
  Package,
  ShoppingCart,
  ClipboardList,
  RotateCcw,
  FileText,
  Receipt,
  Headphones,
  Lightbulb,
  Building,
  Users,
  Target,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Box,
  Truck,
  BarChart3,
  Settings,
  Bell,
  Plus,
  TrendingUp,
  ShieldCheck,
  MessageSquare,
  Activity,
  Network,
  PackageCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DistributorUser {
  id: string;
  full_name: string;
  role: string;
  distributor_id: string;
  is_impersonated?: boolean;
  distributors?: { name: string };
}

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  badge?: number;
}

const mainNavItems: NavItem[] = [
  { label: 'Home', icon: Home, path: '/distributor-portal/dashboard' },
  { label: 'Primary Orders', icon: ClipboardList, path: '/distributor-portal/primary-orders' },
  { label: 'Secondary Sales', icon: ShoppingCart, path: '/distributor-portal/secondary-sales' },
  { label: 'Secondary Invoice', icon: Receipt, path: '/distributor-portal/secondary-invoices' },
  { label: 'Retailer Ledger', icon: FileText, path: '/distributor-portal/retailer-ledger' },
  { label: 'Inventory', icon: Package, path: '/distributor-portal/inventory' },
  { label: 'Stock Health', icon: Activity, path: '/distributor-portal/stock-health' },
  { label: 'Network', icon: Network, path: '/distributor-portal/network' },
  { label: 'Packing Lists', icon: PackageCheck, path: '/distributor-portal/packing-lists' },
  { label: 'Primary Price Book', icon: FileText, path: '/distributor-portal/price-book' },
  { label: 'Schemes', icon: Target, path: '/distributor-portal/schemes' },
];

const operationsNavItems: NavItem[] = [
  { label: 'Goods Receipt', icon: Box, path: '/distributor-portal/goods-receipt' },
  { label: 'Retailer Returns', icon: RotateCcw, path: '/distributor-portal/returns' },
  { label: 'Company Returns', icon: Truck, path: '/distributor-portal/company-returns' },
  { label: 'Create Return Note', icon: RotateCcw, path: '/distributor-portal/create-return' },
  { label: 'Stock Adjustments', icon: BarChart3, path: '/distributor-portal/stock-adjustments' },
  { label: 'Inventory Ledger', icon: FileText, path: '/distributor-portal/inventory-ledger' },
];

const supportNavItems: NavItem[] = [
  { label: 'Retailer Feedback', icon: MessageSquare, path: '/distributor-portal/retailer-feedback' },
  { label: 'Claims', icon: FileText, path: '/distributor-portal/claims' },
  { label: 'Support', icon: Headphones, path: '/distributor-portal/support' },
  { label: 'Ideas', icon: Lightbulb, path: '/distributor-portal/ideas' },
];

const settingsNavItems: NavItem[] = [
  { label: 'Business Profile', icon: Building, path: '/distributor-portal/profile' },
  { label: 'Team', icon: Users, path: '/distributor-portal/contacts' },
  { label: 'FY Plan', icon: Target, path: '/distributor-portal/fy-plan' },
];

const DMSLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<DistributorUser | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeUser = async () => {
      // Check for impersonate URL param which signals new tab from admin
      const urlParams = new URLSearchParams(window.location.search);
      const isImpersonateRequest = urlParams.get('impersonate') === 'true';
      
      if (isImpersonateRequest) {
        // Retry multiple times to handle localStorage sync delays across tabs
        const MAX_RETRIES = 5;
        const RETRY_DELAY = 300;
        
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          // Wait before checking (localStorage needs time to sync across tabs)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          
          const pendingImpersonation = localStorage.getItem('pending_impersonation');
          if (pendingImpersonation) {
            try {
              const impersonationData = JSON.parse(pendingImpersonation);
              // Extend validity to 60 seconds for slow connections
              if (Date.now() - impersonationData.timestamp < 60000) {
                localStorage.setItem('distributor_user', JSON.stringify(impersonationData.distributorUser));
                localStorage.setItem('distributor_id', impersonationData.distributorId);
                sessionStorage.setItem('admin_impersonation', JSON.stringify({
                  adminUserId: impersonationData.adminUserId,
                  returnUrl: impersonationData.returnUrl,
                  impersonatedUser: impersonationData.impersonatedUser,
                }));
                localStorage.removeItem('pending_impersonation');
                setUser(impersonationData.distributorUser);
                setLoading(false);
                
                // Clear the URL param
                window.history.replaceState({}, '', window.location.pathname);
                
                toast.success(`Viewing portal as ${impersonationData.impersonatedUser}`, {
                  description: 'Admin viewing mode active',
                });
                return;
              }
            } catch (e) {
              console.error('Failed to parse impersonation data:', e);
            }
          }
          
          console.log(`Impersonation attempt ${attempt + 1}/${MAX_RETRIES}: data not found yet`);
        }
        
        // All retries exhausted - show error and redirect
        console.error('Impersonation failed: Could not find session data after retries');
        toast.error('Failed to load portal session', {
          description: 'Please try again or log in manually',
        });
        localStorage.removeItem('pending_impersonation');
        navigate('/distributor-portal/login');
        return;
      }
      
      // Non-impersonation flow - check for existing session
      const pendingImpersonation = localStorage.getItem('pending_impersonation');
      if (pendingImpersonation) {
        try {
          const impersonationData = JSON.parse(pendingImpersonation);
          if (Date.now() - impersonationData.timestamp < 60000) {
            localStorage.setItem('distributor_user', JSON.stringify(impersonationData.distributorUser));
            localStorage.setItem('distributor_id', impersonationData.distributorId);
            sessionStorage.setItem('admin_impersonation', JSON.stringify({
              adminUserId: impersonationData.adminUserId,
              returnUrl: impersonationData.returnUrl,
              impersonatedUser: impersonationData.impersonatedUser,
            }));
            localStorage.removeItem('pending_impersonation');
            setUser(impersonationData.distributorUser);
            setLoading(false);
            
            toast.success(`Viewing portal as ${impersonationData.impersonatedUser}`, {
              description: 'Admin viewing mode active',
            });
            return;
          }
        } catch (e) {
          console.error('Failed to parse impersonation data:', e);
        }
        localStorage.removeItem('pending_impersonation');
      }

      const storedUser = localStorage.getItem('distributor_user');
      if (!storedUser) {
        navigate('/distributor-portal/login');
        return;
      }
      setUser(JSON.parse(storedUser));
      setLoading(false);
    };
    
    initializeUser();
  }, [navigate]);

  const handleLogout = async () => {
    const impersonationData = sessionStorage.getItem('admin_impersonation');
    const storedUser = localStorage.getItem('distributor_user');
    const isImpersonated = storedUser ? JSON.parse(storedUser).is_impersonated : false;

    if (isImpersonated && impersonationData) {
      localStorage.removeItem('distributor_user');
      localStorage.removeItem('distributor_id');
      sessionStorage.removeItem('admin_impersonation');
      toast.success('Exited impersonation mode');
      window.close();
      return;
    }

    await supabase.auth.signOut();
    localStorage.removeItem('distributor_user');
    localStorage.removeItem('distributor_id');
    navigate('/distributor-portal/login');
    toast.success('Logged out successfully');
  };

  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = location.pathname === item.path;
    return (
      <button
        onClick={() => {
          navigate(item.path);
          setSidebarOpen(false);
        }}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
          isActive 
            ? "bg-primary text-primary-foreground shadow-md" 
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <item.icon className="w-5 h-5 flex-shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        {item.badge && item.badge > 0 && (
          <span className="px-2 py-0.5 bg-destructive text-destructive-foreground text-xs rounded-full">
            {item.badge}
          </span>
        )}
        {isActive && <ChevronRight className="w-4 h-4" />}
      </button>
    );
  };

  const NavSection = ({ title, items }: { title: string; items: NavItem[] }) => (
    <div className="space-y-1">
      <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </p>
      {items.map((item) => (
        <NavLink key={item.path} item={item} />
      ))}
    </div>
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo/Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg">
            <TrendingUp className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-foreground truncate">
              {user?.distributors?.name || 'DMS Portal'}
            </h2>
            <p className="text-xs text-muted-foreground truncate">
              Distributor Management
            </p>
          </div>
        </div>
      </div>

      {/* Quick Action */}
      <div className="p-4">
        <Button 
          className="w-full shadow-md"
          onClick={() => {
            navigate('/distributor-portal/create-primary-order');
            setSidebarOpen(false);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          New Order
        </Button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3">
        <div className="space-y-6 pb-6">
          <NavSection title="Main" items={mainNavItems} />
          <Separator />
          <NavSection title="Operations" items={operationsNavItems} />
          <Separator />
          <NavSection title="Support" items={supportNavItems} />
          <Separator />
          <NavSection title="Settings" items={settingsNavItems} />
        </div>
      </ScrollArea>

      {/* User Section */}
      <div className="p-4 border-t bg-muted/30">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 border-2 border-primary/20">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {user?.full_name?.charAt(0) || 'D'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.full_name}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleLogout}
            className="text-muted-foreground hover:text-destructive"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const isImpersonated = user?.is_impersonated;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Admin Impersonation Banner */}
      {isImpersonated && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 text-white px-4 py-2 safe-area-top">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-sm font-medium">
                Admin Viewing Mode: {user?.full_name}
              </span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleLogout}
              className="h-7 text-white hover:bg-amber-600"
            >
              <X className="w-4 h-4 mr-1" />
              Exit
            </Button>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-72 lg:flex-col bg-card border-r shadow-sm">
        <SidebarContent />
      </aside>

      {/* Mobile Header */}
      <header className={cn(
        "lg:hidden fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-b shadow-sm",
        isImpersonated ? "mt-10" : "safe-area-top"
      )}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="w-6 h-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-80">
                <SidebarContent />
              </SheetContent>
            </Sheet>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-foreground">
                {user?.distributors?.name || 'DMS'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={cn(
        "lg:pl-72 min-h-screen",
        isImpersonated ? "pt-[calc(3.5rem+40px)]" : "pt-14 lg:pt-0",
        "pb-safe"
      )}>
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
          <Outlet context={{ user, distributorId: user?.distributor_id }} />
        </div>
      </main>
    </div>
  );
};

export default DMSLayout;

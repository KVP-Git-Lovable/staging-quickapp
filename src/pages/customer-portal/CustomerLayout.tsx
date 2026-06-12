import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Home, Gift, Sparkles, ClipboardList, BarChart3 } from 'lucide-react';
import { useCustomerPortalAuth } from '@/hooks/useCustomerPortalAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { customerPortalSupabase } from '@/integrations/supabase/portal-client';
import { CustomerPortalHeader } from '@/components/customer-portal/CustomerPortalHeader';
import { toast } from 'sonner';

const navItems = [
  { path: '/customer-portal/home', icon: Home, label: 'Home' },
  { path: '/customer-portal/schemes', icon: Gift, label: 'Schemes' },
  { path: '/customer-portal/catalog', icon: Sparkles, label: 'AI Shop', isCenter: true },
  { path: '/customer-portal/orders', icon: ClipboardList, label: 'Orders' },
  { path: '/customer-portal/reports', icon: BarChart3, label: 'Reports' },
];

const CustomerLayout = () => {
  const { retailer, loading, logout } = useCustomerPortalAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    if (!loading && !retailer) {
      navigate('/customer-portal/login');
    }
  }, [loading, retailer, navigate]);

  useEffect(() => {
    if (!retailer?.id) return;

    let isActive = true;

    const validatePortalAccess = async () => {
      const { data, error } = await supabase
        .from('retailers')
        .select('id, portal_enabled')
        .eq('id', retailer.id)
        .maybeSingle();

      if (error) {
        console.error('Failed to validate customer portal access:', error);
        return;
      }

      if (!isActive) return;

      if (!data?.portal_enabled) {
        toast.error('Customer Portal access is not enabled for this retailer. Please login with a valid portal account.');
        logout();
      }
    };

    validatePortalAccess();

    return () => {
      isActive = false;
    };
  }, [retailer?.id, logout]);

  const { data: cartCount = 0 } = useQuery({
    queryKey: ['customer-cart-count', retailer?.id],
    queryFn: async () => {
      if (!retailer?.id) return 0;
      const { count, error } = await customerPortalSupabase
        .from('customer_portal_cart')
        .select('id', { count: 'exact', head: true })
        .eq('retailer_id', retailer.id);

      if (error) {
        console.error('Failed to load customer cart count:', error);
        return 0;
      }

      return count || 0;
    },
    enabled: !!retailer?.id,
    refetchInterval: 10000,
  });

  const { data: activeSchemeCount = 0 } = useQuery({
    queryKey: ['customer-active-scheme-count'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { count } = await supabase
        .from('product_schemes')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('show_in_portal', true)
        .or(`end_date.is.null,end_date.gte.${today}`);
      return count || 0;
    },
    staleTime: 60000,
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!retailer) return null;

  return (
    <div className="min-h-screen bg-muted/50 pb-20">
      <CustomerPortalHeader
        retailerName={retailer.name}
        retailerId={retailer.id}
        cartCount={cartCount}
        onLogout={logout}
        language={language}
        onLanguageChange={setLanguage}
      />
      <Outlet context={{ retailer, cartCount }} />

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-area-bottom">
        <div className="flex justify-around items-end h-16 max-w-lg mx-auto relative">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            const isSchemes = item.label === 'Schemes';
            const isCenter = item.isCenter;

            if (isCenter) {
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="flex flex-col items-center justify-center flex-1 -mt-5 relative"
                >
                  <div
                    className={`h-14 w-14 rounded-full flex items-center justify-center shadow-lg transition-all ${isActive ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-primary/30 scale-110' : 'bg-gradient-to-br from-primary/90 to-primary/70 text-primary-foreground shadow-primary/20'}`}
                  >
                    <Icon size={24} strokeWidth={2} />
                  </div>
                  <span className={`text-[9px] mt-1 ${isActive ? 'font-bold text-primary' : 'font-medium text-muted-foreground'}`}>
                    {item.label}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors relative ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
              >
                <div className="relative">
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                  {isSchemes && activeSchemeCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 bg-amber-500 text-white text-[8px] font-bold rounded-full h-3.5 min-w-[14px] flex items-center justify-center px-0.5">
                      {activeSchemeCount > 9 ? '9+' : activeSchemeCount}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default CustomerLayout;
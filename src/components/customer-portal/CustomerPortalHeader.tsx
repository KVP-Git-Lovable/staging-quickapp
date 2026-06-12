import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HomeHamburgerMenu } from './HomeHamburgerMenu';
import { useCustomerNotifications } from '@/hooks/useCustomerNotifications';

interface CustomerPortalHeaderProps {
  retailerName: string;
  retailerId?: string;
  cartCount: number;
  onLogout: () => void;
  language: string;
  onLanguageChange: (lang: string) => void;
}

export const CustomerPortalHeader: React.FC<CustomerPortalHeaderProps> = ({
  retailerName,
  retailerId,
  cartCount,
  onLogout,
  language,
  onLanguageChange,
}) => {
  const navigate = useNavigate();
  const displayName = retailerName || '';
  const { unreadCount } = useCustomerNotifications(retailerId);

  return (
    <div className="sticky top-0 z-40 border-b shadow-[0_2px_8px_rgba(0,0,0,0.12)] pt-[env(safe-area-inset-top)]" style={{ background: 'linear-gradient(135deg, #1a2332 0%, #2c3e50 40%, #b8860b 100%)' }}>
      <div className="flex items-center justify-between px-5 py-4 max-w-lg mx-auto">
        <div>
          <h1 className="text-lg font-bold text-white">
            Hello, {displayName} 👋
          </h1>
          <p className="text-[11px] text-white/70">What would you like to do today?</p>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 relative"
            onClick={() => navigate('/customer-portal/notifications')}
          >
            <Bell size={20} className="text-white/80" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 relative"
            onClick={() => navigate('/customer-portal/cart')}
          >
            <ShoppingCart size={20} className="text-white/80" />
            {cartCount > 0 && (
              <span className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
                {cartCount}
              </span>
            )}
          </Button>
          <HomeHamburgerMenu
            onLogout={onLogout}
            language={language}
            onLanguageChange={onLanguageChange}
          />
        </div>
      </div>
    </div>
  );
};

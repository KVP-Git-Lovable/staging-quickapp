import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, ShoppingBag, Camera, ClipboardList, Package, MessageCircle, LogOut, Globe, Gift } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { SUPPORTED_LANGUAGES } from '@/hooks/useVoiceOrderAssistant';

interface HomeHamburgerMenuProps {
  onLogout: () => void;
  language: string;
  onLanguageChange: (lang: string) => void;
}

const gridActions = [
  { icon: ShoppingBag, label: 'Place Order', path: '/customer-portal/home', color: 'from-blue-500 to-blue-600' },
  { icon: Camera, label: 'Photo Order', path: '/customer-portal/home?photo=true', color: 'from-emerald-500 to-emerald-600' },
  { icon: ClipboardList, label: 'My Orders', path: '/customer-portal/orders', color: 'from-amber-500 to-amber-600' },
  { icon: Package, label: 'Products', path: '/customer-portal/home', color: 'from-purple-500 to-purple-600' },
  { icon: Gift, label: 'Schemes', path: '/customer-portal/schemes', color: 'from-pink-500 to-pink-600' },
  { icon: MessageCircle, label: 'Chat to Order', path: '/customer-portal/chat', color: 'from-indigo-500 to-indigo-600' },
];

export const HomeHamburgerMenu: React.FC<HomeHamburgerMenuProps> = ({
  onLogout,
  language,
  onLanguageChange,
}) => {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Menu size={22} />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[300px] p-0">
        <SheetHeader className="p-4 pb-2">
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>

        {/* Grid Navigation */}
        <div className="px-4 py-3">
          <div className="grid grid-cols-3 gap-3">
            {gridActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={() => { setOpen(false); navigate(action.path); }}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-muted/50 transition-colors"
                >
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center shadow-md`}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <span className="text-[10px] font-medium text-foreground leading-tight text-center">
                    {action.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Language selector */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Globe size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Voice Language</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => onLanguageChange(lang.code)}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                  language === lang.code
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border hover:bg-muted'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={() => { setOpen(false); onLogout(); }}
          className="flex items-center gap-3 px-4 py-3 border-t border-border text-left hover:bg-destructive/5 transition-colors w-full"
        >
          <LogOut size={20} className="text-destructive shrink-0" />
          <p className="text-sm font-medium text-destructive">Logout</p>
        </button>
      </SheetContent>
    </Sheet>
  );
};

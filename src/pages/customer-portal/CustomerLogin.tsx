import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Store, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCustomerPortalAuth } from '@/hooks/useCustomerPortalAuth';

interface RetailerChoice {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  beat_id: string | null;
  territory_id: string | null;
  distributor_id: string | null;
  owner_id: string | null;
  parent_name?: string | null;
}

const CustomerLogin = () => {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [choices, setChoices] = useState<RetailerChoice[]>([]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoTriedRef = useRef(false);

  // Safety net: clear stale SW caches on first portal load
  useEffect(() => {
    // Clear ALL caches to ensure fresh routing
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(n => caches.delete(n));
      });
    }
    // Unregister stale service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
      });
    }
  }, []);
  const { login, retailer } = useCustomerPortalAuth();

  // If already logged in, redirect
  if (retailer) {
    navigate('/customer-portal/home', { replace: true });
    return null;
  }

  const finalizeLogin = async (r: RetailerChoice, cleanPhone: string) => {
    let distributorId = r.distributor_id || undefined;
    if (!distributorId && r.parent_name) {
      const { data: dist } = await supabase
        .from('distributors')
        .select('id')
        .ilike('name', r.parent_name)
        .maybeSingle();
      if (dist) distributorId = dist.id;
    }

    login({
      id: r.id,
      name: r.name,
      phone: r.phone || cleanPhone,
      address: r.address || undefined,
      beat_id: r.beat_id || undefined,
      territory_id: r.territory_id || undefined,
      distributor_id: distributorId,
      owner_id: r.owner_id || undefined,
    });

    toast.success(`Welcome, ${r.name}!`);
    navigate('/customer-portal/home', { replace: true });
  };

  const handleLogin = async () => {
    const digitsOnly = phone.replace(/\D/g, '');
    const cleanPhone = digitsOnly.startsWith('91') && digitsOnly.length === 12
      ? digitsOnly.slice(2)
      : digitsOnly;

    const phoneVariants = [cleanPhone, `+91${cleanPhone}`, `91${cleanPhone}`];

    if (cleanPhone.length !== 10) {
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('retailers')
        .select('id, name, phone, address, beat_id, territory_id, distributor_id, owner_id, parent_name, portal_enabled')
        .in('phone', phoneVariants)
        .eq('portal_enabled', true)
        .order('name', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        const { data: existingRetailer, error: lookupError } = await supabase
          .from('retailers')
          .select('id')
          .in('phone', phoneVariants)
          .limit(1)
          .maybeSingle();

        if (lookupError) throw lookupError;

        if (existingRetailer) {
          toast.error('Customer Portal access is not enabled for this retailer. Please contact your admin.');
          return;
        }

        toast.error('Phone number not found. Please use your registered number.');
        return;
      }

      if (data.length === 1) {
        await finalizeLogin(data[0] as RetailerChoice, cleanPhone);
        return;
      }

      // Multiple portal-enabled retailers share this phone — prompt user to pick
      setChoices(data as RetailerChoice[]);
    } catch (err: any) {
      console.error('Login error:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePickRetailer = async (r: RetailerChoice) => {
    setLoading(true);
    try {
      const digitsOnly = phone.replace(/\D/g, '');
      const cleanPhone = digitsOnly.startsWith('91') && digitsOnly.length === 12
        ? digitsOnly.slice(2)
        : digitsOnly;
      await finalizeLogin(r, cleanPhone);
    } catch (err: any) {
      console.error('Selection error:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/10 p-4">
      <Card className="w-full max-w-sm shadow-xl border-primary/10">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Store className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-xl font-bold text-foreground">
            Retailer Portal
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {choices.length > 0
              ? 'Select your store to continue'
              : 'Enter your registered phone number to login'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          {choices.length === 0 ? (
            <>
              <Input
                type="tel"
                placeholder="Enter registered phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 12))}
                className="h-14 text-lg tracking-wide"
                maxLength={12}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
              <Button
                onClick={handleLogin}
                disabled={loading || phone.length < 10}
                className="w-full h-14 text-lg font-semibold"
                size="lg"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                {loading ? 'Checking...' : 'Login'}
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              {choices.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handlePickRetailer(r)}
                  disabled={loading}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left hover:bg-accent/40 transition-colors disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{r.name}</p>
                    {r.address && (
                      <p className="text-xs text-muted-foreground truncate">{r.address}</p>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </button>
              ))}
              <Button
                variant="ghost"
                onClick={() => setChoices([])}
                disabled={loading}
                className="w-full"
              >
                Use a different number
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerLogin;

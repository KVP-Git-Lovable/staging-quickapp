import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const SESSION_KEY = 'influencer_portal_session';

export function getInfluencerSession() {
  try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function clearInfluencerSession() { localStorage.removeItem(SESSION_KEY); }

export default function InfluencerPortalLogin() {
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (getInfluencerSession()) nav('/influencer-portal'); }, [nav]);

  async function login() {
    const p = phone.trim();
    if (!p) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('influencers').select('id, name, phone, role, region, pincode, portal_enabled')
      .eq('phone', p).maybeSingle();
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    if (!data) { toast.error('No influencer found with this phone'); return; }
    if (!data.portal_enabled) { toast.error('Portal access not enabled for you. Please contact your rep.'); return; }
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    toast.success(`Welcome ${data.name}`);
    nav('/influencer-portal');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Influencer Portal</CardTitle>
          <p className="text-sm text-muted-foreground">Sign in with your registered phone</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91…"
              onKeyDown={e => e.key === 'Enter' && login()} />
          </div>
          <Button className="w-full" onClick={login} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Continue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

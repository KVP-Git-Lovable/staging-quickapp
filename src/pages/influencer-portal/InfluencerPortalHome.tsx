import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LogOut, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { clearInfluencerSession, getInfluencerSession } from './InfluencerPortalLogin';

export default function InfluencerPortalHome() {
  const nav = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [schemes, setSchemes] = useState<any[]>([]);
  const [retailers, setRetailers] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [refForm, setRefForm] = useState({ retailer_name: '', phone: '', area: '', notes: '' });
  const [ticketForm, setTicketForm] = useState({ subject: '', description: '' });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const previewId = params.get('preview');
    if (previewId) {
      (async () => {
        const { data, error } = await (supabase as any)
          .from('influencers')
          .select('id, name, phone, role, region, pincode, portal_enabled')
          .eq('id', previewId).maybeSingle();
        if (error || !data) { toast.error('Influencer not found'); nav('/influencers'); return; }
        setSession({ ...data, __preview: true });
      })();
      return;
    }
    const s = getInfluencerSession();
    if (!s) { nav('/influencer-portal/login'); return; }
    setSession(s);
  }, [nav]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      setLoading(true);
      const now = new Date().toISOString();
      const [sc, rt, tk, rf] = await Promise.all([
        (supabase as any).from('product_schemes').select('id, scheme_name, description, start_date, end_date, is_active')
          .eq('is_active', true).lte('start_date', now).gte('end_date', now).limit(20),
        session.pincode
          ? (supabase as any).from('retailers').select('id, name, phone, address, pincode').eq('pincode', session.pincode).limit(50)
          : (supabase as any).from('retailers').select('id, name, phone, address, pincode').limit(50),
        (supabase as any).from('support_requests').select('id, subject, status, created_at').eq('influencer_id', session.id).order('created_at', { ascending: false }).limit(20),
        (supabase as any).from('influencer_referrals').select('*').eq('influencer_id', session.id).order('created_at', { ascending: false }).limit(20),
      ]);
      setSchemes(sc.data || []); setRetailers(rt.data || []); setTickets(tk.data || []); setReferrals(rf.data || []);
      setLoading(false);
    })();
  }, [session]);

  function logout() { clearInfluencerSession(); nav('/influencer-portal/login'); }

  async function submitReferral() {
    if (!refForm.retailer_name.trim()) { toast.error('Retailer name required'); return; }
    const { error } = await (supabase as any).from('influencer_referrals').insert({
      influencer_id: session.id, ...refForm,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Referral submitted');
    setRefForm({ retailer_name: '', phone: '', area: '', notes: '' });
    const { data } = await (supabase as any).from('influencer_referrals').select('*').eq('influencer_id', session.id).order('created_at', { ascending: false }).limit(20);
    setReferrals(data || []);
  }

  async function submitTicket() {
    if (!ticketForm.subject.trim()) { toast.error('Subject required'); return; }
    const { error } = await (supabase as any).from('support_requests').insert({
      influencer_id: session.id, subject: ticketForm.subject, description: ticketForm.description, status: 'open', source: 'influencer_portal',
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Ticket raised');
    setTicketForm({ subject: '', description: '' });
    const { data } = await (supabase as any).from('support_requests').select('id, subject, status, created_at').eq('influencer_id', session.id).order('created_at', { ascending: false }).limit(20);
    setTickets(data || []);
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto p-3 flex items-center justify-between">
          <div>
            <div className="font-semibold">{session.name}</div>
            <div className="text-xs text-muted-foreground">Influencer Portal</div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4 mr-1" />Logout</Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        <Tabs defaultValue="schemes">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="schemes">Schemes</TabsTrigger>
            <TabsTrigger value="retailers">Retailers</TabsTrigger>
            <TabsTrigger value="refer">Refer</TabsTrigger>
            <TabsTrigger value="support">Support</TabsTrigger>
          </TabsList>

          <TabsContent value="schemes">
            {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto my-8" /> :
              schemes.length === 0 ? <p className="text-center text-muted-foreground py-8">No active schemes right now</p> :
              <div className="grid gap-3">
                {schemes.map(s => (
                  <Card key={s.id}>
                    <CardHeader className="pb-2"><CardTitle className="text-base">{s.scheme_name}</CardTitle></CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{s.description || 'No description'}</p>
                      <div className="text-xs mt-2">Valid till {new Date(s.end_date).toLocaleDateString()}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>}
          </TabsContent>

          <TabsContent value="retailers">
            <p className="text-xs text-muted-foreground mb-2">Retailers in your region {session.pincode ? `(${session.pincode})` : ''}</p>
            {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto my-8" /> :
              retailers.length === 0 ? <p className="text-center text-muted-foreground py-8">No retailers found</p> :
              <div className="grid gap-2">
                {retailers.map(r => (
                  <Card key={r.id}><CardContent className="p-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.phone || '—'} · {r.address || ''}</div>
                  </CardContent></Card>
                ))}
              </div>}
          </TabsContent>

          <TabsContent value="refer">
            <Card><CardHeader><CardTitle className="text-base">Refer a retailer</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Retailer Name *</Label><Input value={refForm.retailer_name} onChange={e => setRefForm({ ...refForm, retailer_name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Phone</Label><Input value={refForm.phone} onChange={e => setRefForm({ ...refForm, phone: e.target.value })} /></div>
                  <div><Label>Area</Label><Input value={refForm.area} onChange={e => setRefForm({ ...refForm, area: e.target.value })} /></div>
                </div>
                <div><Label>Notes</Label><Textarea rows={3} value={refForm.notes} onChange={e => setRefForm({ ...refForm, notes: e.target.value })} placeholder="Not selling / stock-out / other" /></div>
                <Button onClick={submitReferral}><Send className="h-4 w-4 mr-1" />Submit Referral</Button>
              </CardContent>
            </Card>
            {referrals.length > 0 && <div className="mt-4 space-y-2">
              <div className="text-sm font-medium">Your referrals</div>
              {referrals.map(r => (
                <Card key={r.id}><CardContent className="p-3 flex justify-between">
                  <div><div className="font-medium">{r.retailer_name}</div><div className="text-xs text-muted-foreground">{r.area || ''} · {r.phone || ''}</div></div>
                  <Badge>{r.status}</Badge>
                </CardContent></Card>
              ))}
            </div>}
          </TabsContent>

          <TabsContent value="support">
            <Card><CardHeader><CardTitle className="text-base">Raise a ticket</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Subject *</Label><Input value={ticketForm.subject} onChange={e => setTicketForm({ ...ticketForm, subject: e.target.value })} /></div>
                <div><Label>Description</Label><Textarea rows={4} value={ticketForm.description} onChange={e => setTicketForm({ ...ticketForm, description: e.target.value })} /></div>
                <Button onClick={submitTicket}><Send className="h-4 w-4 mr-1" />Submit</Button>
              </CardContent>
            </Card>
            {tickets.length > 0 && <div className="mt-4 space-y-2">
              <div className="text-sm font-medium">Your tickets</div>
              {tickets.map(t => (
                <Card key={t.id}><CardContent className="p-3 flex justify-between">
                  <div><div className="font-medium">{t.subject}</div><div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</div></div>
                  <Badge variant="outline">{t.status}</Badge>
                </CardContent></Card>
              ))}
            </div>}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

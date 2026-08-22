import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Loader2, Plus, ExternalLink, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Layout } from '@/components/Layout';

const ROLE_LABEL: Record<string, string> = {
  plumber: 'Plumber', painter: 'Painter', electrician: 'Electrician',
  civil_contractor: 'Civil Contractor', architect: 'Architect', mason: 'Mason',
};

export default function InfluencerDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [inf, setInf] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [retailers, setRetailers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapRetailer, setMapRetailer] = useState('');

  async function load() {
    if (!id) return;
    setLoading(true);
    const [i, o, m, r, t] = await Promise.all([
      (supabase as any).from('influencers').select('*').eq('id', id).maybeSingle(),
      (supabase as any).from('orders').select('id, order_number, total_amount, created_at, retailer_id, status').eq('influencer_id', id).order('created_at', { ascending: false }).limit(200),
      (supabase as any).from('influencer_retailer_map').select('*').eq('influencer_id', id).order('created_at', { ascending: false }),
      (supabase as any).from('influencer_referrals').select('*').eq('influencer_id', id).order('created_at', { ascending: false }),
      (supabase as any).from('support_requests').select('id, subject, status, created_at').eq('influencer_id', id).order('created_at', { ascending: false }).limit(50),
    ]);
    setInf(i.data); setOrders(o.data || []); setMappings(m.data || []); setReferrals(r.data || []); setTickets(t.data || []);

    // enrich retailer names
    const retailerIds = Array.from(new Set([
      ...(o.data||[]).map((x:any)=>x.retailer_id),
      ...(m.data||[]).map((x:any)=>x.retailer_id),
      ...(r.data||[]).map((x:any)=>x.tagged_retailer_id),
    ].filter(Boolean)));
    if (retailerIds.length) {
      const { data: rs } = await (supabase as any).from('retailers').select('id, name').in('id', retailerIds);
      setRetailers(rs || []);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, [id]);

  const retailerName = (rid: string) => retailers.find(r => r.id === rid)?.name || rid?.slice(0, 8);

  // Portal referrals that carry products count as influenced demand too
  const productReferrals = referrals.filter(
    (r: any) => Array.isArray(r.interested_products) && r.interested_products.length > 0
  );
  const influencedRows = [
    ...orders.map((o: any) => ({
      key: o.id,
      source: 'order' as const,
      label: o.order_number || o.id.slice(0, 8),
      retailer: o.retailer_id ? retailerName(o.retailer_id) : '—',
      status: o.status,
      amount: Number(o.total_amount || 0),
      products: null as any[] | null,
      date: o.created_at,
    })),
    ...productReferrals.map((r: any) => ({
      key: `ref-${r.id}`,
      source: 'referral' as const,
      label: r.consumer_name || r.retailer_name || 'Portal referral',
      retailer: r.tagged_retailer_id ? retailerName(r.tagged_retailer_id) : (r.retailer_name || '—'),
      status: r.status,
      amount: 0,
      products: r.interested_products as any[],
      date: r.created_at,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const influencedCount = orders.length + productReferrals.length;

  async function addMapping() {
    if (!mapRetailer.trim()) return;
    const { error } = await (supabase as any).from('influencer_retailer_map').insert({
      influencer_id: id, retailer_id: mapRetailer.trim(), created_by: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Retailer linked');
    setMapOpen(false); setMapRetailer(''); load();
  }

  if (loading) return <Layout><div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div></Layout>;
  if (!inf) return <Layout><div className="p-8">Not found</div></Layout>;

  const portalUrl = `${window.location.origin}/influencer-portal?preview=${inf.id}`;

  return (
    <Layout>
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" onClick={() => nav('/influencers')}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-xl">{inf.name}</CardTitle>
              <div className="flex gap-2 mt-2 items-center">
                <Badge variant="secondary">{ROLE_LABEL[inf.role]}</Badge>
                {inf.company && <span className="text-sm text-muted-foreground">{inf.company}</span>}
                {inf.portal_enabled && <Badge>Portal enabled</Badge>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Influenced Orders</div>
              <div className="text-2xl font-semibold">{inf.influenced_orders_count}</div>
              <div className="text-sm">₹ {Number(inf.influenced_orders_value || 0).toLocaleString('en-IN')}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-3 text-sm">
          <div><div className="text-xs text-muted-foreground">Phone</div>{inf.phone}</div>
          <div><div className="text-xs text-muted-foreground">Email</div>{inf.email || '—'}</div>
          <div><div className="text-xs text-muted-foreground">Region</div>{inf.region || '—'}</div>
          <div><div className="text-xs text-muted-foreground">Pincode</div>{inf.pincode || '—'}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Influencer Portal</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Input readOnly value={portalUrl} className="text-xs font-mono" />
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(portalUrl); toast.success('Link copied'); }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => window.open(portalUrl, '_blank')}>
              <ExternalLink className="h-4 w-4 mr-1" /> Open Portal (Admin Preview)
            </Button>
            {!inf.portal_enabled && (
              <span className="text-xs text-muted-foreground self-center">
                Portal login (OTP) is not yet enabled for this influencer. Admin preview bypasses login.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Influenced Orders ({orders.length})</TabsTrigger>
          <TabsTrigger value="mapped">Mapped Retailers ({mappings.length})</TabsTrigger>
          <TabsTrigger value="referrals">Referrals ({referrals.length})</TabsTrigger>
          <TabsTrigger value="tickets">Support Tickets ({tickets.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <Card><CardContent className="pt-4">
            {orders.length === 0 ? <div className="text-muted-foreground text-sm text-center py-8">No orders attributed yet</div> :
            <Table><TableHeader><TableRow>
              <TableHead>Order #</TableHead><TableHead>Retailer</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>Date</TableHead>
            </TableRow></TableHeader><TableBody>
              {orders.map(o => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.order_number || o.id.slice(0, 8)}</TableCell>
                  <TableCell>{retailerName(o.retailer_id)}</TableCell>
                  <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                  <TableCell className="text-right">₹ {Number(o.total_amount || 0).toLocaleString('en-IN')}</TableCell>
                  <TableCell>{new Date(o.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="mapped">
          <Card><CardContent className="pt-4 space-y-3">
            <Dialog open={mapOpen} onOpenChange={setMapOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Link Retailer</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Link Retailer</DialogTitle></DialogHeader>
                <Label>Retailer ID (UUID)</Label>
                <Input value={mapRetailer} onChange={e => setMapRetailer(e.target.value)} placeholder="paste retailer id" />
                <DialogFooter><Button onClick={addMapping}>Link</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            {mappings.length === 0 ? <div className="text-muted-foreground text-sm text-center py-8">No retailers linked yet</div> :
            <Table><TableHeader><TableRow>
              <TableHead>Retailer</TableHead><TableHead>Since</TableHead><TableHead>Active</TableHead>
            </TableRow></TableHeader><TableBody>
              {mappings.map(m => (
                <TableRow key={m.id}>
                  <TableCell>{retailerName(m.retailer_id)}</TableCell>
                  <TableCell>{m.since}</TableCell>
                  <TableCell>{m.active ? <Badge>Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="referrals">
          <Card><CardContent className="pt-4">
            {referrals.length === 0 ? <div className="text-muted-foreground text-sm text-center py-8">No referrals yet</div> :
            <Table><TableHeader><TableRow>
              <TableHead>Retailer Name</TableHead><TableHead>Phone</TableHead><TableHead>Area</TableHead>
              <TableHead>Status</TableHead><TableHead>Date</TableHead>
            </TableRow></TableHeader><TableBody>
              {referrals.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{r.retailer_name}</TableCell><TableCell>{r.phone || '—'}</TableCell>
                  <TableCell>{r.area || '—'}</TableCell>
                  <TableCell><Badge>{r.status}</Badge></TableCell>
                  <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="tickets">
          <Card><CardContent className="pt-4">
            {tickets.length === 0 ? <div className="text-muted-foreground text-sm text-center py-8">No tickets</div> :
            <Table><TableHeader><TableRow>
              <TableHead>Subject</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead>
            </TableRow></TableHeader><TableBody>
              {tickets.map(t => (
                <TableRow key={t.id}>
                  <TableCell>{t.subject}</TableCell>
                  <TableCell><Badge variant="outline">{t.status}</Badge></TableCell>
                  <TableCell>{new Date(t.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
    </Layout>
  );
}

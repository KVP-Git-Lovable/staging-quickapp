import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Search, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Layout } from '@/components/Layout';

const ROLES = ['plumber', 'painter', 'electrician', 'civil_contractor', 'architect', 'mason'];
const ROLE_LABEL: Record<string, string> = {
  plumber: 'Plumber', painter: 'Painter', electrician: 'Electrician',
  civil_contractor: 'Civil Contractor', architect: 'Architect', mason: 'Mason',
};

export default function InfluencersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    name: '', company: '', phone: '', email: '', website: '',
    role: 'plumber', region: '', pincode: '', portal_enabled: false, notes: '',
  });

  async function load() {
    setLoading(true);
    const [inf, refs] = await Promise.all([
      (supabase as any).from('influencers').select('*').order('created_at', { ascending: false }).limit(500),
      (supabase as any).from('influencer_referrals').select('influencer_id, interested_products').limit(2000),
    ]);
    if (inf.error) { toast.error(inf.error.message); setLoading(false); return; }

    // Portal referrals that carry products count as influenced demand too
    const portalCounts = new Map<string, number>();
    (refs.data || []).forEach((r: any) => {
      if (Array.isArray(r.interested_products) && r.interested_products.length > 0) {
        portalCounts.set(r.influencer_id, (portalCounts.get(r.influencer_id) || 0) + 1);
      }
    });

    setRows((inf.data || []).map((r: any) => ({
      ...r,
      __portal_referral_count: portalCounts.get(r.id) || 0,
      __influenced_total: (r.influenced_orders_count || 0) + (portalCounts.get(r.id) || 0),
    })));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const t = q.toLowerCase();
    return rows.filter(r => [r.name, r.phone, r.company, r.region, ROLE_LABEL[r.role]]
      .filter(Boolean).some((v: string) => v.toLowerCase().includes(t)));
  }, [q, rows]);

  async function save() {
    if (!form.name?.trim() || !form.phone?.trim()) { toast.error('Name and phone required'); return; }
    setSaving(true);
    const { error } = await (supabase as any).from('influencers').insert({ ...form, created_by: user?.id });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Influencer added');
    setOpen(false);
    setForm({ name: '', company: '', phone: '', email: '', website: '', role: 'plumber', region: '', pincode: '', portal_enabled: false, notes: '' });
    load();
  }

  async function togglePortal(id: string, value: boolean) {
    const { error } = await (supabase as any).from('influencers').update({ portal_enabled: value }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    setRows(rs => rs.map(r => r.id === id ? { ...r, portal_enabled: value } : r));
  }

  return (
    <Layout>
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Influencers</h1>
          <p className="text-sm text-muted-foreground">
            Plumbers, painters, electricians and others who recommend the brand
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Add Influencer</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add Influencer</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Company</Label><Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
              <div><Label>Phone *</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Website</Label><Input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} /></div>
              <div><Label>Role *</Label>
                <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Region</Label><Input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} /></div>
              <div><Label>Pincode</Label><Input value={form.pincode} onChange={e => setForm({ ...form, pincode: e.target.value })} /></div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch checked={form.portal_enabled} onCheckedChange={v => setForm({ ...form, portal_enabled: v })} />
                <Label>Enable influencer portal (phone OTP login)</Label>
              </div>
              <div className="col-span-2"><Label>Notes</Label><Textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search name, phone, role…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…</div>
            : filtered.length === 0 ? <div className="py-12 text-center text-muted-foreground">No influencers yet</div>
            : <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Phone</TableHead>
                <TableHead>Region</TableHead><TableHead className="text-right"># Orders</TableHead>
                <TableHead className="text-right">Value Influenced</TableHead>
                <TableHead>Portal</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium"><button className="text-primary hover:underline text-left" onClick={() => navigate(`/influencers/${r.id}`)}>{r.name}</button>{r.company ? <div className="text-xs text-muted-foreground">{r.company}</div> : null}</TableCell>
                    <TableCell><Badge variant="secondary">{ROLE_LABEL[r.role] || r.role}</Badge></TableCell>
                    <TableCell>{r.phone}</TableCell>
                    <TableCell>{r.region || '—'}</TableCell>
                    <TableCell className="text-right">
                      {r.__influenced_total}
                      {r.__portal_referral_count > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          incl. {r.__portal_referral_count} portal
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">₹ {Number(r.influenced_orders_value || 0).toLocaleString('en-IN')}</TableCell>
                    <TableCell><Switch checked={r.portal_enabled} onCheckedChange={v => togglePortal(r.id, v)} /></TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => navigate(`/influencers/${r.id}`)}><ExternalLink className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>}
        </CardContent>
      </Card>
    </div>
    </Layout>
  );
}

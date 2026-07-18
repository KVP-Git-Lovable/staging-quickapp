import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Menu, LogOut, Mic, MicOff, Send, Plus, Trash2, Search, Store,
  UserPlus, Sparkles, LifeBuoy, Users, ChevronRight, CheckCircle2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { clearInfluencerSession, getInfluencerSession } from './InfluencerPortalLogin';

type Tab = 'refer' | 'retailers' | 'schemes' | 'support';

interface ProductLine { name: string; qty: string; unit: string; }
interface RetailerLite { id: string; name: string; phone?: string | null; address?: string | null; pincode?: string | null; }

/* ------------------- Web Speech helper (no external calls) ------------------- */
function useWebSpeech(lang = 'en-IN') {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const recRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  const start = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error('Voice not supported on this device'); return; }
    const rec = new SR();
    rec.lang = lang; rec.interimResults = true; rec.continuous = true;
    rec.onresult = (e: any) => {
      let full = '';
      for (let i = 0; i < e.results.length; i++) full += e.results[i][0].transcript + ' ';
      setText(full.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  };
  const stop = () => { try { recRef.current?.stop(); } catch {} setListening(false); };
  const reset = () => setText('');
  return { supported, listening, text, setText, start, stop, reset };
}

export default function InfluencerPortalHome() {
  const nav = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('refer');
  const [menuOpen, setMenuOpen] = useState(false);

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

  function logout() {
    if (session?.__preview) { window.close(); nav('/influencers'); return; }
    clearInfluencerSession(); nav('/influencer-portal/login');
  }

  if (!session) return null;
  const initials = (session.name || '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-primary text-primary-foreground shadow-sm" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center gap-3 px-4 py-3">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10 -ml-2">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="p-4 bg-primary text-primary-foreground">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-white/20 flex items-center justify-center font-semibold">{initials}</div>
                  <div className="text-left">
                    <SheetTitle className="text-primary-foreground text-base">{session.name}</SheetTitle>
                    <div className="text-xs text-primary-foreground/80 capitalize">{session.role || 'Influencer'} · {session.phone}</div>
                  </div>
                </div>
              </SheetHeader>
              <nav className="p-2">
                {[
                  { k: 'refer' as Tab, label: 'Refer a Consumer', icon: UserPlus },
                  { k: 'retailers' as Tab, label: 'Retailers Nearby', icon: Store },
                  { k: 'schemes' as Tab, label: 'Active Schemes', icon: Sparkles },
                  { k: 'support' as Tab, label: 'Support Tickets', icon: LifeBuoy },
                ].map(m => (
                  <button key={m.k} onClick={() => { setTab(m.k); setMenuOpen(false); }}
                    className={cn('w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium',
                      tab === m.k ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted')}>
                    <m.icon className="h-4 w-4" /> {m.label}
                  </button>
                ))}
                <div className="my-2 border-t" />
                <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10">
                  <LogOut className="h-4 w-4" /> Logout
                </button>
              </nav>
            </SheetContent>
          </Sheet>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-primary-foreground/70 leading-none">Influencer Portal</div>
            <div className="font-semibold truncate">Hi, {session.name?.split(' ')[0]}</div>
          </div>
          <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold">{initials}</div>
        </div>
      </header>

      {session.__preview && (
        <div className="bg-amber-100 text-amber-900 text-xs text-center py-1 border-b border-amber-200">
          Admin preview · No OTP required
        </div>
      )}

      {/* Content */}
      <main className="flex-1 pb-24">
        {tab === 'refer' && <ReferTab session={session} />}
        {tab === 'retailers' && <RetailersTab session={session} />}
        {tab === 'schemes' && <SchemesTab />}
        {tab === 'support' && <SupportTab session={session} />}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t shadow-[0_-2px_10px_rgba(0,0,0,0.04)]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="grid grid-cols-4">
          {[
            { k: 'refer' as Tab, label: 'Refer', icon: UserPlus },
            { k: 'retailers' as Tab, label: 'Retailers', icon: Store },
            { k: 'schemes' as Tab, label: 'Schemes', icon: Sparkles },
            { k: 'support' as Tab, label: 'Support', icon: LifeBuoy },
          ].map(m => (
            <button key={m.k} onClick={() => setTab(m.k)}
              className={cn('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                tab === m.k ? 'text-primary' : 'text-muted-foreground')}>
              <m.icon className={cn('h-5 w-5', tab === m.k && 'scale-110')} />
              {m.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/* -------------------------------- REFER TAB -------------------------------- */
function ReferTab({ session }: { session: any }) {
  const [consumer, setConsumer] = useState({ name: '', phone: '', address: '' });
  const [products, setProducts] = useState<ProductLine[]>([{ name: '', qty: '', unit: 'kg' }]);
  const [notes, setNotes] = useState('');
  const [tagged, setTagged] = useState<RetailerLite | null>(null);
  const [retailerSearchOpen, setRetailerSearchOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<any[]>([]);

  const voice = useWebSpeech('en-IN');

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from('influencer_referrals')
        .select('id, consumer_name, retailer_name, status, created_at, interested_products')
        .eq('influencer_id', session.id)
        .order('created_at', { ascending: false }).limit(5);
      setRecent(data || []);
    })();
  }, [session.id, saving]);

  // Auto-parse transcript into consumer name + product lines the first time
  useEffect(() => {
    if (!voice.text) return;
    if (!consumer.name && !products[0].name) {
      const t = voice.text;
      const nameMatch = t.match(/(?:name is|mera naam|customer)\s+([A-Za-z ]{2,30})/i);
      if (nameMatch) setConsumer(c => ({ ...c, name: nameMatch[1].trim() }));
    }
  }, [voice.text]);

  const addLine = () => setProducts(p => [...p, { name: '', qty: '', unit: 'kg' }]);
  const removeLine = (i: number) => setProducts(p => p.filter((_, idx) => idx !== i));
  const updateLine = (i: number, k: keyof ProductLine, v: string) =>
    setProducts(p => p.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  const pushVoiceToProduct = () => {
    if (!voice.text.trim()) return;
    setProducts(p => {
      const empty = p.findIndex(l => !l.name.trim());
      if (empty >= 0) { const next = [...p]; next[empty] = { ...next[empty], name: voice.text.trim() }; return next; }
      return [...p, { name: voice.text.trim(), qty: '', unit: 'kg' }];
    });
    voice.reset();
  };

  const submit = async () => {
    if (!consumer.name.trim()) { toast.error('Consumer name is required'); return; }
    const cleanProducts = products.filter(p => p.name.trim()).map(p => ({
      name: p.name.trim(), qty: p.qty || null, unit: p.unit || null,
    }));
    setSaving(true);
    const { error } = await (supabase as any).from('influencer_referrals').insert({
      influencer_id: session.id,
      retailer_name: tagged?.name || consumer.name,
      phone: consumer.phone || null,
      area: consumer.address || null,
      notes: notes || null,
      consumer_name: consumer.name,
      consumer_phone: consumer.phone || null,
      consumer_address: consumer.address || null,
      interested_products: cleanProducts,
      tagged_retailer_id: tagged?.id || null,
      voice_transcript: voice.text || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Referral saved 🎉');
    setConsumer({ name: '', phone: '', address: '' });
    setProducts([{ name: '', qty: '', unit: 'kg' }]);
    setNotes(''); setTagged(null); voice.reset();
  };

  return (
    <div className="p-4 space-y-4">
      {/* Voice hero */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Tap & speak the customer request</div>
              <div className="text-xs text-muted-foreground">Say name, product & quantity. We'll fill it in.</div>
            </div>
            <button
              onClick={voice.listening ? voice.stop : voice.start}
              disabled={!voice.supported}
              className={cn(
                'shrink-0 h-16 w-16 rounded-full flex items-center justify-center shadow-lg transition-all',
                voice.listening ? 'bg-red-500 text-white scale-110 animate-pulse' : 'bg-primary text-primary-foreground active:scale-95',
                !voice.supported && 'opacity-50'
              )}>
              {voice.listening ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
            </button>
          </div>
          {voice.text && (
            <div className="mt-3 rounded-lg bg-white border p-3">
              <div className="text-xs text-muted-foreground mb-1">Heard:</div>
              <div className="text-sm italic">"{voice.text}"</div>
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={pushVoiceToProduct}><Plus className="h-3.5 w-3.5 mr-1" />Add as product</Button>
                <Button size="sm" variant="ghost" onClick={voice.reset}><X className="h-3.5 w-3.5 mr-1" />Clear</Button>
              </div>
            </div>
          )}
          {!voice.supported && <div className="text-[11px] text-muted-foreground mt-2">Voice unavailable — type instead.</div>}
        </CardContent>
      </Card>

      {/* Consumer */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" /> Consumer details</div>
          <Input placeholder="Consumer name *" value={consumer.name} onChange={e => setConsumer({ ...consumer, name: e.target.value })} className="h-11 text-base" />
          <Input placeholder="Phone" inputMode="tel" value={consumer.phone} onChange={e => setConsumer({ ...consumer, phone: e.target.value })} className="h-11 text-base" />
          <Input placeholder="Area / Address" value={consumer.address} onChange={e => setConsumer({ ...consumer, address: e.target.value })} className="h-11 text-base" />
        </CardContent>
      </Card>

      {/* Products */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold">Interested products</div>
          {products.map((line, i) => (
            <div key={i} className="grid grid-cols-[1fr_72px_72px_36px] gap-2 items-center">
              <Input placeholder="Product" value={line.name} onChange={e => updateLine(i, 'name', e.target.value)} className="h-10" />
              <Input placeholder="Qty" inputMode="decimal" value={line.qty} onChange={e => updateLine(i, 'qty', e.target.value)} className="h-10" />
              <select value={line.unit} onChange={e => updateLine(i, 'unit', e.target.value)} className="h-10 border rounded-md text-sm bg-background px-1">
                <option value="kg">kg</option><option value="g">g</option>
                <option value="pcs">pcs</option><option value="ltr">ltr</option><option value="box">box</option>
              </select>
              <Button size="icon" variant="ghost" onClick={() => removeLine(i)} disabled={products.length === 1}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addLine} className="w-full"><Plus className="h-4 w-4 mr-1" /> Add product</Button>
        </CardContent>
      </Card>

      {/* Tag retailer */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold flex items-center gap-2"><Store className="h-4 w-4 text-primary" /> Tag a retailer</div>
          {tagged ? (
            <div className="flex items-center justify-between rounded-lg border bg-primary/5 p-3">
              <div>
                <div className="font-medium text-sm">{tagged.name}</div>
                <div className="text-xs text-muted-foreground">{tagged.phone || ''} {tagged.pincode ? `· ${tagged.pincode}` : ''}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setTagged(null)}><X className="h-4 w-4" /></Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setRetailerSearchOpen(true)} className="w-full justify-start h-11">
              <Search className="h-4 w-4 mr-2 text-muted-foreground" /> Search & tag retailer
            </Button>
          )}
        </CardContent>
      </Card>

      <Textarea rows={3} placeholder="Extra notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />

      <Button onClick={submit} disabled={saving} className="w-full h-12 text-base">
        <Send className="h-4 w-4 mr-2" /> {saving ? 'Saving…' : 'Submit referral'}
      </Button>

      {recent.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent referrals</div>
          {recent.map(r => (
            <Card key={r.id}><CardContent className="p-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{r.consumer_name || r.retailer_name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {(r.interested_products?.length || 0)} product(s) · {new Date(r.created_at).toLocaleDateString()}
                </div>
              </div>
              <Badge variant="secondary" className="capitalize">{r.status}</Badge>
            </CardContent></Card>
          ))}
        </div>
      )}

      <RetailerSearchSheet
        open={retailerSearchOpen}
        onClose={() => setRetailerSearchOpen(false)}
        pincode={session.pincode}
        onPick={(r) => { setTagged(r); setRetailerSearchOpen(false); }}
      />
    </div>
  );
}

/* --------------------------- Retailer search sheet --------------------------- */
function RetailerSearchSheet({ open, onClose, pincode, onPick }: {
  open: boolean; onClose: () => void; pincode?: string | null; onPick: (r: RetailerLite) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<RetailerLite[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      let qb: any = (supabase as any).from('retailers').select('id, name, phone, address, pincode').limit(30);
      if (q.trim()) qb = qb.ilike('name', `%${q.trim()}%`);
      else if (pincode) qb = qb.eq('pincode', pincode);
      const { data } = await qb;
      setResults(data || []); setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, open, pincode]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle>Tag a retailer</SheetTitle>
        </SheetHeader>
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input autoFocus placeholder="Search retailer by name…" value={q} onChange={e => setQ(e.target.value)} className="pl-9 h-11" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && <div className="text-center text-sm text-muted-foreground py-8">Searching…</div>}
          {!loading && results.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">No retailers found</div>}
          {results.map(r => (
            <button key={r.id} onClick={() => onPick(r)}
              className="w-full text-left rounded-lg border p-3 hover:bg-muted active:bg-muted/70 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground truncate">{r.phone || '—'} · {r.address || ''} {r.pincode ? `· ${r.pincode}` : ''}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------- Retailers tab ------------------------------- */
function RetailersTab({ session }: { session: any }) {
  const [rows, setRows] = useState<RetailerLite[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    (async () => {
      const qb: any = session.pincode
        ? (supabase as any).from('retailers').select('id, name, phone, address, pincode').eq('pincode', session.pincode).limit(100)
        : (supabase as any).from('retailers').select('id, name, phone, address, pincode').limit(100);
      const { data } = await qb; setRows(data || []);
    })();
  }, [session]);
  const filtered = useMemo(() => rows.filter(r => !q || r.name?.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  return (
    <div className="p-4 space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search retailers…" value={q} onChange={e => setQ(e.target.value)} className="pl-9 h-11" />
      </div>
      <div className="text-xs text-muted-foreground">{session.pincode ? `Showing retailers near ${session.pincode}` : 'All retailers'}</div>
      {filtered.map(r => (
        <Card key={r.id}><CardContent className="p-3">
          <div className="font-medium text-sm">{r.name}</div>
          <div className="text-xs text-muted-foreground">{r.phone || '—'} · {r.address || ''}</div>
        </CardContent></Card>
      ))}
      {filtered.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">No retailers found</div>}
    </div>
  );
}

/* -------------------------------- Schemes tab -------------------------------- */
function SchemesTab() {
  const [schemes, setSchemes] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const now = new Date().toISOString();
      const { data } = await (supabase as any).from('product_schemes')
        .select('id, scheme_name, description, start_date, end_date, is_active')
        .eq('is_active', true).lte('start_date', now).gte('end_date', now).limit(30);
      setSchemes(data || []);
    })();
  }, []);
  return (
    <div className="p-4 space-y-3">
      {schemes.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">No active schemes right now</div>}
      {schemes.map(s => (
        <Card key={s.id} className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-primary to-primary/40" />
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><Sparkles className="h-5 w-5" /></div>
              <div className="min-w-0">
                <div className="font-semibold text-sm">{s.scheme_name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.description || 'No description'}</div>
                <div className="text-[11px] mt-2 flex items-center gap-1 text-muted-foreground"><CheckCircle2 className="h-3 w-3" /> Valid till {new Date(s.end_date).toLocaleDateString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* -------------------------------- Support tab -------------------------------- */
function SupportTab({ session }: { session: any }) {
  const [form, setForm] = useState({ subject: '', description: '' });
  const [tickets, setTickets] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await (supabase as any).from('support_requests')
      .select('id, subject, status, created_at').eq('influencer_id', session.id)
      .order('created_at', { ascending: false }).limit(20);
    setTickets(data || []);
  };
  useEffect(() => { load(); }, [session]);

  const submit = async () => {
    if (!form.subject.trim()) { toast.error('Subject required'); return; }
    setSaving(true);
    const { error } = await (supabase as any).from('support_requests').insert({
      influencer_id: session.id, subject: form.subject, description: form.description,
      status: 'open', source: 'influencer_portal',
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Ticket raised');
    setForm({ subject: '', description: '' }); load();
  };

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold flex items-center gap-2"><LifeBuoy className="h-4 w-4 text-primary" /> Raise a ticket</div>
          <Input placeholder="Subject *" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="h-11" />
          <Textarea rows={3} placeholder="Describe the issue" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <Button onClick={submit} disabled={saving} className="w-full h-11"><Send className="h-4 w-4 mr-2" />{saving ? 'Sending…' : 'Submit'}</Button>
        </CardContent>
      </Card>
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your tickets</div>
        {tickets.length === 0 && <div className="text-center text-sm text-muted-foreground py-6">No tickets yet</div>}
        {tickets.map(t => (
          <Card key={t.id}><CardContent className="p-3 flex items-center justify-between">
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{t.subject}</div>
              <div className="text-[11px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
            </div>
            <Badge variant="secondary" className="capitalize">{t.status}</Badge>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}

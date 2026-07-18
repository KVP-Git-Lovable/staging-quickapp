import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Menu, LogOut, Mic, MicOff, Send, Plus, Trash2, Search, Store,
  UserPlus, Sparkles, LifeBuoy, Users, ChevronRight, CheckCircle2, X,
  MapPin, Star, ArrowLeft, Phone, Package,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { clearInfluencerSession, getInfluencerSession } from './InfluencerPortalLogin';

type Tab = 'refer' | 'retailers' | 'schemes' | 'support';

interface ProductLine { product_id?: string | null; name: string; sku?: string | null; brand?: string | null; qty: string; unit: string; }
interface RetailerLite {
  id: string; name: string; phone?: string | null; address?: string | null;
  pincode?: string | null; latitude?: number | null; longitude?: number | null;
  __favourite?: boolean; __distanceKm?: number;
}
interface ProductLite { id: string; name: string; sku?: string | null; brand?: string | null; }

const REFERRAL_STATUSES: { value: string; label: string }[] = [
  { value: 'consumer_added', label: 'Consumer added' },
  { value: 'intent_recorded', label: 'Intent recorded' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'serviced', label: 'Serviced' },
  { value: 'drop', label: 'Drop' },
  { value: 'cancelled', label: 'Cancelled' },
];


/* ------------------- Web Speech helper ------------------- */
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

/* ------------------- Voice parsing ------------------- */
const UNIT_MAP: Record<string, string> = {
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  g: 'g', gram: 'g', grams: 'g', gm: 'g', gms: 'g',
  l: 'ltr', ltr: 'ltr', liter: 'ltr', litre: 'ltr', liters: 'ltr', litres: 'ltr',
  ml: 'ml', milliliter: 'ml',
  pc: 'pcs', pcs: 'pcs', piece: 'pcs', pieces: 'pcs', nos: 'pcs',
  box: 'box', boxes: 'box', carton: 'box', cartons: 'box',
  pack: 'pack', packs: 'pack', packet: 'pack', packets: 'pack',
};

interface ParsedVoice {
  consumer_name?: string;
  consumer_phone?: string;
  products: ProductLine[];
}

function parseVoice(text: string): ParsedVoice {
  const t = text.trim();
  const result: ParsedVoice = { products: [] };

  // Name
  const nameMatch = t.match(/(?:name is|naam hai|mera naam|customer is|consumer is|for)\s+([A-Za-z][A-Za-z ]{1,30})/i);
  if (nameMatch) result.consumer_name = nameMatch[1].trim().replace(/\s+(and|phone|number|wants|needs).*$/i, '');

  // Phone (10 digits)
  const phoneMatch = t.match(/(?:phone|number|mobile|contact)[^\d]*(\d[\d\s-]{8,})/i) || t.match(/\b(\d{10})\b/);
  if (phoneMatch) result.consumer_phone = phoneMatch[1].replace(/\D/g, '').slice(0, 10);

  // Products: qty + unit + optional product name
  // e.g. "5 kg rice", "2 boxes paint", "10 pieces of hammer"
  const re = /(\d+(?:\.\d+)?)\s*(kg|kilos?|kilograms?|g|gm|gms|grams?|l|ltr|liters?|litres?|ml|pc|pcs|pieces?|nos|box(?:es)?|cartons?|packs?|packets?)\b(?:\s+of)?\s+([a-zA-Z][a-zA-Z ]{1,30})?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const qty = m[1];
    const rawUnit = m[2].toLowerCase();
    const unit = UNIT_MAP[rawUnit] || rawUnit;
    const name = (m[3] || '').trim().replace(/\s+(and|with|for|phone|number).*$/i, '');
    result.products.push({ name, qty, unit });
  }
  return result;
}

/* ------------------- Distance ------------------- */
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
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

      <main className="flex-1 pb-24">
        {tab === 'refer' && <ReferTab session={session} />}
        {tab === 'retailers' && <RetailersTab session={session} />}
        {tab === 'schemes' && <SchemesTab />}
        {tab === 'support' && <SupportTab session={session} />}
      </main>

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

/* -------------------------------- REFER TAB (list + form) -------------------------------- */
function ReferTab({ session }: { session: any }) {
  const [view, setView] = useState<'list' | 'form'>('list');
  const [refreshKey, setRefreshKey] = useState(0);

  if (view === 'form') {
    return <ReferForm session={session} onBack={() => setView('list')} onSaved={() => { setRefreshKey(k => k + 1); setView('list'); }} />;
  }
  return <ReferList session={session} onAdd={() => setView('form')} refreshKey={refreshKey} />;
}

function ReferList({ session, onAdd, refreshKey }: { session: any; onAdd: () => void; refreshKey: number }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from('influencer_referrals')
        .select('id, consumer_name, consumer_phone, retailer_name, status, created_at, interested_products, tagged_retailer_id')
        .eq('influencer_id', session.id)
        .order('created_at', { ascending: false }).limit(50);
      setRows(data || []); setLoading(false);
    })();
  }, [session.id, refreshKey]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Your referrals</div>
          <div className="text-xs text-muted-foreground">{rows.length} total</div>
        </div>
        <Button onClick={onAdd} className="h-11 px-4">
          <Plus className="h-4 w-4 mr-1.5" /> Add referral
        </Button>
      </div>

      {loading && <div className="text-center text-sm text-muted-foreground py-8">Loading…</div>}
      {!loading && rows.length === 0 && (
        <Card><CardContent className="p-8 text-center space-y-3">
          <UserPlus className="h-10 w-10 mx-auto text-muted-foreground" />
          <div className="text-sm font-medium">No referrals yet</div>
          <div className="text-xs text-muted-foreground">Tap "Add referral" to record your first consumer request.</div>
          <Button onClick={onAdd} className="mt-2"><Plus className="h-4 w-4 mr-1.5" /> Add referral</Button>
        </CardContent></Card>
      )}
      {!loading && rows.map(r => (
        <Card key={r.id}><CardContent className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm truncate">{r.consumer_name || r.retailer_name || 'Consumer'}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {r.consumer_phone ? `📞 ${r.consumer_phone} · ` : ''}
                {(r.interested_products?.length || 0)} product(s) · {new Date(r.created_at).toLocaleDateString()}
              </div>
              {Array.isArray(r.interested_products) && r.interested_products.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.interested_products.slice(0, 3).map((p: any, i: number) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground">
                      {p.qty ? `${p.qty}${p.unit ? ' ' + p.unit : ''} ` : ''}{p.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <Badge variant="secondary" className="capitalize shrink-0">{r.status}</Badge>
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}

/* -------------------- REFER FORM -------------------- */
function ReferForm({ session, onBack, onSaved }: { session: any; onBack: () => void; onSaved: () => void }) {
  const [consumer, setConsumer] = useState({ name: '', phone: '', address: '' });
  const [products, setProducts] = useState<ProductLine[]>([{ name: '', qty: '', unit: 'kg' }]);
  const [notes, setNotes] = useState('');
  const [tagged, setTagged] = useState<RetailerLite | null>(null);
  const [retailerSearchOpen, setRetailerSearchOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const voice = useWebSpeech('en-IN');
  const lastProcessedRef = useRef('');

  // Merge parsed voice → consumer + product qty/unit/name
  useEffect(() => {
    if (!voice.text || voice.text === lastProcessedRef.current) return;
    const parsed = parseVoice(voice.text);
    setConsumer(c => ({
      name: c.name || parsed.consumer_name || '',
      phone: c.phone || parsed.consumer_phone || '',
      address: c.address,
    }));
    if (parsed.products.length) {
      setProducts(existing => {
        const next = existing.filter(l => l.name.trim() || l.qty.trim());
        for (const p of parsed.products) {
          // update empty row first
          const emptyIdx = next.findIndex(l => !l.name.trim() && !l.qty.trim());
          if (emptyIdx >= 0) {
            next[emptyIdx] = { name: p.name || next[emptyIdx].name, qty: p.qty || next[emptyIdx].qty, unit: p.unit || next[emptyIdx].unit };
          } else {
            next.push({ name: p.name, qty: p.qty, unit: p.unit || 'kg' });
          }
        }
        return next.length ? next : [{ name: '', qty: '', unit: 'kg' }];
      });
    }
  }, [voice.text]);

  const applyVoice = () => {
    lastProcessedRef.current = voice.text;
    toast.success('Voice applied to form');
  };

  const addLine = () => setProducts(p => [...p, { name: '', qty: '', unit: 'kg' }]);
  const removeLine = (i: number) => setProducts(p => p.filter((_, idx) => idx !== i));
  const updateLine = (i: number, k: keyof ProductLine, v: string) =>
    setProducts(p => p.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  const submit = async () => {
    if (!consumer.name.trim()) { toast.error('Consumer name is required'); return; }
    const cleanProducts = products.filter(p => p.name.trim() || p.qty.trim()).map(p => ({
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
    onSaved();
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 -mt-1">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <div className="text-lg font-semibold">New referral</div>
      </div>

      {/* Voice hero */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Tap & speak the request</div>
              <div className="text-xs text-muted-foreground">
                Try: "Customer is Ramesh, phone 9876543210, wants 5 kg paint and 2 pieces brush"
              </div>
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
                <Button size="sm" variant="outline" onClick={applyVoice}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Use in form</Button>
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
            <div key={i} className="grid grid-cols-[1fr_72px_84px_36px] gap-2 items-center">
              <Input placeholder="Product" value={line.name} onChange={e => updateLine(i, 'name', e.target.value)} className="h-10" />
              <Input placeholder="Qty" inputMode="decimal" value={line.qty} onChange={e => updateLine(i, 'qty', e.target.value)} className="h-10" />
              <select value={line.unit} onChange={e => updateLine(i, 'unit', e.target.value)} className="h-10 border rounded-md text-sm bg-background px-1">
                <option value="kg">kg</option><option value="g">g</option>
                <option value="ltr">ltr</option><option value="ml">ml</option>
                <option value="pcs">pcs</option><option value="box">box</option><option value="pack">pack</option>
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
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{tagged.name}</div>
                <div className="text-xs text-muted-foreground truncate">{tagged.phone || '—'} · {tagged.address || ''}</div>
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

      <RetailerSearchSheet
        open={retailerSearchOpen}
        onClose={() => setRetailerSearchOpen(false)}
        influencerId={session.id}
        onPick={(r) => { setTagged(r); setRetailerSearchOpen(false); }}
      />
    </div>
  );
}

/* --------------------------- Retailer search sheet --------------------------- */
function RetailerSearchSheet({ open, onClose, influencerId, onPick }: {
  open: boolean; onClose: () => void; influencerId: string; onPick: (r: RetailerLite) => void;
}) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState<RetailerLite[]>([]);
  const [favourites, setFavourites] = useState<RetailerLite[]>([]);
  const [nearby, setNearby] = useState<RetailerLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);

  // Get geolocation once when opened
  useEffect(() => {
    if (!open || coords || geoDenied) return;
    if (!navigator.geolocation) { setGeoDenied(true); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setGeoDenied(true),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  }, [open, coords, geoDenied]);

  // Load favourites (retailers this influencer has previously tagged in a referral)
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: refs } = await (supabase as any)
        .from('influencer_referrals')
        .select('tagged_retailer_id')
        .eq('influencer_id', influencerId)
        .not('tagged_retailer_id', 'is', null)
        .limit(200);
      const ids = Array.from(new Set((refs || []).map((r: any) => r.tagged_retailer_id).filter(Boolean)));
      if (!ids.length) { setFavourites([]); return; }
      const { data: rets } = await (supabase as any)
        .from('retailers')
        .select('id, name, phone, address, pincode, latitude, longitude')
        .in('id', ids as any).limit(50);
      setFavourites((rets || []).map((r: any) => ({ ...r, __favourite: true })));
    })();
  }, [open, influencerId]);

  // Load a batch of retailers for search / nearby calc
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      let qb: any = (supabase as any).from('retailers').select('id, name, phone, address, pincode, latitude, longitude');
      if (q.trim()) qb = qb.ilike('name', `%${q.trim()}%`).limit(50);
      else qb = qb.limit(200);
      const { data } = await qb;
      setAll(data || []); setLoading(false);
    })();
  }, [q, open]);

  // Compute nearby from `all` + coords
  useEffect(() => {
    if (!coords || !all.length) { setNearby([]); return; }
    const withDist = all
      .filter(r => r.latitude != null && r.longitude != null)
      .map(r => ({ ...r, __distanceKm: distanceKm(coords.lat, coords.lon, Number(r.latitude), Number(r.longitude)) }))
      .sort((a, b) => (a.__distanceKm! - b.__distanceKm!))
      .slice(0, 15);
    setNearby(withDist);
  }, [coords, all]);

  const searching = q.trim().length > 0;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle>Tag a retailer</SheetTitle>
        </SheetHeader>
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input autoFocus placeholder="Search all retailers by name…" value={q} onChange={e => setQ(e.target.value)} className="pl-9 h-11" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Favourites — always visible when not searching */}
          {!searching && favourites.length > 0 && (
            <Section title="Your regular retailers" icon={<Star className="h-4 w-4 text-amber-500" />}>
              {favourites.map(r => <RetailerRow key={`fav-${r.id}`} r={r} onPick={onPick} />)}
            </Section>
          )}

          {/* Nearby */}
          {!searching && (
            <Section title="Near you" icon={<MapPin className="h-4 w-4 text-primary" />}>
              {geoDenied && <div className="text-xs text-muted-foreground px-1">Enable location to see retailers around you.</div>}
              {!geoDenied && !coords && <div className="text-xs text-muted-foreground px-1">Getting your location…</div>}
              {coords && nearby.length === 0 && <div className="text-xs text-muted-foreground px-1">No mapped retailers nearby.</div>}
              {nearby.map(r => <RetailerRow key={`near-${r.id}`} r={r} onPick={onPick} />)}
            </Section>
          )}

          {/* Search results */}
          {searching && (
            <Section title={`Results for "${q}"`}>
              {loading && <div className="text-center text-sm text-muted-foreground py-4">Searching…</div>}
              {!loading && all.length === 0 && <div className="text-center text-sm text-muted-foreground py-4">No retailers found</div>}
              {all.map(r => <RetailerRow key={`s-${r.id}`} r={r} onPick={onPick} />)}
            </Section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {icon} {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function RetailerRow({ r, onPick }: { r: RetailerLite; onPick: (r: RetailerLite) => void }) {
  return (
    <button onClick={() => onPick(r)}
      className="w-full text-left rounded-lg border p-3 hover:bg-muted active:bg-muted/70 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div className="font-medium text-sm truncate">{r.name}</div>
          {r.__favourite && <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />}
        </div>
        <div className="text-xs text-muted-foreground truncate mt-0.5">
          {r.phone ? <><Phone className="h-3 w-3 inline mr-1" />{r.phone}</> : '—'}
        </div>
        {r.address && <div className="text-[11px] text-muted-foreground truncate">{r.address}</div>}
        {r.__distanceKm != null && (
          <div className="text-[10px] text-primary mt-0.5">{r.__distanceKm.toFixed(1)} km away</div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

/* ------------------------------- Retailers tab ------------------------------- */
function RetailersTab({ session }: { session: any }) {
  const [rows, setRows] = useState<RetailerLite[]>([]);
  const [favourites, setFavourites] = useState<RetailerLite[]>([]);
  const [q, setQ] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) { setGeoDenied(true); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setGeoDenied(true),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from('retailers')
        .select('id, name, phone, address, pincode, latitude, longitude').limit(300);
      setRows(data || []);

      // favourites
      const { data: refs } = await (supabase as any)
        .from('influencer_referrals')
        .select('tagged_retailer_id')
        .eq('influencer_id', session.id)
        .not('tagged_retailer_id', 'is', null).limit(200);
      const ids = Array.from(new Set((refs || []).map((r: any) => r.tagged_retailer_id).filter(Boolean)));
      if (ids.length) {
        const { data: favs } = await (supabase as any).from('retailers')
          .select('id, name, phone, address, pincode, latitude, longitude').in('id', ids as any).limit(50);
        setFavourites((favs || []).map((r: any) => ({ ...r, __favourite: true })));
      }
    })();
  }, [session.id]);

  const list = useMemo(() => {
    if (q.trim()) {
      return rows.filter(r => r.name?.toLowerCase().includes(q.toLowerCase()));
    }
    if (coords) {
      return rows
        .filter(r => r.latitude != null && r.longitude != null)
        .map(r => ({ ...r, __distanceKm: distanceKm(coords.lat, coords.lon, Number(r.latitude), Number(r.longitude)) }))
        .sort((a, b) => (a.__distanceKm! - b.__distanceKm!))
        .slice(0, 30);
    }
    return rows.slice(0, 30);
  }, [rows, q, coords]);

  return (
    <div className="p-4 space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search all retailers…" value={q} onChange={e => setQ(e.target.value)} className="pl-9 h-11" />
      </div>

      {!q && favourites.length > 0 && (
        <Section title="Your regular retailers" icon={<Star className="h-4 w-4 text-amber-500" />}>
          {favourites.map(r => (
            <Card key={`fav-${r.id}`}><CardContent className="p-3">
              <div className="flex items-center gap-1.5">
                <div className="font-medium text-sm">{r.name}</div>
                <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
              </div>
              <div className="text-xs text-muted-foreground">{r.phone || '—'}</div>
              {r.address && <div className="text-[11px] text-muted-foreground">{r.address}</div>}
            </CardContent></Card>
          ))}
        </Section>
      )}

      <Section
        title={q ? `Results for "${q}"` : (coords ? 'Near you' : (geoDenied ? 'All retailers' : 'Getting location…'))}
        icon={q ? undefined : <MapPin className="h-4 w-4 text-primary" />}
      >
        {list.map(r => (
          <Card key={r.id}><CardContent className="p-3">
            <div className="font-medium text-sm">{r.name}</div>
            <div className="text-xs text-muted-foreground">{r.phone || '—'}</div>
            {r.address && <div className="text-[11px] text-muted-foreground">{r.address}</div>}
            {r.__distanceKm != null && (
              <div className="text-[10px] text-primary mt-0.5">{r.__distanceKm.toFixed(1)} km away</div>
            )}
          </CardContent></Card>
        ))}
        {list.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">No retailers found</div>}
      </Section>
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

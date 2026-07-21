import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  Radar, MapPin, Camera, Plus, Search, LogOut, ArrowLeft, Loader2, Sparkles,
  Store, ChevronRight, User, ClipboardList, Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { clearEmployeeSession, getEmployeeSession } from './EmployeePortalLogin';

type Tab = 'home' | 'visits';

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function uploadPhoto(file: Blob, prefix: string): Promise<string | null> {
  try {
    const ext = (file as any).type?.split('/')?.[1] || 'jpg';
    const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const { error } = await (supabase as any).storage.from('visit-photos').upload(path, file, { upsert: false });
    if (error) throw error;
    const { data } = (supabase as any).storage.from('visit-photos').getPublicUrl(path);
    return data.publicUrl;
  } catch (e: any) {
    toast.error(e.message || 'Photo upload failed');
    return null;
  }
}

export default function EmployeePortalHome() {
  const nav = useNavigate();
  const session = getEmployeeSession();
  const [tab, setTab] = useState<Tab>('home');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [retailerSheet, setRetailerSheet] = useState(false);
  const [addRetailerOpen, setAddRetailerOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [selectedRetailer, setSelectedRetailer] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);

  useEffect(() => {
    if (!session) { nav('/employee-portal/login', { replace: true }); return; }
    navigator.geolocation?.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
    loadVisits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadVisits() {
    if (!session) return;
    const { data } = await (supabase as any).functions.invoke('employee-portal-api', {
      body: { action: 'list_visits', employee_id: session.id },
    });
    setVisits(data?.visits || []);
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-gradient-to-r from-indigo-700 to-cyan-600 text-white shadow-md">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center">
            <Radar className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-xs opacity-80">Market Intelligence</p>
            <p className="font-semibold truncate">{session.full_name}</p>
          </div>
          <Button size="icon" variant="ghost" className="text-white hover:bg-white/15"
            onClick={() => { clearEmployeeSession(); nav('/employee-portal/login', { replace: true }); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pb-24 pt-4 space-y-4">
        {tab === 'home' ? (
          <>
            {/* Hero */}
            <Card className="overflow-hidden border-none shadow-lg bg-gradient-to-br from-indigo-600 via-indigo-500 to-cyan-500 text-white">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80">
                  <Sparkles className="h-3.5 w-3.5" /> Today
                </div>
                <h2 className="text-lg font-semibold mt-1">Capture what the market is telling us.</h2>
                <p className="text-sm opacity-90 mt-1">
                  {coords ? 'Location locked — nearby retailers ready.' : 'Enable location to see nearby retailers.'}
                </p>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <Button variant="secondary" className="bg-white/95 text-slate-900 hover:bg-white"
                    onClick={() => setRetailerSheet(true)}>
                    <Search className="h-4 w-4 mr-1" /> Find retailer
                  </Button>
                  <Button variant="secondary" className="bg-white/95 text-slate-900 hover:bg-white"
                    onClick={() => setAddRetailerOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Add retailer
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-3 gap-2">
              <StatChip label="Visits" value={visits.length} />
              <StatChip label="New" value={visits.filter(v => v.is_new_retailer).length} />
              <StatChip label="This week" value={visits.filter(v => {
                const d = new Date(v.created_at); const w = new Date(); w.setDate(w.getDate()-7);
                return d > w;
              }).length} />
            </div>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">Recent visits</h3>
                  <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setTab('visits')}>
                    View all <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
                {visits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No visits yet — tap "Find retailer" to start.</p>
                ) : (
                  <div className="space-y-2">
                    {visits.slice(0, 3).map(v => <VisitRow key={v.id} v={v} />)}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" onClick={() => setTab('home')}><ArrowLeft className="h-4 w-4" /></Button>
              <h2 className="font-semibold">My visits</h2>
            </div>
            <div className="space-y-2">
              {visits.length === 0 && <p className="text-sm text-muted-foreground">No visits yet.</p>}
              {visits.map(v => <VisitRow key={v.id} v={v} />)}
            </div>
          </>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 border-t bg-white z-30">
        <div className="max-w-md mx-auto grid grid-cols-2">
          <button onClick={() => setTab('home')} className={`py-3 flex flex-col items-center text-xs ${tab==='home'?'text-indigo-600 font-semibold':'text-slate-500'}`}>
            <Store className="h-5 w-5" /> Home
          </button>
          <button onClick={() => setTab('visits')} className={`py-3 flex flex-col items-center text-xs ${tab==='visits'?'text-indigo-600 font-semibold':'text-slate-500'}`}>
            <ClipboardList className="h-5 w-5" /> Visits
          </button>
        </div>
      </nav>

      <RetailerSearchSheet
        open={retailerSheet} onOpenChange={setRetailerSheet}
        coords={coords}
        onPick={(r) => { setSelectedRetailer(r); setRetailerSheet(false); setVisitOpen(true); }}
        onAddNew={() => { setRetailerSheet(false); setAddRetailerOpen(true); }}
      />

      <AddRetailerSheet
        open={addRetailerOpen} onOpenChange={setAddRetailerOpen}
        coords={coords}
        onCreated={(r) => { setSelectedRetailer(r); setAddRetailerOpen(false); setVisitOpen(true); }}
      />

      <VisitFormSheet
        open={visitOpen} onOpenChange={setVisitOpen}
        session={session} retailer={selectedRetailer} coords={coords}
        onSaved={() => { setVisitOpen(false); setSelectedRetailer(null); loadVisits(); }}
      />
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white shadow-sm border p-3 text-center">
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function VisitRow({ v }: { v: any }) {
  return (
    <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50">
      {v.retailer_photo_url
        ? <img src={v.retailer_photo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
        : <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center"><Store className="h-5 w-5 text-slate-400" /></div>}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">{v.retailer_name || 'Retailer'}</p>
          {v.is_new_retailer && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">New</Badge>}
        </div>
        <p className="text-xs text-muted-foreground truncate">{v.overall_sentiment || v.visit_purpose || '—'}</p>
        {v.territory_executive_name && (
          <p className="text-[11px] text-slate-500 mt-0.5"><User className="h-3 w-3 inline mr-1" />{v.territory_executive_name}</p>
        )}
      </div>
      <div className="text-[10px] text-slate-400 whitespace-nowrap">
        {new Date(v.created_at).toLocaleDateString()}
      </div>
    </div>
  );
}

function RetailerSearchSheet({ open, onOpenChange, coords, onPick, onAddNew }: {
  open: boolean; onOpenChange: (v: boolean) => void; coords: any;
  onPick: (r: any) => void; onAddNew: () => void;
}) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await (supabase as any).functions.invoke('employee-portal-api', {
        body: {
          action: 'search_retailers',
          q: q.trim(),
          lat: coords?.lat,
          lng: coords?.lng,
          limit: 200,
        },
      });
      if (error) toast.error(error.message);
      setRows(data?.retailers || []);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [open, q, coords?.lat, coords?.lng]);

  const filtered = useMemo(() => rows.slice(0, 60), [rows]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4">
          <SheetTitle>Find retailer</SheetTitle>
        </SheetHeader>
        <div className="p-4 space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search name, phone, address…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <Button variant="outline" className="w-full" onClick={onAddNew}>
            <Plus className="h-4 w-4 mr-1" /> Retailer not listed — add new
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {loading && <div className="text-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>}
          {!loading && filtered.map(r => (
            <button key={r.id} onClick={() => onPick(r)}
              className="w-full text-left p-3 rounded-lg hover:bg-slate-50 border-b flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Store className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{r.name}</p>
                <p className="text-xs text-muted-foreground truncate">{r.address || '—'}</p>
                <p className="text-[11px] text-slate-500">{r.phone || ''}</p>
              </div>
              {isFinite(r._dist) && <span className="text-[10px] text-slate-500 whitespace-nowrap">{r._dist.toFixed(1)} km</span>}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AddRetailerSheet({ open, onOpenChange, coords, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; coords: any;
  onCreated: (r: any) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [territoryId, setTerritoryId] = useState<string>('');
  const [territories, setTerritories] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await (supabase as any).from('territories').select('id,name,assigned_user_id').order('name').limit(500);
      setTerritories(data || []);
    })();
  }, [open]);

  function onFile(f: File | null) {
    setPhoto(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function save() {
    if (!name.trim()) { toast.error('Retailer name required'); return; }
    if (!photo) { toast.error('Please capture the retailer name board photo'); return; }
    if (!coords) { toast.error('Location required — enable GPS'); return; }
    setSaving(true);
    const photo_url = await uploadPhoto(photo, 'retailer-boards');
    const payload: any = {
      name: name.trim(), phone: phone.trim() || null, address: address.trim() || null,
      notes: notes.trim() || null, photo_url,
      latitude: coords.lat, longitude: coords.lng,
      territory_id: territoryId || null,
      entity_type: 'retailer', status: 'active',
      shop_front_visible: true,
    };
    const { data, error } = await (supabase as any).from('retailers').insert(payload).select('*').single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Retailer added');
    setName(''); setPhone(''); setAddress(''); setNotes(''); setPhoto(null); setPreview(null); setTerritoryId('');
    onCreated({ ...data, __isNew: true });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] overflow-y-auto">
        <SheetHeader><SheetTitle>Add new retailer</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-3">
          <div>
            <Label>Shop name board photo *</Label>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
              onChange={e => onFile(e.target.files?.[0] || null)} />
            {preview ? (
              <div className="relative mt-1">
                <img src={preview} className="w-full h-48 object-cover rounded-lg" />
                <Button size="sm" variant="secondary" className="absolute top-2 right-2"
                  onClick={() => fileRef.current?.click()}>Retake</Button>
              </div>
            ) : (
              <Button variant="outline" className="w-full h-24 mt-1" onClick={() => fileRef.current?.click()}>
                <Camera className="h-5 w-5 mr-2" /> Capture shop name board
              </Button>
            )}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'Waiting for GPS…'}
          </div>
          <div><Label>Retailer name *</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div><Label>Contact number</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
          <div><Label>Address</Label><Textarea rows={2} value={address} onChange={e => setAddress(e.target.value)} /></div>
          <div>
            <Label>Territory</Label>
            <select className="w-full border rounded-md h-10 px-2 bg-background"
              value={territoryId} onChange={e => setTerritoryId(e.target.value)}>
              <option value="">Auto / Unassigned</option>
              {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save & start visit
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---- Joint Sales aligned config (mirrors JointSalesFeedbackModal) ----
const STAR_PARAMS: { key: string; label: string; hint: string }[] = [
  { key: 'product_packaging_feedback', label: 'Product Packaging', hint: 'Packaging quality & appeal' },
  { key: 'product_sku_range_feedback', label: 'Product SKU Range', hint: 'Variety of products stocked' },
  { key: 'product_quality_feedback', label: 'Product Quality', hint: 'Customer satisfaction with quality' },
  { key: 'service_feedback', label: 'Service Quality', hint: 'Overall service & support' },
  { key: 'consumer_feedback', label: 'Consumer Satisfaction', hint: 'End consumer feedback' },
];

const DROPDOWN_PARAMS: { key: string; label: string; options: string[] }[] = [
  { key: 'placement_feedback', label: 'Product Placement', options: [
      'Excellent - Prime shelf space', 'Good - Visible location',
      'Average - Needs improvement', 'Poor - Not visible',
  ]},
  { key: 'promotion_vs_competition', label: 'Promotes Us vs Competition', options: [
      'Actively promotes us over competition', 'Promotes equally with competition',
      'Prefers competition slightly', 'Heavily promotes competition',
  ]},
  { key: 'product_usp_feedback', label: 'Product USP Awareness', options: [
      'Clearly understands and promotes USP', 'Aware of key USPs',
      'Limited awareness', 'No awareness of USP',
  ]},
  { key: 'schemes_feedback', label: 'Schemes Effectiveness', options: [
      'Highly effective - Driving sales', 'Moderately effective',
      'Not very effective', 'Needs better schemes',
  ]},
  { key: 'pricing_feedback', label: 'Pricing Competitiveness', options: [
      'Very competitive', 'Competitive',
      'Slightly higher than competitors', 'Too expensive',
  ]},
  { key: 'willingness_to_grow_range', label: 'Willingness to Grow Range', options: [
      'Highly willing - Ready to expand', 'Willing - Open to new products',
      'Hesitant - Needs convincing', 'Not willing - Satisfied with current',
  ]},
];

const DROPDOWN_SCORES: Record<string, number> = {
  'Excellent - Prime shelf space': 5, 'Good - Visible location': 4, 'Average - Needs improvement': 2, 'Poor - Not visible': 1,
  'Highly willing - Ready to expand': 5, 'Willing - Open to new products': 4, 'Hesitant - Needs convincing': 2, 'Not willing - Satisfied with current': 1,
  'Highly effective - Driving sales': 5, 'Moderately effective': 4, 'Not very effective': 2, 'Needs better schemes': 1,
  'Very competitive': 5, 'Competitive': 4, 'Slightly higher than competitors': 2, 'Too expensive': 1,
  'Actively promotes us over competition': 5, 'Promotes equally with competition': 4, 'Prefers competition slightly': 2, 'Heavily promotes competition': 1,
  'Clearly understands and promotes USP': 5, 'Aware of key USPs': 4, 'Limited awareness': 2, 'No awareness of USP': 1,
};

function calcJointScore(feedback: Record<string, any>): number {
  let total = 0;
  const MAX = 55; // 5 star × 5 + 6 dd × 5
  STAR_PARAMS.forEach(p => { total += parseInt(feedback[p.key]) || 0; });
  DROPDOWN_PARAMS.forEach(p => { const v = feedback[p.key]; if (v && DROPDOWN_SCORES[v]) total += DROPDOWN_SCORES[v]; });
  if (!total) return 0;
  return Math.round((total / MAX) * 100) / 10;
}

const RETAILER_SIZE_OPTIONS = ['Small (< 200 sq ft)', 'Medium (200-500 sq ft)', 'Large (500-1000 sq ft)', 'Very Large (> 1000 sq ft)'];

function StarRow({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n === value ? 0 : n)}
          className="p-0.5 focus:outline-none transition-transform active:scale-95"
          aria-label={`${n} star`}
        >
          <Star className={`h-7 w-7 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
        </button>
      ))}
    </div>
  );
}

function VisitFormSheet({ open, onOpenChange, session, retailer, coords, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  session: any; retailer: any; coords: any; onSaved: () => void;
}) {
  const [sellsOurProducts, setSellsOurProducts] = useState<'yes' | 'no' | ''>('');
  const [feedback, setFeedback] = useState<Record<string, any>>({});
  const [actionItems, setActionItems] = useState('');
  const [orderIncrease, setOrderIncrease] = useState('');
  const [monthlyPotential, setMonthlyPotential] = useState('');

  // "No" branch fields
  const [interestedToKnowMore, setInterestedToKnowMore] = useState<'yes' | 'no' | ''>('');
  const [competitionBrand, setCompetitionBrand] = useState('');
  const [competitionSkus, setCompetitionSkus] = useState('');
  const [competitionMonthlyValue, setCompetitionMonthlyValue] = useState('');
  const [competitionPricing, setCompetitionPricing] = useState('');
  const [retailerSize, setRetailerSize] = useState('');
  const [retailerMonthlyTurnover, setRetailerMonthlyTurnover] = useState('');
  const [retailerNotes, setRetailerNotes] = useState('');

  const [exec, setExec] = useState<{ id?: string; name?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSellsOurProducts('');
    setFeedback({});
    setActionItems(''); setOrderIncrease(''); setMonthlyPotential('');
    setInterestedToKnowMore(''); setCompetitionBrand(''); setCompetitionSkus('');
    setCompetitionMonthlyValue(''); setCompetitionPricing('');
    setRetailerSize(''); setRetailerMonthlyTurnover(''); setRetailerNotes('');
    (async () => {
      if (retailer?.territory_id) {
        const { data: t } = await (supabase as any).from('territories')
          .select('assigned_user_id').eq('id', retailer.territory_id).maybeSingle();
        const uid = t?.assigned_user_id;
        if (uid) {
          const { data: p } = await (supabase as any).from('profiles')
            .select('full_name').eq('id', uid).maybeSingle();
          setExec({ id: uid, name: p?.full_name || 'Executive' });
        } else setExec(null);
      } else setExec(null);
    })();
  }, [open, retailer, session.id]);

  const score = useMemo(() => calcJointScore(feedback), [feedback]);
  const scoreColor = score >= 8 ? 'bg-green-100 text-green-700'
    : score >= 6 ? 'bg-yellow-100 text-yellow-700'
    : score >= 4 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700';

  async function publish() {
    if (!retailer) return;
    if (!sellsOurProducts) { toast.error('Please indicate whether the retailer sells our products'); return; }

    if (sellsOurProducts === 'yes') {
      const rated = STAR_PARAMS.filter(p => (parseInt(feedback[p.key]) || 0) > 0).length
        + DROPDOWN_PARAMS.filter(p => !!feedback[p.key]).length;
      if (rated < 1) { toast.error('Please fill at least one feedback field'); return; }
    } else {
      if (!interestedToKnowMore) { toast.error('Please indicate if the retailer is interested to know more'); return; }
    }

    setSaving(true);
    const jointBlob: any = {
      sells_our_products: sellsOurProducts,
      score: sellsOurProducts === 'yes' ? score : null,
      ...feedback,
      order_increase_amount: parseFloat(orderIncrease) || 0,
      monthly_potential_6months: parseFloat(monthlyPotential) || 0,
      joint_sales_impact: actionItems || null,
    };
    if (sellsOurProducts === 'no') {
      jointBlob.non_selling = {
        interested_to_know_more: interestedToKnowMore,
        competition: {
          brand: competitionBrand || null,
          skus: competitionSkus || null,
          monthly_value: parseFloat(competitionMonthlyValue) || null,
          pricing: competitionPricing || null,
        },
        retailer_profile: {
          size: retailerSize || null,
          monthly_turnover: parseFloat(retailerMonthlyTurnover) || null,
          notes: retailerNotes || null,
        },
      };
    }

    const payload = {
      employee_id: session.id,
      employee_name: session.full_name,
      retailer_id: retailer.id,
      retailer_name: retailer.name,
      is_new_retailer: !!retailer.__isNew,
      territory_id: retailer.territory_id || null,
      territory_executive_id: exec?.id || null,
      territory_executive_name: exec?.name || null,
      retailer_photo_url: retailer.__isNew ? retailer.photo_url || null : null,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      joint_sales_feedback: jointBlob,
      additional_notes: actionItems || null,
      overall_sentiment: sellsOurProducts === 'yes'
        ? (score ? `Score ${score}/10` : null)
        : `Non-selling • ${interestedToKnowMore === 'yes' ? 'interested' : 'not interested'}`,
    };
    const { data, error } = await (supabase as any).functions.invoke('employee-portal-api', {
      body: { action: 'save_visit', visit: payload },
    });
    setSaving(false);
    if (error || !data?.success) {
      toast.error(error?.message || data?.error || 'Failed to publish');
      return;
    }
    toast.success('Feedback published');
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[95vh] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-indigo-600" />
              Retailer Feedback
            </SheetTitle>
            {sellsOurProducts === 'yes' && score > 0 && (
              <Badge className={`text-sm px-2 py-1 ${scoreColor}`}>Score: {score}/10</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{retailer?.name}</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Gate: Sells our products? */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
            <Label className="text-indigo-800 font-medium">Currently selling our products?</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(['yes','no'] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSellsOurProducts(opt)}
                  className={`h-11 rounded-lg border font-medium text-sm ${
                    sellsOurProducts === opt
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  {opt === 'yes' ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
          </div>

          {sellsOurProducts === 'yes' && (
            <>
              {/* Star ratings */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Star className="h-5 w-5 text-amber-500" />
                  <h3 className="text-base font-semibold text-indigo-700">Performance Ratings</h3>
                </div>
                <div className="space-y-3">
                  {STAR_PARAMS.map(p => (
                    <div key={p.key} className="rounded-lg bg-slate-50 p-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{p.label}</p>
                        <p className="text-xs text-muted-foreground">{p.hint}</p>
                      </div>
                      <StarRow
                        value={parseInt(feedback[p.key]) || 0}
                        onChange={(n) => setFeedback({ ...feedback, [p.key]: n ? n.toString() : '' })}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Store assessment dropdowns */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Store className="h-5 w-5 text-blue-600" />
                  <h3 className="text-base font-semibold text-blue-700">Store Assessment</h3>
                </div>
                <div className="space-y-3">
                  {DROPDOWN_PARAMS.map(p => (
                    <div key={p.key} className="rounded-lg bg-slate-50 p-3">
                      <Label className="font-medium text-sm">{p.label}</Label>
                      <select
                        className="mt-2 w-full h-11 border rounded-lg px-3 bg-white text-sm"
                        value={feedback[p.key] || ''}
                        onChange={(e) => setFeedback({ ...feedback, [p.key]: e.target.value })}
                      >
                        <option value="">Select</option>
                        {p.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sales outcome */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-5 w-5 text-green-600" />
                  <h3 className="text-base font-semibold text-green-700">Sales Outcome</h3>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label>Order Increase (₹)</Label>
                    <Input type="number" inputMode="decimal" value={orderIncrease}
                      onChange={e => setOrderIncrease(e.target.value)} placeholder="Additional order value" />
                  </div>
                  <div>
                    <Label>6-Month Growth Potential (₹)</Label>
                    <Input type="number" inputMode="decimal" value={monthlyPotential}
                      onChange={e => setMonthlyPotential(e.target.value)} placeholder="Expected monthly value" />
                  </div>
                </div>
              </div>
            </>
          )}

          {sellsOurProducts === 'no' && (
            <>
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                <Label className="text-amber-800 font-medium">Interested to know more about our products?</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {(['yes','no'] as const).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setInterestedToKnowMore(opt)}
                      className={`h-11 rounded-lg border font-medium text-sm ${
                        interestedToKnowMore === opt
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {opt === 'yes' ? 'Yes, interested' : 'Not interested'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Store className="h-5 w-5 text-red-600" />
                  <h3 className="text-base font-semibold text-red-700">Competition Details</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label>Competitor brand(s) sold</Label>
                    <Input value={competitionBrand} onChange={e => setCompetitionBrand(e.target.value)} placeholder="e.g. Brand X, Brand Y" />
                  </div>
                  <div>
                    <Label>SKUs / product range</Label>
                    <Textarea rows={2} value={competitionSkus} onChange={e => setCompetitionSkus(e.target.value)} placeholder="Key SKUs stocked" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Monthly value (₹)</Label>
                      <Input type="number" inputMode="decimal" value={competitionMonthlyValue}
                        onChange={e => setCompetitionMonthlyValue(e.target.value)} placeholder="Est. off-take" />
                    </div>
                    <div>
                      <Label>Pricing position</Label>
                      <select className="w-full h-11 border rounded-lg px-3 bg-white text-sm"
                        value={competitionPricing} onChange={e => setCompetitionPricing(e.target.value)}>
                        <option value="">Select</option>
                        <option>Lower than us</option>
                        <option>Similar to us</option>
                        <option>Higher than us</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ClipboardList className="h-5 w-5 text-slate-600" />
                  <h3 className="text-base font-semibold text-slate-700">Retailer Profile</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label>Retailer size</Label>
                    <select className="w-full h-11 border rounded-lg px-3 bg-white text-sm"
                      value={retailerSize} onChange={e => setRetailerSize(e.target.value)}>
                      <option value="">Select size</option>
                      {RETAILER_SIZE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Est. monthly turnover (₹)</Label>
                    <Input type="number" inputMode="decimal" value={retailerMonthlyTurnover}
                      onChange={e => setRetailerMonthlyTurnover(e.target.value)} placeholder="Overall shop turnover" />
                  </div>
                  <div>
                    <Label>Additional details</Label>
                    <Textarea rows={2} value={retailerNotes} onChange={e => setRetailerNotes(e.target.value)} placeholder="Segment, footfall, chain type…" />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          <div>
            <Label>Action items / notes</Label>
            <Textarea rows={3} value={actionItems} onChange={(e) => setActionItems(e.target.value)}
              placeholder="Agreed next steps, follow-ups…" />
          </div>

          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'GPS pending'}
            {exec?.name && <span className="ml-2">• Executive: {exec.name}</span>}
          </div>
        </div>

        {/* Sticky footer */}
        <div className="border-t bg-white px-4 py-3 flex items-center gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={publish} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Publish
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}


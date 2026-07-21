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
  Store, ChevronRight, User, ClipboardList,
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

const SENTIMENTS = ['Very positive', 'Positive', 'Neutral', 'Concerned', 'Negative'];

function VisitFormSheet({ open, onOpenChange, session, retailer, coords, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  session: any; retailer: any; coords: any; onSaved: () => void;
}) {
  const [form, setForm] = useState<any>({
    visit_purpose: '', retailer_response: '', product_interest: '',
    competitor_notes: '', pricing_feedback: '', supply_issues: '',
    overall_sentiment: '', next_action: '', additional_notes: '',
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [exec, setExec] = useState<{ id?: string; name?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      visit_purpose: '', retailer_response: '', product_interest: '',
      competitor_notes: '', pricing_feedback: '', supply_issues: '',
      overall_sentiment: '', next_action: '', additional_notes: '',
    });
    setPhoto(null); setPreview(null);
    // Auto-resolve executive from retailer.territory_id
    (async () => {
      if (!retailer?.territory_id) { setExec(null); return; }
      const { data: t } = await (supabase as any).from('territories')
        .select('assigned_user_id').eq('id', retailer.territory_id).maybeSingle();
      const uid = t?.assigned_user_id;
      if (!uid) { setExec(null); return; }
      const { data: p } = await (supabase as any).from('profiles')
        .select('full_name').eq('id', uid).maybeSingle();
      setExec({ id: uid, name: p?.full_name || 'Executive' });
    })();
  }, [open, retailer]);

  function onFile(f: File | null) {
    setPhoto(f); setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function save() {
    if (!retailer) return;
    if (!form.retailer_response.trim()) { toast.error('Please note the retailer response'); return; }
    setSaving(true);
    let photo_url: string | null = retailer.__isNew ? retailer.photo_url || null : null;
    if (photo) photo_url = await uploadPhoto(photo, 'employee-visits');
    const payload = {
      employee_id: session.id, employee_name: session.full_name,
      retailer_id: retailer.id, retailer_name: retailer.name,
      is_new_retailer: !!retailer.__isNew,
      territory_id: retailer.territory_id || null,
      territory_executive_id: exec?.id || null,
      territory_executive_name: exec?.name || null,
      retailer_photo_url: photo_url,
      latitude: coords?.lat ?? null, longitude: coords?.lng ?? null,
      ...form,
    };
    const { error } = await (supabase as any).from('employee_market_visits').insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Visit saved');
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[95vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Visit — {retailer?.name}</SheetTitle>
        </SheetHeader>

        <div className="mt-3 space-y-3">
          <Card className="bg-indigo-50/60 border-indigo-100">
            <CardContent className="p-3 text-sm space-y-1">
              <div className="flex items-center gap-2"><User className="h-3.5 w-3.5" /> <strong>Manager (you):</strong> {session.full_name}</div>
              <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />
                {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'GPS pending'}
              </div>
              <div className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" />
                <strong>Territory executive:</strong> {exec?.name || 'Not mapped'}
              </div>
            </CardContent>
          </Card>

          <div>
            <Label>Retailer photo</Label>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
              onChange={e => onFile(e.target.files?.[0] || null)} />
            {preview ? (
              <div className="relative mt-1">
                <img src={preview} className="w-full h-40 object-cover rounded-lg" />
                <Button size="sm" variant="secondary" className="absolute top-2 right-2"
                  onClick={() => fileRef.current?.click()}>Retake</Button>
              </div>
            ) : (
              <Button variant="outline" className="w-full h-20 mt-1" onClick={() => fileRef.current?.click()}>
                <Camera className="h-4 w-4 mr-2" /> Capture retailer / shop photo
              </Button>
            )}
          </div>

          <div><Label>Purpose of visit</Label>
            <Input value={form.visit_purpose} onChange={e => setForm({ ...form, visit_purpose: e.target.value })}
              placeholder="Market check, new launch, competition scan…" /></div>

          <div><Label>Retailer response *</Label>
            <Textarea rows={3} value={form.retailer_response} onChange={e => setForm({ ...form, retailer_response: e.target.value })}
              placeholder="What did the retailer say?" /></div>

          <div><Label>Products of interest</Label>
            <Textarea rows={2} value={form.product_interest} onChange={e => setForm({ ...form, product_interest: e.target.value })} /></div>

          <div><Label>Competitor observations</Label>
            <Textarea rows={2} value={form.competitor_notes} onChange={e => setForm({ ...form, competitor_notes: e.target.value })}
              placeholder="Brands seen, promotions, shelf share…" /></div>

          <div><Label>Pricing feedback</Label>
            <Textarea rows={2} value={form.pricing_feedback} onChange={e => setForm({ ...form, pricing_feedback: e.target.value })} /></div>

          <div><Label>Supply / stock issues</Label>
            <Textarea rows={2} value={form.supply_issues} onChange={e => setForm({ ...form, supply_issues: e.target.value })} /></div>

          <div>
            <Label>Overall sentiment</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {SENTIMENTS.map(s => (
                <button key={s} type="button"
                  onClick={() => setForm({ ...form, overall_sentiment: s })}
                  className={`px-3 py-1.5 rounded-full text-xs border ${form.overall_sentiment===s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div><Label>Next action</Label>
            <Input value={form.next_action} onChange={e => setForm({ ...form, next_action: e.target.value })}
              placeholder="e.g. Sample drop, executive follow-up" /></div>

          <div><Label>Additional notes</Label>
            <Textarea rows={2} value={form.additional_notes} onChange={e => setForm({ ...form, additional_notes: e.target.value })} /></div>

          <Button className="w-full bg-gradient-to-r from-indigo-600 to-cyan-500" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save visit
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

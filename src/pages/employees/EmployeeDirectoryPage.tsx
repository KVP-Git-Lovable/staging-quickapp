import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Loader2, Radar, ExternalLink } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Layout } from '@/components/Layout';

type Row = any;

const EMPTY_FORM: Row = {
  full_name: '', employee_code: '', email: '', phone: '',
  department: '', location: '', joining_date: '',
  previous_experience: '', bio: '',
  social_links: { linkedin: '', twitter: '', instagram: '' },
  follows_company_page: false,
  reports_to_directory_id: null,
};

export default function EmployeeDirectoryPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Row>(EMPTY_FORM);

  // Detail / edit dialog state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailForm, setDetailForm] = useState<Row | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailDeleting, setDetailDeleting] = useState(false);


  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('employee_directory').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) toast.error(error.message); else setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const t = q.toLowerCase();
    return rows.filter(r =>
      [r.full_name, r.employee_code, r.email, r.phone, r.department, r.location]
        .filter(Boolean).some((v: string) => v.toLowerCase().includes(t))
    );
  }, [q, rows]);

  async function save() {
    if (!form.full_name?.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    const payload = { ...form, created_by: user?.id, joining_date: form.joining_date || null };
    const { error } = await (supabase as any).from('employee_directory').insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Employee added');
    setOpen(false);
    setForm({ ...form, full_name: '', employee_code: '', email: '', phone: '', department: '', location: '', joining_date: '', previous_experience: '', bio: '' });
    load();
  }

  function openDetail(r: Row) {
    setDetailForm({ ...r, social_links: r.social_links || { linkedin: '', twitter: '', instagram: '' } });
    setEditMode(false);
    setDetailOpen(true);
  }

  async function saveDetail() {
    if (!detailForm) return;
    if (!detailForm.full_name?.trim()) { toast.error('Name required'); return; }
    setDetailSaving(true);
    const { id, created_at, updated_at, created_by, ...rest } = detailForm;
    const payload = { ...rest, joining_date: rest.joining_date || null };
    const { error } = await (supabase as any).from('employee_directory').update(payload).eq('id', id);
    setDetailSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Employee updated');
    setEditMode(false);
    setDetailOpen(false);
    load();
  }

  async function deleteDetail() {
    if (!detailForm?.id) return;
    if (!confirm(`Delete ${detailForm.full_name}? This cannot be undone.`)) return;
    setDetailDeleting(true);
    const { error } = await (supabase as any).from('employee_directory').delete().eq('id', detailForm.id);
    setDetailDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Employee deleted');
    setDetailOpen(false);
    load();
  }

  return (
    <Layout>
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-4">

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Employees</h1>
          <p className="text-sm text-muted-foreground">Company staff directory including non-user records</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Add Employee</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add Employee</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Full Name *</Label><Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><Label>Employee ID</Label><Input value={form.employee_code} onChange={e => setForm({ ...form, employee_code: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Department</Label><Input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} /></div>
              <div><Label>Location</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
              <div><Label>Reports To</Label>
                <select className="w-full border rounded-md h-10 px-2 bg-background"
                  value={form.reports_to_directory_id || ''}
                  onChange={e => setForm({ ...form, reports_to_directory_id: e.target.value || null })}>
                  <option value="">—</option>
                  {rows.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                </select>
              </div>
              <div><Label>Joining Date</Label><Input type="date" value={form.joining_date} onChange={e => setForm({ ...form, joining_date: e.target.value })} /></div>
              <div className="col-span-2"><Label>LinkedIn</Label><Input value={form.social_links.linkedin} onChange={e => setForm({ ...form, social_links: { ...form.social_links, linkedin: e.target.value } })} /></div>
              <div><Label>Twitter</Label><Input value={form.social_links.twitter} onChange={e => setForm({ ...form, social_links: { ...form.social_links, twitter: e.target.value } })} /></div>
              <div><Label>Instagram</Label><Input value={form.social_links.instagram} onChange={e => setForm({ ...form, social_links: { ...form.social_links, instagram: e.target.value } })} /></div>
              <div className="col-span-2 flex items-center gap-2">
                <Checkbox id="follow" checked={form.follows_company_page} onCheckedChange={v => setForm({ ...form, follows_company_page: !!v })} />
                <Label htmlFor="follow" className="cursor-pointer">Following the company page</Label>
              </div>
              <div className="col-span-2"><Label>Previous Experience</Label><Textarea rows={3} value={form.previous_experience} onChange={e => setForm({ ...form, previous_experience: e.target.value })} /></div>
              <div className="col-span-2"><Label>Brief / Bio</Label><Textarea rows={3} value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} /></div>
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
            <Input className="pl-8" placeholder="Search name, email, department…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…</div>
            : filtered.length === 0 ? <div className="py-12 text-center text-muted-foreground">No employees yet</div>
            : <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Emp ID</TableHead><TableHead>Department</TableHead>
                <TableHead>Location</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead>
                <TableHead>Follows</TableHead><TableHead>Market Portal</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <button
                        onClick={() => openDetail(r)}
                        className="text-indigo-600 hover:underline text-left"
                      >
                        {r.full_name}
                      </button>
                    </TableCell>
                    <TableCell>{r.employee_code || '—'}</TableCell>
                    <TableCell>{r.department || '—'}</TableCell>
                    <TableCell>{r.location || '—'}</TableCell>
                    <TableCell>{r.email || '—'}</TableCell>
                    <TableCell>{r.phone || '—'}</TableCell>
                    <TableCell>{r.follows_company_page ? <Badge>Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!r.portal_enabled}
                          onCheckedChange={async (v) => {
                            const { error } = await (supabase as any).from('employee_directory')
                              .update({ portal_enabled: v }).eq('id', r.id);
                            if (error) { toast.error(error.message); return; }
                            toast.success(v ? 'Portal enabled' : 'Portal disabled');
                            load();
                          }}
                        />
                        {r.portal_enabled && (
                          <a
                            href={`/employee-portal/login?preview=${r.id}`}
                            target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                          >
                            <Radar className="h-3.5 w-3.5" /> Open <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>}
        </CardContent>
      </Card>

      {/* Detail / Edit dialog */}
      <Dialog open={detailOpen} onOpenChange={(o) => { setDetailOpen(o); if (!o) setEditMode(false); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editMode ? 'Edit Employee' : 'Employee Details'}</DialogTitle>
          </DialogHeader>
          {detailForm && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label>Full name *</Label>
                <Input disabled={!editMode} value={detailForm.full_name || ''} onChange={e => setDetailForm({ ...detailForm, full_name: e.target.value })} />
              </div>
              <div><Label>Employee code</Label><Input disabled={!editMode} value={detailForm.employee_code || ''} onChange={e => setDetailForm({ ...detailForm, employee_code: e.target.value })} /></div>
              <div><Label>Department</Label><Input disabled={!editMode} value={detailForm.department || ''} onChange={e => setDetailForm({ ...detailForm, department: e.target.value })} /></div>
              <div><Label>Email</Label><Input disabled={!editMode} value={detailForm.email || ''} onChange={e => setDetailForm({ ...detailForm, email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input disabled={!editMode} value={detailForm.phone || ''} onChange={e => setDetailForm({ ...detailForm, phone: e.target.value })} /></div>
              <div><Label>Location</Label><Input disabled={!editMode} value={detailForm.location || ''} onChange={e => setDetailForm({ ...detailForm, location: e.target.value })} /></div>
              <div><Label>Joining date</Label><Input type="date" disabled={!editMode} value={detailForm.joining_date || ''} onChange={e => setDetailForm({ ...detailForm, joining_date: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Previous experience</Label><Textarea disabled={!editMode} value={detailForm.previous_experience || ''} onChange={e => setDetailForm({ ...detailForm, previous_experience: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Bio</Label><Textarea disabled={!editMode} value={detailForm.bio || ''} onChange={e => setDetailForm({ ...detailForm, bio: e.target.value })} /></div>
              <div><Label>LinkedIn</Label><Input disabled={!editMode} value={detailForm.social_links?.linkedin || ''} onChange={e => setDetailForm({ ...detailForm, social_links: { ...detailForm.social_links, linkedin: e.target.value } })} /></div>
              <div><Label>Twitter</Label><Input disabled={!editMode} value={detailForm.social_links?.twitter || ''} onChange={e => setDetailForm({ ...detailForm, social_links: { ...detailForm.social_links, twitter: e.target.value } })} /></div>
              <div><Label>Instagram</Label><Input disabled={!editMode} value={detailForm.social_links?.instagram || ''} onChange={e => setDetailForm({ ...detailForm, social_links: { ...detailForm.social_links, instagram: e.target.value } })} /></div>
              <div className="flex items-center gap-2 mt-6">
                <Checkbox disabled={!editMode} checked={!!detailForm.follows_company_page} onCheckedChange={(v) => setDetailForm({ ...detailForm, follows_company_page: !!v })} />
                <Label>Follows company page</Label>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteDetail} disabled={detailDeleting}>
              {detailDeleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Delete
            </Button>
            {editMode ? (
              <Button onClick={saveDetail} disabled={detailSaving}>
                {detailSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save
              </Button>
            ) : (
              <Button onClick={() => setEditMode(true)}>Edit</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

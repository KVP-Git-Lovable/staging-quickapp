import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Radar } from 'lucide-react';
import { toast } from 'sonner';

const SESSION_KEY = 'employee_portal_session';

export function getEmployeeSession() {
  try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function clearEmployeeSession() { localStorage.removeItem(SESSION_KEY); }

export default function EmployeePortalLogin() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  // Preview mode: admins can jump in from the employee master via ?preview=<id>
  useEffect(() => {
    const preview = params.get('preview');
    if (preview) {
      (async () => {
        const { data } = await (supabase as any)
          .from('employee_directory').select('*').eq('id', preview).maybeSingle();
        if (data) {
          localStorage.setItem(SESSION_KEY, JSON.stringify(data));
          nav('/employee-portal', { replace: true });
        }
      })();
      return;
    }
    if (getEmployeeSession()) nav('/employee-portal');
  }, [nav, params]);

  async function login() {
    if (!phone.trim()) return;
    setLoading(true);
    const { data, error } = await (supabase as any).functions.invoke('employee-portal-api', {
      body: { action: 'login', phone: phone.trim(), pin: pin.trim() },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    if (!data?.success) { toast.error(data?.error || 'Login failed'); return; }
    localStorage.setItem(SESSION_KEY, JSON.stringify(data.employee));
    toast.success(`Welcome ${data.employee.full_name}`);
    nav('/employee-portal');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-800 p-4">
      <Card className="w-full max-w-md border-none shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg">
            <Radar className="h-7 w-7 text-white" />
          </div>
          <CardTitle className="text-xl">Market Intelligence Portal</CardTitle>
          <p className="text-sm text-muted-foreground">Field insights, made effortless</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Registered phone" />
          </div>
          <div>
            <Label>PIN (optional)</Label>
            <Input value={pin} onChange={e => setPin(e.target.value)} type="password"
              onKeyDown={e => e.key === 'Enter' && login()} />
          </div>
          <Button className="w-full bg-gradient-to-r from-indigo-600 to-cyan-500 hover:opacity-90"
            onClick={login} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

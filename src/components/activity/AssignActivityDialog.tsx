import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActivityTypes } from '@/hooks/useActivityTypes';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface AssignableUser { user_id: string; user_name: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAssigned?: () => void;
}

const DURATIONS: { label: string; minutes: number | 'custom' | 'full' }[] = [
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '4h', minutes: 240 },
  { label: 'Full day', minutes: 'full' },
  { label: 'Custom', minutes: 'custom' },
];

export const AssignActivityDialog: React.FC<Props> = ({ open, onOpenChange, onAssigned }) => {
  const { types } = useActivityTypes();

  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<AssignableUser[]>([]);

  const [category, setCategory] = useState<string>('');
  const [subType, setSubType] = useState<string>('');
  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [durationChoice, setDurationChoice] = useState<string>('60');
  const [customMinutes, setCustomMinutes] = useState<number>(60);
  const [halfDay, setHalfDay] = useState<'full' | 'first_half' | 'second_half'>('full');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data, error } = await supabase.rpc('get_assignable_users' as any);
      if (!error && Array.isArray(data)) setUsers(data as AssignableUser[]);
    })();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSelected([]); setCategory(''); setSubType(''); setNote('');
      setDurationChoice('60'); setCustomMinutes(60); setHalfDay('full');
      setDate(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [open]);

  const categories = useMemo(
    () => types.filter((t) => t.is_active && t.is_category),
    [types]
  );
  const subTypes = useMemo(
    () =>
      types.filter(
        (t) => t.is_active && !t.is_category && t.show_in_picker && (!category || t.parent_id === category)
      ),
    [types, category]
  );

  const selectedSub = types.find((t) => t.id === subType);

  const toggleUser = (u: AssignableUser) => {
    setSelected((prev) =>
      prev.some((x) => x.user_id === u.user_id) ? prev.filter((x) => x.user_id !== u.user_id) : [...prev, u]
    );
  };

  const resolveMinutes = (): number => {
    if (durationChoice === 'full') return 480;
    if (durationChoice === 'custom') return Math.max(1, customMinutes || 0);
    return parseInt(durationChoice, 10) || 60;
  };

  const canSubmit = selected.length > 0 && !!selectedSub && !busy;

  const handleAssign = async () => {
    if (!canSubmit || !selectedSub) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('assign_activity' as any, {
      p_subordinate_ids: selected.map((s) => s.user_id),
      p_activity_type: selectedSub.name,
      p_activity_date: date,
      p_expected_duration_minutes: resolveMinutes(),
      p_half_day_type: halfDay === 'full' ? null : halfDay,
      p_note: note || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message || 'Failed to assign');
      return;
    }
    const created = (data as any)?.created ?? (Array.isArray(data) ? data.length : selected.length);
    const skipped = (data as any)?.skipped ?? 0;
    toast.success(`Assigned to ${created}${skipped ? ` · skipped ${skipped}` : ''}`);
    onOpenChange(false);
    onAssigned?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign activity</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Assign to */}
          <div>
            <label className="text-sm font-medium">Assign to <span className="text-rose-500">*</span></label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between mt-1">
                  {selected.length ? `${selected.length} selected` : 'Select people'}
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0 pointer-events-auto" align="start">
                <Command>
                  <CommandInput placeholder="Search…" />
                  <CommandList>
                    <CommandEmpty>No users.</CommandEmpty>
                    <CommandGroup>
                      {users.map((u) => {
                        const active = selected.some((x) => x.user_id === u.user_id);
                        return (
                          <CommandItem key={u.user_id} onSelect={() => toggleUser(u)}>
                            <Check className={cn('mr-2 h-4 w-4', active ? 'opacity-100' : 'opacity-0')} />
                            {u.user_name}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selected.map((s) => (
                  <Badge key={s.user_id} variant="secondary" className="gap-1">
                    {s.user_name}
                    <button onClick={() => toggleUser(s)}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Activity type */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setSubType(''); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Sub-type <span className="text-rose-500">*</span></label>
              <Select value={subType} onValueChange={setSubType} disabled={!category && subTypes.length === 0}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {subTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="text-sm font-medium">Date</label>
            <Input type="date" value={date} min={format(new Date(), 'yyyy-MM-dd')} onChange={(e) => setDate(e.target.value)} className="mt-1" />
          </div>

          {/* Duration */}
          <div>
            <label className="text-sm font-medium">Expected duration</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {DURATIONS.map((d) => {
                const val = d.minutes === 'full' ? 'full' : d.minutes === 'custom' ? 'custom' : String(d.minutes);
                return (
                  <Button
                    key={d.label}
                    type="button"
                    size="sm"
                    variant={durationChoice === val ? 'default' : 'outline'}
                    onClick={() => setDurationChoice(val)}
                  >
                    {d.label}
                  </Button>
                );
              })}
            </div>
            {durationChoice === 'custom' && (
              <Input
                type="number"
                min={1}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(parseInt(e.target.value || '0', 10))}
                className="mt-2 w-32"
                placeholder="Minutes"
              />
            )}
          </div>

          {/* Time of day */}
          <div>
            <label className="text-sm font-medium">Time of day</label>
            <div className="flex gap-2 mt-1">
              {[
                { v: 'full', label: 'Full day' },
                { v: 'first_half', label: 'First half' },
                { v: 'second_half', label: 'Second half' },
              ].map((o) => (
                <Button
                  key={o.v}
                  type="button"
                  size="sm"
                  variant={halfDay === (o.v as any) ? 'default' : 'outline'}
                  onClick={() => setHalfDay(o.v as any)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div>
            <label className="text-sm font-medium">Instructions (optional)</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1" placeholder="Add context for the assignee…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleAssign} disabled={!canSubmit}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AssignActivityDialog;

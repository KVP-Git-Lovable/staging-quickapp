import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Plus, Pencil, Trash2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import AddressFormFields, { type AddressValue } from '@/components/common/AddressFormFields';
import LocationCaptureButton from '@/components/common/LocationCaptureButton';
import { useSavedAddresses, type SavedAddress, type SavedAddressInput } from '@/hooks/useSavedAddresses';

interface Props {
  distributorId: string;
  trigger?: React.ReactNode;
  onChanged?: () => void;
}

const emptyAddress: AddressValue = {
  address_line1: '', address_line2: '', city: '', state: '', pincode: '', country: 'India',
  landmark: '', contact_person: '', contact_phone: '',
};

export const SavedAddressesManager = ({ distributorId, trigger, onChanged }: Props) => {
  const { addresses, loading, create, update, remove } = useSavedAddresses(distributorId);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [label, setLabel] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [address, setAddress] = useState<AddressValue>(emptyAddress);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const reset = () => {
    setEditing(null); setLabel(''); setIsDefault(false);
    setAddress(emptyAddress); setLatitude(null); setLongitude(null);
    setShowForm(false);
  };

  const startAdd = () => {
    reset();
    setIsDefault(addresses.length === 0);
    setShowForm(true);
  };

  const startEdit = (a: SavedAddress) => {
    setEditing(a);
    setLabel(a.label);
    setIsDefault(a.is_default);
    setAddress({
      address_line1: a.address_line1, address_line2: a.address_line2 || '',
      city: a.city, state: a.state || '', pincode: a.pincode, country: a.country,
      landmark: a.landmark || '', contact_person: a.contact_person || '', contact_phone: a.contact_phone || '',
    });
    setLatitude(a.latitude); setLongitude(a.longitude);
    setShowForm(true);
  };

  const save = async () => {
    if (!label.trim()) { toast.error('Label is required'); return; }
    if (!address.address_line1?.trim() || !address.city?.trim() || !address.pincode?.trim()) {
      toast.error('Address line 1, city and pincode are required');
      return;
    }
    const payload: SavedAddressInput = {
      label: label.trim(),
      address_line1: address.address_line1!.trim(),
      address_line2: address.address_line2 || null,
      city: address.city!.trim(),
      state: address.state || null,
      pincode: address.pincode!.trim(),
      country: address.country || 'India',
      landmark: address.landmark || null,
      contact_person: address.contact_person || null,
      contact_phone: address.contact_phone || null,
      latitude, longitude,
      is_default: isDefault,
    };
    setSaving(true);
    try {
      if (editing) await update(editing.id, payload);
      else await create(payload);
      toast.success(editing ? 'Address updated' : 'Address saved');
      reset();
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    try { await remove(id); toast.success('Address removed'); onChanged?.(); }
    catch (err: any) { toast.error(err.message || 'Failed to delete'); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        {trigger || <Button variant="link" size="sm" className="h-auto p-0 text-xs">Manage saved addresses</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Saved Addresses</DialogTitle>
        </DialogHeader>

        {!showForm && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={startAdd}><Plus className="w-3.5 h-3.5 mr-1" /> Add address</Button>
            </div>
            {loading ? (
              <div className="text-center py-6 text-sm text-muted-foreground">Loading...</div>
            ) : addresses.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No saved addresses yet.</div>
            ) : (
              <div className="space-y-2">
                {addresses.map((a) => (
                  <div key={a.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{a.label}</span>
                        {a.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                        {a.latitude !== null && a.longitude !== null && (
                          <MapPin className="w-3 h-3 text-emerald-600" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{a.formatted_address}</p>
                      {a.contact_person && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{a.contact_person} {a.contact_phone ? `• ${a.contact_phone}` : ''}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(a)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => del(a.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showForm && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Label <span className="text-destructive">*</span></Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Mumbai Branch, Event Site" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="saved-default" checked={isDefault} onCheckedChange={(v) => setIsDefault(!!v)} />
              <Label htmlFor="saved-default" className="cursor-pointer text-sm">Set as default address</Label>
            </div>
            <Separator />
            <AddressFormFields value={address} onChange={setAddress} />
            <LocationCaptureButton
              latitude={latitude}
              longitude={longitude}
              onChange={(lat, lng) => { setLatitude(lat); setLongitude(lng); }}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowForm(false)}>Back</Button>
              <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Save'}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SavedAddressesManager;

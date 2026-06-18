import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AddressParts } from '@/lib/addressFormat';

export type AddressValue = AddressParts & {
  contact_person?: string | null;
  contact_phone?: string | null;
};

interface Props {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  showContact?: boolean;
  compact?: boolean;
}

export const AddressFormFields = ({ value, onChange, showContact = true, compact = false }: Props) => {
  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });
  const inputCls = compact ? 'h-9' : '';
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2">
        <Label className="text-xs">Address Line 1 <span className="text-destructive">*</span></Label>
        <Input className={inputCls} value={value.address_line1 || ''} onChange={(e) => set({ address_line1: e.target.value })} placeholder="House / building / street" />
      </div>
      <div className="sm:col-span-2">
        <Label className="text-xs">Address Line 2</Label>
        <Input className={inputCls} value={value.address_line2 || ''} onChange={(e) => set({ address_line2: e.target.value })} placeholder="Area / locality" />
      </div>
      <div>
        <Label className="text-xs">City <span className="text-destructive">*</span></Label>
        <Input className={inputCls} value={value.city || ''} onChange={(e) => set({ city: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">State</Label>
        <Input className={inputCls} value={value.state || ''} onChange={(e) => set({ state: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">Pincode <span className="text-destructive">*</span></Label>
        <Input className={inputCls} value={value.pincode || ''} onChange={(e) => set({ pincode: e.target.value })} inputMode="numeric" />
      </div>
      <div>
        <Label className="text-xs">Country</Label>
        <Input className={inputCls} value={value.country || 'India'} onChange={(e) => set({ country: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <Label className="text-xs">Landmark</Label>
        <Input className={inputCls} value={value.landmark || ''} onChange={(e) => set({ landmark: e.target.value })} />
      </div>
      {showContact && (
        <>
          <div>
            <Label className="text-xs">Contact Person</Label>
            <Input className={inputCls} value={value.contact_person || ''} onChange={(e) => set({ contact_person: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Contact Phone</Label>
            <Input className={inputCls} value={value.contact_phone || ''} onChange={(e) => set({ contact_phone: e.target.value })} inputMode="tel" />
          </div>
        </>
      )}
    </div>
  );
};

export default AddressFormFields;

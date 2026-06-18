import { useEffect, useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Warehouse as WarehouseIcon, BookMarked, Edit3, AlertCircle } from 'lucide-react';
import AddressFormFields, { type AddressValue } from '@/components/common/AddressFormFields';
import LocationCaptureButton from '@/components/common/LocationCaptureButton';
import { useWarehouses, type Warehouse } from '@/hooks/useWarehouses';
import { useSavedAddresses, type SavedAddress } from '@/hooks/useSavedAddresses';
import SavedAddressesManager from './SavedAddressesManager';
import { formatAddress } from '@/lib/addressFormat';

export type ShippingSource = 'warehouse' | 'saved' | 'custom';

export interface ShippingSelection {
  source: ShippingSource;
  warehouseId?: string | null;
  savedAddressId?: string | null;
  custom?: AddressValue;
  customLatitude?: number | null;
  customLongitude?: number | null;
  saveCustom?: boolean;
  customLabel?: string;
}

interface Props {
  distributorId: string;
  value: ShippingSelection;
  onChange: (next: ShippingSelection) => void;
}

const emptyAddress: AddressValue = {
  address_line1: '', address_line2: '', city: '', state: '', pincode: '', country: 'India',
  landmark: '', contact_person: '', contact_phone: '',
};

export const ShippingAddressPicker = ({ distributorId, value, onChange }: Props) => {
  const { warehouses, defaultWarehouse, loading: whLoading } = useWarehouses(distributorId);
  const { addresses, loading: addrLoading } = useSavedAddresses(distributorId);

  // Auto-select defaults
  useEffect(() => {
    if (value.source === 'warehouse' && !value.warehouseId && defaultWarehouse) {
      onChange({ ...value, warehouseId: defaultWarehouse.id });
    }
  }, [defaultWarehouse, value.source]); // eslint-disable-line

  useEffect(() => {
    if (value.source === 'saved' && !value.savedAddressId && addresses.length > 0) {
      const def = addresses.find(a => a.is_default) || addresses[0];
      onChange({ ...value, savedAddressId: def.id });
    }
  }, [addresses, value.source]); // eslint-disable-line

  const selectedWarehouse = useMemo<Warehouse | undefined>(
    () => warehouses.find(w => w.id === value.warehouseId),
    [warehouses, value.warehouseId]
  );
  const selectedSaved = useMemo<SavedAddress | undefined>(
    () => addresses.find(a => a.id === value.savedAddressId),
    [addresses, value.savedAddressId]
  );

  const setSource = (source: ShippingSource) => onChange({ ...value, source });

  const renderPreview = (lines: string, contact?: string | null, phone?: string | null, hasGeo?: boolean) => (
    <div className="mt-2 rounded-lg border bg-muted/30 p-3 text-xs">
      <p className="text-foreground">{lines}</p>
      {(contact || phone) && (
        <p className="text-muted-foreground mt-1">{contact}{contact && phone ? ' • ' : ''}{phone}</p>
      )}
      {hasGeo && (
        <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-emerald-700">
          <MapPin className="w-3 h-3" /> Geolocation saved
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <Label className="text-xs font-medium text-muted-foreground">
        Shipping Address <span className="text-muted-foreground/70">(Optional)</span>
      </Label>

      <RadioGroup
        value={value.source}
        onValueChange={(v) => setSource(v as ShippingSource)}
        className="grid grid-cols-3 gap-2"
      >
        {[
          { v: 'warehouse', label: 'Warehouse', icon: WarehouseIcon },
          { v: 'saved', label: 'Saved', icon: BookMarked },
          { v: 'custom', label: 'New custom', icon: Edit3 },
        ].map(({ v, label, icon: Icon }) => (
          <label
            key={v}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer text-xs transition-colors ${
              value.source === v ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-input hover:bg-muted/40'
            }`}
          >
            <RadioGroupItem value={v} className="h-3.5 w-3.5" />
            <Icon className="w-3.5 h-3.5" />
            <span className="font-medium">{label}</span>
          </label>
        ))}
      </RadioGroup>

      {value.source === 'warehouse' && (
        <div>
          <Select
            value={value.warehouseId || ''}
            onValueChange={(v) => onChange({ ...value, warehouseId: v })}
            disabled={whLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder={whLoading ? 'Loading…' : warehouses.length ? 'Select warehouse' : 'No warehouses available'} />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map(w => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}{w.is_default ? ' (Default)' : ''}{w.city ? ` — ${w.city}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedWarehouse && (
            selectedWarehouse.formatted_address && selectedWarehouse.address_line1 ? (
              renderPreview(
                selectedWarehouse.formatted_address,
                selectedWarehouse.contact_person,
                selectedWarehouse.contact_phone,
                selectedWarehouse.latitude !== null && selectedWarehouse.longitude !== null
              )
            ) : (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>This warehouse has no address yet. Add one in <strong>Inventory → Warehouses</strong>.</span>
              </div>
            )
          )}
        </div>
      )}

      {value.source === 'saved' && (
        <div>
          <Select
            value={value.savedAddressId || ''}
            onValueChange={(v) => onChange({ ...value, savedAddressId: v })}
            disabled={addrLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder={addrLoading ? 'Loading…' : addresses.length ? 'Select saved address' : 'No saved addresses yet'} />
            </SelectTrigger>
            <SelectContent>
              {addresses.map(a => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}{a.is_default ? ' (Default)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between mt-1.5">
            {selectedSaved && (
              <span className="text-[10px] text-muted-foreground">{selectedSaved.city}, {selectedSaved.pincode}</span>
            )}
            <SavedAddressesManager distributorId={distributorId} />
          </div>
          {selectedSaved && renderPreview(
            selectedSaved.formatted_address || formatAddress(selectedSaved),
            selectedSaved.contact_person,
            selectedSaved.contact_phone,
            selectedSaved.latitude !== null && selectedSaved.longitude !== null
          )}
        </div>
      )}

      {value.source === 'custom' && (
        <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
          <AddressFormFields
            value={value.custom || emptyAddress}
            onChange={(next) => onChange({ ...value, custom: next })}
            compact
          />
          <LocationCaptureButton
            latitude={value.customLatitude ?? null}
            longitude={value.customLongitude ?? null}
            onChange={(lat, lng) => onChange({ ...value, customLatitude: lat, customLongitude: lng })}
          />
          <div className="space-y-2 pt-1 border-t">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={!!value.saveCustom}
                onCheckedChange={(v) => onChange({ ...value, saveCustom: !!v })}
              />
              Save this address for future orders
            </label>
            {value.saveCustom && (
              <Input
                placeholder="Label (e.g. Pune Event Site)"
                value={value.customLabel || ''}
                onChange={(e) => onChange({ ...value, customLabel: e.target.value })}
                className="h-8 text-xs"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShippingAddressPicker;

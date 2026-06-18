import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Warehouse as WarehouseIcon, Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import AddressFormFields, { type AddressValue } from '@/components/common/AddressFormFields';
import LocationCaptureButton from '@/components/common/LocationCaptureButton';
import type { Warehouse, WarehouseInput } from '@/hooks/useWarehouses';

interface WarehouseManagementProps {
  warehouses: Warehouse[];
  loading: boolean;
  onCreateWarehouse: (input: WarehouseInput) => Promise<void>;
  onUpdateWarehouse: (id: string, input: WarehouseInput) => Promise<void>;
  onDeleteWarehouse: (id: string) => Promise<void>;
  defaultOpen?: boolean;
}

const emptyAddress: AddressValue = {
  address_line1: '', address_line2: '', city: '', state: '', pincode: '', country: 'India',
  landmark: '', contact_person: '', contact_phone: '',
};

const WarehouseManagement = ({
  warehouses,
  loading,
  onCreateWarehouse,
  onUpdateWarehouse,
  onDeleteWarehouse,
  defaultOpen = false,
}: WarehouseManagementProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [address, setAddress] = useState<AddressValue>(emptyAddress);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(''); setCode(''); setIsDefault(false);
    setAddress(emptyAddress); setLatitude(null); setLongitude(null);
  };

  const openAdd = () => {
    setEditingId(null);
    reset();
    setIsDefault(warehouses.length === 0);
    setDialogOpen(true);
  };

  const openEdit = (w: Warehouse) => {
    setEditingId(w.id);
    setName(w.name); setCode(w.code || ''); setIsDefault(w.is_default);
    setAddress({
      address_line1: w.address_line1 || '', address_line2: w.address_line2 || '',
      city: w.city || '', state: w.state || '', pincode: w.pincode || '',
      country: w.country || 'India', landmark: w.landmark || '',
      contact_person: w.contact_person || '', contact_phone: w.contact_phone || '',
    });
    setLatitude(w.latitude ?? null);
    setLongitude(w.longitude ?? null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Warehouse name is required');
      return;
    }
    const payload: WarehouseInput = {
      name: name.trim(),
      code: code.trim() || null,
      is_default: isDefault,
      ...address,
      latitude, longitude,
    };
    setSaving(true);
    try {
      if (editingId) {
        await onUpdateWarehouse(editingId, payload);
        toast.success('Warehouse updated');
      } else {
        await onCreateWarehouse(payload);
        toast.success('Warehouse created');
      }
      setDialogOpen(false);
    } catch (err: any) {
      const msg = err.message || 'Failed to save warehouse';
      if (msg.includes('duplicate') || msg.includes('unique')) {
        toast.error('A warehouse with this name already exists');
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await onDeleteWarehouse(id);
      toast.success('Warehouse deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete warehouse');
    }
  };

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer py-3 px-4 hover:bg-muted/30 transition-colors">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <WarehouseIcon className="w-4 h-4" />
                  Warehouses ({warehouses.length})
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={(e) => { e.stopPropagation(); openAdd(); }}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Warehouse
                </Button>
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 px-4 pb-4">
              {loading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                </div>
              ) : warehouses.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No warehouses found. Create one to get started.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {warehouses.map((w) => {
                      const hasAddr = !!(w.address_line1 && w.city && w.pincode);
                      return (
                        <TableRow key={w.id}>
                          <TableCell className="font-medium">{w.name}</TableCell>
                          <TableCell>{w.code || '—'}</TableCell>
                          <TableCell className="max-w-[280px]">
                            {hasAddr ? (
                              <span className="text-xs text-muted-foreground truncate block" title={w.formatted_address || ''}>
                                {w.city}, {w.pincode}
                              </span>
                            ) : (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Not set</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {w.is_default && (
                              <Badge variant="secondary" className="text-xs">Default</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(w)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(w.id)}
                                disabled={w.is_default && warehouses.length > 1}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Warehouse' : 'Add Warehouse'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name <span className="text-destructive">*</span></Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Warehouse" />
              </div>
              <div>
                <Label className="text-xs">Code</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. WH-01" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="is-default" checked={isDefault} onCheckedChange={(v) => setIsDefault(!!v)} />
              <Label htmlFor="is-default" className="cursor-pointer text-sm">Set as default warehouse</Label>
            </div>

            <Separator />
            <div>
              <h4 className="text-sm font-semibold mb-2">Address & Location</h4>
              <AddressFormFields value={address} onChange={setAddress} />
              <div className="mt-3">
                <LocationCaptureButton
                  latitude={latitude}
                  longitude={longitude}
                  onChange={(lat, lng) => { setLatitude(lat); setLongitude(lng); }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WarehouseManagement;

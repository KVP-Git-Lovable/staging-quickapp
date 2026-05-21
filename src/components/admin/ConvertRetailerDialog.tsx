import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, AlertTriangle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ExternalRetailer {
  id: number;
  company_name: string;
  address: string | null;
  city: string;
  mobile: string | null;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  state?: string | null;
  pincode?: string | null;
}

interface Beat {
  id: string;
  beat_name: string;
  beat_id: string;
}

interface ConvertRetailerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  retailer?: ExternalRetailer | null;
  retailers?: ExternalRetailer[];
  pincode: string;
  district?: string;
  onConverted: () => void;
}

export const ConvertRetailerDialog: React.FC<ConvertRetailerDialogProps> = ({
  open, onOpenChange, retailer, retailers: bulkRetailers, pincode, district, onConverted,
}) => {
  const isBulk = !!(bulkRetailers && bulkRetailers.length > 0);
  const targetRetailers = isBulk ? bulkRetailers! : (retailer ? [retailer] : []);

  const [beats, setBeats] = useState<Beat[]>([]);
  const [beatId, setBeatId] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [checkedDuplicate, setCheckedDuplicate] = useState(false);
  const [districtBeatCount, setDistrictBeatCount] = useState(0);

  useEffect(() => {
    if (open && targetRetailers.length > 0) {
      if (!isBulk && retailer) {
        setName(retailer.company_name || '');
        setAddress(retailer.address || '');
        setPhone(retailer.mobile || '');
        setCategory(retailer.category || '');
        checkDuplicate(retailer);
      } else {
        setName('');
        setAddress('');
        setPhone('');
        setCategory('');
        setDuplicateWarning(null);
      }
      setNotes('');
      setBeatId('');
      setCheckedDuplicate(false);
      fetchBeats();
    }
  }, [open, retailer, bulkRetailers, district]);

  const fetchBeats = async () => {
    // Fetch all active beats with territory info
    const { data: allBeats } = await supabase
      .from('beats')
      .select('id, beat_name, beat_id, territory_id')
      .eq('is_active', true)
      .order('beat_name');
    
    const beatsList = (allBeats as any[]) || [];
    
    if (district) {
      try {
        // Step 1: Get all pincodes in the same district
        const { data: districtPincodes } = await (supabase as any)
          .from('pincode_master')
          .select('pincode')
          .eq('district', district);
        
        const pincodeSet = new Set(
          (districtPincodes || []).map((d: any) => d.pincode).filter(Boolean) as string[]
        );
        
        if (pincodeSet.size > 0) {
          // Step 2: Find territories whose pincode_ranges overlap with district pincodes
          const { data: territories } = await supabase
            .from('territories')
            .select('id, pincode_ranges');
          
          const matchingTerritoryIds = new Set<string>();
          (territories || []).forEach((t: any) => {
            const ranges = t.pincode_ranges as string[] | null;
            if (ranges && ranges.some((p: string) => pincodeSet.has(p))) {
              matchingTerritoryIds.add(t.id);
            }
          });
          
          // Step 3: Also find beats that have retailers in this district
          // Use a single query: find distinct beat_ids from retailers whose location_tag contains district name or the current pincode
          const beatIdsWithDistrictRetailers = new Set<string>();
          const { data: districtRetailers } = await supabase
            .from('retailers')
            .select('beat_id')
            .or(`location_tag.ilike.%${district}%,location_tag.ilike.%${pincode}%`)
            .not('beat_id', 'is', null)
            .limit(500);
          (districtRetailers || []).forEach((r: any) => {
            if (r.beat_id) beatIdsWithDistrictRetailers.add(r.beat_id);
          });
          
          // Step 4: Split beats into district-relevant and others
          const districtBeats: Beat[] = [];
          const otherBeats: Beat[] = [];
          
          beatsList.forEach((b: any) => {
            const beat: Beat = { id: b.id, beat_name: b.beat_name, beat_id: b.beat_id };
            if (
              (b.territory_id && matchingTerritoryIds.has(b.territory_id)) ||
              beatIdsWithDistrictRetailers.has(b.beat_id)
            ) {
              districtBeats.push(beat);
            } else {
              otherBeats.push(beat);
            }
          });
          
          if (districtBeats.length > 0) {
            setBeats([...districtBeats, ...otherBeats]);
            setDistrictBeatCount(districtBeats.length);
            return;
          }
        }
      } catch (err) {
        console.error('Error filtering beats by district:', err);
      }
    }
    
    // Fallback: show all beats
    setBeats(beatsList.map((b: any) => ({ id: b.id, beat_name: b.beat_name, beat_id: b.beat_id })));
    setDistrictBeatCount(0);
  };

  const checkDuplicate = async (r: ExternalRetailer) => {
    setDuplicateWarning(null);
    if (r.mobile) {
      const { data } = await supabase.from('retailers').select('id, name, phone').eq('phone', r.mobile).limit(5);
      if (data && data.length > 0) {
        setDuplicateWarning(`Similar retailer found: "${data[0].name}" with phone ${data[0].phone}`);
        return;
      }
    }
    const { data: nameMatch } = await supabase
      .from('retailers')
      .select('id, name')
      .ilike('name', `%${r.company_name}%`)
      .limit(3);
    if (nameMatch && nameMatch.length > 0) {
      setDuplicateWarning(`Similar retailer found: "${nameMatch[0].name}"`);
    }
  };

  const handleConvert = async () => {
    if (!beatId) {
      toast.error('Please select a beat');
      return;
    }
    if (targetRetailers.length === 0) return;

    if (!isBulk && duplicateWarning && !checkedDuplicate) {
      setCheckedDuplicate(true);
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const selectedBeat = beats.find(b => b.id === beatId);
      let successCount = 0;

      for (const r of targetRetailers) {
        const retailerName = isBulk ? r.company_name : name.trim();
        const retailerAddress = isBulk ? (r.address || 'N/A') : (address.trim() || 'N/A');
        const retailerPhone = isBulk ? (r.mobile || null) : (phone.trim() || null);
        const retailerCategory = isBulk ? (r.category || null) : (category.trim() || null);

        const { data: newRetailer, error: insertErr } = await supabase
          .from('retailers')
          .insert({
            user_id: user.id,
            beat_id: selectedBeat?.beat_id || beatId,
            beat_name: selectedBeat?.beat_name || '',
            name: retailerName,
            address: retailerAddress,
            phone: retailerPhone,
            category: retailerCategory,
            latitude: r.latitude,
            longitude: r.longitude,
            location_tag: [r.city, pincode].filter(Boolean).join(', '),
            entity_type: 'retailer',
            status: 'active',
            notes: notes.trim() || `Converted from external DB (PIN: ${pincode})`,
            verified: false,
          })
          .select('id')
          .single();

        if (insertErr) {
          console.error(`Failed to convert "${r.company_name}":`, insertErr);
          continue;
        }

        await (supabase as any)
          .from('retailer_external_db')
          .update({
            is_converted: true,
            converted_retailer_id: newRetailer.id,
          })
          .eq('id', r.id);

        successCount++;
      }

      if (successCount > 0) {
        toast.success(isBulk
          ? `${successCount} retailer${successCount !== 1 ? 's' : ''} added to system`
          : `"${name}" added to system successfully`
        );
        onConverted();
        onOpenChange(false);
      } else {
        toast.error('No retailers could be converted');
      }
    } catch (err: any) {
      toast.error(err.message || 'Conversion failed');
    } finally {
      setLoading(false);
    }
  };

  if (targetRetailers.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isBulk ? `Convert ${targetRetailers.length} retailers` : 'Convert to Internal Retailer'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
          {/* Bulk summary */}
          {isBulk && (
            <div className="rounded-md border border-border bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Selected retailers:</p>
              <ScrollArea className="max-h-28">
                <ul className="space-y-1">
                  {targetRetailers.map(r => (
                    <li key={r.id} className="text-xs text-foreground">
                      • {r.company_name} <span className="text-muted-foreground">— {r.city}</span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}

          {/* Duplicate warning (single mode only) */}
          {!isBulk && duplicateWarning && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
              <div className="text-xs">
                <p className="font-medium text-yellow-800 dark:text-yellow-400">Possible duplicate</p>
                <p className="text-yellow-700 dark:text-yellow-500">{duplicateWarning}</p>
                {checkedDuplicate && (
                  <p className="mt-1 font-medium text-yellow-800 dark:text-yellow-400">Click "Convert" again to proceed anyway.</p>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">Beat (required)</label>
            <Select value={beatId} onValueChange={setBeatId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a beat" />
              </SelectTrigger>
              <SelectContent>
                {districtBeatCount > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800">
                      Beats in {district || 'this district'}
                    </div>
                    {beats.slice(0, districtBeatCount).map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.beat_name} ({b.beat_id})</SelectItem>
                    ))}
                    {beats.length > districtBeatCount && (
                      <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground bg-muted/50 border-t border-b border-border">
                        Other beats
                      </div>
                    )}
                    {beats.slice(districtBeatCount).map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.beat_name} ({b.beat_id})</SelectItem>
                    ))}
                  </>
                )}
                {districtBeatCount === 0 && beats.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.beat_name} ({b.beat_id})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Single-mode fields */}
          {!isBulk && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Retailer Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Address</label>
                <Input value={address} onChange={e => setAddress(e.target.value)} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Phone</label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Category</label>
                  <Input value={category} onChange={e => setCategory(e.target.value)} className="mt-1" />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" placeholder="Additional notes..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConvert} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {!isBulk && checkedDuplicate && duplicateWarning
              ? 'Convert Anyway'
              : isBulk
                ? `Convert ${targetRetailers.length} Retailers`
                : 'Convert to Retailer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

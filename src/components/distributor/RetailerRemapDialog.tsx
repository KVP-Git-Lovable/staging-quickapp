import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, ArrowRight, Store, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Retailer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  distributor_id: string | null;
  distributor_name?: string;
}

interface Distributor {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceDistributorId?: string;
  onSuccess?: () => void;
}

export function RetailerRemapDialog({ open, onOpenChange, sourceDistributorId, onSuccess }: Props) {
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [targetDistributorId, setTargetDistributorId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [distributorSearch, setDistributorSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, sourceDistributorId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load retailers
      let retailerQuery = supabase
        .from('retailers')
        .select('id, name, phone, address, distributor_id')
        .order('name');
      
      if (sourceDistributorId) {
        retailerQuery = retailerQuery.eq('distributor_id', sourceDistributorId);
      }

      const { data: retailersData, error: retailerError } = await retailerQuery;
      if (retailerError) throw retailerError;

      // Load distributors for target selection (exclude user-derived placeholders)
      const { data: distributorsData, error: distError } = await supabase
        .from('distributors')
        .select('id, name')
        .order('name');
      if (distError) throw distError;

      // Get distributor names for retailers
      const retailersWithDist = (retailersData || []).map(r => {
        const dist = distributorsData?.find(d => d.id === r.distributor_id);
        return { ...r, distributor_name: dist?.name };
      });

      setRetailers(retailersWithDist);
      setDistributors(distributorsData || []);
    } catch (error: any) {
      toast.error("Failed to load data: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredRetailers = retailers.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.phone?.includes(searchQuery) ||
    r.address?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDistributors = distributors.filter(d =>
    d.name.toLowerCase().includes(distributorSearch.toLowerCase())
  );

  const toggleRetailer = (id: string) => {
    setSelectedRetailers(prev => 
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedRetailers.length === filteredRetailers.length) {
      setSelectedRetailers([]);
    } else {
      setSelectedRetailers(filteredRetailers.map(r => r.id));
    }
  };

  const handleRemap = async () => {
    if (selectedRetailers.length === 0) {
      toast.error("Please select at least one retailer");
      return;
    }
    if (!targetDistributorId) {
      toast.error("Please select a target distributor");
      return;
    }

    setSubmitting(true);
    try {
      const targetDist = distributors.find(d => d.id === targetDistributorId);
      
      const { error } = await supabase
        .from('retailers')
        .update({ 
          distributor_id: targetDistributorId,
          parent_type: 'Distributor',
          parent_name: targetDist?.name || null
        })
        .in('id', selectedRetailers);

      if (error) throw error;

      toast.success(`${selectedRetailers.length} retailer(s) remapped successfully`);
      setSelectedRetailers([]);
      setTargetDistributorId("");
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error("Failed to remap retailers: " + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="flex-shrink-0 p-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Remap Retailers to Distributor
          </DialogTitle>
          <DialogDescription>
            Select retailers and choose a new distributor to transfer them to.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
            {/* Retailer Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Store className="h-4 w-4 text-muted-foreground" />
                  Select Retailers
                </h4>
                <Button variant="ghost" size="sm" onClick={toggleAll} className="h-7 text-xs">
                  {selectedRetailers.length === filteredRetailers.length ? "Deselect All" : "Select All"}
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search retailers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <div className="h-[180px] md:h-[250px] border rounded-md bg-muted/20 overflow-y-auto">
                {loading ? (
                  <div className="p-4 text-center text-muted-foreground">Loading...</div>
                ) : filteredRetailers.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">No retailers found</div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredRetailers.map(retailer => (
                      <div 
                        key={retailer.id}
                        className={`flex items-start gap-3 p-2.5 rounded-md cursor-pointer transition-colors hover:bg-muted/50 ${
                          selectedRetailers.includes(retailer.id) ? 'bg-primary/10 border border-primary/30' : 'border border-transparent'
                        }`}
                        onClick={() => toggleRetailer(retailer.id)}
                      >
                        <Checkbox 
                          checked={selectedRetailers.includes(retailer.id)}
                          onCheckedChange={() => toggleRetailer(retailer.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm leading-tight">{retailer.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {retailer.phone} {retailer.address && `• ${retailer.address}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {selectedRetailers.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {selectedRetailers.length} retailer(s) selected
                </Badge>
              )}
            </div>

            {/* Arrow Divider */}
            <div className="hidden md:flex items-center justify-center self-center py-8">
              <div className="flex flex-col items-center gap-2">
                <div className="w-px h-8 bg-border" />
                <div className="p-2 rounded-full bg-muted border">
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="w-px h-8 bg-border" />
              </div>
            </div>
            
            {/* Mobile Arrow */}
            <div className="flex md:hidden justify-center py-2">
              <div className="p-2 rounded-full bg-muted border rotate-90">
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>

            {/* Target Distributor Selection */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Target Distributor
              </h4>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search distributors..."
                  value={distributorSearch}
                  onChange={(e) => setDistributorSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <div className="h-[180px] md:h-[250px] border rounded-md bg-muted/20 overflow-y-auto">
                <div className="p-2 space-y-1">
                  {filteredDistributors.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">No distributors found</div>
                  ) : (
                    filteredDistributors.map(dist => (
                      <div 
                        key={dist.id}
                        className={`flex items-center gap-3 p-2.5 rounded-md cursor-pointer transition-colors hover:bg-muted/50 ${
                          targetDistributorId === dist.id ? 'bg-primary/10 border border-primary/30' : 'border border-transparent'
                        }`}
                        onClick={() => setTargetDistributorId(dist.id)}
                      >
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                          targetDistributorId === dist.id ? 'border-primary bg-primary' : 'border-muted-foreground/50'
                        }`}>
                          {targetDistributorId === dist.id && (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                          )}
                        </div>
                        <span className="font-medium text-sm">{dist.name}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              {targetDistributorId && (
                <Badge variant="secondary" className="text-xs">
                  Selected: {distributors.find(d => d.id === targetDistributorId)?.name}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 p-6 pt-4 border-t flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button 
            onClick={handleRemap} 
            disabled={submitting || selectedRetailers.length === 0 || !targetDistributorId}
            className="w-full sm:w-auto"
          >
            {submitting ? "Remapping..." : `Remap ${selectedRetailers.length} Retailer(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

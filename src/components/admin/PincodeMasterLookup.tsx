import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, MapPin, Store } from 'lucide-react';
import { karnatakaDistrictHDI } from '@/data/karnatakaHDI';
import { getGDIData } from '@/data/gdiIndexData';
import { Button } from '@/components/ui/button';
import { PincodeRetailersList } from './PincodeRetailersList';

interface PincodeData {
  pincode: string;
  territory_po: string | null;
}

export interface ExternalRetailer {
  id: number;
  company_name: string;
  address: string | null;
  city: string;
  mobile: string | null;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
}

export const PincodeMasterLookup: React.FC = () => {
  const [states, setStates] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [pincodes, setPincodes] = useState<PincodeData[]>([]);
  
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingPincodes, setLoadingPincodes] = useState(false);

  const [expandedPincode, setExpandedPincode] = useState<string | null>(null);
  const [retailers, setRetailers] = useState<ExternalRetailer[]>([]);
  const [loadingRetailers, setLoadingRetailers] = useState(false);

  const groupedPincodes = useMemo(() => {
    const map = new Map<string, string[]>();
    pincodes.forEach(item => {
      const territories = map.get(item.pincode) || [];
      if (item.territory_po && !territories.includes(item.territory_po)) {
        territories.push(item.territory_po);
      }
      map.set(item.pincode, territories);
    });
    return Array.from(map.entries()).map(([pincode, territories]) => ({ pincode, territories }));
  }, [pincodes]);

  useEffect(() => {
    const fetchStates = async () => {
      setLoadingStates(true);
      const { data, error } = await (supabase as any).rpc('get_distinct_states');
      if (!error && data) {
        setStates(data.map((d: { statename: string }) => d.statename));
      }
      setLoadingStates(false);
    };
    fetchStates();
  }, []);

  useEffect(() => {
    if (!selectedState) {
      setDistricts([]);
      setSelectedDistrict('');
      setPincodes([]);
      return;
    }
    const fetchDistricts = async () => {
      setLoadingDistricts(true);
      setSelectedDistrict('');
      setPincodes([]);
      const { data, error } = await (supabase as any).rpc('get_distinct_districts', {
        p_state: selectedState
      });
      if (!error && data) {
        setDistricts((data as any[]).map((d: { district: string }) => d.district));
      }
      setLoadingDistricts(false);
    };
    fetchDistricts();
  }, [selectedState]);

  useEffect(() => {
    if (!selectedState || !selectedDistrict) {
      setPincodes([]);
      return;
    }
    const fetchPincodes = async () => {
      setLoadingPincodes(true);
      setExpandedPincode(null);
      const { data, error } = await (supabase as any)
        .from('pincode_master')
        .select('pincode, territory_po')
        .eq('statename', selectedState)
        .eq('district', selectedDistrict)
        .order('pincode');
      if (!error && data) {
        setPincodes(data as any);
      }
      setLoadingPincodes(false);
    };
    fetchPincodes();
  }, [selectedState, selectedDistrict]);

  const handleViewRetailers = async (pincode: string) => {
    if (expandedPincode === pincode) {
      setExpandedPincode(null);
      return;
    }
    setExpandedPincode(pincode);
    setLoadingRetailers(true);
    const { data, error } = await supabase
      .from('retailer_external_db')
      .select('id, company_name, address, city, mobile, category, latitude, longitude')
      .eq('pincode', pincode)
      .order('company_name');
    if (!error && data) {
      setRetailers(data);
    } else {
      setRetailers([]);
    }
    setLoadingRetailers(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Pincode Lookup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* State Dropdown */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Select State</label>
          <Select value={selectedState} onValueChange={setSelectedState} disabled={loadingStates}>
            <SelectTrigger>
              <SelectValue placeholder={loadingStates ? "Loading states..." : "Select a state"} />
            </SelectTrigger>
            <SelectContent>
              {states.map((state) => (
                <SelectItem key={state} value={state}>{state}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* District Dropdown */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Select District</label>
          <Select 
            value={selectedDistrict} 
            onValueChange={setSelectedDistrict} 
            disabled={!selectedState || loadingDistricts}
          >
            <SelectTrigger>
              <SelectValue placeholder={
                loadingDistricts ? "Loading districts..." : 
                !selectedState ? "Select a state first" : 
                "Select a district"
              } />
            </SelectTrigger>
            <SelectContent>
              {districts.map((district) => (
                <SelectItem key={district} value={district}>{district}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Karnataka HDI Info Boxes */}
        {selectedState === 'KARNATAKA' && selectedDistrict && (() => {
          const hdiData = karnatakaDistrictHDI[selectedDistrict.toLowerCase()];
          if (!hdiData) return null;
          return (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-center">
                  <p className="text-[10px] text-green-600 dark:text-green-400 font-medium uppercase tracking-wider">Health Index</p>
                  <p className="text-lg font-bold text-green-700 dark:text-green-300">{hdiData.healthIndex}</p>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-center">
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wider">Education Index</p>
                  <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{hdiData.educationIndex}</p>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-center">
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium uppercase tracking-wider">Standard of Living</p>
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{hdiData.standardOfLivingIndex}</p>
                </div>
                <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-center">
                  <p className="text-[10px] text-purple-600 dark:text-purple-400 font-medium uppercase tracking-wider">HDI</p>
                  <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{hdiData.hdi}</p>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground text-center mt-2 italic">
                Source: Directorate of Economics and Statistics, Govt. of Karnataka (2023-24)
              </p>
            </>
          );
        })()}

        {/* GDI Info Boxes for other states */}
        {selectedState && selectedDistrict && selectedState !== 'KARNATAKA' && (() => {
          const gdiData = getGDIData(selectedState, selectedDistrict);
          if (!gdiData) return null;
          return (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-center">
                  <p className="text-[10px] text-green-600 dark:text-green-400 font-medium uppercase tracking-wider">Health Index</p>
                  <p className="text-lg font-bold text-green-700 dark:text-green-300">{gdiData.healthIndex}</p>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-center">
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wider">Education Index</p>
                  <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{gdiData.educationIndex}</p>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-center">
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium uppercase tracking-wider">Standard of Living</p>
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{gdiData.standardOfLivingIndex}</p>
                </div>
                <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-center">
                  <p className="text-[10px] text-purple-600 dark:text-purple-400 font-medium uppercase tracking-wider">HDI</p>
                  <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{gdiData.hdi}</p>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground text-center mt-2 italic">
                Source: NITI Aayog SDG India Index 2024-25 &amp; UNDP Subnational HDI Database
              </p>
            </>
          );
        })()}

        {loadingPincodes && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loadingPincodes && pincodes.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-[auto_1fr_1fr] gap-2 items-center text-sm font-medium text-muted-foreground border-b pb-2 px-3">
              <span>PIN Code</span>
              <span className="text-center">Retailers</span>
              <span className="text-right">Territory Name</span>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {groupedPincodes.map((item) => (
                <React.Fragment key={item.pincode}>
                  <div className="grid grid-cols-[auto_1fr_1fr] gap-2 items-center py-2 px-3 rounded-md bg-muted/50 hover:bg-muted transition-colors">
                    <span className="font-mono text-sm font-medium">{item.pincode}</span>
                    <div className="flex justify-center">
                      <Button
                        variant={expandedPincode === item.pincode ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => handleViewRetailers(item.pincode)}
                      >
                        <Store className="h-3 w-3" />
                        View Retailers
                      </Button>
                    </div>
                    <div className="text-sm text-muted-foreground text-right">
                      {item.territories.length > 0
                        ? item.territories.join(', ')
                        : '-'}
                    </div>
                  </div>
                  {expandedPincode === item.pincode && (
                    <PincodeRetailersList
                      pincode={item.pincode}
                      retailers={retailers}
                      loading={loadingRetailers}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center pt-2">
              Showing {groupedPincodes.length} result{groupedPincodes.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}

        {!loadingPincodes && selectedDistrict && pincodes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No pincodes found for this selection.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

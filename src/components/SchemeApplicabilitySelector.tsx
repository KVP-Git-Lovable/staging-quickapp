import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Globe, 
  MapPin, 
  Route, 
  Store, 
  User, 
  Building2,
  ChevronDown, 
  ChevronRight,
  X,
  Search,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';


export interface ApplicabilityRule {
  level: 'global' | 'territory' | 'beat' | 'retailer' | 'salesperson' | 'distributor';
  entityId: string;
  entityName: string;
  includeChildren: boolean;
}


interface SchemeApplicabilitySelectorProps {
  applicabilityType: 'global' | 'targeted' | 'hybrid';
  setApplicabilityType: (type: 'global' | 'targeted' | 'hybrid') => void;
  applicabilityRules: ApplicabilityRule[];
  setApplicabilityRules: (rules: ApplicabilityRule[]) => void;
}

interface Territory {
  id: string;
  name: string;
}

interface Beat {
  id: string;
  beat_name: string;
  territory_id: string | null;
}

interface Retailer {
  id: string;
  name: string;
  beat_id: string | null;
}

interface Salesperson {
  id: string;
  full_name: string;
}

interface Distributor {
  id: string;
  name: string;
}


export const SchemeApplicabilitySelector = ({
  applicabilityType,
  setApplicabilityType,
  applicabilityRules,
  setApplicabilityRules
}: SchemeApplicabilitySelectorProps) => {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [salespersons, setSalespersons] = useState<Salesperson[]>([]);
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    territory: false,
    beat: false,
    retailer: false,
    salesperson: false,
    distributor: false
  });
  
  // Search filters
  const [searchFilters, setSearchFilters] = useState<Record<string, string>>({
    territory: '',
    beat: '',
    retailer: '',
    salesperson: '',
    distributor: ''
  });


  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch territories
      const territoriesRes = await supabase.from('territories').select('id, name').order('name');
      if (territoriesRes.data) setTerritories(territoriesRes.data as unknown as Territory[]);
      
      // Fetch beats
      const beatsRes = await supabase.from('beats').select('id, beat_name, territory_id').order('beat_name');
      if (beatsRes.data) setBeats(beatsRes.data as unknown as Beat[]);
      
      // Fetch retailers - simplified query
      const retailersRes = await supabase.from('retailers').select('id, name, beat_id').limit(500);
      if (retailersRes.data) {
        const activeRetailers = (retailersRes.data as unknown as Retailer[]).slice(0, 500);
        setRetailers(activeRetailers);
      }
      
      // Fetch salespersons
      const salespersonsRes = await supabase.from('profiles').select('id, full_name').order('full_name');
      if (salespersonsRes.data) setSalespersons(salespersonsRes.data as unknown as Salesperson[]);

      // Fetch distributors
      const distributorsRes = await supabase.from('distributors').select('id, name').order('name');
      if (distributorsRes.data) setDistributors(distributorsRes.data as unknown as Distributor[]);
    } catch (error) {
      console.error('Error fetching applicability data:', error);
    } finally {
      setLoading(false);
    }
  };


  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const isEntitySelected = (level: string, entityId: string) => {
    return applicabilityRules.some(r => r.level === level && r.entityId === entityId);
  };

  const toggleEntity = (level: ApplicabilityRule['level'], entityId: string, entityName: string) => {
    if (isEntitySelected(level, entityId)) {
      setApplicabilityRules(applicabilityRules.filter(r => !(r.level === level && r.entityId === entityId)));
    } else {
      setApplicabilityRules([
        ...applicabilityRules,
        { level, entityId, entityName, includeChildren: true }
      ]);
    }
  };

  const removeRule = (level: string, entityId: string) => {
    setApplicabilityRules(applicabilityRules.filter(r => !(r.level === level && r.entityId === entityId)));
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'territory': return <MapPin className="h-4 w-4" />;
      case 'beat': return <Route className="h-4 w-4" />;
      case 'retailer': return <Store className="h-4 w-4" />;
      case 'salesperson': return <User className="h-4 w-4" />;
      case 'distributor': return <Building2 className="h-4 w-4" />;

      default: return <Globe className="h-4 w-4" />;
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'territory': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'beat': return 'bg-green-100 text-green-700 border-green-200';
      case 'retailer': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'salesperson': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'distributor': return 'bg-rose-100 text-rose-700 border-rose-200';

      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getCascadeText = (level: string) => {
    switch (level) {
      case 'territory': return 'Includes all beats & retailers within this territory';
      case 'beat': return 'Includes all retailers within this beat';
      case 'salesperson': return 'Includes all assigned territories, beats & retailers';
      case 'distributor': return 'Applies to all primary orders placed by this distributor';

      case 'retailer': return 'Specific retailer only';
      default: return '';
    }
  };

  const getSelectedCount = (level: string) => {
    return applicabilityRules.filter(r => r.level === level).length;
  };

  const filteredTerritories = territories.filter(t => 
    t.name.toLowerCase().includes(searchFilters.territory.toLowerCase())
  );

  const filteredBeats = beats.filter(b => 
    b.beat_name.toLowerCase().includes(searchFilters.beat.toLowerCase())
  );

  const filteredRetailers = retailers.filter(r => 
    r.name.toLowerCase().includes(searchFilters.retailer.toLowerCase())
  );

  const filteredSalespersons = salespersons.filter(s => 
    s.full_name?.toLowerCase().includes(searchFilters.salesperson.toLowerCase())
  );

  const filteredDistributors = distributors.filter(d => 
    d.name?.toLowerCase().includes(searchFilters.distributor.toLowerCase())
  );


  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading targeting options...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-base font-semibold">Scheme Applicability</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Define where this scheme should apply
        </p>
      </div>

      {/* Applicability Type Selection */}
      <RadioGroup
        value={applicabilityType}
        onValueChange={(value) => {
          setApplicabilityType(value as 'global' | 'targeted' | 'hybrid');
          if (value === 'global') {
            setApplicabilityRules([]);
          }
        }}
        className="space-y-2"
      >
        <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
          <RadioGroupItem value="global" id="global" />
          <div className="flex items-center gap-2 flex-1">
            <Globe className="h-5 w-5 text-primary" />
            <div>
              <Label htmlFor="global" className="font-medium cursor-pointer">Global</Label>
              <p className="text-xs text-muted-foreground">Available to everyone</p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
          <RadioGroupItem value="targeted" id="targeted" />
          <div className="flex items-center gap-2 flex-1">
            <MapPin className="h-5 w-5 text-primary" />
            <div>
              <Label htmlFor="targeted" className="font-medium cursor-pointer">Targeted</Label>
              <p className="text-xs text-muted-foreground">Specific territories, beats, retailers, or salespersons</p>
            </div>
          </div>
        </div>
      </RadioGroup>

      {/* Targeting Options - Only show when targeted is selected */}
      {applicabilityType === 'targeted' && (
        <div className="space-y-3 pt-2">
          {/* Selected Rules Display */}
          {applicabilityRules.length > 0 && (
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <Label className="text-sm font-medium">Selected Targets ({applicabilityRules.length})</Label>
              <div className="flex flex-wrap gap-2">
                {applicabilityRules.map((rule, idx) => (
                  <Badge
                    key={`${rule.level}-${rule.entityId}-${idx}`}
                    variant="outline"
                    className={cn("flex items-center gap-1 pr-1", getLevelColor(rule.level))}
                  >
                    {getLevelIcon(rule.level)}
                    <span className="max-w-[150px] truncate">{rule.entityName}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 hover:bg-transparent"
                      onClick={() => removeRule(rule.level, rule.entityId)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Territory Section */}
          <Collapsible open={expandedSections.territory} onOpenChange={() => toggleSection('territory')}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <span>By Territory</span>
                  {getSelectedCount('territory') > 0 && (
                    <Badge variant="secondary" className="ml-2">{getSelectedCount('territory')}</Badge>
                  )}
                </div>
                {expandedSections.territory ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-blue-50 p-2 rounded">
                  <Info className="h-3 w-3" />
                  <span>Includes all beats & retailers within selected territories</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search territories..."
                    value={searchFilters.territory}
                    onChange={(e) => setSearchFilters(prev => ({ ...prev, territory: e.target.value }))}
                    className="pl-8 h-9"
                  />
                </div>
                <ScrollArea className="h-[150px]">
                  <div className="space-y-1">
                    {filteredTerritories.map(territory => (
                      <div key={territory.id} className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
                        <Checkbox
                          checked={isEntitySelected('territory', territory.id)}
                          onCheckedChange={() => toggleEntity('territory', territory.id, territory.name)}
                        />
                        <span className="text-sm">{territory.name}</span>
                      </div>
                    ))}
                    {filteredTerritories.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No territories found</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Beat Section */}
          <Collapsible open={expandedSections.beat} onOpenChange={() => toggleSection('beat')}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4 text-green-600" />
                  <span>By Beat</span>
                  {getSelectedCount('beat') > 0 && (
                    <Badge variant="secondary" className="ml-2">{getSelectedCount('beat')}</Badge>
                  )}
                </div>
                {expandedSections.beat ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-green-50 p-2 rounded">
                  <Info className="h-3 w-3" />
                  <span>Includes all retailers within selected beats</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search beats..."
                    value={searchFilters.beat}
                    onChange={(e) => setSearchFilters(prev => ({ ...prev, beat: e.target.value }))}
                    className="pl-8 h-9"
                  />
                </div>
                <ScrollArea className="h-[150px]">
                  <div className="space-y-1">
                    {filteredBeats.map(beat => (
                      <div key={beat.id} className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
                        <Checkbox
                          checked={isEntitySelected('beat', beat.id)}
                          onCheckedChange={() => toggleEntity('beat', beat.id, beat.beat_name)}
                        />
                        <span className="text-sm">{beat.beat_name}</span>
                      </div>
                    ))}
                    {filteredBeats.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No beats found</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Retailer Section */}
          <Collapsible open={expandedSections.retailer} onOpenChange={() => toggleSection('retailer')}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-purple-600" />
                  <span>By Retailer</span>
                  {getSelectedCount('retailer') > 0 && (
                    <Badge variant="secondary" className="ml-2">{getSelectedCount('retailer')}</Badge>
                  )}
                </div>
                {expandedSections.retailer ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-purple-50 p-2 rounded">
                  <Info className="h-3 w-3" />
                  <span>Specific retailers only (no cascading)</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search retailers..."
                    value={searchFilters.retailer}
                    onChange={(e) => setSearchFilters(prev => ({ ...prev, retailer: e.target.value }))}
                    className="pl-8 h-9"
                  />
                </div>
                <ScrollArea className="h-[150px]">
                  <div className="space-y-1">
                    {filteredRetailers.map(retailer => (
                      <div key={retailer.id} className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
                        <Checkbox
                          checked={isEntitySelected('retailer', retailer.id)}
                          onCheckedChange={() => toggleEntity('retailer', retailer.id, retailer.name)}
                        />
                        <span className="text-sm">{retailer.name}</span>
                      </div>
                    ))}
                    {filteredRetailers.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No retailers found</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Salesperson Section */}
          <Collapsible open={expandedSections.salesperson} onOpenChange={() => toggleSection('salesperson')}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-amber-600" />
                  <span>By Salesperson</span>
                  {getSelectedCount('salesperson') > 0 && (
                    <Badge variant="secondary" className="ml-2">{getSelectedCount('salesperson')}</Badge>
                  )}
                </div>
                {expandedSections.salesperson ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-amber-50 p-2 rounded">
                  <Info className="h-3 w-3" />
                  <span>Applies to all territories, beats & retailers assigned to this salesperson</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search salespersons..."
                    value={searchFilters.salesperson}
                    onChange={(e) => setSearchFilters(prev => ({ ...prev, salesperson: e.target.value }))}
                    className="pl-8 h-9"
                  />
                </div>
                <ScrollArea className="h-[150px]">
                  <div className="space-y-1">
                    {filteredSalespersons.map(person => (
                      <div key={person.id} className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
                        <Checkbox
                          checked={isEntitySelected('salesperson', person.id)}
                          onCheckedChange={() => toggleEntity('salesperson', person.id, person.full_name || 'Unknown')}
                        />
                        <span className="text-sm">{person.full_name || 'Unknown User'}</span>
                      </div>
                    ))}
                    {filteredSalespersons.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No salespersons found</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Distributor Section */}
          <Collapsible open={expandedSections.distributor} onOpenChange={() => toggleSection('distributor')}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-rose-600" />
                  <span>By Distributor</span>
                  {getSelectedCount('distributor') > 0 && (
                    <Badge variant="secondary" className="ml-2">{getSelectedCount('distributor')}</Badge>
                  )}
                </div>
                {expandedSections.distributor ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-rose-50 p-2 rounded">
                  <Info className="h-3 w-3" />
                  <span>Applies to all primary orders placed by selected distributors</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search distributors..."
                    value={searchFilters.distributor}
                    onChange={(e) => setSearchFilters(prev => ({ ...prev, distributor: e.target.value }))}
                    className="pl-8 h-9"
                  />
                </div>
                <ScrollArea className="h-[150px]">
                  <div className="space-y-1">
                    {filteredDistributors.map(d => (
                      <div key={d.id} className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
                        <Checkbox
                          checked={isEntitySelected('distributor', d.id)}
                          onCheckedChange={() => toggleEntity('distributor', d.id, d.name)}
                        />
                        <span className="text-sm">{d.name}</span>
                      </div>
                    ))}
                    {filteredDistributors.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No distributors found</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </CollapsibleContent>
          </Collapsible>

        </div>
      )}
    </div>
  );
};

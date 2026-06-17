import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, 
  Search, 
  Building2, 
  Phone, 
  MapPin,
  Users,
  Truck,
  Filter,
  ArrowRightLeft,
  Store,
  Network,
  Layers3,
  Eye,
  EyeOff
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RetailerRemapDialog } from "@/components/distributor/RetailerRemapDialog";

// DMS type values stored in distribution_level column
const DMS_TYPE = {
  DIRECT: 'direct_distributor',
  SS: 'super_stockist',
  USS: 'under_super_stockist',
} as const;

interface Distributor {
  id: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string | null;
  address: string | null;
  status: string;
  distribution_level: string | null;
  partnership_status: string | null;
  gst_number: string | null;
  sales_team_size: number | null;
  assets_vans: number | null;
  assets_trucks: number | null;
  network_retailers_count: number | null;
  onboarding_date: string | null;
  parent_id: string | null;
  is_placeholder?: boolean | null;
}

const statusColors: Record<string, string> = {
  'initial_connect': 'bg-gray-100 text-gray-800',
  'evaluation': 'bg-yellow-100 text-yellow-800',
  'strong_candidate': 'bg-blue-100 text-blue-800',
  'documentation': 'bg-purple-100 text-purple-800',
  'onboarded': 'bg-green-100 text-green-800',
  'active': 'bg-green-100 text-green-800',
  'inactive': 'bg-red-100 text-red-800',
  'drop': 'bg-red-100 text-red-800',
};

const partnershipColors: Record<string, string> = {
  'platinum': 'bg-gradient-to-r from-slate-400 to-slate-600 text-white',
  'gold': 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-white',
  'silver': 'bg-gradient-to-r from-gray-300 to-gray-500 text-white',
  'registered': 'bg-gray-100 text-gray-800',
};

const levelLabels: Record<string, string> = {
  'super_stockist': 'Super Stockist',
  'distributor': 'Distributor',
  'sub_distributor': 'Sub-Distributor',
  'agent': 'Agent',
};

const DMS_TABS = [
  { value: 'direct_distributor', label: 'Direct', icon: Store, description: 'Orders direct from Company' },
  { value: 'super_stockist', label: 'Super Stockist', icon: Layers3, description: 'Supplies SS + USS distributors' },
  { value: 'under_super_stockist', label: 'Under SS', icon: Network, description: 'Orders via Super Stockist' },
] as const;

export default function DistributorMaster() {
  const navigate = useNavigate();
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("direct_distributor");
  const [showRemapDialog, setShowRemapDialog] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('hiddenDistributorIds') || '[]')); }
    catch { return new Set(); }
  });
  const [showHidden, setShowHidden] = useState(false);

  const persistHidden = (s: Set<string>) => {
    localStorage.setItem('hiddenDistributorIds', JSON.stringify([...s]));
  };
  const hideDistributor = (id: string, name: string) => {
    const next = new Set(hiddenIds); next.add(id); setHiddenIds(next); persistHidden(next);
    toast.success(`${name} hidden`, {
      action: { label: 'Undo', onClick: () => unhideDistributor(id) },
    });
  };
  const unhideDistributor = (id: string) => {
    const next = new Set(hiddenIds); next.delete(id); setHiddenIds(next); persistHidden(next);
  };

  useEffect(() => {
    loadDistributors();
  }, []);

  const loadDistributors = async () => {
    try {
      const { data, error } = await supabase
        .from('distributors')
        .select('*')
        .or('is_placeholder.is.null,is_placeholder.eq.false')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDistributors(data || []);
    } catch (error: any) {
      toast.error("Failed to load distributors: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getDistributorsByType = (type: string) => {
    return distributors.filter(d => {
      // Map legacy values to new DMS types
      let dmsType = d.distribution_level;
      if (dmsType === 'distributor' || dmsType === 'sub_distributor' || dmsType === 'agent' || !dmsType) {
        dmsType = 'direct_distributor';
      }
      // Exact match for new types
      const matchesType = dmsType === type;
      const matchesSearch = 
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.contact_person?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.phone?.includes(searchQuery);
      const matchesStatus = statusFilter === "all" || d.status === statusFilter;
      const matchesHidden = showHidden ? true : !hiddenIds.has(d.id);
      return matchesType && matchesSearch && matchesStatus && matchesHidden;
    });
  };

  const formatStatus = (status: string) => {
    return status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown';
  };

  const DistributorCard = ({ distributor }: { distributor: Distributor }) => {
    const isHidden = hiddenIds.has(distributor.id);
    return (
    <Card 
      className={`cursor-pointer hover:shadow-md transition-shadow ${isHidden ? 'opacity-60' : ''}`}
      onClick={() => navigate(`/distributor/${distributor.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{distributor.name}</h3>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {distributor.partnership_status && (
                <Badge className={`text-xs flex-shrink-0 ${partnershipColors[distributor.partnership_status] || 'bg-muted text-muted-foreground'}`}>
                  {distributor.partnership_status.charAt(0).toUpperCase() + distributor.partnership_status.slice(1)}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{distributor.contact_person}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Badge className={`${statusColors[distributor.status] || 'bg-muted text-muted-foreground'}`}>
              {formatStatus(distributor.status)}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={isHidden ? 'Unhide' : 'Hide from list'}
              onClick={(e) => {
                e.stopPropagation();
                if (isHidden) unhideDistributor(distributor.id);
                else hideDistributor(distributor.id, distributor.name);
              }}
            >
              {isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
          <span className="flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {distributor.phone}
          </span>
        </div>

        {distributor.address && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
            <MapPin className="h-3 w-3" />
            {distributor.address}
          </p>
        )}

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {distributor.sales_team_size !== null && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {distributor.sales_team_size} team
            </span>
          )}
          {(distributor.assets_vans || distributor.assets_trucks) && (
            <span className="flex items-center gap-1">
              <Truck className="h-3 w-3" />
              {(distributor.assets_vans || 0) + (distributor.assets_trucks || 0)} vehicles
            </span>
          )}
          {distributor.network_retailers_count !== null && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {distributor.network_retailers_count} retailers
            </span>
          )}
        </div>
      </CardContent>
    </Card>
    );
  };

  const TabContent = ({ type }: { type: string }) => {
    const list = getDistributorsByType(type);
    if (loading) {
      return (
        <div className="space-y-3 mt-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4 h-28 bg-muted/50" />
            </Card>
          ))}
        </div>
      );
    }
    if (list.length === 0) {
      return (
        <Card className="mt-4">
          <CardContent className="p-8 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground font-medium">No distributors found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {type === 'direct_distributor' && 'Add distributors that take primary orders directly from the company.'}
              {type === 'super_stockist' && 'Add Super Stockists who supply to USS distributors and retailers.'}
              {type === 'under_super_stockist' && 'Add Under Super Stockists who order via a Super Stockist parent.'}
            </p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => navigate(`/add-distributor?type=${type}`)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add {type === 'direct_distributor' ? 'Direct Distributor' : type === 'super_stockist' ? 'Super Stockist' : 'Under Super Stockist'}
            </Button>
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="space-y-3 mt-4">
        {list.map(d => <DistributorCard key={d.id} distributor={d} />)}
      </div>
    );
  };

  return (
    <Layout>
      <div className="p-4 pb-24 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Distributor Master</h1>
            <p className="text-sm text-muted-foreground">Manage your DMS network structure</p>
          </div>
          <div className="flex items-center gap-2">
            {hiddenIds.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => setShowHidden(v => !v)}
              >
                {showHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showHidden ? 'Hide hidden' : `Show hidden (${hiddenIds.size})`}
              </Button>
            )}
            <Button 
              variant="outline"
              onClick={() => setShowRemapDialog(true)}
              size="sm"
              className="gap-2"
            >
              <ArrowRightLeft className="h-4 w-4" />
              Remap
            </Button>
            <Button 
              onClick={() => navigate(`/add-distributor?type=${activeTab}`)}
              size="sm"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add New
            </Button>
          </div>
        </div>

        {/* Search & Status Filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, contact, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-10 text-xs">
              <Filter className="h-3 w-3 mr-1 flex-shrink-0" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="initial_connect">Initial Connect</SelectItem>
              <SelectItem value="evaluation">Evaluation</SelectItem>
              <SelectItem value="strong_candidate">Strong Candidate</SelectItem>
              <SelectItem value="documentation">Documentation</SelectItem>
              <SelectItem value="onboarded">Onboarded</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="drop">Dropped</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2">
          {DMS_TABS.map(tab => {
            const count = getDistributorsByType(tab.value).length;
            return (
              <Card 
                key={tab.value} 
                className={`cursor-pointer transition-all border-2 ${activeTab === tab.value ? 'border-primary bg-primary/5' : 'border-transparent'}`}
                onClick={() => setActiveTab(tab.value)}
              >
                <CardContent className="p-3 text-center">
                  <tab.icon className={`h-5 w-5 mx-auto mb-1 ${activeTab === tab.value ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className={`text-lg font-bold ${activeTab === tab.value ? 'text-primary' : 'text-foreground'}`}>{loading ? '–' : count}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{tab.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* DMS Type Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-3">
            {DMS_TABS.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="text-xs sm:text-sm">
                <tab.icon className="h-3.5 w-3.5 mr-1 sm:mr-1.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {DMS_TABS.map(tab => (
            <TabsContent key={tab.value} value={tab.value}>
              {/* Tab Description */}
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <tab.icon className="h-4 w-4 text-primary" />
                <span>{tab.description}</span>
              </div>
              <TabContent type={tab.value} />
            </TabsContent>
          ))}
        </Tabs>

        {/* Remap Dialog */}
        <RetailerRemapDialog 
          open={showRemapDialog} 
          onOpenChange={setShowRemapDialog}
          onSuccess={loadDistributors}
        />
      </div>
    </Layout>
  );
}

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Edit, 
  Trash2, 
  Building2, 
  Phone, 
  Mail, 
  MapPin,
  Calendar,
  Users,
  Truck,
  FileText,
  Store,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DistributorAttachments } from "@/components/distributor/DistributorAttachments";
import { DistributorBeats } from "@/components/distributor/DistributorBeats";
import { DistributorRetailers } from "@/components/distributor/DistributorRetailers";
import { DistributorTerritories } from "@/components/distributor/DistributorTerritories";
import { DistributorFYPlan } from "@/components/distributor/DistributorFYPlan";
import { DistributorPortalUsers } from "@/components/distributor/DistributorPortalUsers";
import { DistributorPriceBooks } from "@/components/distributor/DistributorPriceBooks";
import { DistributorPrimaryOrders } from "@/components/distributor/DistributorPrimaryOrders";
import { DistributorEvaluationTasks } from "@/components/distributor/DistributorEvaluationTasks";
import { EvaluationChecklist } from "@/components/distributor/EvaluationChecklist";
import { DistributorContactsList } from "@/components/distributor/DistributorContactsList";
import { DistributorSecondaryOrders } from "@/components/distributor/DistributorSecondaryOrders";
import DistributorCompanyProfile from "@/components/distributor/DistributorCompanyProfile";
import { PaymentCreditTab } from "@/components/distributor/PaymentCreditTab";
import { moveToRecycleBin } from "@/utils/recycleBinUtils";

interface Distributor {
  id: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  status: string;
  distribution_level: string | null;
  partnership_status: string | null;
  established_year: number | null;
  distribution_experience_years: number | null;
  sales_team_size: number | null;
  assets_vans: number | null;
  assets_trucks: number | null;
  network_retailers_count: number | null;
  region_coverage: string | null;
  onboarding_date: string | null;
  years_of_relationship: number | null;
  products_distributed: string[] | null;
  other_products: string[] | null;
  competition_products: string[] | null;
  strength: string | null;
  weakness: string | null;
  opportunities: string | null;
  threats: string | null;
  about_business: string | null;
  parent_id: string | null;
  created_at: string;
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

export default function DistributorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [distributor, setDistributor] = useState<Distributor | null>(null);
  const [parentDistributor, setParentDistributor] = useState<{name: string} | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (id) {
      loadDistributor();
    }
  }, [id]);

  const loadDistributor = async () => {
    try {
      const { data, error } = await supabase
        .from('distributors')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setDistributor(data);

      // Load parent if exists
      if (data.parent_id) {
        const { data: parent } = await supabase
          .from('distributors')
          .select('name')
          .eq('id', data.parent_id)
          .single();
        setParentDistributor(parent);
      }
    } catch (error: any) {
      toast.error("Failed to load distributor: " + error.message);
      navigate('/distributor-master');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!distributor) return;
    
    try {
      await moveToRecycleBin({
        tableName: 'distributors',
        recordId: distributor.id,
        recordData: distributor,
        moduleName: 'Distributors',
        recordName: distributor.name
      });

      const { error } = await supabase
        .from('distributors')
        .delete()
        .eq('id', distributor.id);

      if (error) throw error;

      toast.success("Distributor moved to recycle bin");
      navigate('/distributor-master');
    } catch (error: any) {
      toast.error("Failed to delete: " + error.message);
    }
  };

  const formatStatus = (status: string) => {
    return status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown';
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-4 space-y-4">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-32 bg-muted animate-pulse rounded" />
        </div>
      </Layout>
    );
  }

  if (!distributor) {
    return (
      <Layout>
        <div className="p-4 text-center">
          <p className="text-muted-foreground">Distributor not found</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 pb-24 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <Button variant="ghost" size="icon" onClick={() => navigate('/distributor-master')} className="shrink-0 mt-0.5">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">{distributor.name}</h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {distributor.distribution_level && (
                  <Badge variant="outline" className="text-xs">
                    {levelLabels[distributor.distribution_level] || distributor.distribution_level}
                  </Badge>
                )}
                <Badge className={`text-xs ${statusColors[distributor.status] || 'bg-gray-100'}`}>
                  {formatStatus(distributor.status)}
                </Badge>
                {distributor.partnership_status && (
                  <Badge className={`text-xs ${partnershipColors[distributor.partnership_status] || 'bg-gray-100'}`}>
                    {distributor.partnership_status.charAt(0).toUpperCase() + distributor.partnership_status.slice(1)}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button variant="outline" size="icon" onClick={() => navigate(`/edit-distributor/${distributor.id}`)} className="h-8 w-8">
              <Edit className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon" className="text-destructive h-8 w-8">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Distributor?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{distributor.name}"? This will move the record to the recycle bin.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Contact Info Card */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{distributor.contact_person}</span>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a href={`tel:${distributor.phone}`} className="text-primary">{distributor.phone}</a>
            </div>
            {distributor.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${distributor.email}`} className="text-primary">{distributor.email}</a>
              </div>
            )}
            {distributor.address && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span className="text-sm">{distributor.address}</span>
              </div>
            )}
            {distributor.gst_number && (
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">GST: {distributor.gst_number}</span>
              </div>
            )}
            {parentDistributor && (
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Parent: {parentDistributor.name}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto -mx-4 px-4 pb-2">
            <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-8 sm:w-full gap-1">
              <TabsTrigger value="overview" className="text-xs whitespace-nowrap px-3">Overview</TabsTrigger>
              <TabsTrigger value="primary-orders" className="text-xs whitespace-nowrap px-3">Primary</TabsTrigger>
              <TabsTrigger value="secondary-orders" className="text-xs whitespace-nowrap px-3">Secondary</TabsTrigger>
              <TabsTrigger value="network" className="text-xs whitespace-nowrap px-3">Network</TabsTrigger>
              <TabsTrigger value="portal" className="text-xs whitespace-nowrap px-3">Portal</TabsTrigger>
              <TabsTrigger value="pricing" className="text-xs whitespace-nowrap px-3">Pricing</TabsTrigger>
              <TabsTrigger value="business" className="text-xs whitespace-nowrap px-3">FY Plan</TabsTrigger>
              <TabsTrigger value="company-profile" className="text-xs whitespace-nowrap px-3">Company Profile</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {/* About Business - First */}
            {distributor.about_business && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">About Business</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{distributor.about_business}</p>
                </CardContent>
              </Card>
            )}

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Est. {distributor.established_year || 'N/A'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Established Year</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {distributor.sales_team_size || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Sales Team</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Truck className="h-4 w-4" />
                    {(distributor.assets_vans || 0) + (distributor.assets_trucks || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Vehicles</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Store className="h-4 w-4" />
                    {distributor.network_retailers_count || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Retailers</p>
                </CardContent>
              </Card>
            </div>

            {/* Contacts (Collapsible within Overview) */}
            <DistributorContactsList distributorId={distributor.id} />

            {/* Evaluation Tasks (Collapsible within Overview) */}
            <DistributorEvaluationTasks distributorId={distributor.id} />

            {/* Onboarding Evaluation Checklist */}
            <EvaluationChecklist
              distributorId={distributor.id}
              checklist={(distributor as any).evaluation_checklist || {}}
              onUpdate={loadDistributor}
            />

            {/* Products */}
            {(distributor.products_distributed?.length || distributor.other_products?.length) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Products</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {distributor.products_distributed?.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Our Products</p>
                      <div className="flex flex-wrap gap-1">
                        {distributor.products_distributed.map((p, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {distributor.other_products?.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Other Products</p>
                      <div className="flex flex-wrap gap-1">
                        {distributor.other_products.map((p, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{p}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {distributor.competition_products?.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Competition Products</p>
                      <div className="flex flex-wrap gap-1">
                        {distributor.competition_products.map((p, i) => (
                          <Badge key={i} variant="destructive" className="text-xs">{p}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* SWOT */}
            {(distributor.strength || distributor.weakness || distributor.opportunities || distributor.threats) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">SWOT Analysis</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  {distributor.strength && (
                    <div className="bg-green-50 dark:bg-green-950 p-2 rounded">
                      <p className="text-xs font-medium text-green-700 dark:text-green-300">Strengths</p>
                      <p className="text-xs mt-1">{distributor.strength}</p>
                    </div>
                  )}
                  {distributor.weakness && (
                    <div className="bg-red-50 dark:bg-red-950 p-2 rounded">
                      <p className="text-xs font-medium text-red-700 dark:text-red-300">Weaknesses</p>
                      <p className="text-xs mt-1">{distributor.weakness}</p>
                    </div>
                  )}
                  {distributor.opportunities && (
                    <div className="bg-blue-50 dark:bg-blue-950 p-2 rounded">
                      <p className="text-xs font-medium text-blue-700 dark:text-blue-300">Opportunities</p>
                      <p className="text-xs mt-1">{distributor.opportunities}</p>
                    </div>
                  )}
                  {distributor.threats && (
                    <div className="bg-orange-50 dark:bg-orange-950 p-2 rounded">
                      <p className="text-xs font-medium text-orange-700 dark:text-orange-300">Threats</p>
                      <p className="text-xs mt-1">{distributor.threats}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* About Business already shown at top */}

            {/* Attachments */}
            <DistributorAttachments distributorId={distributor.id} />
          </TabsContent>

          <TabsContent value="primary-orders" className="mt-4">
            <DistributorPrimaryOrders distributorId={distributor.id} />
          </TabsContent>

          <TabsContent value="secondary-orders" className="mt-4">
            <DistributorSecondaryOrders distributorId={distributor.id} />
          </TabsContent>

          <TabsContent value="network" className="space-y-4 mt-4">
            <DistributorBeats distributorId={distributor.id} />
            <DistributorRetailers distributorId={distributor.id} />
            <DistributorTerritories distributorId={distributor.id} />
          </TabsContent>

          <TabsContent value="portal" className="mt-4">
            <DistributorPortalUsers 
              distributorId={distributor.id} 
              distributorName={distributor.name} 
            />
          </TabsContent>

          <TabsContent value="pricing" className="mt-4">
            <DistributorPriceBooks distributorId={distributor.id} />
          </TabsContent>

          <TabsContent value="business" className="mt-4">
            <DistributorFYPlan distributorId={distributor.id} />
          </TabsContent>

          <TabsContent value="company-profile" className="mt-4">
            <DistributorCompanyProfile distributorId={distributor.id} readOnly />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
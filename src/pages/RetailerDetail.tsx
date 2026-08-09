import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { MapPin, Phone, Store, Package, Calendar, TrendingUp, CheckCircle2, Wallet, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaymentLedgerTab } from "@/components/retailer/PaymentLedgerTab";
import { InvoicesTab } from "@/components/retailer/InvoicesTab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { CreditScoreDisplay } from "@/components/CreditScoreDisplay";
import { RetailerPerformanceAnalytics } from "@/components/RetailerPerformanceAnalytics";
import { RetailerLoyaltyCard } from "@/components/loyalty/RetailerLoyaltyCard";
import { TargetVsActualCard } from "@/components/performance/TargetVsActualCard";

interface Retailer {
  id: string;
  name: string;
  address: string;
  phone: string;
  category: string;
  priority: string;
  status: string;
  notes: string;
  parent_type: string;
  parent_name: string;
  location_tag: string;
  retail_type: string;
  potential: string;
  competitors: string[];
  entity_type: string;
  beat_name: string;
  photo_url: string;
  latitude: number;
  longitude: number;
  last_visit_date: string;
  order_value: number;
  created_at: string;
  updated_at: string;
  verified?: boolean;
  last_order_date?: string;
  last_order_value?: number;
  avg_monthly_orders_3m?: number;
  avg_order_per_visit_3m?: number;
  total_visits_3m?: number;
  productive_visits_3m?: number;
  total_lifetime_order_value?: number;
  revenue_growth_12m?: number;
  total_order_value_fy?: number;
}

export const RetailerDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [retailer, setRetailer] = useState<Retailer | null>(null);
  const [distributorName, setDistributorName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && id) {
      loadRetailerData();
    }
  }, [user, id]);

  const loadRetailerData = async () => {
    try {
      setLoading(true);
      
      // Load retailer data
      const { data: retailerData, error: retailerError } = await supabase
        .from('retailers')
        .select('*')
        .eq('id', id)
        .eq('user_id', user!.id)
        .single();

      if (retailerError) {
        if (retailerError.code === 'PGRST116') {
          toast({
            title: 'Retailer not found',
            description: 'The requested retailer could not be found.',
            variant: 'destructive'
          });
          navigate('/my-retailers');
          return;
        }
        throw retailerError;
      }

      setRetailer(retailerData);

      // Load distributor information
      const { data: distributorMapping, error: mappingError } = await supabase
        .from('distributor_retailer_mappings')
        .select('distributor_id')
        .eq('retailer_id', id)
        .eq('user_id', user!.id)
        .maybeSingle();

      if (!mappingError && distributorMapping?.distributor_id) {
        const { data: distributorData, error: distributorError } = await supabase
          .from('retailers')
          .select('name')
          .eq('id', distributorMapping.distributor_id)
          .eq('entity_type', 'distributor')
          .maybeSingle();

        if (!distributorError && distributorData) {
          setDistributorName(distributorData.name);
        }
      }
    } catch (error) {
      console.error('Error loading retailer data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load retailer information.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'bg-destructive text-destructive-foreground';
      case 'medium':
        return 'bg-warning text-warning-foreground';
      case 'low':
        return 'bg-success text-success-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-success text-success-foreground';
      case 'inactive':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-primary text-primary-foreground';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4">
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading retailer details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!retailer) {
    return (
      <Layout>
      <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4">
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Retailer not found</p>
            <Button onClick={() => navigate('/my-retailers')}>
              Back to Retailers
            </Button>
          </div>
        </div>
      </div>
      </Layout>
    );
  }

  return (
    <Layout>
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-card-foreground">Retailer Details</h1>
            <p className="text-sm text-muted-foreground">Complete information about the retailer</p>
          </div>
        </div>

        {/* Main Info Card */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <CardTitle className="text-xl">{retailer.name}</CardTitle>
                  {retailer.verified && (
                    <CheckCircle2 className="h-5 w-5 text-blue-600" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className={getPriorityColor(retailer.priority)}>
                    {retailer.priority || 'Medium'} Priority
                  </Badge>
                  <Badge className={getStatusColor(retailer.status)}>
                    {retailer.status || 'Active'}
                  </Badge>
                  {retailer.category && (
                    <Badge variant="outline">{retailer.category}</Badge>
                  )}
                </div>
              </div>
              {retailer.photo_url && (
                <div className="w-24 h-24 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
                  <img 
                    src={retailer.photo_url} 
                    alt={retailer.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Contact Information */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Contact Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Address</label>
<div className="flex items-start gap-2 mt-1">
  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
  <a
    href={(retailer.latitude && retailer.longitude)
      ? `https://www.google.com/maps/search/?api=1&query=${retailer.latitude},${retailer.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(retailer.address || '')}`}
    target="_blank"
    rel="noopener noreferrer"
    className="text-sm text-primary hover:underline"
    title="Open in Google Maps"
    onClick={(e) => e.stopPropagation()}
  >
    {retailer.address}
  </a>
</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Phone</label>
                  <p className="text-sm mt-1">{retailer.phone || 'Not provided'}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Business Information */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Store className="h-4 w-4" />
                Business Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Retail Type</label>
                  <p className="text-sm mt-1">{retailer.retail_type || 'Not specified'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Potential</label>
                  <p className="text-sm mt-1">{retailer.potential || 'Not assessed'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Beat</label>
                  <p className="text-sm mt-1">{retailer.beat_name || 'Not assigned'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Location Tag</label>
                  <p className="text-sm mt-1">{retailer.location_tag || 'Not tagged'}</p>
                </div>
              </div>
            </div>

            {/* Target vs Actual Section */}
            <Separator />
            <TargetVsActualCard entityType="retailer" entityId={retailer.id} userId={user?.id} />

            {/* Credit Score Section */}
            <Separator />
            <CreditScoreDisplay retailerId={retailer.id} variant="full" showCreditLimit={true} />

            {/* Distributor Information */}
            {distributorName && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Distribution
                  </h3>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Mapped Distributor</label>
                    <p className="text-sm mt-1">{distributorName}</p>
                  </div>
                </div>
              </>
            )}

            {/* Parent Information */}
            {retailer.parent_name && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-3">Parent Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Parent Type</label>
                      <p className="text-sm mt-1">{retailer.parent_type}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Parent Name</label>
                      <p className="text-sm mt-1">{retailer.parent_name}</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Loyalty Points Section */}
            <Separator />
            <RetailerLoyaltyCard retailerId={retailer.id} fseUserId={user?.id || ""} />

            {/* Competition */}
            {retailer.competitors && retailer.competitors.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-3">Competition</h3>
                  <div className="flex flex-wrap gap-2">
                    {retailer.competitors.map((competitor, index) => (
                      <Badge key={index} variant="outline">{competitor}</Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Performance Analytics */}
            <Separator />
            <RetailerPerformanceAnalytics
              lastOrderDate={retailer.last_order_date}
              lastOrderValue={retailer.last_order_value}
              avgMonthlyOrders={retailer.avg_monthly_orders_3m}
              avgOrderPerVisit={retailer.avg_order_per_visit_3m}
              totalVisits={retailer.total_visits_3m}
              productiveVisits={retailer.productive_visits_3m}
              totalLifetimeOrderValue={retailer.total_lifetime_order_value}
              revenueGrowth12m={retailer.revenue_growth_12m}
              totalOrderValueFy={retailer.total_order_value_fy}
            />

            {/* Notes */}
            {retailer.notes && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-3">Notes</h3>
                  <p className="text-sm bg-muted p-3 rounded-lg">{retailer.notes}</p>
                </div>
              </>
            )}

            {/* Timestamps */}
            <Separator />
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Record Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <label className="font-medium">Created</label>
                  <p>{new Date(retailer.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <label className="font-medium">Last Updated</label>
                  <p>{new Date(retailer.updated_at).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment ledger + invoices */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Payments &amp; Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="payments">
              <TabsList>
                <TabsTrigger value="payments">
                  <Wallet className="h-3.5 w-3.5 mr-1" /> Payment ledger
                </TabsTrigger>
                <TabsTrigger value="invoices">
                  <Receipt className="h-3.5 w-3.5 mr-1" /> Invoices
                </TabsTrigger>
              </TabsList>
              <TabsContent value="payments" className="mt-4">
                <PaymentLedgerTab retailerId={retailer.id} />
              </TabsContent>
              <TabsContent value="invoices" className="mt-4">
                <InvoicesTab retailerId={retailer.id} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
    </Layout>
  );
};
import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Search, CreditCard, Loader2, MapPin } from "lucide-react";
import { RetailerDetailModal } from "@/components/RetailerDetailModal";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/contexts/CurrencyContext";

interface PendingPaymentRetailer {
  id: string;
  name: string;
  beat_id: string;
  address: string;
  pending_amount: number;
  last_order_date: string | null;
  owner_id: string | null;
  owner_name: string | null;
}

export default function PendingPaymentsAll() {
  const { format } = useCurrency();
  const { userProfile } = useAuth();
  const [retailers, setRetailers] = useState<PendingPaymentRetailer[]>([]);
  const [filteredRetailers, setFilteredRetailers] = useState<PendingPaymentRetailer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRetailer, setSelectedRetailer] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    if (userProfile?.id) {
      fetchPendingPayments();
    }
  }, [userProfile?.id]);

  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredRetailers(retailers);
    } else {
      const filtered = retailers.filter(
        (r) =>
          r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.beat_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.address.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredRetailers(filtered);
    }
  }, [searchTerm, retailers]);

  const fetchPendingPayments = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("retailers")
        .select("id, name, beat_id, address, pending_amount, last_order_date, owner_id")
        .or(`user_id.eq.${userProfile!.id},owner_id.eq.${userProfile!.id}`)
        .gt("pending_amount", 0)
        .order("pending_amount", { ascending: false });

      if (error) throw error;

      const me = userProfile!.id;
      const otherOwnerIds = Array.from(
        new Set(
          (data || [])
            .map((r: any) => r.owner_id)
            .filter((id: string | null) => !!id && id !== me)
        )
      ) as string[];
      let ownerNameMap: Record<string, string> = {};
      if (otherOwnerIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .in("id", otherOwnerIds);
        (profs || []).forEach((p: any) => {
          ownerNameMap[p.id] = p.full_name || p.username || p.id;
        });
      }
      const enriched: PendingPaymentRetailer[] = (data || []).map((r: any) => ({
        ...r,
        owner_id: r.owner_id || null,
        owner_name:
          r.owner_id && r.owner_id !== me ? ownerNameMap[r.owner_id] || null : null,
      }));
      setRetailers(enriched);
      setFilteredRetailers(enriched);
    } catch (error) {
      console.error("Error fetching pending payments:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetailerClick = async (retailerId: string) => {
    try {
      const { data, error } = await supabase
        .from("retailers")
        .select("*")
        .eq("id", retailerId)
        .single();

      if (error) throw error;

      setSelectedRetailer(data);
      setShowDetailModal(true);
    } catch (error) {
      console.error("Error fetching retailer details:", error);
    }
  };


  const totalPending = retailers.reduce((sum, r) => sum + r.pending_amount, 0);

  return (
    <Layout>
      <div className="container mx-auto p-4 max-w-6xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">All Pending Payments</h1>
            <p className="text-sm text-muted-foreground">
              Complete list of retailers with outstanding payments
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total Outstanding</p>
            <p className="text-2xl font-bold text-destructive">{format(totalPending)}</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by retailer name, beat, or address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Retailers List */}
        {isLoading ? (
          <Card>
            <CardContent className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : filteredRetailers.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No pending payments found</p>
              <p className="text-sm text-muted-foreground">
                {searchTerm ? "Try adjusting your search" : "All retailers have cleared their dues"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredRetailers.map((retailer) => (
              <Card
                key={retailer.id}
                className="cursor-pointer hover:shadow-lg transition-shadow border-l-4 border-l-destructive"
                onClick={() => handleRetailerClick(retailer.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-semibold">{retailer.name}</h3>
                          {retailer.owner_name && (
                            <p className="text-[11px] italic text-muted-foreground mt-0.5">
                              Credited to {retailer.owner_name} — you collect, revenue stays with original owner
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Outstanding</p>
                          <p className="text-xl font-bold text-destructive">
                            {format(retailer.pending_amount)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground">Address</p>
                            <p className="font-medium line-clamp-2">{retailer.address}</p>
                          </div>
                        </div>
                        
                        <div>
                          <p className="text-xs text-muted-foreground">Beat</p>
                          <p className="font-medium">{retailer.beat_id || "Unassigned"}</p>
                        </div>
                        
                        <div>
                          <p className="text-xs text-muted-foreground">Last Order Date</p>
                          <p className="font-medium">
                            {retailer.last_order_date
                              ? new Date(retailer.last_order_date).toLocaleDateString("en-IN")
                              : "No orders yet"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Retailer Detail Modal */}
      {selectedRetailer && (
        <RetailerDetailModal
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedRetailer(null);
          }}
          retailer={selectedRetailer}
          onSuccess={() => {
            fetchPendingPayments();
          }}
        />
      )}
    </Layout>
  );
}

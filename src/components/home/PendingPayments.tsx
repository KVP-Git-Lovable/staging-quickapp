import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, RefreshCw, ChevronRight, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { RetailerDetailModal } from "@/components/RetailerDetailModal";
import { useTranslation } from "react-i18next";
import { useCurrency } from "@/contexts/CurrencyContext";

interface PendingPayment {
  retailerId: string;
  retailerName: string;
  pendingAmount: number;
  lastOrderDate: string | null;
  ownerId: string | null;
  ownerName: string | null;
}

interface PendingPaymentsProps {
  userId: string;
}

export const PendingPayments = ({ userId }: PendingPaymentsProps) => {
  const { format } = useCurrency();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [selectedRetailer, setSelectedRetailer] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const fetchPendingPayments = async () => {
    try {
      console.log('[PendingPayments] Fetching pending payments for user:', userId);
      
      const { data, error } = await supabase
        .from('retailers')
        .select('id, name, pending_amount, last_order_date, owner_id')
        .or(`user_id.eq.${userId},owner_id.eq.${userId}`)
        .gt('pending_amount', 0)
        .order('pending_amount', { ascending: false })
        .limit(5);

      if (error) {
        console.error('[PendingPayments] Error fetching:', error);
        return;
      }

      console.log('[PendingPayments] Fetched data:', data);

      // Resolve owner names for retailers whose owner is someone other than the current user
      const otherOwnerIds = Array.from(
        new Set(
          (data || [])
            .map((r: any) => r.owner_id)
            .filter((id: string | null) => !!id && id !== userId)
        )
      ) as string[];
      let ownerNameMap: Record<string, string> = {};
      if (otherOwnerIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, username')
          .in('id', otherOwnerIds);
        (profs || []).forEach((p: any) => {
          ownerNameMap[p.id] = p.full_name || p.username || p.id;
        });
      }

      const pendingList: PendingPayment[] = (data || []).map((retailer: any) => ({
        retailerId: retailer.id,
        retailerName: retailer.name,
        pendingAmount: retailer.pending_amount || 0,
        lastOrderDate: retailer.last_order_date,
        ownerId: retailer.owner_id || null,
        ownerName:
          retailer.owner_id && retailer.owner_id !== userId
            ? ownerNameMap[retailer.owner_id] || null
            : null,
      }));

      setPayments(pendingList);
      
      // Calculate total pending from all retailers (not just top 5)
      const { data: totalData } = await supabase
        .from('retailers')
        .select('pending_amount')
        .or(`user_id.eq.${userId},owner_id.eq.${userId}`)
        .gt('pending_amount', 0);

      const total = (totalData || []).reduce((sum, r) => sum + (r.pending_amount || 0), 0);
      setTotalPending(total);
      setLastUpdated(new Date());
      
    } catch (error) {
      console.error('[PendingPayments] Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    
    fetchPendingPayments();

    // Set up real-time subscription for retailers table changes
    console.log('[PendingPayments] Setting up real-time subscription...');
    
    const channel = supabase
      .channel('pending-payments-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'retailers',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('[PendingPayments] Real-time update received:', payload);
          // Refetch data when any change occurs
          fetchPendingPayments();
        }
      )
      .subscribe((status) => {
        console.log('[PendingPayments] Subscription status:', status);
      });

    // Also listen to orders table for payment updates
    const ordersChannel = supabase
      .channel('pending-payments-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('[PendingPayments] Order update received:', payload);
          // Refetch pending payments when orders change
          fetchPendingPayments();
        }
      )
      .subscribe();

    return () => {
      console.log('[PendingPayments] Cleaning up subscriptions...');
      supabase.removeChannel(channel);
      supabase.removeChannel(ordersChannel);
    };
  }, [userId]);

  const handleRetailerClick = async (retailerId: string) => {
    try {
      const { data, error } = await supabase
        .from('retailers')
        .select('*')
        .eq('id', retailerId)
        .single();

      if (error) throw error;

      setSelectedRetailer(data);
      setShowDetailModal(true);
    } catch (error) {
      console.error('Error fetching retailer details:', error);
    }
  };


  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-destructive" />
            {t('home.pendingPayments')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {t('home.updated')} {formatTime(lastUpdated)}
            </Badge>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={fetchPendingPayments}
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Total Pending */}
        <div className="bg-destructive/10 rounded-lg p-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{t('home.totalPending')}</p>
            <p className="text-xl font-bold text-destructive">{format(totalPending)}</p>
          </div>
          <AlertCircle className="h-8 w-8 text-destructive/50" />
        </div>

        {/* Pending List */}
        {payments.length > 0 ? (
          <div className="space-y-2">
            {payments.map((payment) => (
              <div 
                key={payment.retailerId}
                className="flex items-center justify-between p-2 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
                onClick={() => handleRetailerClick(payment.retailerId)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{payment.retailerName}</p>
                  {payment.lastOrderDate && (
                    <p className="text-xs text-muted-foreground">
                      {t('home.lastOrder')}: {new Date(payment.lastOrderDate).toLocaleDateString('en-IN')}
                    </p>
                  )}
                  {payment.ownerName && (
                    <p className="text-[10px] text-muted-foreground italic">
                      Credited to {payment.ownerName}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-destructive">
                    {format(payment.pendingAmount)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm">{t('home.noPendingPaymentsMessage')}</p>
          </div>
        )}

        {/* View All Button */}
        {payments.length > 0 && (
          <Button 
            variant="outline" 
            className="w-full text-sm"
            onClick={() => navigate('/pending-payments-all')}
          >
            {t('home.viewAllPendingPayments')}
          </Button>
        )}
      </CardContent>

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
    </Card>
  );
};

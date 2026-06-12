import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Calendar, Loader2, Printer, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { usePackingList, PackingList } from '@/hooks/usePackingList';
import PicklistPackingStage from '@/components/packing/stages/PicklistPackingStage';
import InvoiceDispatchStage from '@/components/packing/stages/InvoiceDispatchStage';
import DeliveryRunStage from '@/components/packing/stages/DeliveryRunStage';

export default function PackingListDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pl, setPl] = useState<PackingList | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('packing_lists').select('*').eq('id', id).single();
      setPl(data as PackingList);
      setLoading(false);
    })();
  }, [id]);

  const refreshStatus = async (newStatus?: string) => {
    if (!id) return;
    const { data } = await supabase.from('packing_lists').select('*').eq('id', id).single();
    if (data) {
      setPl(data as PackingList);
      return;
    }
    if (newStatus && pl) {
      setPl({ ...pl, status: newStatus as any, updated_at: new Date().toISOString() });
    }
  };

  if (loading || !pl) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusBadgeStyles: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    picking: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    packed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    ready: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    dispatched: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    cancelled: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="min-h-screen bg-background pb-4">
      <div className="bg-card border-b sticky top-0 z-20">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <Package className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-xl font-semibold">{pl.packing_list_number}</h1>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  Delivery: {format(new Date(pl.delivery_date), 'dd MMM yyyy')}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={statusBadgeStyles[pl.status] || statusBadgeStyles.draft}>
              {pl.status.toUpperCase()}
            </Badge>
            <Button variant="outline" size="icon" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {(pl.status === 'draft' || pl.status === 'picking') && (
          <PicklistPackingStage
            packingList={pl}
            onStatusChange={refreshStatus}
            onCancel={() => navigate(-1)}
          />
        )}
        {(pl.status === 'packed' || pl.status === 'ready') && (
          <InvoiceDispatchStage packingList={pl} onStatusChange={refreshStatus} />
        )}
        {(pl.status === 'ready' || pl.status === 'dispatched' || pl.status === 'delivered' || pl.status === 'completed') && (
          <DeliveryRunStage packingList={pl} onStatusChange={refreshStatus} />
        )}
        {pl.status === 'cancelled' && (
          <div className="text-center py-12 text-muted-foreground">This packing list was cancelled.</div>
        )}
      </div>
    </div>
  );
}

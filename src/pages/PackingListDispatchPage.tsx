import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Calendar, Loader2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Layout } from '@/components/Layout';
import { supabase } from '@/integrations/supabase/client';
import { PackingList } from '@/hooks/usePackingList';
import PrimaryDispatchStage from '@/components/packing/stages/PrimaryDispatchStage';
import PrimaryDeliveryStage from '@/components/packing/stages/PrimaryDeliveryStage';
import PrimaryInvoiceStage from '@/components/packing/stages/PrimaryInvoiceStage';
import { getPrimaryPackingListInvoiceLookup } from '@/components/packing/stages/primaryInvoiceLookup';

interface Props {
  /** When true, omit the global Layout chrome (used inside nested portal routes). */
  bare?: boolean;
}

export default function PackingListDispatchPage({ bare = false }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pl, setPl] = useState<PackingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasFinalizedInvoice, setHasFinalizedInvoice] = useState<boolean>(true);

  const load = async () => {
    if (!id) return;
    const { data } = await supabase.from('packing_lists').select('*').eq('id', id).single();
    setPl(data as PackingList);
    // Check finalized primary invoices for linked orders
    if (data && (data as any).order_type === 'primary') {
      const invoiceLookup = await getPrimaryPackingListInvoiceLookup(id);
      setHasFinalizedInvoice(invoiceLookup.ready);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [id]);

  const refreshStatus = async () => {
    await load();
  };

  const statusBadgeStyles: Record<string, string> = {
    ready: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    dispatched: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    cancelled: 'bg-destructive/10 text-destructive',
  };

  const body = loading || !pl ? (
    <div className="min-h-[40vh] flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ) : (
    <div className="min-h-screen bg-background pb-6">
      <div className="bg-card border-b sticky top-0 z-20">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Package className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-semibold">{pl.packing_list_number} — Dispatch</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-3 w-3" />
                Delivery: {format(new Date(pl.delivery_date), 'dd MMM yyyy')}
              </div>
            </div>
          </div>
          <Badge className={statusBadgeStyles[pl.status] || 'bg-muted text-muted-foreground'}>
            {pl.status.toUpperCase()}
          </Badge>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {pl.status === 'ready' && !hasFinalizedInvoice && (
          <>
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/40 p-3 text-sm text-amber-800 dark:text-amber-200">
              No finalized primary invoice for this packing list yet. Generate and finalize the invoice below before dispatching.
            </div>
            <PrimaryInvoiceStage packingList={pl} onStatusChange={refreshStatus} />
          </>
        )}
        {pl.status === 'ready' && hasFinalizedInvoice && (
          <PrimaryDispatchStage packingList={pl} onStatusChange={refreshStatus} />
        )}
        {(pl.status === 'dispatched' || pl.status === 'delivered' || pl.status === 'completed') && (
          <PrimaryDeliveryStage packingList={pl} onStatusChange={refreshStatus} />
        )}
        {pl.status === 'cancelled' && (
          <div className="text-center py-12 text-muted-foreground">This packing list was cancelled.</div>
        )}
        {(pl.status === 'draft' || pl.status === 'picking' || pl.status === 'packed') && (
          <div className="text-center py-12 text-muted-foreground">
            This packing list is not yet ready for dispatch.
          </div>
        )}
      </div>
    </div>
  );

  return bare ? body : <Layout>{body}</Layout>;
}

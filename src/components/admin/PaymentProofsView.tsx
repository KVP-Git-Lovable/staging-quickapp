import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink, Image as ImageIcon, Calendar, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface OrderWithProof {
  id: string;
  order_date: string;
  retailer_name: string;
  total_amount: number;
  is_credit_order: boolean;
  credit_paid_amount: number;
  payment_method: string;
  payment_proof_url: string | null;
  created_at: string;
}

export const PaymentProofsView = () => {
  const [orders, setOrders] = useState<OrderWithProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProof, setSelectedProof] = useState<OrderWithProof | null>(null);
  const [dateFilter, setDateFilter] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("");
  const [showOnlyWithProofs, setShowOnlyWithProofs] = useState(false);

  useEffect(() => {
    fetchPaymentProofs();
  }, []);

  const fetchPaymentProofs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('orders')
        .select(`
          id,
          order_date,
          retailer_name,
          total_amount,
          is_credit_order,
          credit_paid_amount,
          payment_method,
          payment_proof_url,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      // Only filter for proofs if checkbox is checked
      if (showOnlyWithProofs) {
        query = query.not('payment_proof_url', 'is', null);
      }

      if (dateFilter) {
        query = query.gte('order_date', dateFilter);
      }

      if (paymentMethodFilter) {
        query = query.eq('payment_method', paymentMethodFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching payment proofs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPaymentMethodBadge = (method: string | null | undefined) => {
    const variants: { [key: string]: "default" | "secondary" | "destructive" | "outline" } = {
      cash: "default",
      cheque: "secondary",
      upi: "outline",
      neft: "destructive"
    };
    const key = (method || "").toLowerCase();
    const label = method ? method.toUpperCase() : "N/A";
    return <Badge variant={variants[key] || "default"}>{label}</Badge>;
  };

  const getPaymentTypeBadge = (isCreditOrder: boolean, creditPaid: number) => {
    if (isCreditOrder && creditPaid === 0) {
      return <Badge variant="destructive">Full Credit</Badge>;
    } else if (isCreditOrder && creditPaid > 0) {
      return <Badge variant="secondary">Partial Payment</Badge>;
    } else {
      return <Badge variant="default">Full Payment</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Payment Proofs & Records
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Date Filter (From)</Label>
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <select
                className="w-full h-10 px-3 rounded-md border border-input bg-background"
                value={paymentMethodFilter}
                onChange={(e) => setPaymentMethodFilter(e.target.value)}
              >
                <option value="">All Methods</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="upi">UPI</option>
                <option value="neft">NEFT</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Show Only With Proofs</Label>
              <div className="flex items-center h-10">
                <input
                  type="checkbox"
                  id="showOnlyWithProofs"
                  checked={showOnlyWithProofs}
                  onChange={(e) => setShowOnlyWithProofs(e.target.checked)}
                  className="w-4 h-4 rounded border-input"
                />
                <label htmlFor="showOnlyWithProofs" className="ml-2 text-sm">
                  Only with proofs
                </label>
              </div>
            </div>
            <div className="flex items-end">
              <Button onClick={fetchPaymentProofs} className="w-full">
                Apply Filters
              </Button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading payment proofs...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No payment proofs found</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Retailer</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Payment Type</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Proof</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          {format(new Date(order.order_date), 'dd MMM yyyy')}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{order.retailer_name}</TableCell>
                      <TableCell className="font-semibold">₹{order.total_amount.toLocaleString()}</TableCell>
                      <TableCell>{getPaymentTypeBadge(order.is_credit_order, order.credit_paid_amount)}</TableCell>
                      <TableCell>{getPaymentMethodBadge(order.payment_method)}</TableCell>
                      <TableCell>
                        {order.payment_proof_url ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedProof(order)}
                          >
                            <ImageIcon className="w-4 h-4 mr-1" />
                            View Proof
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">No proof</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Proof Preview Dialog */}
      <Dialog open={!!selectedProof} onOpenChange={() => setSelectedProof(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment Proof - {selectedProof?.retailer_name}</DialogTitle>
          </DialogHeader>
          {selectedProof && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Order Date:</span>
                  <p className="font-medium">{format(new Date(selectedProof.order_date), 'dd MMM yyyy')}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Amount:</span>
                  <p className="font-medium">₹{selectedProof.total_amount.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Payment Type:</span>
                  <p>{getPaymentTypeBadge(selectedProof.is_credit_order, selectedProof.credit_paid_amount)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Payment Method:</span>
                  <p>{getPaymentMethodBadge(selectedProof.payment_method)}</p>
                </div>
              </div>

              {selectedProof.payment_proof_url && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Payment Proof Image:</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(selectedProof.payment_proof_url!, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      Open in New Tab
                    </Button>
                  </div>
                  <img
                    src={selectedProof.payment_proof_url}
                    alt="Payment Proof"
                    className="w-full rounded-lg border"
                  />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

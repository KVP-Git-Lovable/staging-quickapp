 import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ChevronRight, ArrowLeft, User, Store, Download, BadgeCheck } from "lucide-react";
 import { useHindiToEnglish } from "@/hooks/useHindiToEnglish";
import { downloadCSV } from "@/utils/fileDownloader";
import type { NewRetailerDetail } from "./useBusinessMetrics";

/**
 * Quote every cell and double inner quotes — a retailer name containing a comma
 * or a quote would otherwise shift the remaining columns on that row. The BOM
 * keeps Excel from mangling ₹ and Hindi/Kannada names.
 */
const exportRowsToCsv = async (
  filename: string,
  columns: { key: string; label: string }[],
  rows: Record<string, unknown>[],
) => {
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    columns.map(c => cell(c.label)).join(','),
    ...rows.map(r => columns.map(c => cell(r[c.key])).join(',')),
  ].join('\n');
  await downloadCSV('﻿' + csv, filename);
};

interface BeatDetail {
  beat_name: string;
  visits_count: number;
  orders_count: number;
  revenue: number;
}

interface RetailerDetail {
  id: string;
  name: string;
  beat_name: string;
  orders_count: number;
  revenue: number;
  pending_amount: number;
}

interface OrderDetail {
  id: string;
  order_date: string;
  retailer_name: string;
  total_amount: number;
  status: string;
  user_id?: string;
  user_name?: string;
}

interface ProductDetail {
  product_name: string;
  unit: string;
  quantity: number;
  revenue: number;
}

interface PendingPaymentDetail {
  retailer_name: string;
  order_date: string;
  order_id: string;
  pending_amount: number;
  user_id?: string;
  user_name?: string;
}

interface UserPendingPaymentSummary {
  user_id: string;
  user_name: string;
  total_pending: number;
  retailer_count: number;
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUsers: string[];
  dateRange: { from: Date; to: Date };
}

// Beat Details Dialog
export const BeatDetailsDialog = ({
  open,
  onOpenChange,
  selectedUsers,
  dateRange,
  data,
  isLoading
}: DialogProps & { data: BeatDetail[]; isLoading: boolean }) => {
   const { translateTexts, getTranslated } = useHindiToEnglish();
 
   // Translate Hindi beat names when data changes
   useEffect(() => {
     if (data.length > 0) {
       const textsToTranslate = data.map(b => b.beat_name).filter(Boolean);
       translateTexts(textsToTranslate);
     }
   }, [data]);
 
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Beat-wise Performance</DialogTitle>
          <DialogDescription>
            {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd, yyyy')} • {selectedUsers.length} user(s)
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Beat Name</TableHead>
                <TableHead className="text-right">Visits</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No beat data available
                  </TableCell>
                </TableRow>
              ) : (
                data.map((beat, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{getTranslated(beat.beat_name)}</TableCell>
                    <TableCell className="text-right">{beat.visits_count}</TableCell>
                    <TableCell className="text-right">{beat.orders_count}</TableCell>
                    <TableCell className="text-right font-semibold">₹{beat.revenue.toLocaleString()}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

// Retailer Details Dialog
export const RetailerDetailsDialog = ({
  open,
  onOpenChange,
  selectedUsers,
  dateRange,
  data,
  isLoading
}: DialogProps & { data: RetailerDetail[]; isLoading: boolean }) => {
   const { translateTexts, getTranslated } = useHindiToEnglish();
 
   // Translate Hindi retailer and beat names when data changes
   useEffect(() => {
     if (data.length > 0) {
       const textsToTranslate = [
         ...data.map(r => r.name),
         ...data.map(r => r.beat_name).filter(Boolean)
       ];
       translateTexts(textsToTranslate);
     }
   }, [data]);
 
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Retailer-wise Performance</DialogTitle>
          <DialogDescription>
            {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd, yyyy')} • {selectedUsers.length} user(s)
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Retailer Name</TableHead>
                <TableHead>Beat</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Pending</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No retailer data available
                  </TableCell>
                </TableRow>
              ) : (
                data.map((retailer) => (
                  <TableRow key={retailer.id}>
                     <TableCell className="font-medium">{getTranslated(retailer.name)}</TableCell>
                     <TableCell className="text-muted-foreground">{retailer.beat_name ? getTranslated(retailer.beat_name) : '-'}</TableCell>
                    <TableCell className="text-right">{retailer.orders_count}</TableCell>
                    <TableCell className="text-right font-semibold">₹{retailer.revenue.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      {retailer.pending_amount > 0 ? (
                        <span className="text-red-600">₹{retailer.pending_amount.toLocaleString()}</span>
                      ) : (
                        <span className="text-green-600">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export const NewRetailersDialog = ({
  open,
  onOpenChange,
  selectedUsers,
  dateRange,
  data,
  isLoading
}: DialogProps & { data: NewRetailerDetail[]; isLoading: boolean }) => {
  const { translateTexts, getTranslated } = useHindiToEnglish();

  useEffect(() => {
    if (data.length > 0) {
      translateTexts([...data.map(r => r.name), ...data.map(r => r.beat_name).filter(Boolean)]);
    }
  }, [data]);

  const yetToOrder = data.filter(r => r.orders_count === 0).length;

  const handleExport = () =>
    exportRowsToCsv(
      `new-retailers-${format(dateRange.from, 'yyyy-MM-dd')}-to-${format(dateRange.to, 'yyyy-MM-dd')}`,
      [
        { key: 'name', label: 'Retailer' },
        { key: 'beat_name', label: 'Beat' },
        { key: 'added_by', label: 'Added By' },
        { key: 'added_on', label: 'Added On' },
        { key: 'verified', label: 'Verified' },
        { key: 'orders_count', label: 'Orders Since' },
        { key: 'revenue', label: 'Revenue' },
        { key: 'id', label: 'Retailer ID' },
      ],
      data.map(r => ({
        ...r,
        added_on: format(new Date(r.created_at), 'dd/MM/yyyy HH:mm'),
        verified: r.verified ? 'Yes' : 'No',
        revenue: r.revenue.toFixed(2),
      })),
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Newly Added Retailers</DialogTitle>
              <DialogDescription>
                {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd, yyyy')} • {selectedUsers.length} user(s)
                {data.length > 0 && ` • ${data.length} added, ${yetToOrder} yet to order`}
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={data.length === 0}>
              <Download size={14} className="mr-2" /> Export CSV
            </Button>
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Retailer</TableHead>
                <TableHead>Beat</TableHead>
                <TableHead>Added By</TableHead>
                <TableHead>Added On</TableHead>
                <TableHead className="text-right">Orders Since</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No retailers were added in this period</TableCell></TableRow>
              ) : (
                data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        {getTranslated(r.name)}
                        {r.verified && <BadgeCheck size={13} className="text-green-600 shrink-0" />}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.beat_name ? getTranslated(r.beat_name) : '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{r.added_by}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), 'dd MMM, HH:mm')}</TableCell>
                    <TableCell className="text-right">
                      {r.orders_count === 0
                        ? <Badge variant="outline" className="text-amber-600 border-amber-300">Yet to order</Badge>
                        : r.orders_count}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {r.revenue > 0 ? `₹${r.revenue.toLocaleString()}` : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

// Order Details Dialog - grouped by user
export const OrderDetailsDialog = ({
  open,
  onOpenChange,
  selectedUsers,
  dateRange,
  data,
  isLoading
}: DialogProps & { data: OrderDetail[]; isLoading: boolean }) => {
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  // Group by user
  const userSummaries = useMemo(() => {
    const map = new Map<string, { user_name: string; order_count: number; total_amount: number }>();
    data.forEach(order => {
      const uid = order.user_id || 'unknown';
      const existing = map.get(uid);
      if (existing) {
        existing.order_count += 1;
        existing.total_amount += order.total_amount;
      } else {
        map.set(uid, {
          user_name: order.user_name || 'Unknown',
          order_count: 1,
          total_amount: order.total_amount
        });
      }
    });
    return Array.from(map.entries())
      .map(([user_id, info]) => ({ user_id, ...info }))
      .sort((a, b) => b.total_amount - a.total_amount);
  }, [data]);

  const userOrders = useMemo(() => {
    if (!selectedUser) return [];
    return data.filter(o => (o.user_id || 'unknown') === selectedUser);
  }, [data, selectedUser]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) setSelectedUser(null);
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {selectedUser && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedUser(null)}>
                <ArrowLeft size={16} />
              </Button>
            )}
            <div>
              <DialogTitle>{selectedUser ? `Orders – ${userSummaries.find(u => u.user_id === selectedUser)?.user_name}` : 'Order Details'}</DialogTitle>
              <DialogDescription>
                {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd, yyyy')} • {selectedUsers.length} user(s)
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          {!selectedUser ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="text-center">Orders</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : userSummaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No order data available</TableCell>
                  </TableRow>
                ) : (
                  userSummaries.map((user) => (
                    <TableRow key={user.user_id} className="cursor-pointer" onClick={() => setSelectedUser(user.user_id)}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <User size={14} className="text-muted-foreground" />
                        {user.user_name}
                      </TableCell>
                      <TableCell className="text-center">{user.order_count}</TableCell>
                      <TableCell className="text-right font-semibold">₹{user.total_amount.toLocaleString()}</TableCell>
                      <TableCell><ChevronRight size={14} className="text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Retailer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>{format(new Date(order.order_date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell className="font-medium">{order.retailer_name}</TableCell>
                    <TableCell className="text-right font-semibold">₹{order.total_amount.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

// Product Breakdown Dialog
export const ProductBreakdownDialog = ({
  open,
  onOpenChange,
  selectedUsers,
  dateRange,
  data,
  isLoading
}: DialogProps & { data: ProductDetail[]; isLoading: boolean }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Product-wise Breakdown (Quantity)</DialogTitle>
          <DialogDescription>
            {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd, yyyy')} • {selectedUsers.length} user(s)
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product Name</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No product data available
                  </TableCell>
                </TableRow>
              ) : (
                data.map((product, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{product.product_name}</TableCell>
                    <TableCell className="text-muted-foreground">{product.unit || 'PCs'}</TableCell>
                    <TableCell className="text-right">{product.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right font-semibold">₹{product.revenue.toLocaleString()}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

// Pending Payments Dialog with User-wise drill-down
export const PendingPaymentsDialog = ({
  open,
  onOpenChange,
  selectedUsers,
  dateRange,
  data,
  isLoading
}: DialogProps & { data: PendingPaymentDetail[]; isLoading: boolean }) => {
  const [selectedUser, setSelectedUser] = useState<UserPendingPaymentSummary | null>(null);

  // Group data by user
  const userSummaries: UserPendingPaymentSummary[] = data.reduce((acc, payment) => {
    const userId = payment.user_id || 'unknown';
    const userName = payment.user_name || 'Unknown User';
    
    const existing = acc.find(u => u.user_id === userId);
    if (existing) {
      existing.total_pending += payment.pending_amount;
      existing.retailer_count += 1;
    } else {
      acc.push({
        user_id: userId,
        user_name: userName,
        total_pending: payment.pending_amount,
        retailer_count: 1
      });
    }
    return acc;
  }, [] as UserPendingPaymentSummary[]);

  // Get retailer data for selected user
  const retailerData = selectedUser 
    ? data.filter(p => p.user_id === selectedUser.user_id)
    : [];

  // Reset selected user when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedUser(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {selectedUser && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => setSelectedUser(null)}
              >
                <ArrowLeft size={16} />
              </Button>
            )}
            <div>
              <DialogTitle className="flex items-center gap-2">
                {selectedUser ? (
                  <>
                    <Store size={16} />
                    Retailer-wise Pending - {selectedUser.user_name}
                  </>
                ) : (
                  <>
                    <User size={16} />
                    User-wise Pending Payments
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd, yyyy')} • {selectedUsers.length} user(s)
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          {!selectedUser ? (
            // User-wise summary view
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User Name</TableHead>
                  <TableHead className="text-center">Retailers</TableHead>
                  <TableHead className="text-right">Pending Amount</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : userSummaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No pending payments
                    </TableCell>
                  </TableRow>
                ) : (
                  userSummaries
                    .sort((a, b) => b.total_pending - a.total_pending)
                    .map((user) => (
                      <TableRow 
                        key={user.user_id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedUser(user)}
                      >
                        <TableCell className="font-medium">{user.user_name}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{user.retailer_count}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-destructive">
                          ₹{user.total_pending.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <ChevronRight size={16} className="text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          ) : (
            // Retailer-wise detail view for selected user
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Retailer</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead className="text-right">Pending Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {retailerData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      No retailers found
                    </TableCell>
                  </TableRow>
                ) : (
                  retailerData
                    .sort((a, b) => b.pending_amount - a.pending_amount)
                    .map((payment, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{payment.retailer_name}</TableCell>
                        <TableCell>{format(new Date(payment.order_date), 'MMM dd, yyyy')}</TableCell>
                        <TableCell className="text-right font-semibold text-destructive">
                          ₹{payment.pending_amount.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

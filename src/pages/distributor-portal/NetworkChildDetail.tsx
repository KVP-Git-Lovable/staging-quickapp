import { useState, useEffect } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, Package, ShoppingCart, ClipboardList, CheckCircle, PackageCheck } from "lucide-react";
import NetworkChildInventoryView from "@/components/distributor-portal/network-inventory/NetworkChildInventoryView";

interface DistributorContext {
  distributorId: string;
}

export default function NetworkChildDetail() {
  const { childId } = useParams<{ childId: string }>();
  const { distributorId } = useOutletContext<DistributorContext>();
  const navigate = useNavigate();

  const [child, setChild] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [primaryOrders, setPrimaryOrders] = useState<any[]>([]);
  const [secondarySales, setSecondarySales] = useState<any[]>([]);
  // Inventory now owned by NetworkChildInventoryView (read-only)
  const [primaryPackingLists, setPrimaryPackingLists] = useState<any[]>([]);
  const [secondaryPackingLists, setSecondaryPackingLists] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, completed: 0, inventoryCount: 0 });

  useEffect(() => {
    if (!childId) return;
    const load = async () => {
      // Child info
      const { data: childData } = await supabase
        .from("distributors")
        .select("*, distributor_types(name, code)")
        .eq("id", childId)
        .single();
      setChild(childData);

      // Primary orders — handle both Company-routed (NULL) and direct-targeted orders
      const { data: po } = await supabase
        .from("primary_orders")
        .select("*")
        .eq("source_distributor_id", childId)
        .or(`target_distributor_id.is.null,target_distributor_id.eq.${distributorId}`)
        .order("order_date", { ascending: false });
      setPrimaryOrders(po || []);

      // Secondary sales — match by distributor_id OR retailer's distributor_id/parent_name
      const { data: ssDirectOrders } = await supabase
        .from("orders")
        .select("id, retailer_id, retailer_name, created_at, status, total_amount, distributor_id")
        .or(`distributor_id.eq.${childId},distributor_id.is.null`)
        .order("created_at", { ascending: false });

      // For orders with NULL distributor_id, check retailer ownership
      let secondaryOrders = (ssDirectOrders || []).filter((o: any) => o.distributor_id === childId);
      const nullDistOrders = (ssDirectOrders || []).filter((o: any) => !o.distributor_id);
      if (nullDistOrders.length > 0) {
        const retailerIds = [...new Set(nullDistOrders.map((o: any) => o.retailer_id).filter(Boolean))];
        if (retailerIds.length > 0) {
          const { data: retailers } = await supabase
            .from("retailers")
            .select("id, distributor_id, parent_name")
            .in("id", retailerIds);
          const childDistName = childData?.name;
          const matchingRetailerIds = new Set(
            (retailers || [])
              .filter((r: any) => r.distributor_id === childId || (childDistName && r.parent_name === childDistName))
              .map((r: any) => r.id)
          );
          const extraOrders = nullDistOrders.filter((o: any) => matchingRetailerIds.has(o.retailer_id));
          secondaryOrders = [...secondaryOrders, ...extraOrders];
        }
      }
      secondaryOrders.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setSecondarySales(secondaryOrders);

      // Inventory data is fetched inside NetworkChildInventoryView

      // Primary packing lists (orders from child to current distributor)
      const { data: childOrders } = await supabase
        .from('primary_orders')
        .select('id, packing_list_id')
        .eq('source_distributor_id', childId)
        .or(`target_distributor_id.is.null,target_distributor_id.eq.${distributorId}`)
        .not('packing_list_id', 'is', null);

      const packingListIds = (childOrders || []).map((o: any) => o.packing_list_id).filter(Boolean);
      if (packingListIds.length > 0) {
        const { data: plData } = await supabase
          .from('packing_lists')
          .select('*')
          .in('id', packingListIds)
          .order('created_at', { ascending: false });
        setPrimaryPackingLists(plData || []);
      }

      // Secondary packing lists (child's retailer fulfillment, read-only)
      const { data: secPl } = await supabase
        .from('packing_lists')
        .select('*')
        .eq('distributor_id', childId)
        .eq('order_type', 'secondary')
        .order('created_at', { ascending: false });
      setSecondaryPackingLists(secPl || []);

      // Stats
      const totalOrders = po?.length || 0;
      const pending = po?.filter((o: any) => ["pending", "submitted", "processing"].includes(o.status)).length || 0;
      const completed = po?.filter((o: any) => ["delivered", "completed"].includes(o.status)).length || 0;
      setStats({ total: totalOrders, pending, completed, inventoryCount: 0 });

      setLoading(false);
    };
    load();
  }, [childId, distributorId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!child) {
    return (
      <div className="p-6 text-center text-muted-foreground">Distributor not found</div>
    );
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      submitted: "bg-blue-100 text-blue-800",
      processing: "bg-blue-100 text-blue-800",
      approved: "bg-green-100 text-green-800",
      delivered: "bg-green-100 text-green-800",
      completed: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
      rejected: "bg-red-100 text-red-800",
    };
    return (
      <Badge className={`text-[10px] ${colors[status] || "bg-muted text-muted-foreground"}`}>
        {status?.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
      </Badge>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/distributor-portal/network")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground">{child.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {child.distributor_types && (
              <Badge variant="outline" className="text-xs">
                {child.distributor_types.name} • {child.distributor_types.code}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">Child of your network</span>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="primary">Primary Orders</TabsTrigger>
          <TabsTrigger value="secondary">Secondary Sales</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="packing">Packing</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Distributor Info</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Contact:</span> {child.contact_person}</div>
              <div><span className="text-muted-foreground">Phone:</span> {child.phone}</div>
              <div><span className="text-muted-foreground">Email:</span> {child.email || "—"}</div>
              <div><span className="text-muted-foreground">GST:</span> {child.gst_number || "—"}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Address:</span> {child.address || "—"}</div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Orders", value: stats.total, icon: ClipboardList, color: "text-blue-600" },
              { label: "Pending", value: stats.pending, icon: ShoppingCart, color: "text-yellow-600" },
              { label: "Completed", value: stats.completed, icon: CheckCircle, color: "text-green-600" },
              { label: "Inventory Items", value: stats.inventoryCount, icon: Package, color: "text-purple-600" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <s.icon className={`h-8 w-8 ${s.color}`} />
                  <div>
                    <p className="text-2xl font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* PRIMARY ORDERS */}
        <TabsContent value="primary" className="mt-4">
          {primaryOrders.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No primary orders found</p>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {primaryOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium text-sm">{o.order_number}</TableCell>
                      <TableCell className="text-sm">{new Date(o.order_date).toLocaleDateString()}</TableCell>
                      <TableCell>{statusBadge(o.status)}</TableCell>
                      <TableCell className="text-right text-sm">₹{Number(o.total_amount || 0).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* SECONDARY SALES */}
        <TabsContent value="secondary" className="mt-4">
          {secondarySales.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No secondary sales found</p>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Retailer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {secondarySales.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-sm">{o.retailer_name || "—"}</TableCell>
                      <TableCell className="text-sm">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>{statusBadge(o.status)}</TableCell>
                      <TableCell className="text-right text-sm">₹{Number(o.total_amount || 0).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* INVENTORY — Read-only Control Tower */}
        <TabsContent value="inventory" className="mt-4">
          {childId && <NetworkChildInventoryView childId={childId} childName={child?.name} />}
        </TabsContent>

        {/* PACKING */}
        <TabsContent value="packing" className="mt-4 space-y-6">
          {/* Primary Packing — fulfillment from current distributor to this child */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-blue-600" />
              Primary Packing (Your Fulfillment)
            </h3>
            {primaryPackingLists.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">No primary packing lists for this child</p>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Packing #</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {primaryPackingLists.map((pl: any) => (
                      <TableRow key={pl.id}>
                        <TableCell className="font-medium text-sm">{pl.packing_list_number}</TableCell>
                        <TableCell>{statusBadge(pl.status)}</TableCell>
                        <TableCell className="text-sm">{pl.total_items}</TableCell>
                        <TableCell className="text-right text-sm">₹{Number(pl.total_value || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-sm">{new Date(pl.created_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Secondary Packing — child's own retailer fulfillment (read-only) */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Package className="h-4 w-4 text-purple-600" />
              Secondary Packing (Child's Retailer Fulfillment)
            </h3>
            {secondaryPackingLists.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">No secondary packing lists from this child</p>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Packing #</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {secondaryPackingLists.map((pl: any) => (
                      <TableRow key={pl.id}>
                        <TableCell className="font-medium text-sm">{pl.packing_list_number}</TableCell>
                        <TableCell>{statusBadge(pl.status)}</TableCell>
                        <TableCell className="text-sm">{pl.total_items}</TableCell>
                        <TableCell className="text-right text-sm">₹{Number(pl.total_value || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-sm">{new Date(pl.created_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

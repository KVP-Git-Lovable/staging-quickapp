import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Share2, UserPlus, Wallet, MapPin, Calendar, Clock } from "lucide-react";
import {
  useMyOperationsToday,
  useCollectionWorkspace,
  useSharedAccess,
  useDelegations,
  useActivityTimeline,
  useRevokeShare,
} from "@/hooks/useMyOperations";
import { ShareRetailerDrawer } from "@/components/my-operations/ShareRetailerDrawer";
import { DelegateDrawer } from "@/components/my-operations/DelegateDrawer";
import { CollectPaymentDrawer } from "@/components/my-operations/CollectPaymentDrawer";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

const sb = supabase as any;

function useMyDistributorId() {
  return useQuery({
    queryKey: ["my-distributor-id"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await sb.from("profiles").select("distributor_id").eq("id", user.id).maybeSingle();
      return data?.distributor_id ?? null;
    },
  });
}

export default function MyOperations() {
  const today = useMyOperationsToday();
  const shared = useSharedAccess();
  const delegations = useDelegations();
  const activity = useActivityTimeline();
  const { data: distributorId } = useMyDistributorId();
  const revoke = useRevokeShare();

  const [shareTarget, setShareTarget] = useState<{ id: string; name: string } | null>(null);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [collectTarget, setCollectTarget] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Operations</h1>
          <p className="text-sm text-muted-foreground">Daily execution, sharing, delegation and collections</p>
        </div>
        <Button onClick={() => setDelegateOpen(true)} variant="outline">
          <Calendar className="h-4 w-4 mr-2" /> New Delegation
        </Button>
      </div>

      <Tabs defaultValue="today">
        <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="retailers">Retailers</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="shared">Shared Access</TabsTrigger>
          <TabsTrigger value="delegation">Delegation</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Today's retailers</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Retailer</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(today.data || []).map((r) => (
                    <TableRow key={r.retailer_id}>
                      <TableCell>{r.retailer_name}</TableCell>
                      <TableCell>
                        <Badge variant={r.access_type === "owned" ? "default" : "secondary"}>
                          {r.access_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.pending_collection > 0 ? `₹${Number(r.pending_collection).toLocaleString("en-IN")}` : "—"}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => setShareTarget({ id: r.retailer_id, name: r.retailer_name })}>
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setCollectTarget({ id: r.retailer_id, name: r.retailer_name })}>
                          <Wallet className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(today.data || []).length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">
                      {today.isLoading ? "Loading…" : "No retailers today"}
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="retailers">
          <RetailersTab
            onShare={(id, name) => setShareTarget({ id, name })}
            onCollect={(id, name) => setCollectTarget({ id, name })}
          />
        </TabsContent>

        <TabsContent value="collections">
          <CollectionsTab onCollect={(id, name) => setCollectTarget({ id, name })} />
        </TabsContent>

        <TabsContent value="shared">
          <Card>
            <CardHeader><CardTitle className="text-base">Shared access grants</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Retailer</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(shared.data || []).map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.retailers?.name || s.retailer_id}</TableCell>
                      <TableCell><Badge variant="outline">{s.source}</Badge></TableCell>
                      <TableCell className="text-xs">
                        {[s.can_view && "view", s.can_take_orders && "order", s.can_collect_payment && "collect", s.can_update_feedback && "feedback"].filter(Boolean).join(", ")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(s.effective_from), "dd MMM")} – {s.effective_to ? format(new Date(s.effective_to), "dd MMM") : "open"}
                        {!s.is_active && <Badge variant="secondary" className="ml-2">revoked</Badge>}
                      </TableCell>
                      <TableCell>
                        {s.is_active && (
                          <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)}>Revoke</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(shared.data || []).length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No shares yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="delegation">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Delegations</CardTitle>
                <Button size="sm" onClick={() => setDelegateOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-1" /> New
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Direction</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(delegations.data || []).map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-xs">{d.from_user_id?.slice(0, 8)} → {d.to_user_id?.slice(0, 8)}</TableCell>
                      <TableCell><Badge variant="outline">{d.delegation_scope}</Badge></TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(d.effective_from), "dd MMM")} – {format(new Date(d.effective_to), "dd MMM")}
                      </TableCell>
                      <TableCell><Badge>{d.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {(delegations.data || []).length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No delegations</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader><CardTitle className="text-base">Activity timeline</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(activity.data || []).map((a: any) => (
                  <div key={a.id} className="flex items-start gap-3 text-sm border-b pb-2">
                    <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="font-medium">{a.activity_type}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(a.created_at), "dd MMM HH:mm")} · {a.entity_type}
                      </div>
                    </div>
                  </div>
                ))}
                {(activity.data || []).length === 0 && (
                  <div className="text-center text-muted-foreground py-4">No activity yet</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ShareRetailerDrawer
        open={!!shareTarget}
        onOpenChange={(v) => !v && setShareTarget(null)}
        retailerId={shareTarget?.id ?? null}
        retailerName={shareTarget?.name}
      />
      <DelegateDrawer open={delegateOpen} onOpenChange={setDelegateOpen} />
      <CollectPaymentDrawer
        open={!!collectTarget}
        onOpenChange={(v) => !v && setCollectTarget(null)}
        retailerId={collectTarget?.id ?? null}
        retailerName={collectTarget?.name}
        distributorId={distributorId}
      />
    </div>
  );
}

function RetailersTab({
  onShare, onCollect,
}: { onShare: (id: string, name: string) => void; onCollect: (id: string, name: string) => void }) {
  const today = useMyOperationsToday();
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">My retailers (owned + shared)</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Retailer</TableHead>
              <TableHead>Access</TableHead>
              <TableHead className="text-right">Pending</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(today.data || []).map((r) => (
              <TableRow key={r.retailer_id}>
                <TableCell>{r.retailer_name}</TableCell>
                <TableCell><Badge variant={r.access_type === "owned" ? "default" : "secondary"}>{r.access_type}</Badge></TableCell>
                <TableCell className="text-right">
                  {r.pending_collection > 0 ? `₹${Number(r.pending_collection).toLocaleString("en-IN")}` : "—"}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => onShare(r.retailer_id, r.retailer_name)}>
                    <Share2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onCollect(r.retailer_id, r.retailer_name)}>
                    <Wallet className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CollectionsTab({ onCollect }: { onCollect: (id: string, name: string) => void }) {
  const [filter, setFilter] = useState<"mine" | "shared" | "overdue" | "all">("mine");
  const { data = [], isLoading } = useCollectionWorkspace(filter);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Collection workspace</CardTitle>
          <div className="flex gap-1">
            {(["mine", "shared", "overdue", "all"] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                {f}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Retailer</TableHead>
              <TableHead className="text-right">Open Invoices</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead>Oldest</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((r) => (
              <TableRow key={r.retailer_id}>
                <TableCell>{r.retailer_name}</TableCell>
                <TableCell className="text-right">{r.open_invoice_count}</TableCell>
                <TableCell className="text-right">₹{Number(r.outstanding).toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-xs">
                  {r.oldest_invoice_date ? format(new Date(r.oldest_invoice_date), "dd MMM yyyy") : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" onClick={() => onCollect(r.retailer_id, r.retailer_name)}>
                    Collect
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">
                {isLoading ? "Loading…" : "No outstanding collections"}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

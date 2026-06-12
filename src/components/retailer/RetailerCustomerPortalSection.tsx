import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Globe, ShoppingCart, Clock, KeyRound, Power, ExternalLink, Loader2, Copy } from "lucide-react";
import { format } from "date-fns";

interface PortalData {
  portalEnabled: boolean;
  portalPin: string | null;
  totalPortalOrders: number;
  lastPortalOrder: { id: string; created_at: string; total_amount: number } | null;
  lastLogin: string | null;
}

interface Props {
  retailerId: string;
  retailerPhone: string | null;
  portalEnabled?: boolean | null;
  portalPin?: string | null;
  onPortalUpdate?: () => void;
}

export function RetailerCustomerPortalSection({
  retailerId,
  retailerPhone,
  portalEnabled = false,
  portalPin = null,
  onPortalUpdate,
}: Props) {
  const [portalData, setPortalData] = useState<PortalData>({
    portalEnabled: !!portalEnabled,
    portalPin: portalPin ?? null,
    totalPortalOrders: 0,
    lastPortalOrder: null,
    lastLogin: null,
  });
  const [loading, setLoading] = useState(true);
  const [initiating, setInitiating] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    loadPortalData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retailerId]);

  const loadPortalData = async () => {
    setLoading(true);
    try {
      const { data: retailerData } = await supabase
        .from("retailers")
        .select("portal_enabled, portal_pin")
        .eq("id", retailerId)
        .maybeSingle();

      const currentEnabled = (retailerData as any)?.portal_enabled ?? portalEnabled ?? false;
      const currentPin = (retailerData as any)?.portal_pin ?? portalPin ?? null;

      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("retailer_id", retailerId)
        .eq("order_source", "portal_order");

      const { data: lastOrder } = await supabase
        .from("orders")
        .select("id, created_at, total_amount")
        .eq("retailer_id", retailerId)
        .eq("order_source", "portal_order")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setPortalData({
        portalEnabled: !!currentEnabled,
        portalPin: currentPin,
        totalPortalOrders: count || 0,
        lastPortalOrder: lastOrder
          ? {
              id: (lastOrder as any).id,
              created_at: (lastOrder as any).created_at,
              total_amount: Number((lastOrder as any).total_amount) || 0,
            }
          : null,
        lastLogin: null,
      });
    } catch (error) {
      console.error("Error loading portal data:", error);
    } finally {
      setLoading(false);
    }
  };

  const generatePin = () => Math.floor(1000 + Math.random() * 9000).toString();

  const handleInitiatePortal = async () => {
    if (!retailerPhone) {
      toast({
        title: "Phone Required",
        description: "Add a phone number to the retailer before enabling the portal.",
        variant: "destructive",
      });
      return;
    }
    setInitiating(true);
    try {
      const pin = generatePin();
      const { error } = await supabase
        .from("retailers")
        .update({ portal_enabled: true, portal_pin: pin } as any)
        .eq("id", retailerId);
      if (error) throw error;
      setPortalData((prev) => ({ ...prev, portalEnabled: true, portalPin: pin }));
      toast({ title: "Portal Activated", description: `Customer portal enabled. PIN: ${pin}` });
      onPortalUpdate?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to activate portal", variant: "destructive" });
    } finally {
      setInitiating(false);
    }
  };

  const handleResetPin = async () => {
    setResetting(true);
    try {
      const newPin = generatePin();
      const { error } = await supabase
        .from("retailers")
        .update({ portal_pin: newPin } as any)
        .eq("id", retailerId);
      if (error) throw error;
      setPortalData((prev) => ({ ...prev, portalPin: newPin }));
      toast({ title: "PIN Reset", description: `New PIN: ${newPin}` });
      onPortalUpdate?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to reset PIN", variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const handleDeactivatePortal = async () => {
    try {
      const { error } = await supabase
        .from("retailers")
        .update({ portal_enabled: false, portal_pin: null } as any)
        .eq("id", retailerId);
      if (error) throw error;
      setPortalData((prev) => ({ ...prev, portalEnabled: false, portalPin: null }));
      toast({ title: "Portal Deactivated", description: "Customer portal access has been disabled." });
      onPortalUpdate?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to deactivate portal", variant: "destructive" });
    }
  };

  const copyPin = () => {
    if (portalData.portalPin) {
      navigator.clipboard.writeText(portalData.portalPin);
      toast({ title: "Copied", description: "PIN copied to clipboard" });
    }
  };

  const portalUrl = `${window.location.origin}/customer-portal/login`;

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe className="h-4 w-4" /> Customer Portal
          </CardTitle>
          <Badge variant={portalData.portalEnabled ? "default" : "secondary"} className="text-xs">
            {portalData.portalEnabled ? "Active" : "Inactive"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-2.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShoppingCart className="h-3 w-3" /> Portal Orders
                </div>
                <p className="text-lg font-semibold">{portalData.totalPortalOrders}</p>
              </div>
              <div className="rounded-lg border p-2.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> Status
                </div>
                <p className="text-sm font-medium">
                  {portalData.portalEnabled ? "Initiated" : "Not Initiated"}
                </p>
              </div>
            </div>

            {portalData.lastPortalOrder && (
              <div className="rounded-lg border p-2.5 space-y-1">
                <Label className="text-xs text-muted-foreground">Last Portal Order</Label>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    ₹{portalData.lastPortalOrder.total_amount.toLocaleString("en-IN")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(portalData.lastPortalOrder.created_at), "dd MMM yyyy, hh:mm a")}
                  </span>
                </div>
              </div>
            )}

            {portalData.portalEnabled && retailerPhone && (
              <div className="rounded-lg bg-muted/50 p-2.5 space-y-2">
                <Label className="text-xs text-muted-foreground">Portal Access</Label>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground block">Login Phone</span>
                    <span className="font-medium">{retailerPhone}</span>
                  </div>
                  {portalData.portalPin && (
                    <div>
                      <span className="text-xs text-muted-foreground block">PIN</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-medium">{portalData.portalPin}</span>
                        <button
                          onClick={copyPin}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Copy PIN"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                >
                  Open Portal <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {!portalData.portalEnabled ? (
                <Button
                  size="sm"
                  onClick={handleInitiatePortal}
                  disabled={initiating || !retailerPhone}
                  className="gap-1.5"
                >
                  {initiating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Power className="h-3.5 w-3.5" />
                  )}
                  Initiate Customer Portal
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleResetPin}
                    disabled={resetting}
                    className="gap-1.5"
                  >
                    {resetting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="h-3.5 w-3.5" />
                    )}
                    Reset PIN
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDeactivatePortal}
                    className="gap-1.5 text-destructive hover:text-destructive"
                  >
                    <Power className="h-3.5 w-3.5" />
                    Deactivate
                  </Button>
                </>
              )}
            </div>

            {!retailerPhone && !portalData.portalEnabled && (
              <p className="text-xs text-muted-foreground">
                Add a phone number to this retailer to enable customer portal access.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default RetailerCustomerPortalSection;

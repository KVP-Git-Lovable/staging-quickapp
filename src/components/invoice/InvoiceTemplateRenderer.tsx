import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import InvoicePreview from "./InvoicePreview";
import { useAuth } from "@/hooks/useAuth";
import { getInvoiceDisplaySettingsMap, DisplaySettingsMap } from "@/hooks/useInvoiceDisplaySettings";

interface InvoiceTemplateRendererProps {
  orderId: string;
  retailerId: string;
  cartItems: any[];
  schemeDetails?: string;
  paymentMode?: string;
  amountPaid?: number;
  balanceDue?: number;
  orderTotal?: number;
  // The order's actual business date ("YYYY-MM-DD") — pass the cart's
  // effective (possibly backdated) order date so this pre-submit preview
  // matches what the real invoice will show. Defaults to today.
  orderDate?: string;
}

export default function InvoiceTemplateRenderer({
  orderId,
  retailerId,
  cartItems,
  paymentMode,
  amountPaid,
  balanceDue,
  orderTotal,
  schemeDetails = "",
  orderDate,
}: InvoiceTemplateRendererProps) {
  const [company, setCompany] = useState<any>(null);
  const [retailer, setRetailer] = useState<any>(null);
  const [customTemplate, setCustomTemplate] = useState<any>(null);
  const [beatName, setBeatName] = useState<string>("");
  const [salesmanName, setSalesmanName] = useState<string>("");
  const [invoiceTime, setInvoiceTime] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettingsMap>({});
  const { user } = useAuth();

  useEffect(() => {
    fetchData();
    fetchDisplaySettings();
  }, [orderId, retailerId, user]);

  const fetchDisplaySettings = async () => {
    const settings = await getInvoiceDisplaySettingsMap();
    setDisplaySettings(settings);
  };

  const fetchData = async () => {
    try {
      // Fetch company details
      const { data: companyData } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (companyData) {
        setCompany(companyData);
        setCustomTemplate(null);
      }

      // Fetch retailer details with beat
      const { data: retailerData } = await supabase
        .from("retailers")
        .select("*, beat_id, beat_name")
        .eq("id", retailerId)
        .single();

      if (retailerData) {
        setRetailer(retailerData);

        // Primary source: retailers.beat_name (stored at assignment time)
        setBeatName((retailerData.beat_name || "").trim());

        // Fallback: resolve beat name via beats master using retailers.beat_id
        if (!retailerData.beat_name && retailerData.beat_id) {
          // beat_id in retailers can be either UUID (id) or string (beat_id column in beats table)
          // Try matching on beat_id column first, then fall back to id
          let beatData = null;

          const { data: beatByBeatId } = await supabase
            .from("beats")
            .select("beat_name")
            .eq("beat_id", retailerData.beat_id)
            .maybeSingle();

          if (beatByBeatId) {
            beatData = beatByBeatId;
          } else {
            // Fallback: try matching on id (UUID)
            const { data: beatById } = await supabase
              .from("beats")
              .select("beat_name")
              .eq("id", retailerData.beat_id)
              .maybeSingle();
            beatData = beatById;
          }

          if (beatData?.beat_name) {
            setBeatName(beatData.beat_name);
          }
        }
      }

      // Fetch salesman name from current user profile
      if (user?.id) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        
        if (profileData) {
          setSalesmanName(profileData.full_name || "");
        }
      }

      // Set current time as invoice time
      setInvoiceTime(new Date().toLocaleTimeString("en-GB", { 
        hour: "2-digit", 
        minute: "2-digit" 
      }));

    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load invoice data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading invoice...</div>;
  }

  if (!company || !retailer) {
    return <div className="text-sm text-destructive">Missing company or retailer data</div>;
  }

  // Force Template 4 everywhere regardless of company setting
  const getTemplateStyle = (): "template1" | "template2" | "template3" | "template4" => {
    return "template4";
  };

  return (
    <div className="space-y-4">
      {!customTemplate ? (
        <InvoicePreview
          company={company}
          retailer={retailer}
          cartItems={cartItems}
          orderId={orderId}
          templateStyle={getTemplateStyle()}
          beatName={beatName}
          salesmanName={salesmanName}
          invoiceDate={orderDate ? new Date(`${orderDate}T00:00:00`).toLocaleDateString("en-GB") : undefined}
          invoiceTime={invoiceTime}
          schemeDetails={schemeDetails}
          displaySettings={displaySettings}
          paymentMode={paymentMode}
          amountPaid={amountPaid}
          balanceDue={balanceDue}
          orderTotal={orderTotal}
        />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted p-3 border-b">
            <h3 className="font-semibold text-foreground">{customTemplate.name}</h3>
            {customTemplate.description && (
              <p className="text-sm text-muted-foreground mt-1">{customTemplate.description}</p>
            )}
          </div>
          <div className="p-4">
            {customTemplate.template_file_url.endsWith('.pdf') ? (
              <iframe
                src={customTemplate.template_file_url}
                className="w-full h-[600px] border-0"
                title="Invoice Template Preview"
              />
            ) : (
              <img
                src={customTemplate.template_file_url}
                alt={customTemplate.name}
                className="w-full h-auto"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

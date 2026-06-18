import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, Upload, FileCheck2, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PaymentTerm =
  | "immediate" | "net_7" | "net_15" | "net_30" | "net_45"
  | "advance" | "partial" | "credit_based";
export type PaymentMode = "credit" | "bank_transfer" | "upi" | "cash" | "cheque" | "neft_rtgs";

export const TERM_LABELS: Record<PaymentTerm, string> = {
  immediate: "Immediate Payment",
  net_7: "Net 7",
  net_15: "Net 15",
  net_30: "Net 30",
  net_45: "Net 45",
  advance: "Advance Payment",
  partial: "Partial Payment",
  credit_based: "Credit Based",
};

export const MODE_LABELS: Record<PaymentMode, string> = {
  credit: "Credit",
  bank_transfer: "Bank Transfer",
  upi: "UPI",
  cash: "Cash",
  cheque: "Cheque",
  neft_rtgs: "NEFT / RTGS",
};

export interface PaymentDetailsValue {
  paymentTerm: PaymentTerm;
  paymentMode: PaymentMode;
  advanceAmount: number;
  paymentProofUrl: string | null;
}

interface Props {
  value: PaymentDetailsValue;
  onChange: (v: PaymentDetailsValue) => void;
  grandTotal: number;
  requireAdvance: boolean;
  requireProof: boolean;
  canOverride?: boolean;
  distributorId: string;
  allowedModes?: PaymentMode[];
}


const PROOF_BUCKET = "order-payment-proofs";
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];

export function PaymentDetailsCard({
  value,
  onChange,
  grandTotal,
  requireAdvance,
  requireProof,
  canOverride = false,
  distributorId,
  allowedModes,
}: Props) {
  const [override, setOverride] = useState(false);
  const modeOptions = (allowedModes && allowedModes.length > 0
    ? allowedModes
    : (Object.keys(MODE_LABELS) as PaymentMode[]));
  const modeSelectable = modeOptions.length > 1;

  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const showAdvance =
    value.paymentTerm === "advance" || value.paymentTerm === "partial" || requireAdvance;
  const showProof = requireProof || value.paymentTerm === "advance";
  const balance = Math.max(0, grandTotal - (value.advanceAmount || 0));
  const readOnly = !(canOverride && override);

  const set = <K extends keyof PaymentDetailsValue>(k: K, v: PaymentDetailsValue[K]) =>
    onChange({ ...value, [k]: v });

  const handleFile = async (f: File | null) => {
    if (!f) return;
    if (!ACCEPT.includes(f.type)) { toast.error("Only PDF, JPG or PNG allowed"); return; }
    if (f.size > MAX_BYTES) { toast.error("File must be ≤ 5 MB"); return; }
    setUploading(true);
    try {
      const ext = f.name.split(".").pop() || "bin";
      const path = `${distributorId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(PROOF_BUCKET).upload(path, f, {
        contentType: f.type,
        upsert: false,
      });
      if (error) {
        if (error.message?.toLowerCase().includes("bucket not found")) {
          toast.error(`Storage bucket "${PROOF_BUCKET}" missing — create it in Supabase Storage (private, 5MB).`);
        } else {
          toast.error(error.message);
        }
        return;
      }
      set("paymentProofUrl", path);
      toast.success("Proof uploaded");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-md bg-muted/60 grid place-items-center">
              <Wallet className="w-4 h-4 text-foreground/70" />
            </span>
            Payment Details
          </CardTitle>
          {canOverride && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setOverride(o => !o)}
            >
              {override ? "Lock" : "Override"}
            </Button>
          )}
          {!canOverride && (
            <Badge variant="outline" className="text-[10px]">From distributor config</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-5 pt-0 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Payment Terms</Label>
            <Select
              value={value.paymentTerm}
              onValueChange={(v) => set("paymentTerm", v as PaymentTerm)}
              disabled={readOnly}
            >
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TERM_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Payment Mode</Label>
            <Select
              value={value.paymentMode}
              onValueChange={(v) => set("paymentMode", v as PaymentMode)}
              disabled={readOnly && !modeSelectable}
            >
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {modeOptions.map((k) => (
                  <SelectItem key={k} value={k}>{MODE_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </div>

        {showAdvance && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-medium text-muted-foreground">
                Advance Amount (₹) {requireAdvance && <span className="text-destructive">*</span>}
              </Label>
              <Input
                type="number"
                min={0}
                max={grandTotal}
                value={value.advanceAmount || ""}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(grandTotal, Number(e.target.value) || 0));
                  set("advanceAmount", v);
                }}
                placeholder="0"
                className="mt-1.5"
              />
              {(value.advanceAmount || 0) > grandTotal && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Cannot exceed order total
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Balance Payable (₹)</Label>
              <Input value={balance.toLocaleString("en-IN")} readOnly disabled className="mt-1.5 bg-muted/40" />
            </div>
          </div>
        )}

        {showProof && (
          <div>
            <Label className="text-xs font-medium text-muted-foreground">
              Payment Proof {requireProof && <span className="text-destructive">*</span>}
            </Label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] || null)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {value.paymentProofUrl ? "Replace File" : "Upload File"}
              </Button>
              {value.paymentProofUrl && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <FileCheck2 className="w-3 h-3" /> Uploaded
                </span>
              )}
              <span className="text-[10px] text-muted-foreground ml-auto">PDF / JPG / PNG, max 5 MB</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

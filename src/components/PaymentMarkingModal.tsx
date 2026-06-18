import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { IndianRupee, Camera } from "lucide-react";
import { CameraCapture } from "./CameraCapture";

interface PaymentMarkingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  retailerId: string;
  currentPendingAmount: number;
  onPaymentMarked: (newPendingAmount: number) => void;
}

export const PaymentMarkingModal = ({
  open,
  onOpenChange,
  retailerId,
  currentPendingAmount,
  onPaymentMarked
}: PaymentMarkingModalProps) => {
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedProof, setCapturedProof] = useState<Blob | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);

  const handleCameraCapture = async (blob: Blob) => {
    setCapturedProof(blob);
    const preview = URL.createObjectURL(blob);
    setProofPreview(preview);
    setCameraOpen(false);
  };

  const uploadPaymentProof = async (): Promise<string | null> => {
    if (!capturedProof) return null;

    const fileName = `payment-proof-${retailerId}-${Date.now()}.jpg`;
    const { data, error } = await supabase.storage
      .from("order-documents")
      .upload(fileName, capturedProof, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (error) {
      console.error("Error uploading payment proof:", error);
      throw error;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("order-documents")
      .getPublicUrl(data.path);

    return publicUrl;
  };

  const requiresProof = paymentMethod === "cheque" || paymentMethod === "upi" || paymentMethod === "neft";

  // Records the collection + runs FIFO allocation against credit orders.
  const recordCollectionAndAllocate = async (
    amount: number,
    proofUrl: string | null
  ): Promise<{ newPendingAmount: number; allocatedCount: number }> => {
    const { data: authData } = await supabase.auth.getUser();
    const collectorId = authData?.user?.id;
    if (!collectorId) throw new Error("Not authenticated");

    const { data: ret } = await supabase
      .from("retailers")
      .select("owner_id, user_id")
      .eq("id", retailerId)
      .maybeSingle();
    const revenueOwnerId =
      (ret as any)?.owner_id || (ret as any)?.user_id || collectorId;

    const { data: collection, error: insertErr } = await (supabase as any)
      .from("retailer_payment_collections")
      .insert({
        retailer_id: retailerId,
        amount,
        payment_method: paymentMethod,
        payment_proof_url: proofUrl,
        collected_by_user_id: collectorId,
        revenue_owner_id: revenueOwnerId,
      })
      .select("id")
      .single();

    if (insertErr || !collection) throw insertErr || new Error("Failed to record collection");

    const { data: rpcData, error: rpcErr } = await (supabase as any).rpc(
      "apply_retailer_payment_fifo",
      {
        p_retailer_id: retailerId,
        p_amount: amount,
        p_collection_id: (collection as any).id,
      }
    );

    if (rpcErr) {
      console.error("[PaymentMarkingModal] FIFO RPC failed:", rpcErr);
      throw rpcErr;
    }

    const result = (rpcData as any) || {};
    return {
      newPendingAmount: Number(result.new_pending_amount ?? 0),
      allocatedCount: Array.isArray(result.allocations) ? result.allocations.length : 0,
    };
  };

  const handleFullPayment = async () => {
    if (requiresProof && !capturedProof) {
      toast.error(`Please capture ${paymentMethod === "cheque" ? "cheque" : paymentMethod === "upi" ? "UPI" : "NEFT"} photo`);
      return;
    }

    setLoading(true);
    try {
      let proofUrl = null;
      if (capturedProof) {
        proofUrl = await uploadPaymentProof();
      }

      const { error } = await supabase
        .from("retailers")
        .update({ pending_amount: 0 })
        .eq("id", retailerId);

      if (error) throw error;

      const { newPendingAmount, allocatedCount } = await recordCollectionAndAllocate(
        currentPendingAmount,
        proofUrl
      );

      toast.success(
        allocatedCount > 0
          ? `Payment marked. Settled ${allocatedCount} order(s).`
          : "Full payment marked successfully!"
      );
      onPaymentMarked(newPendingAmount);
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error marking full payment:", error);
      toast.error("Failed to mark payment");
    } finally {
      setLoading(false);
    }
  };

  const handleCustomPayment = async () => {
    const amount = parseFloat(paymentAmount);
    
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (amount > currentPendingAmount) {
      toast.error("Payment amount cannot exceed pending amount");
      return;
    }

    if (requiresProof && !capturedProof) {
      toast.error(`Please capture ${paymentMethod === "cheque" ? "cheque" : paymentMethod === "upi" ? "UPI" : "NEFT"} photo`);
      return;
    }

    setLoading(true);
    try {
      let proofUrl = null;
      if (capturedProof) {
        proofUrl = await uploadPaymentProof();
      }

      const newPendingAmount = currentPendingAmount - amount;
      
      const { error } = await supabase
        .from("retailers")
        .update({ pending_amount: newPendingAmount })
        .eq("id", retailerId);

      if (error) throw error;

      await recordCollection(amount, proofUrl);

      toast.success(`Payment of ₹${amount.toLocaleString()} marked successfully!`);
      onPaymentMarked(newPendingAmount); // Pass the new pending amount
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error marking custom payment:", error);
      toast.error("Failed to mark payment");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setPaymentAmount("");
    setPaymentMethod("cash");
    setCapturedProof(null);
    setProofPreview(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IndianRupee className="w-5 h-5" />
            Mark Payment Received
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">Current Pending Amount</p>
            <p className="text-2xl font-bold">₹{currentPendingAmount.toLocaleString()}</p>
          </div>

          {/* Payment Method Selection */}
          <div className="space-y-3">
            <Label>Payment Method</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Button
                type="button"
                variant={paymentMethod === "cash" ? "default" : "outline"}
                className="w-full h-auto py-3 whitespace-normal leading-tight text-center"
                onClick={() => setPaymentMethod("cash")}
              >
                Cash
              </Button>
              <Button
                type="button"
                variant={paymentMethod === "cheque" ? "default" : "outline"}
                className="w-full h-auto py-3 whitespace-normal leading-tight text-center"
                onClick={() => setPaymentMethod("cheque")}
              >
                Cheque
              </Button>
              <Button
                type="button"
                variant={paymentMethod === "upi" ? "default" : "outline"}
                className="w-full h-auto py-3 whitespace-normal leading-tight text-center"
                onClick={() => setPaymentMethod("upi")}
              >
                UPI
              </Button>
              <Button
                type="button"
                variant={paymentMethod === "neft" ? "default" : "outline"}
                className="w-full h-auto py-3 whitespace-normal leading-tight text-center"
                onClick={() => setPaymentMethod("neft")}
              >
                NEFT
              </Button>
            </div>
          </div>

          {/* Camera Capture for Cheque/UPI/NEFT */}
          {requiresProof && (
            <div className="space-y-2">
              <Label>
                {paymentMethod === "cheque" ? "Cheque Photo" : paymentMethod === "upi" ? "UPI Screenshot" : "NEFT Proof"}
              </Label>
              {proofPreview ? (
                <div className="space-y-2">
                  <img
                    src={proofPreview}
                    alt="Payment proof preview"
                    className="w-full h-48 object-cover rounded-lg border"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCameraOpen(true)}
                    className="w-full"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Retake Photo
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCameraOpen(true)}
                  className="w-full"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Capture {paymentMethod === "cheque" ? "Cheque" : paymentMethod === "upi" ? "UPI" : "NEFT"} Photo
                </Button>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Button
              onClick={handleFullPayment}
              disabled={loading || currentPendingAmount === 0}
              className="w-full"
              size="lg"
            >
              Received Full Payment
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="payment-amount">Partial Payment Amount</Label>
              <Input
                id="payment-amount"
                type="number"
                placeholder="Enter amount"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                min="0"
                max={currentPendingAmount}
                step="0.01"
              />
              
              {paymentAmount && parseFloat(paymentAmount) > 0 && (
                <div className="bg-muted/50 p-3 rounded-lg space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paying Now:</span>
                    <span className="font-semibold">₹{parseFloat(paymentAmount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Remaining Pending:</span>
                    <span className="font-semibold text-orange-600">
                      ₹{(currentPendingAmount - parseFloat(paymentAmount)).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              <Button
                onClick={handleCustomPayment}
                disabled={loading || !paymentAmount || currentPendingAmount === 0}
                variant="outline"
                className="w-full"
              >
                Mark Partial Payment
              </Button>
            </div>
          </div>
        </div>

        <CameraCapture
          isOpen={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onCapture={handleCameraCapture}
          title={`Capture ${paymentMethod === "cheque" ? "Cheque" : paymentMethod === "upi" ? "UPI" : "NEFT"} Photo`}
          description={`Take a clear photo of the ${paymentMethod === "cheque" ? "cheque" : paymentMethod === "upi" ? "UPI transaction" : "NEFT transfer proof"}`}
        />

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

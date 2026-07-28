import { useState } from "react";
import { Headset, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Calls the "Madad" Bolna help agent, which rings the signed-in user's own
 * phone number. The number is resolved server-side from the session.
 */
export function MadadHelpButton() {
  const [calling, setCalling] = useState(false);

  const handleClick = async () => {
    if (calling) return;
    setCalling(true);
    try {
      const { data, error } = await supabase.functions.invoke("madad-help-call");
      if (error) throw error;
      if (data?.success) {
        toast.success(
          data.phone
            ? `Madad is calling you now on ${data.phone}`
            : "Madad is calling you now"
        );
      } else {
        toast.error(data?.error ?? "Could not start the help call. Please try again.");
      }
    } catch (err) {
      console.error("[madad] help call failed", err);
      toast.error("Could not start the help call. Please try again.");
    } finally {
      setCalling(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={calling}
      title="Madad — talk to our help assistant"
      aria-label="Madad help call"
      className="relative flex h-8 w-8 items-center justify-center rounded-full bg-warning text-warning-foreground shadow-sm transition-transform hover:scale-105 disabled:opacity-70"
    >
      {calling ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Headset className="h-4 w-4" />
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-foreground text-[9px] font-bold leading-none text-background">
            ?
          </span>
        </>
      )}
    </button>
  );
}

import { CheckCircle2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  verified?: boolean | null;
  method?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  className?: string;
  size?: number;
}

export function VerifiedTick({ verified, method, verifiedBy, verifiedAt, className = "", size = 16 }: Props) {
  if (!verified) return null;
  const methodLabel = method === "whatsapp" ? "WhatsApp self-confirm" : method === "manual" ? "Manual approval" : "Verified";
  const when = verifiedAt ? new Date(verifiedAt).toLocaleDateString() : null;
  const tip = [methodLabel, verifiedBy && `by ${verifiedBy}`, when && `on ${when}`].filter(Boolean).join(" ");

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center ${className}`}>
            <CheckCircle2 className="text-blue-600" style={{ width: size, height: size }} />
          </span>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default VerifiedTick;

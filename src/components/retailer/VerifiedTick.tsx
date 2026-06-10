import { CheckCircle2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  verified?: boolean | null;
  method?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  score?: number | null;
  className?: string;
  size?: number;
}

/**
 * Blue verified tick. Shown when the retailer is explicitly verified OR
 * when the verification score is ≥ 80% (name + phone + address + GPS).
 */
export function VerifiedTick({ verified, method, verifiedBy, verifiedAt, score, className = "", size = 16 }: Props) {
  const scoreOk = typeof score === "number" && score >= 80;
  if (!verified && !scoreOk) return null;
  const methodLabel = method === "whatsapp"
    ? "WhatsApp self-confirm"
    : method === "manual"
    ? "Manual approval"
    : scoreOk && !verified
    ? `Auto-verified (score ${score}%)`
    : "Verified";
  const when = verifiedAt ? new Date(verifiedAt).toLocaleDateString() : null;
  const tip = [methodLabel, verifiedBy && `by ${verifiedBy}`, when && `on ${when}`].filter(Boolean).join(" ");

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center ${className}`}>
            <CheckCircle2 className="text-blue-600 fill-blue-100" style={{ width: size, height: size }} />
          </span>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default VerifiedTick;

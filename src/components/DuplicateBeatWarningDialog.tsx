import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface DuplicateBeatWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beatName: string;
  matchType: 'exact_own' | 'exact_other' | 'near_own' | 'near_other';
  existingOwnerName?: string;
  matchedBeatName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DuplicateBeatWarningDialog({
  open,
  onOpenChange,
  beatName,
  matchType,
  existingOwnerName,
  matchedBeatName,
  onConfirm,
  onCancel,
}: DuplicateBeatWarningDialogProps) {
  const isExact = matchType === 'exact_own' || matchType === 'exact_other';
  const isOtherUser = matchType === 'exact_other' || matchType === 'near_other';

  const title = isExact ? "Duplicate Beat Name Not Allowed" : "Similar Beat Name Found";

  const message =
    matchType === 'exact_own'
      ? `Beat name "${beatName}" already exists under your account. Exact duplicate beat names are not allowed — please edit the name to continue.`
      : matchType === 'exact_other'
      ? `Beat name "${beatName}" already exists in the organization (owned by ${existingOwnerName}). Exact duplicate beat names are not allowed — please edit the name to continue.`
      : matchType === 'near_own'
      ? `A similar beat "${matchedBeatName}" already exists under your account. Are you sure you want to create "${beatName}"?`
      : `A similar beat "${matchedBeatName}" already exists in the organization (owned by ${existingOwnerName}). Are you sure you want to create "${beatName}"?`;

  const iconColorClass = isExact ? "text-destructive" : "text-amber-500";
  const headerColorClass = isExact ? "text-destructive" : "text-amber-600";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${headerColorClass}`}>
            <AlertTriangle className={`h-5 w-5 ${iconColorClass}`} />
            {title}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-foreground py-2">{message}</p>

        {!isExact && isOtherUser && (
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
            If you proceed, two beats with similar names will exist in your organization.
            Consider reassigning retailers from the existing beat instead.
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            {isExact ? "Edit Name" : "Cancel — Edit Name"}
          </Button>
          {!isExact && (
            <Button onClick={onConfirm}>Yes, Create Beat</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

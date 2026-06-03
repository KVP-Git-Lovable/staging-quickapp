import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Search, UserPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as beatService from "@/services/beatService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Profile {
  user_id: string;
  full_name: string | null;
  name?: string | null;
  avatar_url?: string | null;
}

interface TransferOwnershipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beat: { id: string; beat_id: string; beat_name: string; retailer_count: number };
  currentUserId: string;
  onSuccess: () => void;
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export function TransferOwnershipModal({
  open,
  onOpenChange,
  beat,
  currentUserId,
  onSuccess,
}: TransferOwnershipModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSelectedUser(null);
    setReason("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, full_name, name, avatar_url")
          .or(`full_name.ilike.%${q}%,name.ilike.%${q}%`)
          .neq("user_id", currentUserId)
          .limit(8);
        if (error) throw error;
        setResults((data ?? []) as Profile[]);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open, currentUserId]);

  const personName = selectedUser?.full_name || selectedUser?.name || "this user";
  const canSubmit = !!selectedUser && !!reason.trim() && !submitting;

  const handleConfirm = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      await beatService.transferBeatOwnership(
        beat.id,
        selectedUser.user_id,
        currentUserId,
        reason.trim(),
      );
      toast.success(`Beat transferred to ${personName}`);
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to transfer ownership");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus size={18} className="text-destructive" />
            Transfer Beat — {beat.beat_name}
          </DialogTitle>
          <DialogDescription>
            Hand over full ownership of this beat to another user.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This is permanent. Cannot be auto-reversed.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>Transfer to</Label>
            {selectedUser ? (
              <div className="flex items-center justify-between rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={selectedUser.avatar_url ?? undefined} />
                    <AvatarFallback>{initials(personName)}</AvatarFallback>
                  </Avatar>
                  <div className="text-sm font-medium">{personName}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedUser(null)}>
                  <X size={14} />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-7"
                  placeholder="Search users by name…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query.trim().length >= 2 && (
                  <div className="mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover">
                    {searching ? (
                      <div className="p-2 text-sm text-muted-foreground">Searching…</div>
                    ) : results.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">No results</div>
                    ) : (
                      results.map((r) => (
                        <button
                          key={r.user_id}
                          type="button"
                          onClick={() => {
                            setSelectedUser(r);
                            setQuery("");
                            setResults([]);
                          }}
                          className="flex w-full items-center gap-2 p-2 text-left hover:bg-accent"
                        >
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={r.avatar_url ?? undefined} />
                            <AvatarFallback>{initials(r.full_name || r.name)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{r.full_name || r.name || "Unnamed"}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedUser && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <div className="font-medium mb-1">This will:</div>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Move <span className="font-medium text-foreground">{beat.beat_name}</span> to <span className="font-medium text-foreground">{personName}</span></li>
                <li>Reassign all <span className="font-medium text-foreground">{beat.retailer_count}</span> retailer{beat.retailer_count === 1 ? "" : "s"} to <span className="font-medium text-foreground">{personName}</span></li>
                <li>Record full ownership history</li>
                <li>Your past orders and visits remain attributed to you</li>
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <Label>Reason</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. territory restructure"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Transfer Ownership
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TransferOwnershipModal;

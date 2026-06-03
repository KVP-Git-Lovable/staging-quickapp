import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Search, Share2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as beatService from "@/services/beatService";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

type Access = "CO_OWNER" | "OPERATIONAL" | "VIEW_ONLY";

interface Profile {
  id: string;
  full_name: string | null;
  username?: string | null;
  profile_picture_url?: string | null;
}

interface ShareRow {
  id: string;
  user_id: string;
  access_type: Access;
  effective_to: string | null;
  profile?: Profile | null;
}

interface ShareBeatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beat: { id: string; beat_id: string; beat_name: string };
  grantedBy: string;
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ShareBeatModal({ open, onOpenChange, beat, grantedBy }: ShareBeatModalProps) {
  const { can, loading: permLoading } = usePermissions();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);

  const [access, setAccess] = useState<Access>("CO_OWNER");
  const [duration, setDuration] = useState<"permanent" | "until">("permanent");
  const [untilDate, setUntilDate] = useState<Date | undefined>(undefined);
  const [reason, setReason] = useState("");

  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSelectedUser(null);
    setAccess("CO_OWNER");
    setDuration("permanent");
    setUntilDate(undefined);
    setReason("");
    void loadShares();
  }, [open, beat.beat_id]);

  const loadShares = async () => {
    setLoadingShares(true);
    try {
      const { data, error } = await supabase
        .from("beat_user_access")
        .select("id, user_id, access_type, effective_to")
        .eq("beat_id", beat.beat_id)
        .in("access_type", ["CO_OWNER", "OPERATIONAL", "VIEW_ONLY"])
        .eq("is_active", true);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      let profilesMap = new Map<string, Profile>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name, name, avatar_url")
          .in("user_id", ids);
        (profs ?? []).forEach((p: any) => profilesMap.set(p.user_id, p));
      }
      setShares(
        rows.map((r) => ({ ...r, profile: profilesMap.get(r.user_id) ?? null })),
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to load shares");
    } finally {
      setLoadingShares(false);
    }
  };

  // Debounced search
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
  }, [query, open]);

  const excludedIds = useMemo(
    () => new Set([grantedBy, ...shares.map((s) => s.user_id)]),
    [grantedBy, shares],
  );

  const canSubmit =
    !!selectedUser &&
    !!access &&
    (duration === "permanent" || !!untilDate) &&
    !submitting;

  const handleGrant = async () => {
    if (!selectedUser) return;
    if (permLoading) { toast.message("Checking permissions…"); return; }
    if (!can("action_beat_share", "create")) { toast.error("You don't have permission to share beats"); return; }
    setSubmitting(true);
    try {
      await beatService.grantBeatAccess(
        beat.id,
        selectedUser.user_id,
        access,
        grantedBy,
        duration === "until" && untilDate ? untilDate.toISOString() : null,
      );
      toast.success("Access granted");
      setSelectedUser(null);
      setQuery("");
      setResults([]);
      setDuration("permanent");
      setUntilDate(undefined);
      setReason("");
      await loadShares();
    } catch (err: any) {
      toast.error(err?.message || "Failed to grant access");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (row: ShareRow) => {
    if (permLoading) { toast.message("Checking permissions…"); return; }
    if (!can("action_beat_share", "create")) { toast.error("You don't have permission"); return; }
    try {
      await beatService.revokeBeatAccess(beat.id, row.user_id, row.access_type);
      toast.success("Access revoked");
      await loadShares();
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 size={18} className="text-primary" />
            Share Beat — {beat.beat_name}
          </DialogTitle>
          <DialogDescription>
            Grant team members access to this beat.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="space-y-2">
            <Label>Add team member</Label>
            {selectedUser ? (
              <div className="flex items-center justify-between rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={selectedUser.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {initials(selectedUser.full_name || selectedUser.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-sm font-medium">
                    {selectedUser.full_name || selectedUser.name || "Unnamed"}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedUser(null)}
                >
                  <X size={14} />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
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
                    ) : results.filter((r) => !excludedIds.has(r.user_id)).length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">No results</div>
                    ) : (
                      results
                        .filter((r) => !excludedIds.has(r.user_id))
                        .map((r) => (
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
                              <AvatarFallback>
                                {initials(r.full_name || r.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">
                              {r.full_name || r.name || "Unnamed"}
                            </span>
                          </button>
                        ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Access level */}
          <div className="space-y-2">
            <Label>Access level</Label>
            <RadioGroup value={access} onValueChange={(v) => setAccess(v as Access)}>
              <div className="flex items-start gap-2 rounded-md border p-2">
                <RadioGroupItem value="CO_OWNER" id="acc-co" className="mt-1" />
                <Label htmlFor="acc-co" className="flex-1 cursor-pointer">
                  <div className="font-medium text-sm">Co-owner</div>
                  <div className="text-xs text-muted-foreground">
                    Can view, visit, take orders, edit retailers, edit beat
                  </div>
                </Label>
              </div>
              <div className="flex items-start gap-2 rounded-md border p-2">
                <RadioGroupItem value="OPERATIONAL" id="acc-op" className="mt-1" />
                <Label htmlFor="acc-op" className="flex-1 cursor-pointer">
                  <div className="font-medium text-sm">Operational</div>
                  <div className="text-xs text-muted-foreground">
                    Can visit, take orders, update retailers — cannot edit beat structure
                  </div>
                </Label>
              </div>
              <div className="flex items-start gap-2 rounded-md border p-2">
                <RadioGroupItem value="VIEW_ONLY" id="acc-view" className="mt-1" />
                <Label htmlFor="acc-view" className="flex-1 cursor-pointer">
                  <div className="font-medium text-sm">View only</div>
                  <div className="text-xs text-muted-foreground">
                    Can view beat and retailers only
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label>Duration</Label>
            <RadioGroup
              value={duration}
              onValueChange={(v) => setDuration(v as "permanent" | "until")}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="permanent" id="dur-perm" />
                <Label htmlFor="dur-perm" className="cursor-pointer text-sm">
                  Permanent
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="until" id="dur-until" />
                <Label htmlFor="dur-until" className="cursor-pointer text-sm">
                  Until date
                </Label>
                {duration === "until" && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "ml-2 justify-start text-left font-normal",
                          !untilDate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {untilDate ? format(untilDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={untilDate}
                        onSelect={setUntilDate}
                        initialFocus
                        disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </RadioGroup>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. covering Suyog while he's on leave"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleGrant} disabled={!canSubmit}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Grant Access
            </Button>
          </DialogFooter>

          {/* Existing shares */}
          <div className="space-y-2 border-t pt-4">
            <Label>Current shares</Label>
            {loadingShares ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : shares.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No active shares yet.
              </div>
            ) : (
              <div className="space-y-2">
                {shares.map((row) => {
                  const nm = row.profile?.full_name || row.profile?.name || "Unnamed";
                  return (
                    <div
                      key={row.id}
                      className="flex items-center justify-between rounded-md border p-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={row.profile?.avatar_url ?? undefined} />
                          <AvatarFallback>{initials(nm)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{nm}</div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary" className="text-[10px]">
                              {row.access_type === "CO_OWNER"
                                ? "Co-owner"
                                : row.access_type === "OPERATIONAL"
                                ? "Operational"
                                : "View only"}
                            </Badge>
                            <span>
                              {row.effective_to
                                ? `Until ${format(new Date(row.effective_to), "PP")}`
                                : "Permanent"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(row)}
                      >
                        Revoke
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ShareBeatModal;

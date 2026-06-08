import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Info, Loader2, Search, UserCheck, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Profile {
  id: string;
  full_name: string | null;
  username?: string | null;
  profile_picture_url?: string | null;
}

interface PermissionGroup {
  id: string;
  name: string;
  description: string | null;
}

interface CoverageRow {
  id: string;
  coverage_user_id: string;
  start_date: string;
  end_date: string;
  profile?: Profile | null;
}

interface CoverageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beat: { id: string; beat_id: string; beat_name: string };
  primaryUserId: string;
  assignedBy: string;
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

export function CoverageModal({
  open,
  onOpenChange,
  beat,
  primaryUserId,
  assignedBy,
}: CoverageModalProps) {
  const { can, loading: permLoading } = usePermissions();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);

  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [permissionSetId, setPermissionSetId] = useState<string>("");
  const [reason, setReason] = useState("");

  const [permGroups, setPermGroups] = useState<PermissionGroup[]>([]);
  const [activeCoverage, setActiveCoverage] = useState<CoverageRow[]>([]);
  const [loadingCoverage, setLoadingCoverage] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSelectedUser(null);
    setStartDate(undefined);
    setEndDate(undefined);
    setPermissionSetId("");
    setReason("");
    void loadPermGroups();
    void loadCoverage();
  }, [open, beat.beat_id]);

  const loadPermGroups = async () => {
    const { data, error } = await supabase
      .from("permission_set_groups")
      .select("id, name, description")
      .order("name");
    if (!error) setPermGroups((data ?? []) as PermissionGroup[]);
  };

  const loadCoverage = async () => {
    setLoadingCoverage(true);
    try {
      const { data, error } = await supabase
        .from("beat_coverage_assignments")
        .select("id, coverage_user_id, start_date, end_date")
        .eq("beat_id", beat.beat_id)
        .eq("is_active", true)
        .order("start_date", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(rows.map((r) => r.coverage_user_id)));
      const profMap = new Map<string, Profile>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, username, profile_picture_url")
          .in("id", ids);
        (profs ?? []).forEach((p: any) => profMap.set(p.id, p));
      }
      setActiveCoverage(
        rows.map((r) => ({ ...r, profile: profMap.get(r.coverage_user_id) ?? null })),
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to load coverage");
    } finally {
      setLoadingCoverage(false);
    }
  };

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
          .select("id, full_name, username, profile_picture_url")
          .or(`full_name.ilike.%${q}%,username.ilike.%${q}%`)
          .neq("id", primaryUserId)
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
  }, [query, open, primaryUserId]);

  const canSubmit =
    !!selectedUser &&
    !!startDate &&
    !!endDate &&
    !!reason.trim() &&
    !!permissionSetId &&
    !submitting &&
    endDate >= startDate;

  const handleAssign = async () => {
    if (!selectedUser || !startDate || !endDate) return;
    if (permLoading) { toast.message("Checking permissions…"); return; }
    if (!can("action_beat_coverage", "create")) { toast.error("You don't have permission to assign coverage"); return; }
    setSubmitting(true);
    try {
      await beatService.assignCoverage(
        beat.id,
        primaryUserId,
        selectedUser.id,
        startDate.toISOString(),
        endDate.toISOString(),
        reason.trim(),
        permissionSetId,
        assignedBy,
      );
      toast.success("Coverage assigned");
      setSelectedUser(null);
      setQuery("");
      setStartDate(undefined);
      setEndDate(undefined);
      setReason("");
      setPermissionSetId("");
      await loadCoverage();
    } catch (err: any) {
      toast.error(err?.message || "Failed to assign coverage");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnd = async (row: CoverageRow) => {
    if (permLoading) { toast.message("Checking permissions…"); return; }
    if (!can("action_beat_coverage", "create")) { toast.error("You don't have permission"); return; }
    try {
      await beatService.endCoverage(row.id);
      toast.success("Coverage ended");
      await loadCoverage();
    } catch (err: any) {
      toast.error(err?.message || "Failed to end coverage");
    }
  };

  const personName =
    selectedUser?.full_name || selectedUser?.username || "this person";

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck size={18} className="text-primary" />
            Assign Coverage — {beat.beat_name}
          </DialogTitle>
          <DialogDescription>
            Assign someone to temporarily cover this beat.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Coverage person */}
          <div className="space-y-2">
            <Label>Coverage person</Label>
            {selectedUser ? (
              <div className="flex items-center justify-between rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={selectedUser.profile_picture_url ?? undefined} />
                    <AvatarFallback>
                      {initials(selectedUser.full_name || selectedUser.username)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-sm font-medium">{personName}</div>
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
                    ) : results.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">No results</div>
                    ) : (
                      results.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            setSelectedUser(r);
                            setQuery("");
                            setResults([]);
                          }}
                          className="flex w-full items-center gap-2 p-2 text-left hover:bg-accent"
                        >
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={r.profile_picture_url ?? undefined} />
                            <AvatarFallback>
                              {initials(r.full_name || r.username)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">
                            {r.full_name || r.username || "Unnamed"}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {startDate ? format(startDate, "PPP") : "Pick start"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>End</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {endDate ? format(endDate, "PPP") : "Pick end"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    disabled={(d) => (startDate ? d < startDate : false)}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Permission set */}
          <div className="space-y-2">
            <Label>Temporary permissions</Label>
            <Select value={permissionSetId} onValueChange={setPermissionSetId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a permission set" />
              </SelectTrigger>
              <SelectContent>
                {permGroups.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">No permission sets</div>
                ) : (
                  permGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {personName} gets these extra permissions only during coverage
              dates.
            </p>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Suyog on leave"
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
            <Button onClick={handleAssign} disabled={!canSubmit}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assign Coverage
            </Button>
          </DialogFooter>

          {/* Active coverage */}
          <div className="space-y-2 border-t pt-4">
            <Label>Active coverage</Label>
            {loadingCoverage ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : activeCoverage.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No active coverage assignments.
              </div>
            ) : (
              <div className="space-y-2">
                {activeCoverage.map((row) => {
                  const nm = row.profile?.full_name || row.profile?.username || "Unnamed";
                  return (
                    <div
                      key={row.id}
                      className="flex items-center justify-between rounded-md border p-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={row.profile?.profile_picture_url ?? undefined} />
                          <AvatarFallback>{initials(nm)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{nm}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(row.start_date), "PP")} →{" "}
                            {format(new Date(row.end_date), "PP")}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEnd(row)}
                      >
                        End Coverage
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

export default CoverageModal;

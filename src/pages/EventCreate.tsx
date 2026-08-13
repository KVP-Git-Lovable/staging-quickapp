import { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  CalendarIcon, Save, Navigation, X, Loader2, ArrowLeft,
  Info, MapPin, Wallet, Users, Target, UsersRound, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Geolocation } from "@capacitor/geolocation";

const EVENT_TYPES = ["Sales Promotion", "Awareness Campaign", "Retail Activation", "Others"];

interface ProfileOption { id: string; full_name: string; is_active?: boolean | null }

export default function EventCreate() {
  const navigate = useNavigate();
  // Same page serves create and edit. An Event carries a dozen fields — name,
  // address, GPS, budget, target, footfall, assigned reps — and a second form
  // would drift from this one the moment any of them changes.
  const { id: editEventId } = useParams<{ id: string }>();
  const isEdit = !!editEventId;
  const [loadingEvent, setLoadingEvent] = useState(false);
  // Resolved from the loaded row: the route param may be the visit id.
  const [activityId, setActivityId] = useState<string | null>(null);
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  // Basic
  const [eventName, setEventName] = useState("");
  const [eventType, setEventType] = useState("Sales Promotion");
  const [description, setDescription] = useState("");
  const [comments, setComments] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("20:00");

  // Location
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [capturingGPS, setCapturingGPS] = useState(false);

  // Budget
  const [budget, setBudget] = useState("");
  const [salesTarget, setSalesTarget] = useState("");
  const [expectedFootfall, setExpectedFootfall] = useState("");

  // Team
  const [selectedReps, setSelectedReps] = useState<ProfileOption[]>([]);
  const [repPickerOpen, setRepPickerOpen] = useState(false);
  // The event's own user — whoever created it. They are the one person actually
  // attached to the event (they hold the paired visit row), so they belong in the
  // team and cannot be taken out of it.
  const [loadedOwnerId, setLoadedOwnerId] = useState<string | null>(null);
  // Creating: it is you. Editing: whoever the event belongs to, which need not
  // be you — a manager can be editing someone else's event.
  const ownerId = isEdit ? loadedOwnerId : user?.id ?? null;

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-event-team"],
    queryFn: async () => {
      // is_active so the picker can leave out deactivated users. They are still
      // fetched, because one already on an event must keep showing as a chip.
      const { data } = await supabase.from("profiles").select("id, full_name, is_active").order("full_name");
      return (data || []) as ProfileOption[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const owner = useMemo(
    () => profiles.find((p) => p.id === ownerId) ?? null,
    [profiles, ownerId]
  );

  const availableReps = useMemo(
    () =>
      profiles.filter(
        (p) =>
          p.id !== ownerId &&
          p.is_active !== false &&
          !selectedReps.some((s) => s.id === p.id)
      ),
    [profiles, selectedReps, ownerId]
  );

  const captureLocation = async () => {
    setCapturingGPS(true);
    try {
      try {
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
        setLatitude(pos.coords.latitude.toFixed(4));
        setLongitude(pos.coords.longitude.toFixed(4));
        toast.success("Location captured");
      } catch {
        if (!navigator.geolocation) throw new Error("no geo");
        await new Promise<void>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (p) => {
              setLatitude(p.coords.latitude.toFixed(4));
              setLongitude(p.coords.longitude.toFixed(4));
              toast.success("Location captured");
              resolve();
            },
            () => reject(),
            { enableHighAccuracy: true, timeout: 10000 }
          );
        });
      }
    } catch {
      toast.error("Unable to capture location");
    } finally {
      setCapturingGPS(false);
    }
  };

  // Load the event being edited. activity_events is the source of truth; the
  // paired visit only carries the planned date and status.
  useEffect(() => {
    if (!editEventId) return;
    let cancelled = false;
    (async () => {
      setLoadingEvent(true);
      try {
        // The sibling event routes (/event/:id/orders, /stock, /summary) key on
        // visit_id, so this one does too — but accept either id, because the
        // param reads identically at every call site and a mismatch here would
        // just silently load nothing.
        const { data, error } = await supabase
          .from("activity_events")
          .select("*")
          .or(`id.eq.${editEventId},visit_id.eq.${editEventId}`)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!data || cancelled) return;
        const d = data as any;
        setActivityId(d.id);
        setLoadedOwnerId(d.user_id ?? null);
        const toDate = (v?: string | null) => (v ? new Date(`${v}T00:00:00`) : undefined);
        const toTime = (iso?: string | null) =>
          iso ? new Date(iso).toTimeString().slice(0, 5) : undefined;

        setEventName(d.event_name ?? d.activity_name ?? "");
        setDescription(d.description ?? "");
        setComments(d.comments ?? "");
        setStartDate(toDate(d.from_date ?? d.activity_date));
        setEndDate(toDate(d.to_date ?? d.activity_date));
        if (toTime(d.start_time)) setStartTime(toTime(d.start_time)!);
        if (toTime(d.end_time)) setEndTime(toTime(d.end_time)!);
        setAddress(d.activity_place ?? "");
        setLandmark(d.landmark ?? "");
        if (d.start_latitude != null) setLatitude(String(d.start_latitude));
        if (d.start_longitude != null) setLongitude(String(d.start_longitude));
        if (d.budget != null) setBudget(String(d.budget));
        if (d.sales_target != null) setSalesTarget(String(d.sales_target));
        setExpectedFootfall(d.expected_footfall ?? "");
        // remarks was written as "<eventType> — <description>" on create.
        if (typeof d.remarks === "string" && d.remarks.trim()) {
          setEventType(d.remarks.split("—")[0].trim() || "Sales Promotion");
        }
        if (Array.isArray(d.sales_reps) && d.sales_reps.length) {
          const { data: reps } = await supabase
            .from("profiles").select("id, full_name, is_active").in("id", d.sales_reps);
          // Drop the owner: they render as their own pinned chip, and older
          // events stored them in sales_reps while newer ones did not.
          if (reps && !cancelled) {
            setSelectedReps((reps as ProfileOption[]).filter((r) => r.id !== d.user_id));
          }
        }
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "Could not load the event");
      } finally {
        if (!cancelled) setLoadingEvent(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editEventId]);

  const addRep = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    if (p) setSelectedReps((prev) => [...prev, p]);
    setRepPickerOpen(false);
  };
  const removeRep = (id: string) => setSelectedReps((prev) => prev.filter((p) => p.id !== id));

  const validate = (): string | null => {
    if (!eventName.trim()) return "Event Name is required";
    if (!startDate) return "Start Date is required";
    if (!endDate) return "End Date is required";
    if (endDate < startDate) return "End Date must be on or after Start Date";
    if (!address.trim()) return "Address is required";
    if (!budget || isNaN(Number(budget))) return "Budget is required and must be numeric";
    if (salesTarget && isNaN(Number(salesTarget))) return "Sales Target must be numeric";
    if (!ownerId && selectedReps.length === 0) return "At least one Sales Rep is required";
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return "Invalid time format";
    return null;
  };

  const handleSave = async () => {
    if (!user?.id) { toast.error("Please log in"); return; }
    const err = validate();
    if (err) { toast.error(err); return; }

    setSubmitting(true);
    try {
      const startDateStr = format(startDate!, "yyyy-MM-dd");
      const endDateStr = format(endDate!, "yyyy-MM-dd");
      const isMulti = startDateStr !== endDateStr;

      const payload = {
        activity_type: "Event",
        activity_name: eventName,
        event_name: eventName,
        description: description || null,
        comments: comments || null,
        duration_type: isMulti ? "multiple_days" : "hour_based",
        activity_date: startDateStr,
        from_date: isMulti ? startDateStr : null,
        to_date: isMulti ? endDateStr : null,
        total_days: isMulti
          ? Math.max(1, Math.round((endDate!.getTime() - startDate!.getTime()) / 86400000) + 1)
          : 1,
        start_time: new Date(`${startDateStr}T${startTime}:00`).toISOString(),
        end_time: new Date(`${endDateStr}T${endTime}:00`).toISOString(),
        activity_place: address,
        landmark: landmark || null,
        start_latitude: latitude ? Number(latitude) : null,
        start_longitude: longitude ? Number(longitude) : null,
        budget: Number(budget),
        sales_target: salesTarget ? Number(salesTarget) : null,
        expected_footfall: expectedFootfall || null,
        // Owner first, so what is stored matches what the form shows.
        sales_reps: Array.from(new Set([...(ownerId ? [ownerId] : []), ...selectedReps.map((r) => r.id)])),
        remarks: `${eventType}${description ? ` — ${description}` : ""}`,
      };

      // ---- edit -------------------------------------------------------------
      if (isEdit) {
        if (!activityId) throw new Error("Event is still loading, please try again");
        // .select() because RLS filters a rejected row rather than raising: the
        // update would report success having changed nothing.
        const { data: updated, error: uErr } = await supabase
          .from("activity_events")
          .update(payload as any)
          .eq("id", activityId!)
          .select("id, visit_id");
        if (uErr) throw uErr;
        if (!updated || updated.length === 0) {
          throw new Error("You do not have permission to edit this event");
        }

        // Keep the paired visit on the day the event now starts, or My Visits
        // shows it under the old date while the event says otherwise.
        const visitId = (updated[0] as any).visit_id;
        if (visitId) {
          const { data: vRows, error: vuErr } = await supabase
            .from("visits")
            .update({ planned_date: startDateStr } as any)
            .eq("id", visitId)
            .select("id");
          if (vuErr || !vRows || vRows.length === 0) {
            throw new Error(vuErr?.message ?? "You do not have permission to move this event's visit");
          }
        }

        // Staff the event: creates a visit row for anyone newly assigned, and
        // moves the team's rows if the date changed. Must run server-side —
        // visits_insert requires auth.uid() = user_id, so this session cannot
        // write onto another rep's calendar directly.
        const { error: syncErr } = await supabase.rpc("event_sync_participants", {
          p_event_id: activityId!,
        } as any);
        if (syncErr) {
          console.error("[EventCreate] participant sync failed:", syncErr);
          toast.warning("Event saved, but the team could not be updated. Reopen and save again.");
        }

        toast.success("Event updated");
        window.dispatchEvent(new Event("visitDataChanged"));
        navigate("/visits/retailers");
        return;
      }

      // 1) create visit
      const { data: visit, error: vErr } = await supabase
        .from("visits")
        .insert({
          user_id: user.id,
          planned_date: startDateStr,
          status: "planned",
          visit_type: "activity",
        } as any)
        .select("id")
        .single();
      if (vErr) throw vErr;

      // 2) create activity_event
      const { data: created, error: aErr } = await supabase
        .from("activity_events")
        .insert({
          visit_id: visit.id,
          user_id: user.id,
          ...payload,
        } as any)
        .select("id")
        .maybeSingle();
      if (aErr) {
        await supabase.from("visits").delete().eq("id", visit.id);
        throw aErr;
      }

      // Same sync on create, so reps assigned up front get the event straight
      // away rather than only after the first edit.
      if (created?.id) {
        const { error: syncErr } = await supabase.rpc("event_sync_participants", {
          p_event_id: created.id,
        } as any);
        if (syncErr) console.error("[EventCreate] participant sync failed:", syncErr);
      }

      toast.success("Event created successfully");
      window.dispatchEvent(new Event("visitDataChanged"));
      navigate("/visits/retailers");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || (isEdit ? "Failed to update event" : "Failed to create event"));
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "h-9 text-sm rounded-lg border-border/70 bg-background focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary";

  return (
    <div className="min-h-screen bg-slate-50/60 dark:bg-muted/20">
      <Navbar />
      {/* Sticky Header */}
      <div
        className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border shadow-sm"

      >
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-lg shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-bold leading-tight tracking-tight text-foreground truncate">
              {isEdit ? "Edit Event" : "Event Details"}
            </h1>
            <p className="text-xs text-muted-foreground leading-tight truncate">
              {isEdit ? "Update event information" : "Add event information"}
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={submitting || loadingEvent}
            className="h-9 px-4 rounded-lg shrink-0 bg-gradient-to-b from-primary to-primary/90 shadow-sm hover:shadow"
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            {isEdit ? "Save changes" : "Save"}
          </Button>
        </div>
      </div>


      <div className="max-w-5xl mx-auto p-4 space-y-3">
        {/* Basic Information */}
        <SectionCard icon={<Info className="h-3.5 w-3.5" />} title="Basic Information">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Event Name" required>
              <Input className={inputCls} value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. Big Deal Mela" />
            </Field>
            <Field label="Event Type">
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Description">
                <Textarea
                  className="min-h-[60px] text-sm rounded-lg border-border/70 bg-background focus-visible:ring-1 focus-visible:ring-primary"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the event"
                  rows={2}
                />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Comments">
                <Textarea
                  className="min-h-[60px] text-sm rounded-lg border-border/70 bg-background focus-visible:ring-1 focus-visible:ring-primary"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Additional comments or notes"
                  rows={2}
                />
              </Field>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
            <Field label="Start Date" required>
              <DatePopover date={startDate} onChange={setStartDate} />
            </Field>
            <Field label="End Date" required>
              <DatePopover date={endDate} onChange={setEndDate} />
            </Field>
            <Field label="Time">
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Clock className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={cn(inputCls, "pl-7")} />
                </div>
                <span className="text-muted-foreground text-xs">to</span>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
              </div>
            </Field>
          </div>
        </SectionCard>

        {/* Location */}
        <SectionCard
          icon={<MapPin className="h-3.5 w-3.5" />}
          title="Location"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={captureLocation}
              disabled={capturingGPS}
              className="h-7 px-2.5 text-xs rounded-md"
            >
              {capturingGPS ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Navigation className="h-3.5 w-3.5 mr-1" />}
              Use Current Location
            </Button>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Address" required>
              <Input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full address" />
            </Field>
            <Field label="Landmark">
              <Input className={inputCls} value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Nearby landmark" />
            </Field>
            <div className="md:col-span-2 grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Latitude (Optional)">
                <Input className={inputCls} type="number" step="any" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
              </Field>
              <Field label="Longitude (Optional)">
                <Input className={inputCls} type="number" step="any" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
              </Field>
            </div>
          </div>
        </SectionCard>

        {/* Budget & Targets — KPI style */}
        <SectionCard icon={<Wallet className="h-3.5 w-3.5" />} title="Budget & Targets">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KpiField
              icon={<Wallet className="h-4 w-4" />}
              tint="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
              label="Budget (₹)"
              required
            >
              <Input className={cn(inputCls, "text-base font-semibold placeholder:font-normal placeholder:text-muted-foreground/50")} type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="25,000" />
            </KpiField>
            <KpiField
              icon={<Target className="h-4 w-4" />}
              tint="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
              label="Sales Target (₹)"
            >
              <Input className={cn(inputCls, "text-base font-semibold placeholder:font-normal placeholder:text-muted-foreground/50")} type="number" value={salesTarget} onChange={(e) => setSalesTarget(e.target.value)} placeholder="60,000" />
            </KpiField>
            <KpiField
              icon={<UsersRound className="h-4 w-4" />}
              tint="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
              label="Expected Footfall"
            >
              <Input className={cn(inputCls, "text-base font-semibold placeholder:font-normal placeholder:text-muted-foreground/50")} value={expectedFootfall} onChange={(e) => setExpectedFootfall(e.target.value)} placeholder="500+" />
            </KpiField>
          </div>
        </SectionCard>

        {/* Team */}
        <SectionCard icon={<Users className="h-3.5 w-3.5" />} title="Team">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Sales Reps Involved" required>
              <div className="rounded-lg border border-border/70 bg-background min-h-9 px-2 py-1.5 flex flex-wrap gap-1.5 items-center">
                {/* The owner, pinned first and not removable — the event is on
                    their calendar, so they cannot be dropped from its team. */}
                {owner && (
                  <Badge
                    variant="secondary"
                    className="rounded-full px-2 py-0.5 gap-1 text-xs font-medium bg-primary/10 text-primary border-0"
                  >
                    {owner.full_name}
                    <span className="text-[10px] font-normal text-primary/70">Owner</span>
                  </Badge>
                )}
                {selectedReps.map((r) => (
                  <Badge
                    key={r.id}
                    variant="secondary"
                    className="rounded-full pl-2 pr-1 py-0.5 gap-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/15 border-0"
                  >
                    {r.full_name}
                    <button
                      type="button"
                      onClick={() => removeRep(r.id)}
                      className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5"
                      aria-label={`Remove ${r.full_name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {!owner && selectedReps.length === 0 && (
                  <span className="text-xs text-muted-foreground px-1">No reps selected</span>
                )}
              </div>
            </Field>
            <Field label="Add More (Optional)">
              <Popover open={repPickerOpen} onOpenChange={setRepPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn(inputCls, "w-full justify-between font-normal text-muted-foreground")}>
                    Choose member
                    <span className="text-[10px] text-muted-foreground/80">{availableReps.length} available</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search member..." />
                    <CommandList>
                      <CommandEmpty>No members found</CommandEmpty>
                      <CommandGroup>
                        {availableReps.map((p) => (
                          <CommandItem key={p.id} value={p.full_name} onSelect={() => addRep(p.id)}>
                            {p.full_name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </Field>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-xl border border-border/60 shadow-sm bg-card">
      <div className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            {icon}
          </span>
          <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
        </div>
        {action}
      </div>
      <div className="px-4 py-3">{children}</div>
    </Card>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium text-muted-foreground/90 uppercase tracking-wide">
        {label} {required && <span className="text-destructive normal-case">*</span>}
      </Label>
      {children}
    </div>
  );
}

function KpiField({
  icon,
  tint,
  label,
  required,
  children,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-2.5 flex items-center gap-2.5">
      <div className={cn("h-9 w-9 shrink-0 rounded-lg flex items-center justify-center", tint)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <Label className="text-[10px] font-medium text-muted-foreground/90 uppercase tracking-wide">
          {label} {required && <span className="text-destructive normal-case">*</span>}
        </Label>
        {children}
      </div>
    </div>
  );
}

function DatePopover({ date, onChange }: { date: Date | undefined; onChange: (d: Date | undefined) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 w-full justify-start font-normal text-sm rounded-lg border-border/70",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 mr-2 opacity-60" />
          {date ? format(date, "dd MMM yyyy") : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={onChange} initialFocus className={cn("p-3 pointer-events-auto")} />
      </PopoverContent>
    </Popover>
  );
}
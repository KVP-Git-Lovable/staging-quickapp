import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronRight, Loader2, Search, Trophy, Zap } from "lucide-react";
import { categoryMeta } from "./constants";
import { useActivities, usePrograms, useToggleActivity } from "./hooks";
import { ActivityForm } from "./ActivityForm";

const PAGE = "#eef0f4";
const INK = "#1c2440";
const MUT = "#9aa1b5";
const SEC = "#5a6284";
const LINE = "#e7e9f0";

type StatusFilter = "all" | "on" | "off";

/**
 * Every activity in the module, across all programs — the flat view that
 * ProgramDetail can't give you because it only ever shows one program's own
 * activities. Rows open the same ActivityForm used inside a program, so there
 * is one editor, not two.
 */
export function ActivitiesList() {
  const { data: programs = [], isLoading: loadingPrograms } = usePrograms();
  const { data: activities = [], isLoading: loadingActivities } = useActivities();
  const toggle = useToggleActivity();

  const [query, setQuery] = useState("");
  const [programId, setProgramId] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<any | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const isLoading = loadingPrograms || loadingActivities;
  const programById = useMemo(
    () => new Map(programs.map((p: any) => [p.id, p])),
    [programs]
  );

  const enabledCount = activities.filter((a: any) => a.is_enabled).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activities.filter((a: any) => {
      if (programId !== "all" && a.game_id !== programId) return false;
      if (status === "on" && !a.is_enabled) return false;
      if (status === "off" && a.is_enabled) return false;
      if (!q) return true;
      const trigger = (a.trigger_type ?? a.action_type ?? "").replace(/_/g, " ");
      const programName = (programById.get(a.game_id) as any)?.name ?? "";
      return (
        (a.action_name ?? "").toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q) ||
        trigger.toLowerCase().includes(q) ||
        programName.toLowerCase().includes(q)
      );
    });
  }, [activities, query, programId, status, programById]);

  /** Grouped by program, in the programs list's own order, so the module's shape stays visible. */
  const groups = useMemo(() => {
    return programs
      .map((p: any) => ({ program: p, items: filtered.filter((a: any) => a.game_id === p.id) }))
      .filter((g) => g.items.length > 0);
  }, [programs, filtered]);

  const orphans = useMemo(
    () => filtered.filter((a: any) => !programById.has(a.game_id)),
    [filtered, programById]
  );

  const openEditor = (activity: any) => {
    setEditing(activity);
    setFormOpen(true);
  };

  const editingProgram: any = editing ? programById.get(editing.game_id) : null;

  return (
    <div style={{ color: INK }}>
      {/* HEADER — sticks below the tab bar, matching the Programs list */}
      <div
        className="sticky top-[94px] sm:top-[57px] z-10 -mx-1 px-1 py-3 mb-4 backdrop-blur"
        style={{ background: `${PAGE}f0` }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-[30px] h-[30px] rounded-[10px] bg-[#f2edff] text-[#5A2DD8] flex items-center justify-center">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[15px] font-bold tracking-tight leading-tight">All activities</div>
              <div className="text-[11.5px] mt-0.5" style={{ color: MUT }}>
                {isLoading
                  ? "Loading…"
                  : `${activities.length} across ${programs.length} programs · ${enabledCount} enabled`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUT }} />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search activities"
                className="h-9 w-[190px] pl-8 text-[13px] bg-white"
              />
            </div>
            <Select value={programId} onValueChange={setProgramId}>
              <SelectTrigger className="h-9 w-[168px] text-[13px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All programs</SelectItem>
                {programs.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="h-9 w-[124px] text-[13px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                <SelectItem value="on">Enabled</SelectItem>
                <SelectItem value="off">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : !filtered.length ? (
        <div className="bg-white rounded-[20px] p-8 text-center text-sm" style={{ border: `1px solid ${LINE}`, color: MUT }}>
          {activities.length
            ? "No activities match these filters."
            : "No activities yet — open a program to create the first one."}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(({ program, items }) => {
            const cat = categoryMeta(program.category);
            const on = items.filter((a: any) => a.is_enabled).length;
            return (
              <div key={program.id}>
                {/* program heading */}
                <div className="flex items-center gap-2.5 mb-2.5 px-0.5">
                  <div className="w-[26px] h-[26px] rounded-[9px] flex items-center justify-center shrink-0"
                       style={{ background: cat.fill, color: cat.ac }}>
                    <Trophy className="h-[13px] w-[13px]" />
                  </div>
                  <div className="text-[13px] font-bold tracking-tight">{program.name}</div>
                  <span className="text-[10.5px] px-2 py-0.5 rounded-full" style={{ background: cat.fill, color: cat.tx }}>
                    {cat.label}
                  </span>
                  <span className="text-[11px]" style={{ color: MUT }}>
                    {on}/{items.length} enabled
                  </span>
                  {!program.is_active && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#f1f2f7", color: MUT }}>
                      Program draft
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {items.map((a: any) => (
                    <ActivityRow
                      key={a.id}
                      activity={a}
                      cat={cat}
                      onEdit={() => openEditor(a)}
                      onToggle={(next) => toggle.mutate({ id: a.id, is_enabled: next })}
                      busy={toggle.isPending}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {orphans.length > 0 && (
            <div>
              <div className="text-[13px] font-bold tracking-tight mb-2.5 px-0.5">
                Unassigned
                <span className="text-[11px] font-normal ml-2" style={{ color: MUT }}>
                  activity has no matching program
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {orphans.map((a: any) => (
                  <ActivityRow
                    key={a.id}
                    activity={a}
                    cat={categoryMeta(null)}
                    onEdit={() => openEditor(a)}
                    onToggle={(next) => toggle.mutate({ id: a.id, is_enabled: next })}
                    busy={toggle.isPending}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Same editor the program page uses — one form, not two */}
      {editing && editingProgram && (
        <ActivityForm
          open={formOpen}
          onOpenChange={(v) => {
            setFormOpen(v);
            if (!v) setEditing(null);
          }}
          programId={editing.game_id}
          category={editingProgram.category}
          activity={editing}
        />
      )}
    </div>
  );
}

function ActivityRow({
  activity: a, cat, onEdit, onToggle, busy,
}: {
  activity: any;
  cat: any;
  onEdit: () => void;
  onToggle: (next: boolean) => void;
  busy: boolean;
}) {
  const trigger = (a.trigger_type ?? a.action_type ?? "").replace(/_/g, " ");
  const pts = a.is_tiered ? "Tiered" : String(a.points ?? 0);
  const zeroPoints = !a.is_tiered && Number(a.points ?? 0) === 0;

  return (
    <div
      className={`bg-white rounded-[15px] flex items-center gap-3.5 px-4 py-3 transition-shadow hover:shadow-[0_10px_26px_-20px_rgba(28,36,64,.5)] ${
        a.is_enabled ? "" : "opacity-60"
      }`}
      style={{ border: `1px solid ${LINE}` }}
    >
      <button
        type="button"
        onClick={onEdit}
        className="flex items-center gap-3.5 flex-1 min-w-0 text-left"
      >
        <div className="min-w-[52px] h-11 rounded-[11px] flex flex-col items-center justify-center shrink-0"
             style={{ background: cat.fill, color: cat.tx }}>
          <span className={`${a.is_tiered ? "text-[11px]" : "text-[16px]"} font-bold leading-none`}>{pts}</span>
          <span className="text-[8.5px] uppercase tracking-[0.1em] mt-0.5 opacity-70">
            {a.is_tiered ? "range" : "pts"}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium tracking-tight truncate">{a.action_name}</div>
          <div className="text-[11.5px] mt-0.5 truncate" style={{ color: SEC }}>
            {a.description || trigger || "No trigger set"}
          </div>
        </div>
        {zeroPoints && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 hidden sm:inline"
                style={{ background: "#fdecea", color: "#b3261e" }}>
            0 pts — cannot award
          </span>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 hidden sm:block" style={{ color: MUT }} />
      </button>

      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        <span className="text-[10.5px] w-[22px] text-right" style={{ color: a.is_enabled ? "#178a5a" : MUT }}>
          {a.is_enabled ? "On" : "Off"}
        </span>
        <Switch
          checked={!!a.is_enabled}
          disabled={busy}
          onCheckedChange={onToggle}
          aria-label={`${a.is_enabled ? "Disable" : "Enable"} ${a.action_name}`}
        />
      </div>
    </div>
  );
}

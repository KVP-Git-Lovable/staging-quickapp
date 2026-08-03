import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Coins, Loader2, Search, Users } from "lucide-react";
import { categoryMeta } from "./constants";
import { useGamProfiles, usePointsLedger, usePointsSummary, usePrograms } from "./hooks";

const PAGE = "#eef0f4";
const INK = "#1c2440";
const MUT = "#9aa1b5";
const SEC = "#5a6284";
const LINE = "#e7e9f0";

const UNATTRIBUTED = "__none__";
const PAGE_STEP = 100;

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" }) : "—";

/**
 * The full points ledger — every award, with who earned it, which activity and
 * program produced it, what it was tied to, and when it expires.
 */
export function PointsLedger() {
  const [limit, setLimit] = useState(PAGE_STEP);
  const { data: rows = [], isLoading: loadingRows } = usePointsLedger(limit);
  const { data: summary, isLoading: loadingSummary } = usePointsSummary();
  const { data: profiles = [] } = useGamProfiles();
  const { data: programs = [] } = usePrograms();

  const [query, setQuery] = useState("");
  const [programId, setProgramId] = useState("all");
  const [person, setPerson] = useState("all");
  const [source, setSource] = useState("all");

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p: any) => m.set(p.id, p.full_name || "Unnamed"));
    return m;
  }, [profiles]);

  const nameOf = (userId?: string | null) =>
    !userId ? "Unattributed" : nameById.get(userId) ?? "Unknown user";

  const sources = useMemo(
    () => Array.from(new Set(rows.map((r: any) => r.reference_type).filter(Boolean))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r: any) => {
      if (programId !== "all" && r.game_id !== programId) return false;
      if (person !== "all" && (r.user_id ?? UNATTRIBUTED) !== person) return false;
      if (source !== "all" && r.reference_type !== source) return false;
      if (!q) return true;
      return (
        nameOf(r.user_id).toLowerCase().includes(q) ||
        (r.gamification_actions?.action_name ?? "").toLowerCase().includes(q) ||
        (r.gamification_games?.name ?? "").toLowerCase().includes(q) ||
        (r.reference_type ?? "").toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, programId, person, source, nameById]);

  const shownTotal = filtered.reduce((s: number, r: any) => s + Number(r.points || 0), 0);
  const isFiltered = query.trim() || programId !== "all" || person !== "all" || source !== "all";
  const canLoadMore = rows.length >= limit && (!summary || rows.length < summary.awards);

  const topBalance = summary?.byUser?.[0]?.points ?? 0;

  return (
    <div style={{ color: INK }}>
      {/* HEADER */}
      <div
        className="sticky top-[94px] sm:top-[57px] z-10 -mx-1 px-1 py-3 mb-4 backdrop-blur"
        style={{ background: `${PAGE}f0` }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-[30px] h-[30px] rounded-[10px] bg-[#f2edff] text-[#5A2DD8] flex items-center justify-center">
              <Coins className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[15px] font-bold tracking-tight leading-tight">Points ledger</div>
              <div className="text-[11.5px] mt-0.5" style={{ color: MUT }}>
                {loadingSummary
                  ? "Loading…"
                  : `${summary?.awards ?? 0} awards · ${(summary?.total ?? 0).toLocaleString()} points since ${fmtDate(summary?.earliest)}`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUT }} />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ledger"
                className="h-9 w-[178px] pl-8 text-[13px] bg-white"
              />
            </div>
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger className="h-9 w-[150px] text-[13px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {summary?.byUser?.map((u) => (
                  <SelectItem key={u.userId} value={u.userId}>
                    {u.userId === UNATTRIBUTED ? "Unattributed" : nameOf(u.userId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={programId} onValueChange={setProgramId}>
              <SelectTrigger className="h-9 w-[156px] text-[13px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All programs</SelectItem>
                {programs.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="h-9 w-[132px] text-[13px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any source</SelectItem>
                {sources.map((s: any) => (
                  <SelectItem key={s} value={s}>{String(s).replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* BALANCES */}
      <div className="bg-white rounded-[16px] px-4 py-3.5 mb-3" style={{ border: `1px solid ${LINE}` }}>
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-3.5 w-3.5" style={{ color: MUT }} />
          <span className="text-[12.5px] font-bold tracking-tight">Balances by person</span>
          <span className="text-[11px]" style={{ color: MUT }}>
            {summary?.byUser?.length ?? 0} with points
          </span>
        </div>
        {loadingSummary ? (
          <div className="py-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {summary?.byUser?.map((u) => {
              const unattributed = u.userId === UNATTRIBUTED;
              const pct = topBalance ? (u.points / topBalance) * 100 : 0;
              return (
                <button
                  key={u.userId}
                  onClick={() => setPerson(person === u.userId ? "all" : u.userId)}
                  className={`text-left rounded-[12px] px-3 py-2.5 transition-colors ${
                    person === u.userId ? "bg-[#f2edff]" : "hover:bg-[#f6f7fb]"
                  }`}
                  style={{ border: `1px solid ${person === u.userId ? "#d9caf9" : LINE}` }}
                >
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-[12px] font-semibold truncate flex-1"
                      style={unattributed ? { color: "#a2650a" } : undefined}
                    >
                      {unattributed ? "Unattributed" : nameOf(u.userId)}
                    </span>
                    <span className="text-[14px] font-extrabold leading-none">{u.points.toLocaleString()}</span>
                  </div>
                  <div className="h-[5px] rounded-full mt-2 overflow-hidden" style={{ background: "#eceef4" }}>
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${pct}%`, background: unattributed ? "#e0b055" : "#5A2DD8" }}
                    />
                  </div>
                  <div className="text-[9.5px] mt-1.5" style={{ color: MUT }}>
                    {u.awards} awards · last {fmtDate(u.last)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* LEDGER */}
      <div className="bg-white rounded-[16px] overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${LINE}` }}>
          <span className="text-[12.5px] font-bold tracking-tight">All awards</span>
          <span className="text-[11px]" style={{ color: MUT }}>
            {loadingRows ? "loading…" : `showing ${filtered.length}${isFiltered ? " matching" : ""}`}
          </span>
          {isFiltered && (
            <span className="text-[11px] ml-auto" style={{ color: SEC }}>
              {shownTotal.toLocaleString()} pts in view
            </span>
          )}
        </div>

        {loadingRows && !rows.length ? (
          <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !filtered.length ? (
          <div className="py-12 text-center text-sm" style={{ color: MUT }}>
            {rows.length ? "No awards match these filters." : "No points have been awarded yet."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  {["Date", "Person", "Activity", "Program", "Source", "Expires", "Points"].map((h, i) => (
                    <th
                      key={h}
                      className={`text-[9.5px] uppercase tracking-[0.1em] font-bold px-4 py-2.5 whitespace-nowrap ${
                        i === 6 ? "text-right" : "text-left"
                      }`}
                      style={{ color: MUT, borderBottom: `1px solid ${LINE}`, background: "#fafbfd" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => {
                  const cat = categoryMeta(r.gamification_games?.category);
                  const unattributed = !r.user_id;
                  return (
                    <tr key={r.id} className="hover:bg-[#f8f9fc]">
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: SEC, borderBottom: `1px solid #f2f3f7` }}>
                        {fmtDate(r.earned_at)}
                      </td>
                      <td className="px-4 py-2.5 font-semibold whitespace-nowrap"
                          style={{ borderBottom: `1px solid #f2f3f7`, color: unattributed ? "#a2650a" : INK }}>
                        {nameOf(r.user_id)}
                      </td>
                      <td className="px-4 py-2.5" style={{ borderBottom: `1px solid #f2f3f7` }}>
                        {r.gamification_actions?.action_name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ borderBottom: `1px solid #f2f3f7` }}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: cat.ac }} />
                          <span style={{ color: SEC }}>{r.gamification_games?.name ?? "—"}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ borderBottom: `1px solid #f2f3f7` }}>
                        <span className="text-[10.5px] px-2 py-0.5 rounded-full"
                              style={{ background: PAGE, color: SEC }}>
                          {String(r.reference_type ?? "—").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: MUT, borderBottom: `1px solid #f2f3f7` }}>
                        {fmtDate(r.expires_at)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-extrabold whitespace-nowrap"
                          style={{ color: "#178a5a", borderBottom: `1px solid #f2f3f7` }}>
                        +{Number(r.points || 0).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {canLoadMore && !isFiltered && (
          <div className="px-4 py-3 flex justify-center" style={{ borderTop: `1px solid ${LINE}` }}>
            <button
              onClick={() => setLimit((l) => l + PAGE_STEP)}
              disabled={loadingRows}
              className="text-[12.5px] rounded-[10px] px-4 py-2 inline-flex items-center gap-2 hover:bg-[#f4f5f9] transition-colors disabled:opacity-60"
              style={{ border: `1px solid ${LINE}`, color: SEC }}
            >
              {loadingRows && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Load {PAGE_STEP} more
              <span style={{ color: MUT }}>
                ({rows.length} of {summary?.awards ?? "?"})
              </span>
            </button>
          </div>
        )}
      </div>

      {isFiltered && canLoadMore && (
        <div className="text-[11px] mt-2.5 px-1" style={{ color: MUT }}>
          Filters apply to the {rows.length} awards loaded so far — clear them to load the rest.
        </div>
      )}
    </div>
  );
}

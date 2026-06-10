import { Award, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

export type QualityStatus = "unverified" | "partial" | "verified" | "gold" | string | null | undefined;

const MAP: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  gold:       { label: "Gold Verified",       cls: "bg-amber-100 text-amber-800 border-amber-300",   Icon: Award },
  verified:   { label: "Verified",            cls: "bg-emerald-100 text-emerald-800 border-emerald-300", Icon: ShieldCheck },
  partial:    { label: "Partially Verified",  cls: "bg-sky-100 text-sky-800 border-sky-300",         Icon: ShieldAlert },
  unverified: { label: "Unverified",          cls: "bg-zinc-100 text-zinc-700 border-zinc-300",      Icon: ShieldX },
};

export function QualityBadge({ status, score }: { status: QualityStatus; score?: number | null }) {
  const key = (status || "unverified") as keyof typeof MAP;
  const m = MAP[key] || MAP.unverified;
  const Icon = m.Icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${m.cls}`}>
      <Icon className="h-3 w-3" />
      {m.label}{typeof score === "number" ? ` · ${score}%` : ""}
    </span>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, score || 0));
  const color = s >= 90 ? "bg-amber-500" : s >= 70 ? "bg-emerald-500" : s >= 40 ? "bg-sky-500" : "bg-zinc-400";
  return (
    <div className="w-24">
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${s}%` }} />
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{s}%</div>
    </div>
  );
}

export function DuplicateRiskBadge({ risk }: { risk: number }) {
  if (!risk || risk < 31) return null;
  const high = risk >= 71;
  const cls = high ? "bg-red-100 text-red-800 border-red-300" : "bg-orange-100 text-orange-800 border-orange-300";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`} title={`Duplicate risk ${risk}/100`}>
      ⚠ Dup {risk}
    </span>
  );
}

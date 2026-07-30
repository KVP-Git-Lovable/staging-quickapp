import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Users, Search } from "lucide-react";

interface Props {
  mode: string;
  ids: string[];
  onChange: (mode: string, ids: string[]) => void;
}

const MODES = [
  { value: "all", label: "All users" },
  { value: "manager", label: "By manager" },
  { value: "territory", label: "By territory" },
  { value: "users", label: "Specific users" },
];

export function EligibilityPicker({ mode, ids, onChange }: Props) {
  const [search, setSearch] = useState("");

  const { data: users = [] } = useQuery({
    queryKey: ["gam-elig-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, is_active")
        .order("full_name")
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: territories = [] } = useQuery({
    queryKey: ["gam-elig-territories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("territories").select("id, name").order("name").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: resolvedCount } = useQuery({
    queryKey: ["gam-elig-resolve", mode, ids],
    enabled: mode === "manager" && ids.length > 0,
    queryFn: async () => {
      const set = new Set<string>(ids);
      for (const managerId of ids) {
        const { data } = await supabase.rpc("get_all_subordinates", { manager_user_id: managerId });
        (data ?? []).forEach((r: any) => set.add(r.subordinate_user_id));
      }
      return set.size;
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users.slice(0, 50);
    return users.filter((u: any) => (u.full_name ?? "").toLowerCase().includes(q)).slice(0, 50);
  }, [users, search]);

  const toggle = (id: string) => {
    onChange(mode, ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  };

  const nameOf = (id: string) =>
    users.find((u: any) => u.id === id)?.full_name ??
    territories.find((t: any) => t.id === id)?.name ??
    id.slice(0, 8);

  return (
    <div className="space-y-3">
      <Label>Applies to (eligibility)</Label>
      <Select value={mode} onValueChange={(v) => onChange(v, [])}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {MODES.map((m) => (
            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {mode !== "all" && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {ids.length === 0 && <span className="text-sm text-muted-foreground">Nothing selected yet</span>}
            {ids.map((id) => (
              <Badge key={id} variant="secondary" className="gap-1">
                {nameOf(id)}
                <button type="button" onClick={() => toggle(id)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Search className="h-4 w-4 mr-1" />
                {mode === "territory" ? "Choose territories" : mode === "manager" ? "Choose managers" : "Choose users"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2" align="start">
              {mode !== "territory" && (
                <Input
                  placeholder="Search people"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="mb-2"
                />
              )}
              <div className="max-h-64 overflow-y-auto space-y-1">
                {(mode === "territory" ? territories : filtered).map((row: any) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => toggle(row.id)}
                    className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted ${
                      ids.includes(row.id) ? "bg-muted font-medium" : ""
                    }`}
                  >
                    {row.name ?? row.full_name ?? "Unnamed"}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {mode === "manager" && ids.length > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />
              Resolves to {resolvedCount ?? "…"} users, recalculated at each run
            </p>
          )}
        </div>
      )}
    </div>
  );
}

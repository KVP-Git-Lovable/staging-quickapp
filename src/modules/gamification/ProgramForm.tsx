import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CATEGORIES, categoryMeta } from "./constants";

export function ProgramForm({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("orders");
  const [isActive, setIsActive] = useState(true);
  const today = new Date().toISOString().slice(0, 10);
  const nextYear = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(nextYear);

  const create = async () => {
    if (!name.trim()) return toast.error("Give the program a name");
    if (!startDate || !endDate) return toast.error("Pick a start and end date");
    if (endDate < startDate) return toast.error("End date must be after the start date");
    setSaving(true);
    const { error } = await supabase.from("gamification_games").insert({
      name: name.trim(),
      description: description || null,
      category,
      color: categoryMeta(category).color,
      is_active: isActive,
      is_all_territories: true,
      start_date: startDate,
      end_date: endDate,
    });

    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["gam-programs"] });
    toast.success("Program created");
    setName(""); setDescription(""); setCategory("orders"); setIsActive(true);
    setStartDate(today); setEndDate(nextYear);

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-pixel text-sm text-orange-600">CREATE A REWARD PROGRAM</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monsoon order push" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>

            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`h-8 w-8 rounded-full ${c.dot} ${category === c.value ? "ring-2 ring-offset-2 ring-foreground" : ""}`}
                  aria-label={c.label}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label className="mb-0">Active</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

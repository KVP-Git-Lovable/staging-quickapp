import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  BLOCK_CATALOG, createWorkflow,
  type WorkflowBlockConfig, type WorkflowConfig, type WorkflowTone,
} from "../hooks/useCustomWorkflows";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const STEPS = ["Basics", "Blocks", "Parameters", "Narration", "Review"] as const;
const MAX_BLOCKS = 3;

interface FormState {
  name: string;
  description: string;
  blocks: WorkflowBlockConfig[];
  focus: string;
  tone: WorkflowTone;
}

const emptyForm = (): FormState => ({
  name: "",
  description: "",
  blocks: [],
  focus: "",
  tone: "encouraging",
});

const defaultParams = (type: string): Record<string, number> => {
  const cat = BLOCK_CATALOG.find((b) => b.type === type);
  return Object.fromEntries((cat?.params ?? []).map((p) => [p.key, p.default]));
};

export function CreateWorkflowDialog({ open, onOpenChange, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep(0);
    setForm(emptyForm());
  };

  const stepValid = (() => {
    if (step === 0) return form.name.trim().length > 0 && form.name.length <= 80 && form.description.length <= 300;
    if (step === 1) return form.blocks.length >= 1 && form.blocks.length <= MAX_BLOCKS;
    if (step === 3) return form.focus.trim().length > 0 && form.focus.length <= 500;
    return true;
  })();

  const toggleBlock = (type: string) => {
    setForm((f) => {
      const has = f.blocks.some((b) => b.type === type);
      if (has) return { ...f, blocks: f.blocks.filter((b) => b.type !== type) };
      if (f.blocks.length >= MAX_BLOCKS) {
        toast.info(`Pick at most ${MAX_BLOCKS} blocks.`);
        return f;
      }
      return { ...f, blocks: [...f.blocks, { type, params: defaultParams(type) }] };
    });
  };

  const setParam = (type: string, key: string, raw: string) => {
    const n = Number(raw);
    setForm((f) => ({
      ...f,
      blocks: f.blocks.map((b) =>
        b.type === type ? { ...b, params: { ...b.params, [key]: Number.isFinite(n) ? n : 0 } } : b),
    }));
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const config: WorkflowConfig = {
        version: 1,
        blocks: form.blocks,
        narration: { focus: form.focus.trim(), tone: form.tone },
      };
      await createWorkflow({
        name: form.name.trim(),
        description: form.description.trim(),
        config,
      });
      toast.success("Workflow created");
      onCreated();
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create workflow");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Workflow</DialogTitle>
          <DialogDescription>
            Compose deterministic analysis blocks; AI only narrates the computed results.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-1.5">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                  i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                      ? "border-2 border-primary text-primary"
                      : "border border-border text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={`text-[10px] ${i === step ? "font-medium" : "text-muted-foreground"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>

        <div className="min-h-[220px] space-y-4 py-2">
          {step === 0 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="wf-name">Name *</Label>
                <Input
                  id="wf-name"
                  maxLength={80}
                  placeholder="e.g. Weekly risk digest"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wf-desc">Description</Label>
                <Textarea
                  id="wf-desc"
                  maxLength={300}
                  rows={3}
                  placeholder="What should this workflow tell the team?"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
            </>
          )}

          {step === 1 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Pick 1–{MAX_BLOCKS} analysis blocks. Each computes real numbers from the running
                user's own data.
              </p>
              {BLOCK_CATALOG.map((b) => {
                const checked = form.blocks.some((x) => x.type === b.type);
                return (
                  <label
                    key={b.type}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 ${
                      checked ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <Checkbox className="mt-0.5" checked={checked} onCheckedChange={() => toggleBlock(b.type)} />
                    <span>
                      <span className="block text-sm font-medium">{b.label}</span>
                      <span className="block text-xs text-muted-foreground">{b.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {form.blocks.length === 0 && (
                <p className="text-xs text-muted-foreground">No blocks selected.</p>
              )}
              {form.blocks.map((b) => {
                const cat = BLOCK_CATALOG.find((c) => c.type === b.type);
                if (!cat) return null;
                return (
                  <div key={b.type} className="rounded-lg border border-border p-3">
                    <p className="mb-2 text-sm font-medium">{cat.label}</p>
                    <div className="grid grid-cols-2 gap-3">
                      {cat.params.map((p) => (
                        <div key={p.key} className="space-y-1">
                          <Label className="text-xs">{p.label}</Label>
                          <Input
                            type="number"
                            min={p.min}
                            max={p.max}
                            value={b.params[p.key] ?? p.default}
                            onChange={(e) => setParam(b.type, p.key, e.target.value)}
                          />
                          <p className="text-[10px] text-muted-foreground">{p.min}–{p.max}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="wf-focus">Narration focus *</Label>
                <Textarea
                  id="wf-focus"
                  maxLength={500}
                  rows={3}
                  placeholder="e.g. Emphasise which retailers to visit first this week"
                  value={form.focus}
                  onChange={(e) => setForm((f) => ({ ...f, focus: e.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">
                  Guides how the AI phrases the summary. It cannot change the computed numbers.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Tone</Label>
                <RadioGroup
                  value={form.tone}
                  onValueChange={(v) => setForm((f) => ({ ...f, tone: v as WorkflowTone }))}
                  className="flex gap-4"
                >
                  {(["encouraging", "direct", "formal"] as const).map((t) => (
                    <label key={t} className="flex items-center gap-1.5 text-sm capitalize">
                      <RadioGroupItem value={t} /> {t}
                    </label>
                  ))}
                </RadioGroup>
              </div>
            </>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">{form.name}</p>
                {form.description && (
                  <p className="text-xs text-muted-foreground">{form.description}</p>
                )}
              </div>
              <div className="space-y-1.5">
                {form.blocks.map((b) => {
                  const cat = BLOCK_CATALOG.find((c) => c.type === b.type);
                  return (
                    <div key={b.type} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                      <span className="text-sm">{cat?.label ?? b.type}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {Object.entries(b.params).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </Badge>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Focus: “{form.focus.trim()}” · Tone: {form.tone}
              </p>
              <p className="text-[11px] text-muted-foreground">
                The workflow is visible to everyone with QuickApp AI access; each run analyses only
                the running user's own data.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || saving}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!stepValid} className="gap-1">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={saving || !stepValid} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create Workflow
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

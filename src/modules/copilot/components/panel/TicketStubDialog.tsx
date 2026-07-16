import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: { en: string; hi: string } | null;
}

export function TicketStubDialog({ open, onOpenChange, category }: Props) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const ticketId = `TCK-${Date.now().toString().slice(-8)}`;

  useEffect(() => {
    if (!open) { setNote(""); return; }
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      const { data } = await supabase.from("profiles").select("full_name, name").eq("id", u.id).maybeSingle();
      setUser({ name: data?.full_name || data?.name || u.email || "User", email: u.email || "" });
    })();
  }, [open]);

  const submit = async () => {
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 500));
    toast({ title: "Ticket raised (demo)", description: `${ticketId} · ${category?.en ?? ""}` });
    setSubmitting(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Raise ticket</DialogTitle>
          <DialogDescription>
            {category ? `${category.en} · ${category.hi}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Ticket ID</p>
            <p className="font-mono font-medium">{ticketId}</p>
            {user && (
              <>
                <p className="mt-2 text-xs text-muted-foreground">Raised by</p>
                <p className="font-medium">{user.name}</p>
                {user.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
              </>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Add a note (optional)</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe the issue…"
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

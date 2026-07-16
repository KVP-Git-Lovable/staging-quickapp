import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CopilotConversation } from "../types";

export function useConversations() {
  const [items, setItems] = useState<CopilotConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("copilot_conversations")
      .select("id, title, last_message_at, created_at")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) console.error("[copilot] list", error);
    else setItems((data ?? []) as CopilotConversation[]);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (title = "New chat") => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Please sign in"); return null; }
    const { data, error } = await supabase
      .from("copilot_conversations")
      .insert({ user_id: user.id, title })
      .select("id, title, last_message_at, created_at")
      .maybeSingle();
    if (error) { toast.error(error.message); return null; }
    if (data) setItems((prev) => [data as CopilotConversation, ...prev]);
    return data as CopilotConversation | null;
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("copilot_conversations").delete().eq("id", id);
    if (error) { toast.error(error.message); return false; }
    setItems((prev) => prev.filter((c) => c.id !== id));
    return true;
  }, []);

  const patch = useCallback((id: string, changes: Partial<CopilotConversation>) => {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, ...changes } : c)));
  }, []);

  return { items, loading, userId, refresh, create, remove, patch };
}

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CopilotThread {
  id: string;
  title: string;
  last_message_at: string;
  is_pinned: boolean;
}

export function useCopilotThreads() {
  const [threads, setThreads] = useState<CopilotThread[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('copilot_conversations')
      .select('id, title, last_message_at, is_pinned')
      .eq('is_archived', false)
      .order('is_pinned', { ascending: false })
      .order('last_message_at', { ascending: false })
      .limit(50);
    if (error) {
      console.error('[copilot] threads:', error);
    } else {
      setThreads((data ?? []) as CopilotThread[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const createThread = useCallback(async (title = 'New chat') => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('copilot_conversations')
      .insert({ user_id: user.id, title })
      .select('id, title, last_message_at, is_pinned')
      .maybeSingle();
    if (error) { toast.error(error.message); return null; }
    if (data) setThreads((prev) => [data as CopilotThread, ...prev]);
    return data as CopilotThread | null;
  }, []);

  const deleteThread = useCallback(async (id: string) => {
    const { error } = await supabase.from('copilot_conversations').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setThreads((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const renameThread = useCallback(async (id: string, title: string) => {
    await supabase.from('copilot_conversations').update({ title }).eq('id', id);
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }, []);

  return { threads, loading, refresh, createThread, deleteThread, renameThread };
}

import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CopilotChat } from '@/components/copilot/CopilotChat';
import { useCopilotThreads } from '@/hooks/useCopilotThreads';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, MessageSquare, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const Copilot = () => {
  const { threadId } = useParams<{ threadId?: string }>();
  const navigate = useNavigate();
  const { threads, loading, createThread, deleteThread } = useCopilotThreads();

  // Bootstrap: if no threadId in URL, pick most recent or create one.
  useEffect(() => {
    if (loading) return;
    if (threadId) return;
    if (threads.length > 0) {
      navigate(`/copilot/${threads[0].id}`, { replace: true });
    } else {
      (async () => {
        const t = await createThread();
        if (t) navigate(`/copilot/${t.id}`, { replace: true });
      })();
    }
  }, [loading, threadId, threads, createThread, navigate]);

  const handleNew = async () => {
    const t = await createThread();
    if (t) navigate(`/copilot/${t.id}`);
  };

  const handleDelete = async (id: string) => {
    await deleteThread(id);
    if (id === threadId) {
      const remaining = threads.filter((t) => t.id !== id);
      if (remaining[0]) navigate(`/copilot/${remaining[0].id}`, { replace: true });
      else navigate('/copilot', { replace: true });
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r flex flex-col bg-muted/30">
        <div className="p-3 border-b flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Copilot</span>
        </div>
        <div className="p-2">
          <Button onClick={handleNew} className="w-full" size="sm">
            <Plus className="w-4 h-4 mr-1" /> New chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {threads.map((t) => (
            <div key={t.id} className={cn(
              'group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-accent',
              t.id === threadId && 'bg-accent',
            )}>
              <button
                type="button"
                onClick={() => navigate(`/copilot/${t.id}`)}
                className="flex-1 text-left flex items-center gap-2 text-sm truncate"
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{t.title}</span>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                aria-label="Delete chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat */}
      <main className="flex-1 min-w-0">
        {threadId ? (
          <CopilotChat threadId={threadId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Loading Copilot…
          </div>
        )}
      </main>
    </div>
  );
};

export default Copilot;

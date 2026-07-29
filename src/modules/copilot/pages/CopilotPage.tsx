import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PanelLeft, ArrowLeft, Bot } from "lucide-react";
import { useConversations } from "../hooks/useConversations";
import { ConversationSidebar } from "../components/sidebar/ConversationSidebar";
import { ChatWindow } from "../components/chat/ChatWindow";
import { CopilotUtilityPanel } from "../components/panel/CopilotUtilityPanel";
import { CopilotTicker } from "../components/panel/CopilotTicker";

interface CopilotPageProps {
  /** Route prefix for thread URLs. Defaults to the standalone /copilot route. */
  basePath?: string;
  /** When mounted inside another module shell, drop the outer viewport height
   *  and the "Dashboard" back button (the shell owns that chrome). */
  embedded?: boolean;
}

export default function CopilotPage({ basePath = "/copilot", embedded = false }: CopilotPageProps = {}) {
  const { threadId } = useParams<{ threadId?: string }>();
  const navigate = useNavigate();
  const { items, loading, create, remove, refresh } = useConversations();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const bootstrappingRef = useRef(false);

  // Bootstrap: pick most recent or create a new one when no thread in URL.
  useEffect(() => {
    if (loading || threadId) return;
    if (items[0]) {
      navigate(`/copilot/${items[0].id}`, { replace: true });
      return;
    }
    if (bootstrappingRef.current) return;
    bootstrappingRef.current = true;
    void create().then((c) => {
      if (c) navigate(`/copilot/${c.id}`, { replace: true });
      else bootstrappingRef.current = false;
    });
  }, [loading, threadId, items, create, navigate]);

  // Admin read policies can expose other users' thread ids. Never open those
  // ids in the personal chat UI; route back to an owned conversation instead.
  useEffect(() => {
    if (loading || !threadId || items.some((item) => item.id === threadId)) return;
    navigate(items[0] ? `/copilot/${items[0].id}` : "/copilot", { replace: true });
  }, [loading, threadId, items, navigate]);

  const handleNew = async () => {
    const c = await create();
    if (c) { navigate(`/copilot/${c.id}`); setMobileOpen(false); }
  };

  const handleSelect = (id: string) => {
    navigate(`/copilot/${id}`);
    setMobileOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    const isActive = id === threadId;
    const next = items.find((c) => c.id !== id);
    setDeletingId(id); // Unmounts active chat and aborts its stream before DELETE.
    if (isActive) navigate(next ? `/copilot/${next.id}` : "/copilot", { replace: true });
    await remove(id);
    setDeletingId(null);
  };

  const sidebar = (
    <ConversationSidebar
      items={items}
      activeId={threadId}
      onSelect={handleSelect}
      onNew={handleNew}
      onDelete={handleDelete}
      deletingId={deletingId}
    />
  );

  return (
    <div className="flex h-[calc(100vh-56px)] bg-background">
      <div className="hidden md:flex h-full">{sidebar}</div>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="copilot-chrome flex items-center gap-2 border-b border-primary-foreground/10 px-3 py-2.5">
          <div className="md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-warning">
                  <PanelLeft className="w-4 h-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72">
                {sidebar}
              </SheetContent>
            </Sheet>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard")}
            className="gap-1.5 text-primary-foreground hover:bg-primary-foreground/10 hover:text-warning"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
          <h1 className="ml-1 truncate text-base font-bold text-primary-foreground sm:text-lg">
            Welcome to QuickApp Copilot!
          </h1>
          <div className="copilot-action ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-warning/50 shadow-sm">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
        </div>
        <CopilotTicker />
        <div className="flex-1 min-h-0">
          {threadId && deletingId !== threadId ? (
            <ChatWindow
              key={threadId}
              conversationId={threadId}
              onFirstMessage={() => { setTimeout(refresh, 1500); }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Loading Copilot…
            </div>
          )}
        </div>
      </main>

      <CopilotUtilityPanel />
    </div>
  );
}

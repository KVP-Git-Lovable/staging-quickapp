import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PanelLeft, ArrowLeft } from "lucide-react";
import { useConversations } from "../hooks/useConversations";
import { ConversationSidebar } from "../components/sidebar/ConversationSidebar";
import { ChatWindow } from "../components/chat/ChatWindow";

export default function CopilotPage() {
  const { threadId } = useParams<{ threadId?: string }>();
  const navigate = useNavigate();
  const { items, loading, create, remove, refresh } = useConversations();
  const [mobileOpen, setMobileOpen] = useState(false);
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

  const handleNew = async () => {
    const c = await create();
    if (c) { navigate(`/copilot/${c.id}`); setMobileOpen(false); }
  };

  const handleSelect = (id: string) => {
    navigate(`/copilot/${id}`);
    setMobileOpen(false);
  };

  const handleDelete = async (id: string) => {
    await remove(id);
    if (id === threadId) {
      const next = items.find((c) => c.id !== id);
      navigate(next ? `/copilot/${next.id}` : "/copilot", { replace: true });
    }
  };

  const sidebar = (
    <ConversationSidebar
      items={items}
      activeId={threadId}
      onSelect={handleSelect}
      onNew={handleNew}
      onDelete={handleDelete}
    />
  );

  return (
    <div className="flex h-[calc(100vh-56px)] bg-background">
      <div className="hidden md:flex h-full">{sidebar}</div>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <div className="md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon"><PanelLeft className="w-4 h-4" /></Button>
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
            className="gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
          <span className="text-sm font-medium ml-1">Copilot</span>
        </div>
        <div className="flex-1 min-h-0">
          {threadId ? (
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
    </div>
  );
}

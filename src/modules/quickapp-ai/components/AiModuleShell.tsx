import { NavLink, Outlet } from "react-router-dom";
import { MessageSquare, Workflow, Lightbulb, LifeBuoy, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";

const sections = [
  { to: "/quickapp-ai/chat", label: "Chat", icon: MessageSquare, hint: "Ask anything about your business" },
  { to: "/quickapp-ai/workflows", label: "AI Workflows", icon: Workflow, hint: "Build and deploy AI agents" },
  { to: "/quickapp-ai/insights", label: "AI Insights", icon: Lightbulb, hint: "Proactive recommendations" },
  { to: "/quickapp-ai/sahaya", label: "QuickApp Sahaya", icon: LifeBuoy, hint: "Voice help assistant" },
];

export function AiModuleShell() {
  return (
    <div className="flex h-[calc(100vh-56px)] min-h-0 bg-background">
      {/* Desktop secondary nav */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-card/40">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
          <BrainCircuit className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">QuickApp AI</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {sections.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className={({ isActive }) =>
                cn(
                  "flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <s.icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate">{s.label}</span>
                <span className="block truncate text-[11px] opacity-70">{s.hint}</span>
              </span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile secondary nav */}
        <div className="md:hidden flex gap-1 overflow-x-auto border-b border-border bg-card/40 px-2 py-2">
          {sections.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className={({ isActive }) =>
                cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted",
                )
              }
            >
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </NavLink>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default AiModuleShell;

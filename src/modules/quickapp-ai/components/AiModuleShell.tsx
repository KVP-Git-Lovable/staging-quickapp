import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { MessageSquare, Workflow, Lightbulb, LifeBuoy, BrainCircuit, DoorOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";

const sections = [
  { to: "/quickapp-ai/chat", label: "Chat", icon: MessageSquare, hint: "Ask anything about your business", widget: "widget_ai_chat" },
  { to: "/quickapp-ai/workflows", label: "AI Workflows", icon: Workflow, hint: "Build and deploy AI agents", widget: "widget_ai_workflows" },
  { to: "/quickapp-ai/insights", label: "AI Insights", icon: Lightbulb, hint: "Proactive recommendations", widget: "widget_ai_insights" },
  { to: "/quickapp-ai/sahaya", label: "QuickApp Sahaya", icon: LifeBuoy, hint: "Voice help assistant", widget: "widget_ai_sahaya" },
];

export function AiModuleShell() {
  const navigate = useNavigate();
  const { permissions, hasModuleAccess, hasWidgetPermission } = useProfilePermissions();

  // Same visibility contract as other modules: no security profile → show all;
  // full module read → show all; otherwise fall back to the widget permission.
  const hasSecurityProfile = permissions.length > 0;
  const hasFullModuleAccess = hasModuleAccess("module_quickapp_ai");
  const visibleSections = sections.filter(
    (s) => !hasSecurityProfile || hasFullModuleAccess || hasWidgetPermission(s.widget),
  );

  // Leaves the module without signing out — plain client-side navigation.
  const exitToDashboard = () => navigate("/dashboard");

  return (
    <div className="flex h-[calc(100vh-56px)] min-h-0 bg-background">
      {/* Desktop secondary nav */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-card/40">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
          <BrainCircuit className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">QuickApp AI</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {visibleSections.map((s) => (
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
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={exitToDashboard}
            className="flex w-full items-center gap-2 rounded-lg bg-destructive px-3 py-2.5 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
          >
            <DoorOpen className="h-4 w-4 shrink-0" />
            Exit
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile secondary nav — a constant top bar (no horizontal
            scrolling): section items are icon-only so everything fits on
            screen, and only Exit keeps its label so it stays obvious. */}
        <div className="md:hidden flex items-center gap-1 border-b border-border bg-card/40 px-2 py-2">
          {visibleSections.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              aria-label={s.label}
              title={s.label}
              className={({ isActive }) =>
                cn(
                  "flex shrink-0 items-center justify-center rounded-full p-2 transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )
              }
            >
              <s.icon className="h-4 w-4" />
            </NavLink>
          ))}
          <button
            type="button"
            onClick={exitToDashboard}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground"
          >
            <DoorOpen className="h-3.5 w-3.5" />
            Exit
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default AiModuleShell;

import type { PromptCard } from "../types";

// Each prompt is backed by a read-only, RLS-scoped server data handler.
export const PROMPT_CARDS: PromptCard[] = [
  { id: "leave",       title: "Leave balance",         subtitle: "Check remaining days",           prompt: "What is my leave balance?" },
  { id: "attendance",  title: "Attendance this month", subtitle: "Days present, late, missed",     prompt: "Show my attendance this month." },
  { id: "beats",       title: "Last 3 beats",          subtitle: "Summarise recent coverage",      prompt: "Summarise my last three beats." },
  { id: "collections", title: "Pending collections",   subtitle: "Retailers with dues",            prompt: "Show pending collections." },
  { id: "visits",      title: "Plan today's visits",   subtitle: "Prioritise retailers",           prompt: "Help me plan today's visits." },
  { id: "targets",     title: "Today's targets",       subtitle: "What I need to hit",             prompt: "Explain today's targets." },
];

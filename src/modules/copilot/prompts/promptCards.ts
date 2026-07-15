import type { PromptCard } from "../types";

// Phase 1: placeholder prompts. Real business data lands in Phase 2 via tools/RAG.
export const PROMPT_CARDS: PromptCard[] = [
  { id: "leave",       title: "Leave balance",         subtitle: "Check remaining days",           prompt: "What is my leave balance?" },
  { id: "attendance",  title: "Attendance this month", subtitle: "Days present, late, missed",     prompt: "Show my attendance this month." },
  { id: "beats",       title: "Last 3 beats",          subtitle: "Summarise recent coverage",      prompt: "Summarise my last three beats." },
  { id: "collections", title: "Pending collections",   subtitle: "Retailers with dues",            prompt: "Show pending collections." },
  { id: "visits",      title: "Plan today's visits",   subtitle: "Prioritise retailers",           prompt: "Help me plan today's visits." },
  { id: "targets",     title: "Today's targets",       subtitle: "What I need to hit",             prompt: "Explain today's targets." },
];

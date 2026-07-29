## Goal

Produce two standalone audit/technical documents. No code, schema, or edge-function changes — read-only inspection plus new markdown files.

## Deliverables

1. `docs/audit/COPILOT_CHAT_AUDIT.md`
2. `docs/audit/COPILOT_TODAYS_ACTION_PLAN_AUDIT.md`

## Scope of investigation (read-only)

Confirmed source surfaces already located:

- Chat: `src/modules/copilot/pages/CopilotPage.tsx`, `components/chat/*` (ChatWindow, ChatComposer, MessageList, MessageBubble, TypingIndicator, WelcomeHeader), `components/sidebar/*` (ConversationSidebar, CopilotInsights), `components/panel/*` (CopilotUtilityPanel, CopilotTicker, OrdersChart, TicketStubDialog), hooks `useCopilotChat`, `useConversations`, `useCopilotInsights`, `useCopilotTicker`, `useMyOrdersLast7Days`, `services/copilotService.ts`, `utils/sanitize.ts`, `prompts/promptCards.ts`, and edge function `supabase/functions/copilot-agent/*` (index, config, prompts/systemPrompt.ts, services/togetherClient.ts).
- Action Plan: `components/panel/VisitActionPlan.tsx`, hooks `useVisitActionPlan`, `useTodaysVisitRetailers`, and edge function `supabase/functions/copilot-visit-actions/*`.

Also inspected during the audit: relevant tables/RPCs the two functions read, conversation/message persistence tables and their access rules, and Together.AI model/streaming configuration in each `config.ts`.

## Structure of each document

Both docs follow the same outline so they can be compared side by side:

1. Purpose and user-facing behaviour
2. End-to-end workflow (numbered request→render sequence, plus an ASCII flow diagram)
3. Component inventory — every file with its role and key props/state
4. Hook and data layer — queries, caching, refetch and invalidation behaviour
5. Backend/edge function — auth handling, request/response contract, error codes, timeouts
6. AI architecture — which steps hit Together.AI vs. which are deterministic SQL, model id, streaming behaviour, prompt construction, token/latency controls, grounding data injected
7. Data sources — tables, columns, RPCs read, and the access rules they depend on
8. Operational execution — deployment, logging/observability, failure modes and current mitigations (stream drain, abort timeouts, partial-text preservation)
9. Known limitations and risk observations (audit findings only — no fixes applied)
10. Appendix: file map with line references

## Technical details

- Documents are written as reference material for a mixed technical/operational audience: plain-language summary at the top of each section, specifics below.
- Every current-state claim is grounded in a file read or database query performed during the audit; anything unverifiable is flagged as such rather than asserted.
- The audit explicitly lists which Copilot intents are LLM-generated versus locally computed, since that distinction has changed over time.
- No edits to any file under `src/`, `supabase/functions/`, or the database.

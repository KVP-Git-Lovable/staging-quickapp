# QuickApp AI — new navigation module

A new top-level module that becomes the home for every AI capability. It reuses the existing Copilot chat and Madad help agent as-is; no AI backend, edge function, or business logic changes.

## Navigation

- Add a `quickapp-ai` item to the Navbar's `navigationItems` array in `src/components/Navbar.tsx` (label "QuickApp AI", `Sparkles`/`BrainCircuit` icon, gradient colour consistent with siblings), so it appears in the main menu grid and participates in the existing customization/feature-flag filtering.
- Repoint the top-bar Sparkles shortcut from `/copilot` to `/quickapp-ai` (both entry points, per your answer).
- Register routes in `src/App.tsx` under `<ProtectedRoute>`:
  - `/quickapp-ai` → redirects to `/quickapp-ai/chat`
  - `/quickapp-ai/chat`, `/quickapp-ai/workflows`, `/quickapp-ai/insights`, `/quickapp-ai/sahaya`
- Existing `/copilot` and `/copilot/:threadId` routes stay working and untouched.

## Module shell

New `src/modules/quickapp-ai/` folder with a layout page holding a left secondary nav (Chat · AI Workflows · AI Insights · QuickApp Sahaya). It uses the app's existing `NavLink` active styling (`bg-primary/10 text-primary font-medium`), collapses to a horizontal scroll strip on mobile, and renders the selected section beside it. Sections are lazy-mounted so the workflows/insights pages never load chat state.

## Page 1 — Chat

Renders the existing Copilot experience with **zero duplication**: the Chat section mounts the current `CopilotPage` content (conversation sidebar, ticker, `ChatWindow`, utility panel) unchanged. Threads keep their existing `/copilot/:threadId` URLs — selecting a conversation navigates there, exactly as today. Streaming, history, markdown, auth, loading and error states are inherited verbatim.

## Page 2 — AI Workflows (scaffold)

Header "AI Workflows" + the requested subtitle, then three cards:

1. **Workflow Builder** — a static connected-block diagram:
```text
Start → Fetch Retailers → Analyse Orders → Generate Insights → Review → Deploy
```
rendered as vertical (mobile) / horizontal (desktop) nodes with connectors.
2. **AI Agents** — six agent cards (Sales Coach, Visit Optimiser, Churn Detector, Collections Assistant, Stock Advisor, Beat Planner), each with icon, one-line description and a "Coming Soon"/"Prototype" status badge.
3. **Deployment Pipeline** — `Workflow → Validation → Simulation → Production → Monitoring` diagram plus three dummy metric tiles (Success Rate, Avg Response Time, Executions Today).

A prominent **Create Workflow** button at the bottom that shows a "Coming Soon" toast.

## Page 3 — AI Insights (static, backend-ready)

Header "AI Insights" + the requested subtitle, then ten insight cards driven by a typed array in `src/modules/quickapp-ai/data/insightSeeds.ts`: Churn Risk, Low Productivity Retailers, Long Visit Duration, Outstanding Collections, Missed Visit Targets, Beat Optimisation, Upsell-Ready Retailers, Declining Order Values, New Product Opportunities, Seasonal Opportunities.

Each card shows priority badge, title, markdown explanation, business impact, confidence %, expandable details, feedback thumbs, and a **Take Action** button (toast for now). The `AiInsight` type and `InsightCard` component are shaped so a future hook can supply the same objects from the backend — including optional `streaming`, `citations[]` and `actionHref` fields the UI already renders when present.

## Page 4 — QuickApp Sahaya (Help)

Reuses the existing Madad agent: renders the current `MadadHelpButton` (unchanged component, unchanged `madad-help-call` edge function) as the primary "Call Madad" action, wrapped in a help-centre panel explaining that Madad rings the signed-in user's registered number, with the existing help-article content surfaced alongside it.

## Technical notes

- TypeScript throughout, semantic design tokens only (no hardcoded colours), light/dark safe, loading skeletons on the chat mount, toasts for not-yet-available actions.
- **No backend changes**: `copilot-agent`, `aiIntentRouter.ts`, `togetherClient.ts`, deterministic SQL grounding builders, and all other modules are untouched. The current regex-first → AI-router-fallback classification stays exactly as deployed; the module folder is structured so an AI-first router can be swapped in later without touching page code.
- No duplicate Together.ai client, no new chat implementation, no new auth path.

## Out of scope

Orders, retailers, visits, dashboard, reports, auth, and existing Copilot backend behaviour are not modified.

## Goal

Turn `/quickapp-ai/workflows` from a static page into a working feature, with the visual design unchanged. Only **Visit Optimiser** and **Churn Detector** become interactive; the other four cards stay exactly as they are, "Coming Soon" and non-clickable.

Note: the prompt referenced an `auto-plan-visit` Edge Function and an `fn_declining_retailers()` database function — neither exists in this project. Per your answer, the agents reuse the closest existing equivalents (confirmed by inspection):
- Visit Optimiser → the deterministic stop-scoring inputs already used by `ai-route-suggestion` / `ai-weekly-route-plan` (recency, pending dues, productivity, geo proximity).
- Churn Detector → the deterministic declining-retailer calculation already implemented in `copilot-visit-actions` (90-day vs prior-90-day order-value drop).

Neither existing Edge Function is modified; the logic is called/derived through the same read-only queries, not rewritten with new business rules.

## Database (two new tables only)

**`ai_agents`** — catalogue behind the six cards: `id`, `key`, `name`, `description`, `status` (`prototype` | `coming_soon` | `live`), `category`, `sort_order`, `created_at`. Seeded with the six existing cards using today's exact names, descriptions and badge text, in the current order, so the page renders identically.

**`workflow_executions`** — append-only execution log: `id`, `agent_id`, `stage` (`workflow` | `validation` | `simulation` | `production` | `monitoring`), `status` (`running` | `success` | `failed`), `started_at`, `completed_at`, `duration_ms`, `error_message`, `triggered_by`, `result` (jsonb summary for the panel).

Both get GRANTs plus RLS: authenticated users read `ai_agents`; users read/insert their own `workflow_executions` (service role full access for the function). No existing table, policy, trigger, index or function is touched.

## Backend — one new Edge Function `ai-workflow-run`

Additive; nothing existing is edited.

1. Authenticates the caller (same pattern as `copilot-visit-actions`).
2. Inserts a `workflow_executions` row with `status='running'`, `stage='simulation'`.
3. Runs the deterministic branch for the requested agent, **read-only**:
   - *Churn Detector*: 90d vs prior-90d order value per retailer, cancelled orders excluded, ranked by drop — same rules as the existing Copilot implementation.
   - *Visit Optimiser*: today's planned retailers scored on days-since-last-visit, pending dues, recent productivity and geo clustering, returning an ordered stop list — same signals the existing route-suggestion payload is built from.
4. Passes only the finished deterministic facts to Together.AI for a short human-readable summary, reusing the existing `togetherClient.ts` + `MODEL` config already in `copilot-visit-actions` (import, no new client, no new model config, no new auth/retry code).
5. Updates the same row to `success` (with `duration_ms` and result) or `failed` (with `error_message`) — including on timeout or validation error, so history is always complete.

Simulation writes nothing else: no WhatsApp, no plans, visits, orders, retailers, targets or notifications.

## Frontend — `AiWorkflowsPage.tsx` only

Same JSX structure, classes, icons, copy and spacing; only data sources change.

- Cards render from `ai_agents` (fallback to the current static array while loading, so there is no layout shift).
- Clicking Visit Optimiser or Churn Detector opens a shadcn `Sheet` (the drawer pattern already used elsewhere in the app) showing the latest execution's status, stage, duration and timestamp, plus a single **Run Simulation** action and the returned result list + AI summary. The four Coming Soon cards keep no click handler.
- Deployment Pipeline: the existing `StepChain` gets a highlighted-stage prop driven by the selected agent's latest execution; Production/Monitoring render disabled.
- Metrics computed from `workflow_executions` (scoped to the selected agent, or all agents when none is selected): success rate = success / (success + failed); average `duration_ms` excluding running rows; executions today using the app's configured timezone via the existing `useAppTimezone` helpers.
- **Create Workflow** button keeps its current appearance and its existing "coming soon" toast.

## Technical notes

- New files: one migration, `supabase/functions/ai-workflow-run/index.ts`, a `useAiWorkflows` hook and an agent-detail sheet component under `src/modules/quickapp-ai/`.
- Edited file: `src/modules/quickapp-ai/pages/AiWorkflowsPage.tsx` (data wiring only).
- Out of scope and untouched: Copilot Chat, AI Insights, `copilot-agent`, `copilot-visit-actions`, Together.AI config, navigation, and all other modules.

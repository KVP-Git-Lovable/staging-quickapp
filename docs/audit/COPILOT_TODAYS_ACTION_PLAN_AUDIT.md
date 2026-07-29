# QuickApp Copilot — "Today's Action Plan": Technical & Operational Audit

**Scope:** the *Today's Visit Retailers* + *Today's Action Plan* section in the Copilot right-hand utility panel, and its backing edge function `copilot-visit-actions`.
**Type:** read-only audit. No logic, schema, or configuration was changed while producing this document.
**Audit date:** 29 July 2026.
**Method:** direct inspection of the source files listed in the appendix.

---

## 1. Purpose and user-facing behaviour

This feature answers one question for a field user, once per day: *"Of the retailers I am visiting today, which ones need attention, and what should I do about them?"*

Behaviour in plain language:

1. The panel lists every retailer on the user's plan for today, with beat, visit status and dwell time where available. This list loads automatically.
2. Below it sits a single button, **"Get my action plan"**. Nothing is sent to the AI until the user presses it — this is an explicit, on-demand action, not a background job.
3. On press, the server recomputes three risk signals over a 90-day history for exactly those retailers, then asks the AI to turn the numbers into a short, friendly briefing that opens with a greeting by name.
4. The result renders as markdown inside the panel.

The three signals are:

| Signal | Definition |
|---|---|
| **Churn risk** | No confirmed order across the retailer's last 3 completed visits. |
| **Low productivity** | Strike rate = confirmed orders ÷ completed visits, over 90 days; the weakest performers surface. |
| **High dwell time** | Average `check_out_time − check_in_time`, flagging where disproportionate time is spent. |

---

## 2. End-to-end workflow

```text
Panel mounts
    |
    v
useTodaysVisitRetailers()   [client, RLS-scoped]
    visits where user_id = me AND planned_date = today, limit 100
    -> retailers lookup for names/beats
    -> dwell minutes computed client-side from check_in/check_out
    -> renders the retailer list  (NO AI involved)

User presses "Get my action plan"
    |
    v
useVisitActionPlan.generate()
    - AbortController armed at 45 s
    - session access token read
    - POST {VITE_SUPABASE_URL}/functions/v1/copilot-visit-actions  body {}
    |
    v
=============  EDGE: copilot-visit-actions  =============
 1. Bearer header required            -> else 401 unauthorized
 2. TOGETHER_API_KEY required         -> else 500 server_misconfigured
 3. anon client bound to caller JWT; getClaims(token) -> userId
 4. Load profile (display name for the greeting)
 5. Today's visits for this user  -> if none: 200 { empty: true }
 6. Retailer master for those ids (name, beat_name)
 7. 90-day history load for those retailers only:
       visits  (completed, with timestamps)
       orders  (confirmed, joined by visit/retailer)
 8. Deterministic computation:
       churn      = 0 confirmed orders across last 3 completed visits
       strikeRate = confirmed orders / completed visits
       dwellAvg   = mean(check_out - check_in) minutes
 9. Build a compact facts block (only retailers that triggered a signal)
10. streamChat() -> Together.ai
11. Token stream is ACTIVELY DRAINED while awaiting fullText
12. 200 application/json { plan, empty:false, date, retailers[] }
=========================================================
    |
    v
VisitActionPlan renders plan via ReactMarkdown
```

**Note the transport difference from Copilot Chat:** this endpoint returns a single JSON document, not SSE. The stream exists only inside the function.

---

## 3. Component inventory

| File | Role |
|---|---|
| `components/panel/CopilotUtilityPanel.tsx` | Right rail container. Renders the orders chart, the bilingual Ticket Assistant, and mounts `<VisitActionPlan />` beneath them. |
| `components/panel/VisitActionPlan.tsx` | Presentational. Renders the retailer list, the generate button (label toggles to "Preparing your plan…"), the error line, and the markdown plan. Holds no data logic. |
| `hooks/useTodaysVisitRetailers.ts` | Client-side load of today's visits + retailer names; computes dwell minutes; cancellation-safe via a `cancelled` flag. Errors degrade to an empty list. |
| `hooks/useVisitActionPlan.ts` | On-demand fetch of the plan. Owns `plan / loading / error` and the 45 s abort timer. |
| `supabase/functions/copilot-visit-actions/index.ts` | All signal computation and AI narration (~244 lines). |
| `supabase/functions/copilot-visit-actions/config.ts` | Model and limit constants (a duplicate of the chat agent's config). |
| `supabase/functions/copilot-visit-actions/services/togetherClient.ts` | Shared streaming client implementation. |

---

## 4. AI architecture

**Provider:** Together.ai chat completions.
**Model:** `meta-llama/Llama-3.3-70B-Instruct-Turbo` (same as chat; separate config file).
**Prompting:** a single system message setting the persona ("friendly Indian field-sales coach"), a strict instruction to use only the supplied facts, a required greeting of the form *"Hi &lt;name&gt;, I have gathered some action plan for your today's visit…"*, and a length constraint expressed in prose. One user message carries the computed facts block.
**Streaming:** used internally for latency and watchdog behaviour, then flattened to a single string before the JSON response.

### Division of labour — this is the important architectural point

| Stage | Executed by | Notes |
|---|---|---|
| Which retailers are on today's plan | SQL | No AI |
| Churn / strike rate / dwell time | SQL + TypeScript arithmetic in the edge function | **Fully deterministic.** The AI never computes a number. |
| Ranking and thresholding of signals | Edge function | Deterministic |
| Wording, tone, ordering of advice, next steps | Together.ai | **Narration only** |

Consequently the plan's *figures* are reproducible and auditable; only its *prose* is model-generated. A model failure degrades the feature to "no briefing", never to "wrong numbers".

---

## 5. Data sources and access model

Tables read: `profiles`, `visits`, `retailers`, `orders`.

- Everything runs through the anon Supabase client constructed with the caller's `Authorization` header, so **RLS is the sole access boundary** — the function holds no service-role escalation.
- `verify_jwt = true` in `supabase/config.toml`, and claims are validated in code with `getClaims(token)` (the token is passed explicitly; relying on the ambient session was the cause of an earlier 401 regression).
- The history query is bounded twice: to a 90-day window, and to the retailer ids appearing on today's plan.

---

## 6. Operational execution

**Secrets:** `TOGETHER_API_KEY`.

**Timeout budget:**

| Layer | Limit | Behaviour on breach |
|---|---|---|
| Browser (`useVisitActionPlan`) | 45 s `AbortController` | Loading clears; user sees "The action plan took too long to prepare. Please try again." |
| Together client watchdog | 20 s inactivity | Upstream aborted; `upstream_stalled` |
| Supabase edge runtime | 150 s idle | `IDLE_TIMEOUT` 504 (now unreachable in normal operation — see below) |

**Resolved incident — stream deadlock.** An earlier revision awaited `stream.fullText` without reading `stream.tokens`. Because the client is pull-based, nothing pulled, no bytes were consumed, and the request sat until the platform's 150 s `IDLE_TIMEOUT`; the UI stayed on "Preparing your plan…" the whole time. Two fixes are present in the current code and both are required:

1. **Server:** a `drainTokens` reader loop runs concurrently and is awaited alongside `fullText` via `Promise.all`, so the stream is always consumed (`index.ts` ~L210–219).
2. **Client:** the 45 s abort ensures the UI can never be held hostage by an upstream stall, regardless of server behaviour.

**Empty-state contract:** if no visits are planned, the function returns `200 { empty: true }` rather than an error. The hook translates this to the message "No visits are planned for today." — surfaced through the `error` slot, which is why an informational state renders in the destructive style.

**Error handling:** `TogetherError` maps to 429 (rate limited) or 502 (provider failure); anything else returns 500 with the raw error message. All failures are logged with a `[copilot-visit-actions]` prefix.

**Cost profile:** one model call per button press, per user, per day at most in normal use. The retailer list itself costs nothing beyond two client queries.

---

## 7. Observations and limitations (no fixes applied)

1. **Server error messages are passed through verbatim** on the 500 path (`err.message`) and rendered in the UI. This can leak internal detail; chat's endpoint uses fixed codes instead.
2. **The empty state uses the error channel.** "No visits planned today" appears as destructive-styled text, which reads as a failure to the user.
3. **No caching or memoisation.** Pressing the button twice runs the full 90-day computation and a second billed model call; the result is not persisted anywhere, so it is lost on page reload.
4. **Duplicated infrastructure.** `config.ts` and `services/togetherClient.ts` are copies of the chat agent's files. A model or watchdog change must be applied twice, and the two can silently drift.
5. **The plan is not stored.** Unlike chat messages, there is no row written — no history, no audit trail of what advice was given, and no way to measure whether the advice was acted on.
6. **Fixed 90-day lookback and implicit thresholds.** The window and the "last 3 visits" churn rule are hardcoded; they are not configurable per company or per role.
7. **Two `visits` queries per session.** The client loads today's visits for the list and the function independently reloads them for the computation. They can disagree if data changes between the two calls.
8. **Language.** The narration prompt targets English with an Indian sales register; unlike the chat agent it has no instruction to mirror the user's language, so a Hindi-preference user still receives an English briefing.
9. **The 45 s client abort is shorter than a worst-case cold start plus generation.** A slow but ultimately successful run will be discarded client-side while the server continues and is still billed.

---

## 8. Appendix — file map

```text
src/modules/copilot/
  components/panel/CopilotUtilityPanel.tsx   mounts the section
  components/panel/VisitActionPlan.tsx       presentation only
  hooks/useTodaysVisitRetailers.ts           today's list (client, RLS)
  hooks/useVisitActionPlan.ts                on-demand plan fetch + 45s abort

supabase/functions/copilot-visit-actions/
  index.ts            ~244 lines  auth, 90-day signals, narration, JSON response
  config.ts             11 lines  MODEL / URL / limits (duplicate of chat config)
  services/togetherClient.ts      streaming client (duplicate of chat client)
```

Key line anchors in `index.ts`: auth + `getClaims` at the top of the handler; today's-visit load and the `empty` short-circuit in the middle; signal computation before prompt assembly; `drainTokens` + `Promise.all` at ~L210–219; response assembly at ~L221–235; error mapping at ~L236–244.

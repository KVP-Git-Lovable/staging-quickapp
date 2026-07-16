## Audit: what hits Together.AI today vs. what's answered locally

The `copilot-agent` edge function (`supabase/functions/copilot-agent/index.ts`) runs a regex-based `classifyDataIntent()` on every incoming user message. If it matches one of six intents, the response is generated **locally from SQL** and streamed back as a static string. Together.AI is **never called** for those. Everything else falls through to `streamChat()` and hits Together.AI (`openai/gpt-oss-20b`, defined in `config.ts`).

### Prompt card → current routing

| Prompt card (label / subtitle) | Sent text | Matched intent | Where the answer comes from |
|---|---|---|---|
| Leave balance / Check remaining days | "What is my leave balance?" | `leave` | **Local SQL** (`leave_balance` + `leave_types`). No LLM call. |
| Attendance this month / Days present, late, missed | "Show my attendance this month." | `attendance` | **Local SQL** (`attendance`). No LLM call. |
| Last 3 beats / Summarise recent coverage | "Summarise my last three beats." | `beats` | **Local SQL** (`beats` + best-effort `retailers`/`visits`/`orders`). No LLM call. |
| Pending collections / Retailers with dues | "Show pending collections." | `collections` | **Local SQL** (`retailers.pending_amount`). No LLM call. |
| Plan today's visits / Prioritise retailers | "Help me plan today's visits." | `visits` | **Local SQL** (`visits` + `retailers`). No LLM call. |
| Today's targets / What I need to hit | "Explain today's targets." | `targets` | **Local SQL** (`user_period_targets` + `target_kpi_definitions`). No LLM call. |
| Any free-typed question that doesn't match the regexes | user text | none | **Together.AI** streaming call. |

So all six prompt cards currently short-circuit before the model. The user's session id, profile, and message history are still loaded, but `streamChat` is only invoked in the `else` branch (line 453).

Side note: `useTextAssistant.ts` uses ElevenLabs (voice text agent), which is a separate integration and unrelated to Together.AI.

## Proposed change: route prompt cards through Together.AI, using SQL as grounding context

Goal: keep the accuracy of live SQL data, but let Together.AI phrase the answer so tone/formatting is consistent with free-typed questions.

### Approach

1. **Keep** `classifyDataIntent()` and the six `*Answer()` SQL functions in `supabase/functions/copilot-agent/index.ts`. They already produce clean, RLS-scoped facts.
2. **Change the branch at lines 442–454** so that when an intent matches, instead of returning `staticStream(sqlAnswer)`:
   - Run the SQL function to produce a compact "data block" (markdown/JSON facts).
   - Append a synthetic `system` (or `user`-role tool-result) message to the `messages` array containing that data block, wrapped with an instruction like: *"Use only the following authoritative data from the user's workspace to answer. Do not invent numbers."*
   - Call `streamChat({ apiKey, messages })` as normal so Together.AI generates the final answer.
3. **Fallback**: if the SQL call throws, send the user's message to Together.AI without a data block plus a note that live data was unavailable (so the model can respond gracefully instead of a static error string).
4. **No schema, no client, and no UI changes.** Prompt cards, sidebar, and utility panel remain as-is.

### Technical notes

- File touched: `supabase/functions/copilot-agent/index.ts` only.
- Model, streaming, SSE format, and persistence stay unchanged — the assistant reply Together.AI streams is what gets saved (already handled after line 454 in the existing code).
- Token cost: each of the six intents will now consume Together.AI tokens per call. The data block is small (tens of rows max) so it fits comfortably in the current 4096 `max_tokens` budget.
- Latency: adds one LLM round-trip (~1–3s streamed) on top of the SQL query.
- Grounding rule in the injected block prevents the model from hallucinating leave days / target numbers.

### Out of scope

- No changes to regex intents themselves (we can broaden them later).
- No changes to the ElevenLabs voice path.
- No changes to Copilot UI, sidebar insights, or utility panel.

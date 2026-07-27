## Root cause analysis (what the evidence shows, and what it does not)

### Verified facts

**1. The failure is deterministic by intent, not intermittent.** Querying `copilot_messages` shows every user question is saved, but only some get an assistant row:

| Prompt | Intent | Assistant reply saved? |
|---|---|---|
| "What is my leave balance?" (11:08:27) | `leave` | Yes, 2s later |
| "Explain today's targets." (11:13:30) | `targets` | Yes, 1s later |
| "Show pending collections." (11:13:20) | `collections` | **No row at all** |
| "Summarise my last three beats." (11:13:34, 11:28:29) | `beats` | **No row at all** |
| "Help me plan today's visits." (11:08:37, 11:25:33) | `visits` | **No row at all** |

So it is not random: the two intents that return a short data block succeed, the three that build larger multi-row markdown blocks fail every time.

**2. The worker dies silently — no exception is ever thrown.** `copilot-agent` logs for the failing window contain only:

```
11:28:29 booted   (two boots — the CORS preflight boots its own isolate)
11:28:52 shutdown
```

There is no `[copilot-agent] stream error`, no `together error`, no `fatal`. Every catch path in `index.ts` logs before returning, so the absence of any log means **no catch ran**. The isolate was torn down ~23 seconds into the request while awaiting the stream. That also explains the UI: the browser had received a couple of deltas ("You…"), the socket then closed with no `[DONE]` and no error frame.

**3. Because of the ordering in `index.ts`, a torn-down worker loses everything.** Lines 519–521 do `await stream.fullText` → `persistAssistant(...)` → only then enqueue `[DONE]`. Nothing is written until the *entire* answer is complete, which is precisely why the failing prompts leave zero assistant rows despite text having reached the screen.

**4. `MODEL` is `meta-llama/Llama-3.3-70B-Instruct-Turbo`, not `openai/gpt-oss-20b`.** `config.ts` carries an explicit warning against gpt-oss because it streams a long private reasoning phase before any content. The DB confirms Llama is what actually served the successful replies. Worth correcting in your mental model of the system.

### Honest statement of the diagnosis

The *symptom* is fully localized: the Supabase isolate is terminated mid-stream, before any application error handler runs. What I have **not** yet proven is why — the two candidates the current logging cannot distinguish are (a) Together.ai stalling or holding the connection open on those particular prompts until the edge runtime's wall-clock budget elapses, and (b) the request exceeding the runtime budget for an unrelated reason. Notably the data volumes are tiny here (19 pending retailers, 2 visits today, 33 beats), so a "too much data" explanation does not hold — which makes an upstream stall the stronger candidate, but I will not assert it as fact without the instrumentation below.

There are also three defects visible in the code that are real regardless of which candidate wins, and that convert a recoverable hiccup into total data loss:

- **Nothing is persisted until the stream fully completes**, so any interruption discards text the user already saw.
- **No heartbeat and no upstream timeout.** `streamChat` passes no `AbortSignal` from the request and sets no deadline, so a stalled upstream is indistinguishable from a slow one and simply runs until the isolate is killed.
- **The single-shot continuation retry** in `togetherClient.ts` silently issues a *second* full upstream request on a premature EOF, roughly doubling the time budget before the user sees anything — likely making the teardown more probable, not less.

## Plan

### Phase 1 — Diagnostics (temporary, removable)

Add a `[copilot-diag]` tagged, request-correlated log trail so the exact interruption point becomes unambiguous:

- **`togetherClient.ts`**: log upstream HTTP status and response headers on open; count raw SSE frames, content deltas, and total characters; log `finish_reason`, whether `[DONE]` was seen, whether the continuation retry fired, and total upstream duration.
- **`index.ts`**: log the classified intent, data-block character length, total prompt message count, deltas forwarded to the browser, and a timestamped marker at each of stream-open / first-delta / last-delta / fullText-resolved / persisted / `[DONE]`-sent.
- **`copilotService.ts`**: count frames received, log whether `[DONE]` arrived, and log the reader's terminal state.
- Emit a `data:` heartbeat comment every 10s so we can see from the client side whether the connection is alive but idle (upstream stall) versus dropped.

Run each of the five prompts once and compare the three counts (upstream → edge → browser). That triangulates the cut point definitively.

### Phase 2 — Fixes that stand regardless of the diagnosis

1. **Persist incrementally, not only on completion.** Insert the assistant row as soon as the first delta arrives, then update its `content` periodically (every ~750ms or ~200 chars) and once more on close. A killed isolate then leaves the partial answer in the database instead of nothing, and the UI reload matches what the user saw.
2. **Send `[DONE]` semantics correctly.** Move persistence off the critical path of the terminal event, and always emit a terminal frame — `[DONE]` on success, a typed error frame on failure — using a `finally` block so no path can close the stream silently.
3. **Add an upstream deadline and forward the abort signal.** Pass `req.signal` into the Together fetch and apply an explicit inactivity timeout (no delta for N seconds → abort, emit a typed `upstream_stalled` error frame, persist what we have). This converts a silent 23-second death into a visible, actionable error in under 10.
4. **Add SSE heartbeats** (`: keep-alive` comments) so proxies never see an idle connection, and so the client can distinguish "thinking" from "dead".
5. **Make the continuation retry conditional and logged.** Only retry on `finish_reason === "length"`, never on a premature EOF (where it doubles the time budget for no benefit), and surface a visible notice when it fires.
6. **Client: treat a missing `[DONE]` as a recoverable error with the partial text kept.** `copilotService.ts` already throws `stream_incomplete`; make `useCopilotChat` retain the streamed text and append a "response was interrupted — retry?" affordance rather than leaving the bubble ambiguous.

### Phase 3 — Validate

Re-run all five prompts and confirm: identical delta counts at all three layers, `[DONE]` observed client-side, an assistant row present for every prompt, and a deliberately-stalled upstream producing a visible error within the timeout instead of a silent stop. Then strip the Phase 1 logging down to a small permanent set (intent, delta count, finish reason, duration).

### Open question

Do you want me to also switch the model, or keep `meta-llama/Llama-3.3-70B-Instruct-Turbo`? Your request describes `openai/gpt-oss-20b`, which the codebase deliberately moved away from because its reasoning phase delays the first visible token. My recommendation is to keep Llama and fix the streaming layer — but if you want gpt-oss back, the fixes above are a prerequisite, not an alternative.

## Root cause confirmed

The issue is isolated to `copilot-visit-actions`:

- `streamChat()` returns a **pull-based** `ReadableStream` plus a `fullText` promise.
- The action endpoint awaits only `stream.fullText` (`supabase/functions/copilot-visit-actions/index.ts:208–209`) but never reads `stream.tokens`.
- Because the token stream is never consumed, its `pull()` handler never runs, Together.ai response chunks are never drained, and `fullText` never resolves.
- The inactivity watchdog aborts the upstream request after 20 seconds, but without an active stream read the action can remain unresolved until Supabase terminates it at the 150-second `IDLE_TIMEOUT`.
- The frontend correctly resets loading in `finally`, but only after the network request ends, so it displays “Preparing your plan…” for the entire timeout.

## Scoped implementation

1. **Drain the Together stream in the action-plan function**
   - Update only `supabase/functions/copilot-visit-actions/index.ts` to actively consume `stream.tokens` while collecting `stream.fullText`.
   - Propagate stream/provider errors so the function returns promptly instead of leaving the request pending.
   - Do not change the shared/general Copilot Chat endpoint or its behavior.

2. **Add an action-plan-only client timeout**
   - Add an `AbortController` timeout in `useVisitActionPlan.ts` so this sidebar action cannot remain in a loading state indefinitely if the edge/network layer stalls.
   - Convert abort/provider failures into a concise retry message and preserve the existing `finally` loading reset.

3. **Validate the exact path**
   - Deploy only `copilot-visit-actions`.
   - Run a real authenticated request and confirm it returns either a completed plan or a controlled error well before 150 seconds.
   - Verify the sidebar button exits “Preparing your plan…” and that the existing Copilot Chat flow remains untouched.
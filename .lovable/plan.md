## Fix two Copilot chat regressions

### Issue 1 — Composer is unresponsive after the first response

Root cause candidates in `useCopilotChat.ts` + `ChatComposer.tsx`:

- `send()` guards on `status === "submitting" | "streaming"`, but `status` is captured in the `useCallback` closure via deps. If the stream ends with `finish_reason=length` or the SSE connection closes without a proper `[DONE]` (Deno edge → browser proxy buffering can cause this), the client's `while (!completed)` loop exits but `status` may never transition back to `"idle"` cleanly, leaving `isBusy=true` and the Send button permanently disabled.
- Additional edge case: `catch (err) { if (controller.signal.aborted) return; }` returns without resetting `status`, so a mid-stream abort leaves status stuck.

Fixes in `src/modules/copilot/hooks/useCopilotChat.ts`:
1. Replace the `status`-based reentry guard with a pure `sendingRef` guard so a stale/stuck status can never block a new send.
2. Always transition `status` to `"idle"` in the `finally` block (only keep `"error"` if we actually set an error message). This guarantees the composer re-enables after any stream outcome, including aborts and provider-side hangs.
3. Guarantee the assistant message's `streaming: false` flag is set in `finally` too, so message list never stays in a phantom "typing" state.

Fix in `src/modules/copilot/components/chat/ChatComposer.tsx`:
4. Keep the send button clickable independent of `status`; rely on the hook's re-entry guard to drop duplicates. This makes the UI resilient even if the parent's `isBusy` becomes stale.

### Issue 2 — Responses truncated mid-sentence ("These dishes…")

Root cause in `supabase/functions/copilot-agent/services/togetherClient.ts`: `max_tokens: 1024` is too small for open-ended questions (like "best local food in Mangaluru"). Together returns `finish_reason: "length"` and the stream ends abruptly. We already log this but never act on it.

Fixes:
1. Raise `max_tokens` to `2048` (safe headroom for grounded answers + free-form replies while still bounding worst-case latency).
2. When `finish_reason === "length"`, append a short markdown notice (`\n\n_…response truncated. Ask me to continue._`) to the stream so the user sees clearly that the answer was cut, instead of a silent mid-sentence stop.
3. Keep the console warning for observability.

### Files touched
- `src/modules/copilot/hooks/useCopilotChat.ts`
- `src/modules/copilot/components/chat/ChatComposer.tsx`
- `supabase/functions/copilot-agent/services/togetherClient.ts`

### Verification
- Send "Summarise my last three beats", wait for full response, then send a second question in the same thread — composer must accept and send it.
- Ask "What is the best local food in Mangaluru?" — full answer should render; if it still hits the cap, the truncation notice appears at the end.

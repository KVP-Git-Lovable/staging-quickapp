## Goal
Make Copilot prompt cards produce one complete answer, remove duplicate/hanging questions, and answer from the signed-in user’s live QuickApp data.

## Confirmed causes
- Together.ai reasoning tokens are currently treated as answer text. GPT-OSS returns private reasoning separately from final `content`.
- Both server and browser stream parsers can discard the final buffered SSE frame, cutting replies off mid-sentence.
- Prompt-card submission has no synchronous lock, so rapid clicks can insert duplicate user messages before React updates the busy state.
- Initial conversation creation can run twice under React StrictMode.
- The Edge Function currently reads only profile and chat history. It has no queries or tools for leave, attendance, targets, beats, visits, or collections.

## Implementation

### 1. Correct Together.ai streaming
- Update `togetherClient.ts` to emit only `delta.content`; never expose `reasoning` or `reasoning_content` as the user-facing answer.
- Use GPT-OSS-compatible parameters: explicit `reasoning_effort`, sufficient `max_tokens`, and supported sampling values.
- Track `finish_reason`; log and return a clear error if the provider ends because of a token limit before producing final content.
- Flush the decoder and any remaining SSE frame before closing the stream.
- Apply the same residual-frame handling in `copilotService.ts` so the browser cannot lose the final token block.

### 2. Prevent duplicate questions
- Add a synchronous `useRef` send lock in `useCopilotChat`; acquire it before optimistic insertion and release it in `finally`.
- Make the prompt-card/imperative composer path obey the same disabled and empty-input checks as typed submission.
- Add a StrictMode-safe bootstrap guard in `CopilotPage` so one empty account creates only one conversation.
- Collapse identical consecutive legacy user messages while rendering so existing duplicated prompts no longer appear twice; retain non-duplicate failed turns.

### 3. Ground prompt-card answers in Supabase
Add read-only, server-side data handlers for the six existing cards:
- **Leave balance:** current-year `leave_balance` joined with active `leave_types`.
- **Attendance this month:** signed-in user’s current-month attendance summary.
- **Last 3 beats:** latest three accessible beat/visit records, respecting existing beat access and RLS.
- **Pending collections:** accessible outstanding retailer collections only.
- **Plan today’s visits:** today’s accessible visits/beat plan with concise prioritization context.
- **Today’s targets:** current target period and progress for the signed-in user.

The Edge Function will:
- Query with the caller’s bearer token, never service-role access, so existing RLS remains authoritative.
- Route card prompts and close paraphrases to the matching read handler.
- Return compact, deterministic Markdown for simple factual requests such as leave balance.
- Supply bounded query results to the model only when summarization or planning is useful.
- Return an explicit “no data configured” response for empty results instead of inventing values.
- Check and log every Supabase query and persistence error.

### 4. Keep history consistent
- Persist exactly one user message before processing and one completed assistant message after successful completion.
- Do not save private reasoning.
- Ensure errors do not leave a permanent typing indicator; replace it with a retryable error state.
- Preserve complete conversation history within the configured limit for follow-up context.

### 5. Validate and deploy
- Test all six prompt cards against live, RLS-scoped data.
- Double-click a prompt card and verify only one user row and one assistant row are created.
- Verify “What is my leave balance?” returns the current user’s actual leave rows and a complete final sentence/table.
- Test an empty-data user and confirm a truthful empty state.
- Verify the last SSE frame is rendered and persisted identically.
- Deploy the updated `copilot-agent` Edge Function and inspect its logs for provider, query, truncation, or persistence errors.
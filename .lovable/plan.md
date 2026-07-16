## Together.ai integration audit

I checked our implementation in `supabase/functions/copilot-agent/services/togetherClient.ts` and `config.ts` against the docs you pasted. Overall the integration is correct and compliant with Together's OpenAI-compatible Chat Completions API. One small modernization is worth doing; everything else is intentional.

### What matches the docs ✅

| Docs requirement | Our code |
|---|---|
| `Authorization: Bearer <TOGETHER_API_KEY>` | `Authorization: Bearer ${apiKey}` (line 35) |
| API key from env `TOGETHER_API_KEY` | Read from Supabase secret and passed in |
| `POST /v1/chat/completions` | ✅ |
| Body: `model`, `messages[{role,content}]`, `stream:true` | ✅ (plus `temperature: 0.4`) |
| SSE parsing: `data: {json}\n\n`, ignore `[DONE]` | ✅ |
| Delta extraction from `choices[0].delta.content` | ✅ |
| Reasoning-model support (`reasoning` / `reasoning_content` fields) | ✅ (added last turn to fix "three dots" bug) |
| Error handling for 401/403/429/5xx | ✅ mapped to `provider_auth`/`rate_limited`/`provider_upstream` |

### One recommended change

**Base URL**: docs now show `https://api.together.ai/v1`. We use `https://api.together.xyz/v1` (the older host — still works, but `.ai` is the current canonical). Swap to align with docs.

```diff
- export const TOGETHER_URL = "https://api.together.xyz/v1/chat/completions";
+ export const TOGETHER_URL = "https://api.together.ai/v1/chat/completions";
```

### Intentional deviations (leave as-is)

- **Model**: we use `openai/gpt-oss-20b` (your spec). Docs example uses `MiniMaxAI/MiniMax-M3` — just an example, not required.
- **We merge `reasoning*` into the output stream** rather than surfacing it in a separate UI field. This was the fix for the "three dots forever" issue on the leave-balance prompt. Docs describe them as separate; our merge is deliberate for UX.
- **No `response_format` / structured output / vision**: we don't need them for the current chat surface.
- **Raw `fetch` instead of the official SDK**: correct for Deno edge functions — the Node SDK isn't appropriate here.

### Files to change

- `supabase/functions/copilot-agent/config.ts` — update `TOGETHER_URL` host from `.xyz` to `.ai`.

No other changes needed. This is unrelated to the current `conversation_not_found` 404 you were debugging — that's an RLS/grant issue, not a Together client issue.

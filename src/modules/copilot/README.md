# QuickApp Copilot — Phase 1 (Foundation)

Enterprise chat assistant powered by Together.ai Serverless Inference.

## Setup

1. Ensure the Supabase secret `TOGETHER_API_KEY` is configured (project Settings → Secrets).
2. The route `/copilot` is registered in `src/App.tsx`. A "Copilot" entry appears in the top navigation.
3. Edge function `supabase/functions/copilot-agent` deploys automatically. `verify_jwt = true` (see `supabase/config.toml`).

## Architecture

```
Browser  →  src/modules/copilot/services/copilotService.ts  (fetch + SSE parser)
             │  POST /functions/v1/copilot-agent  (Bearer JWT)
             ▼
Edge Fn  →  supabase/functions/copilot-agent/index.ts
             ├─ auth (getClaims)
             ├─ zod validate
             ├─ load history (copilot_messages)
             ├─ services/togetherClient.ts → Together.ai stream
             └─ persist assistant message on stream close
```

## Files

- `pages/CopilotPage.tsx` — two-pane layout (sidebar + chat).
- `components/sidebar/ConversationSidebar.tsx` — threads list, new chat, delete, search placeholder.
- `components/chat/ChatWindow.tsx` — welcome + prompt cards or message list + composer.
- `components/chat/{MessageList,MessageBubble,ChatComposer,TypingIndicator,WelcomeHeader}.tsx` — chat surface.
- `components/cards/PromptCardGrid.tsx` — six placeholder prompt cards.
- `hooks/useConversations.ts` — CRUD over `copilot_conversations`.
- `hooks/useCopilotChat.ts` — streaming state machine (idle → submitting → streaming).
- `services/copilotService.ts` — Edge Function client with SSE reader + friendly error mapping.
- `prompts/promptCards.ts` — card definitions (edit here to change prompts).
- `utils/sanitize.ts` — input trim + `MAX_INPUT_CHARS`.

## Model

Configured in **one place**: `supabase/functions/copilot-agent/config.ts` → `MODEL = "openai/gpt-oss-20b"`.
Swap to any Together.ai Serverless model by editing that constant.

## Database

Reuses existing tables (no migration needed):

- `copilot_conversations` — `id, user_id, title, created_at, updated_at, last_message_at, is_pinned, is_archived`.
- `copilot_messages` — `id, conversation_id, user_id, role, content, created_at, model`.

Both tables already have RLS scoped to `auth.uid()` / conversation ownership.

## Security

- `TOGETHER_API_KEY` is read only inside the Edge Function via `Deno.env.get`.
- JWT is verified in-code (`supabase.auth.getClaims`) even though `verify_jwt = true`.
- Request body is zod-validated; input is trimmed and capped at 4000 chars.
- All conversation/message access goes through RLS.

## Extension points (Phase 2+)

- **Tool calling** — add tool schemas and a dispatch loop around `streamChat` in `index.ts`, plus a `tool` role branch in `useCopilotChat`.
- **RAG** — inject retrieved chunks into the system prompt via a new `buildSystemPrompt` section.
- **Voice / analytics / charts / images** — new component subtrees under `components/`.

## Not yet implemented (out of scope for Phase 1)

Tool calling, RAG/embeddings, voice, analytics, charts, image generation, proactive nudges.

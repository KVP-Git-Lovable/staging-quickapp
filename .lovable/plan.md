
# Madad Help Assistant — Bolna Webhook

Isolated addition to the Bolna ecosystem. No existing agent, edge function, or table is touched.

## 1. Database (single migration)

**`quickapp_help_articles`** — knowledge base
- `id uuid pk`
- `module text not null` (Attendance, Add Retailer, Order Entry, GPS, Regularization, Beat, Login, Sync, Expenses…)
- `title text not null`
- `keywords text[] not null default '{}'` (multi-lingual: Kannada, English, transliterations)
- `language text not null default 'kn'` (kn / en / hi)
- `steps text[] not null default '{}'` (voice-friendly ordered guidance)
- `content text` (optional long form)
- `priority int default 0`
- `is_active bool default true`
- `created_at`, `updated_at` + trigger
- Indexes: GIN on `keywords`, GIN `to_tsvector('simple', title || ' ' || coalesce(content,''))` for text search, btree on `module`, `language`.

RLS: read for `authenticated` + `anon` (webhook uses service role but keep readable for admin UI later). No public write.

**`quickapp_help_logs`** — analytics
- `id uuid pk`
- `agent_id text`
- `caller_phone text`
- `detected_module text`
- `detected_intent text`
- `article_id uuid null references quickapp_help_articles(id) on delete set null`
- `question text`
- `language text`
- `answered bool default false`
- `created_at`
- RLS: insert allowed from service role only; select for admins (via `has_role`).

**`quickapp_help_agents`** — agent registry (future scalability)
- `agent_id text pk` (Bolna agent id)
- `name text not null` (e.g., "Madad", "Madad English", "Hindi Help Assistant")
- `default_language text not null default 'kn'`
- `is_active bool default true`
- `notes text`
- Seed row: `('af3cbfa9-7913-48ff-b6c1-d80e24b2bd4b', 'Madad', 'kn', true, 'Kannada QuickApp help agent')`.

GRANTs + RLS + `service_role` full access on all three.

Seed initial articles for common modules: Attendance (GPS/data failure), Add Retailer, Order Entry, Beat management, Regularization, Sync/Offline, Login, Expenses — each in both Kannada and English with the exact voice-style `steps` from the spec.

## 2. New Edge Function — `bolna-help-webhook`

Path: `supabase/functions/bolna-help-webhook/index.ts`. Registered in `supabase/config.toml` with `verify_jwt = false` (Bolna cannot send a Supabase JWT). Deployed as a standalone function; nothing else edited.

### Request handling
- Accept `POST` (+ `OPTIONS` for CORS via `npm:@supabase/supabase-js@2/cors`).
- Validate body with zod:
  ```
  { agent_id?: string, caller_phone?: string, phone?: string,
    question: string (1..1000), language?: 'kn'|'en'|'hi' }
  ```
- Reject empty question with `400`.
- Look up `agent_id` in `quickapp_help_agents`. If unknown/inactive → fallback response (still logged).

### Matching pipeline (DB-driven, no if/else)
1. Normalise question: lowercase, strip diacritics for latin, keep original for indic.
2. Detect language: use provided `language`; else infer from Unicode block (Kannada block 0C80–0CFF → `kn`, Devanagari → `hi`, else `en`). Default to agent's `default_language`.
3. Candidate search across active articles:
   - Keyword hit: `keywords && normalised_tokens` (array overlap).
   - Full-text: `websearch_to_tsquery('simple', question)` against title + content.
   - Fuzzy: `pg_trgm` similarity on `title` (enable extension in migration).
4. Score = keyword_hits * 3 + fts_rank * 2 + trgm_similarity + language_match_bonus + priority.
5. Pick top article; if score < threshold → fallback.

Implemented via one RPC `match_help_article(p_question text, p_language text)` returning ranked rows — keeps SQL out of the edge function.

### Response shape
Success:
```
{ "success": true, "module": "...", "title": "...", "steps": [...],
  "language": "kn", "article_id": "..." }
```
Fallback (unknown / low score / unknown agent):
```
{ "success": false, "fallback": true,
  "message": "ಈ ಪ್ರಶ್ನೆಗೆ ನನಗೆ ಈಗ ಉತ್ತರ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ನಿಮ್ಮ Administrator ಅಥವಾ Supervisor ಅವರನ್ನು ಸಂಪರ್ಕಿಸಿ." }
```
Fallback message localised per detected language (Kannada default, English/Hindi variants stored in a small constant map inside the function).

### Logging
Every request writes to `quickapp_help_logs` with detected module/intent, chosen `article_id` (nullable), question, language, `answered = success`. Failures inside logging never break the response.

### Isolation guarantees
- Uses only `quickapp_help_*` tables.
- Never reads retailers, products, orders, CRM.
- No shared code with `bolna-outbound-call`, `voice-*` functions.
- Uses `SUPABASE_SERVICE_ROLE_KEY` from env — no new secrets needed.
- `bolna-outbound-call` and voice-* files remain byte-identical.

## 3. Bolna function payload to paste in the agent

Provided verbatim at the end of the response for the user to paste into Madad's Bolna configuration. URL points to the new function; agent ID kept out of the body since Bolna doesn't inject it — instead we'll add `agent_id` to the param map so the webhook can identify future agents.

## Technical notes

- Extensions enabled: `pg_trgm` (fuzzy) and rely on built-in `tsvector`.
- Threshold tuning: start with score ≥ 2; adjustable via a `quickapp_help_config` row later if needed (not built now — YAGNI).
- All new tables carry `GRANT`s per project convention.
- Function returns 200 for business-level fallbacks so Bolna reads the message; only malformed input returns 400.
- No changes to `src/`, no client UI — this is backend-only.

## Files created / edited

- Migration: three new tables, indexes, `pg_trgm`, `match_help_article` RPC, seed articles, seed agent row.
- `supabase/functions/bolna-help-webhook/index.ts` (new).
- `supabase/config.toml` — append `[functions.bolna-help-webhook] verify_jwt = false` only. All existing entries preserved.

## Out of scope

- Admin UI to CRUD articles (can be added later; seed via SQL for now).
- Embeddings / vector search — keyword + FTS + trigram is sufficient for the initial article set and stays free.
- Any change to existing Bolna agents, outbound calling, or voice order flows.


# Restore Bolna Voice AI Backend (4 Edge Functions)

Backend-only restoration. No UI, schema, or existing function changes. Adds 4 new Supabase Edge Functions previously present but lost.

## Scope

Create these new edge functions (none currently exist):
- `supabase/functions/voice-order-status/index.ts`
- `supabase/functions/voice-recent-orders/index.ts`
- `supabase/functions/voice-product-query/index.ts`
- `supabase/functions/voice-place-order/index.ts`

Register all four in `supabase/config.toml` with `verify_jwt = false` (Bolna cannot send Supabase JWTs).

No DB migration. No changes to `orders`, `order_items`, `retailers`, `products`, or any existing function (incl. `voice-order-parser`, `useVoiceOrder`, `useVoiceAssistant`, etc.).

## Shared module

Create `supabase/functions/_shared/bolna.ts` (helper, not an endpoint) containing:

1. **`parseBolnaPayload(req)`** — implements the exact priority chain from the brief: read `req.text()`, JSON.parse safely, then unwrap `arguments` / `tool_call_arguments` / `function_arguments` (object or stringified). Returns `{ raw, payload }`. Logs `METHOD`, `CONTENT TYPE`, `RAW BODY`, `FINAL PAYLOAD`.
2. **`emptyBodyResponse()`** — returns the documented diagnostic `{ success:false, reason:"Empty request body from Bolna", hint:"Bolna is not passing tool arguments" }`.
3. **`normalizePhone(raw)`** — strips spaces/`+`/dashes/parentheses, handles `+91`, `91`, `0` prefixes, returns last-10-digit variant + original.
4. **`findRetailerByPhone(supabase, phone)`** — queries `retailers` by `phone` using `ilike` against last-10-digits and several normalized forms. Returns retailer row or null. Read-only.
5. **`invalidPhoneResponse()`** — `{ success:false, invalid_phone:true, message:"Phone number not registered" }`.
6. **`buildSearchTerms(name)`** — lowercase, strip punctuation, collapse spaces, produce variants (compact, token list).
7. **`ALIASES`** map seeded with `easy tab → AZITAB`, `veggie tab → VEGITAB`, `value → VAYU`, `vayu → VAYU` (extensible object).
8. **`searchProducts(supabase, query)`** — runs in order: alias hit → `ilike '%q%'` on `products.name` & `sku` → token OR → trigram similarity via `select ... order by similarity(name, q) desc` (falls back to JS Dice-coefficient bigram scoring if `pg_trgm` unavailable). Returns ranked list of `{id, name, sku, score}`.
9. **`json(status, body)`** — CORS-wrapped JSON response helper (uses `npm:@supabase/supabase-js@2/cors`).

CORS preflight (`OPTIONS → 200 ok`) handled in every function.

## Endpoint behavior

All four endpoints:
- POST only (return 405 otherwise, with CORS).
- Use `parseBolnaPayload`; if payload empty → `emptyBodyResponse()`.
- Normalize+validate phone → if no retailer → `invalidPhoneResponse()`.
- Use anon-key Supabase client server-side (`SUPABASE_URL`, `SUPABASE_ANON_KEY` already in env). For place-order writes, use `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS (server-only).
- Always wrap response with CORS headers and `Content-Type: application/json`.

### 1. `voice-order-status`
Fetch latest row from `orders` where `retailer_id = retailer.id` ordered by `created_at desc limit 1`. Return:
```
{ order_id: <invoice_number || short id>, status: <status>, expected_delivery: <human date e.g. "10 May"> }
```
Format `delivery_date` (or `created_at + 3d` fallback) as `"D MMM"`. No orders → `{ error:true, message:"No data found" }`.

### 2. `voice-recent-orders`
Select last 5 orders by retailer. Return:
```
{ count, latest_order_amount, latest_order_status }
```
Empty → `{ error:true, message:"No data found" }`.

### 3. `voice-product-query`
Inputs: `phone`, `query`.
Lightweight intent detection: if query contains "how many"/"kitne"/"count"/"stock" → run `searchProducts(query)`, take top hit, return `{ type:"count", value: closing_stock }`. Else return `{ type:"category", value: "<best match name> available" }`. No match → `{ error:true, message:"No data found" }`.

### 4. `voice-place-order`
Inputs: `phone`, `product_name` (string), `quantity` (number OR array).

Multi-product detection:
- If `product_name` contains ` and ` / `,` / ` & ` / Hindi "aur" → split into N product names.
- If `quantity` is an array, zip with names; if scalar → broadcast to all names.
- Else single product flow.

For each name: `searchProducts`. Per item outcomes:
- 0 hits → mark `{ product_found:false, requested:name }`.
- Top score clearly best (delta >= 0.15 or single high-confidence alias) → resolved.
- Ambiguous (multiple within delta < 0.15) and single-product call → return `{ success:false, multiple_matches:true, matches:[top 3 names] }` immediately.
- Ambiguous in multi-product call → take top hit (avoid blocking the whole order).

If at least one resolved:
- Insert one `orders` row (service-role client). Required minimal fields per existing schema: `retailer_id`, `retailer_name`, `user_id` (use `retailer.user_id` snapshot or `retailer.created_by` — whichever exists; fall back to retailer.id-derived owner), `status:'pending'`, `order_source:'Voice'` (string column, additive value, no enum), `sales_channel:'Voice'`, `order_date: today`, `subtotal/total_amount` from rate*qty, `idempotency_key: 'bolna-' + crypto.randomUUID()`.
- Insert resolved `order_items` rows with mandatory `product_id`, `product_name`, `rate` (from product.rate), `unit` (product.unit), `quantity`, `total`.
- Re-use raw inserts only — does NOT call any existing app code path, does NOT touch inventory/credit/visit logic. (Mirrors prior implementation; matches user constraint "do not modify existing order creation logic" — we are not modifying it, we are inserting raw rows the same way the prior Bolna function did.)

Single-product success response:
```
{ success:true, product_found:true, product_name, product, quantity, order_id }
```
Multi-product success:
```
{ success:true, multi_product:true, order_id, items:[{product, quantity}, ...], failed:[...] }
```
All products failed → `{ success:false, product_found:false, message:"Product not found" }`.

## Bolna config compatibility

- `verify_jwt = false` ensures Bolna's tool POST (no Supabase auth header) reaches the function.
- Parser accepts every payload shape listed in the brief, including stringified `arguments`.
- All required debug logs emitted on every request for log-based troubleshooting.

## Performance

- One retailer lookup + at most one product query per call.
- Product search uses indexed `ilike` first; trigram only as ranker on small candidate set (limit 25).
- Target <2s easily met (no AI calls, no external fetches).

## Acceptance checks (post-deploy, via `supabase--curl_edge_functions`)

1. `voice-place-order` with `{phone:"+919741435887", product_name:"easy tab", quantity:5}` → AZITAB resolved, order created.
2. Same with `product_name:"vayu"` → VAYU 30G resolved.
3. Multi: `{product_name:"KADAK GOLD and VAYU", quantity:[5,10]}` → single order, two items.
4. Unknown phone → `{ invalid_phone:true }`.
5. Empty body POST → `{ reason:"Empty request body from Bolna" }`.
6. Bolna wrapper variants (`arguments` object, `arguments` stringified, `tool_call_arguments`) all parse identically.

## Out of scope (explicitly not touched)

- `voice-order-parser`, `report-voice-assistant`, ElevenLabs functions, `useVoiceOrder`, `useVoiceAssistant`, any UI component, any DB table/column/RLS, existing order creation flows (`useOfflineOrderComplete` etc.), inventory ledgers, credit ledger, notifications.

# QA Build Workflow

This project ships **two APKs from one codebase**: a production APK that writes to the live tables, and a QA APK that writes to mirrored `qa_*` tables in the same Supabase project. Both APKs share the same business logic, the same Supabase URL, and the same anon key.

---

## 1. The two-step rule (read this first)

Vite **statically bakes** `import.meta.env` variables into the compiled JS bundle at build time. Android Studio wraps already-compiled assets — it cannot change Vite variables after compilation.

So the workflow is always two steps, in this order:

1. **Terminal first** — compile with the right mode and sync to Android:
   - `npm run sync:qa`   → builds with `.env.qa`, syncs to `android/`
   - `npm run sync:prod` → builds with `.env.production`, syncs to `android/`
2. **Android Studio second** — pick the matching Build Variant, then Build APK:
   - After `sync:qa`  → `qaDebug` or `qaRelease`
   - After `sync:prod` → `prodDebug` or `prodRelease`

Skipping Step 1 will bundle stale or wrong web assets into the APK.

---

## 2. Build commands

### QA APK
```bash
npm run sync:qa
# then in Android Studio: Build Variant = qaDebug (or qaRelease) → Build APK
```

### Production APK
```bash
npm run sync:prod
# then in Android Studio: Build Variant = prodRelease → Build APK
```

`qaRelease` and `prodRelease` need a signing keystore configured separately to produce distributable signed APKs.

---

## 3. Why `server.url` was removed from `capacitor.config.ts`

The previous config set `server.url` to a hosted Lovable preview URL. That made **every APK** ignore its own bundled `dist/` and instead load the UI live from the internet at runtime. With that in place:

- QA-mode table routing was impossible (the bundle the QA APK ran was the production-hosted bundle).
- The whole UI required internet just to start.

After removal:

- Each APK loads its UI from its own compiled `dist/` (offline-capable UI).
- Only Supabase API calls still need the network.
- Hot-reload on a connected phone no longer works; phone testing requires `npm run sync:*` + rebuild. Browser preview is unaffected.

---

## 4. Known limitations (server-side automation NOT triggered in QA)

QA `qa_*` tables are structural mirrors created via `LIKE INCLUDING DEFAULTS INCLUDING CONSTRAINTS`, which copies columns, defaults, NOT NULLs, and CHECK constraints — but **not triggers, foreign keys, or indexes**. Triggers in Postgres are bound to a specific table name, so production triggers do not fire on `qa_*` tables.

### Triggers on Tier 1 production tables that do NOT fire on `qa_*`

| Production table | Triggers (function) |
|---|---|
| `attendance` | `trg_refresh_attendance_summaries`, `update_attendance_updated_at` |
| `order_items` | `trg_auto_update_visit_status_on_order_items`, `trg_event_stock_on_order_items` |
| `orders` | `trg_audit_delete_orders`, `trg_award_productive_visit_points` (x2), `trg_bump_unverified_order_count`, `trg_create_invoice_on_order_confirmed`, `trg_notification_orders`, `trg_set_order_owner_snapshot`, `trg_sync_order_status_from_delivery`, `trg_update_revenue_on_order`, `trigger_auto_update_visit_on_order`, `trigger_auto_update_visit_status_on_order`, `trigger_set_order_date`, `trigger_update_retailer_analytics_orders`, `trigger_update_retailer_last_order`, `update_orders_updated_at` |
| `products` | `trg_products_audit_user`, `trg_stamp_product_last_cost_update`, `trg_sync_product_tax_from_hsn`, `trg_sync_product_tax_link`, `update_products_updated_at` |
| `retailer_visit_logs` | `update_retailer_visit_logs_updated_at` |
| `retailers` | `retailers_audit_log`, `retailers_duplicate_check`, `retailers_score_recalc`, `trg_audit_delete_retailers`, `trg_sync_retailer_beat_name`, `trg_sync_whatsapp_phone_name_cache`, `trg_update_retailer_count`, `update_retailers_updated_at` |
| `visits` | `trg_audit_delete_visits`, `trg_notification_visits`, `trg_update_visit_actuals`, `trigger_update_retailer_analytics_visits`, `trigger_update_retailer_last_visit`, `update_visits_updated_at` |
| `inst_leads` | (none found) |
| `gps_tracking` | (none found) |

### Edge functions that reference Tier 1 table names (will operate on production tables only)

`beat-health-insights`, `generate-recommendations`, `auto-generate-beat-plan`, `auto-end-day`, `calculate-credit-score`, `whatsapp-retailer-verify-inbound`, `chat-assistant`, `bolna-outbound-call`, `calculate-competency-scores`, `voice-recent-orders`, `competency-improvement-tips`, `ai-scheme-engine`, `send-retailer-welcome-whatsapp`, `ai-insights-engine`, `get-smart-basket-suggestions`, `generate-target-advice`, `generate-visit-ai-insights`, `voice-place-order`, `generate-scheduled-content`, `voice-order-status`, `send-retailer-verification-whatsapp`, `verify-retailer-call`.

### Scope of QA

- **Can validate:** client-side flows, form/UI behavior, offline write queue, duplicate prevention, optimistic state, navigation, role gating, basic CRUD against `qa_*`.
- **Cannot validate end-to-end:** auto-invoice creation, retailer analytics rollups, notification fan-out, audit logs, gamification points, WhatsApp send-outs, AI insights generation, and anything else driven by production triggers or edge functions tied to production table names.

---

## 5. Per-APK storage isolation

Android isolates local app storage (including the WebView's IndexedDB and SQLite, used by the offline queue and master-data cache) **per applicationId**. The QA APK uses applicationId `com.kvp.salesnavigator.qa` (`.qa` suffix); the production APK uses `com.kvp.salesnavigator`. Both can be installed on the same test device at the same time with zero data crossover.

---

## 6. All portals in this APK are covered by QA routing

This single APK ships multiple portals (field rep, distributor portal, customer portal, admin/operations screens). Once call sites are migrated to `table('orders')`-style routing, every portal in the QA build automatically writes to `qa_*` instead of production for any Tier 1 mirrored table. That is intended behavior, not a side effect.

---

## 7. QA data lifecycle

- **Generation:** QA data is generated automatically just by using the QA APK. No manual seeding step is required.
- **Per-run cleanup:** `select cleanup_qa_run('<run_id>'::uuid);` removes every row across all `qa_*` tables that was stamped with that `qa_run_id`, and marks the matching `qa_test_runs` row as `cleaned`. Returns a jsonb summary of rows deleted per table.
- **Full reset:** `select reset_all_qa_data();` truncates every `qa_*` table (RESTART IDENTITY CASCADE). **Admin role required** — gated via `has_role(auth.uid(), 'admin'::app_role)`.
- **Leaving QA data in place is safe.** It lives only in `qa_*` tables and never affects production.

---

## Reference — `qa_*` tables created

Tier 1 mirrors (+ `qa_run_id uuid`): `qa_retailers`, `qa_orders`, `qa_order_items`, `qa_visits`, `qa_retailer_visit_logs`, `qa_attendance`, `qa_inst_leads`, `qa_products`, `qa_gps_tracking`.

QA control: `qa_test_runs`, `qa_test_logs`, `qa_sync_audit_log`.

Tier 2 (read-through from production, no mirror): `profiles`, `beats`, `territories`, `distributors`, `product_variants`, `product_categories`, `product_schemes`, `feature_flags`, `companies`, `user_roles`, and other config/reference tables.

RLS is enabled on every `qa_*` table with a single permissive policy for `authenticated` (any signed-in user can read/write any QA row — these are sandbox tables, not production data).

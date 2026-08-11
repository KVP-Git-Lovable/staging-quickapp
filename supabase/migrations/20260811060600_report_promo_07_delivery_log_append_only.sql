-- Report promotion 07 — make report_delivery_log append-only.
--
-- WHY: the log used to be upserted on (subscription_id, recipient_user_id,
-- period), so a re-run overwrote the earlier record and there was no history of
-- repeated fires — and no way to tell a Manual "Run now" from the scheduled
-- Auto delivery. generate-report now INSERTs one row per run instead, which is
-- what feeds the "Fired by" column in Notification History.
--
-- A plain INSERT cannot coexist with the unique index: the first delivery for a
-- period succeeds and the second violates it. So the index has to go.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ORDERING — THIS FILE MUST BE APPLIED **AFTER** generate-report IS DEPLOYED.
--
-- This is the one migration in the promotion set that does NOT go first.
-- The older generate-report upserts with
--     onConflict: 'subscription_id,recipient_user_id,period'
-- which REQUIRES this unique index. Drop it while the old function is still
-- deployed and every delivery fails with
--     "there is no unique or exclusion constraint matching the ON CONFLICT
--      specification"
-- i.e. reports stop entirely.
--
-- Correct sequence:
--   1. the column + function migrations   (safe under the old function)
--   2. deploy generate-report             (works under the old index for the
--                                          first delivery of each period; only
--                                          a same-period re-run would fail)
--   3. THIS FILE                          (closes that remaining case)
--
-- Deploying the function first and dropping the index second leaves a much
-- smaller exposure than the reverse, which would take delivery down outright.
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_report_delivery_dedupe;

-- Replacement is deliberately NON-unique: it still serves the
-- "latest delivery for this subscription and period" lookup that the history
-- view and the dispatcher's catch-up check perform, without constraining
-- how many times a period may be delivered.
CREATE INDEX IF NOT EXISTS idx_report_delivery_sub_period_created
  ON public.report_delivery_log USING btree (subscription_id, period, created_at DESC);

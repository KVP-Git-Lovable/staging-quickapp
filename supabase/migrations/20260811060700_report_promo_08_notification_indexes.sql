-- Report promotion 08 — notification read-path indexes.
--
-- Found while sweeping index parity between staging and production rather than
-- patching one gap at a time. It is NOT part of the report work: production's
-- `notifications` table carries no index at all beyond its primary key, while
-- the notification bell and the Notification History page both filter on
-- (user_id, is_read) ordered by created_at. Every unread-count fetch and every
-- history page load is therefore a sequential scan — over 13,103 rows in
-- production at the time of writing, and growing with each delivery.
--
-- Bringing production to parity with staging. Safe and independent of the rest
-- of the promotion: adding an index changes no behaviour, only cost, and each
-- statement is guarded so this replays cleanly where the indexes already exist.

-- The hot path: unread badge and the paginated history list.
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON public.notifications USING btree (user_id, is_read, created_at DESC);

-- Partial: only a small minority of notifications are retailer-scoped, so the
-- predicate keeps the index small.
CREATE INDEX IF NOT EXISTS idx_notifications_retailer_id
  ON public.notifications USING btree (retailer_id)
  WHERE (retailer_id IS NOT NULL);

-- Used when splitting app notifications from customer-portal ones.
CREATE INDEX IF NOT EXISTS idx_notifications_target_portal
  ON public.notifications USING btree (target_portal);

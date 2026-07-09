
-- 1. Drop the rogue duplicate-award triggers and function on orders.
DROP TRIGGER IF EXISTS trg_award_productive_visit_points ON public.orders;
DROP TRIGGER IF EXISTS trg_award_productive_visit_points_on_order ON public.orders;
DROP FUNCTION IF EXISTS public.award_productive_visit_points_on_order();

-- 2. Idempotency guard: prevent the same (user, action, order) from being awarded twice.
-- Uses metadata.order_id since reference_id currently holds retailer_id on legacy rows.
CREATE UNIQUE INDEX IF NOT EXISTS gamification_points_user_action_order_uniq
  ON public.gamification_points (user_id, action_id, ((metadata->>'order_id')))
  WHERE metadata ? 'order_id';

ALTER TABLE public.gamification_daily_tracking
  DROP CONSTRAINT IF EXISTS gamification_daily_tracking_user_id_action_id_tracking_date_key;
DROP INDEX IF EXISTS public.uq_gam_tracking_user_action_period;
DROP INDEX IF EXISTS public.gamification_daily_tracking_user_id_action_id_tracking_date_key;
UPDATE public.gamification_daily_tracking SET period_key = to_char(tracking_date, 'YYYY-MM-DD') WHERE period_key IS NULL;
ALTER TABLE public.gamification_daily_tracking ALTER COLUMN period_key SET NOT NULL;
DELETE FROM public.gamification_daily_tracking a
USING public.gamification_daily_tracking b
WHERE a.ctid < b.ctid
  AND a.user_id = b.user_id AND a.action_id = b.action_id AND a.period_key = b.period_key
  AND coalesce(a.retailer_id,'00000000-0000-0000-0000-000000000000'::uuid) = coalesce(b.retailer_id,'00000000-0000-0000-0000-000000000000'::uuid);
CREATE UNIQUE INDEX uq_gam_tracking_user_action_period
  ON public.gamification_daily_tracking (user_id, action_id, period_key, coalesce(retailer_id,'00000000-0000-0000-0000-000000000000'::uuid));
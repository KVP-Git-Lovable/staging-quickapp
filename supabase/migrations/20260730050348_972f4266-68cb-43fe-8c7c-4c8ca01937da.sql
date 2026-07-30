ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_dismissed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'delivered';

UPDATE public.notifications SET read_at = created_at WHERE is_read = true AND read_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_notification_read_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_read = true AND (OLD.is_read IS DISTINCT FROM true) AND NEW.read_at IS NULL THEN
    NEW.read_at = now();
  END IF;
  IF NEW.is_read = false THEN
    NEW.read_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_read_at ON public.notifications;
CREATE TRIGGER trg_notifications_read_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.set_notification_read_at();

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, is_read, created_at DESC);

DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications"
ON public.notifications FOR DELETE TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, UPDATE ON public.notifications TO anon;
GRANT ALL ON public.notifications TO service_role;
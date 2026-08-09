-- Blocks the three operations that have actually caused data loss on this
-- project, while leaving every routine DDL alone.
--
--   BLOCKED : DROP TABLE
--             ALTER TABLE ... DROP COLUMN
--             ALTER TABLE ... RENAME COLUMN/TO/CONSTRAINT
--   ALLOWED : CREATE anything, ADD COLUMN, CREATE OR REPLACE,
--             DROP VIEW / FUNCTION / POLICY / TRIGGER / INDEX
--
-- Escape hatch for deliberate work, in the same transaction:
--     SET LOCAL app.allow_destructive = 'on';
--
-- The Supabase Dashboard "Delete table" button does not set that, so it fails
-- with a clear message. This is what would have prevented the loss of
-- notification_rules (31 Jul), currencies (31 Jul) and activity_types (30 Jul),
-- and the products.rate -> price rename in production (27 Jul).

CREATE OR REPLACE FUNCTION public.guard_destructive_ddl()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  q text;
BEGIN
  -- Deliberate, explicit opt-in bypasses the guard.
  IF coalesce(current_setting('app.allow_destructive', true), '') = 'on' THEN
    RETURN;
  END IF;

  IF tg_tag = 'DROP TABLE' THEN
    RAISE EXCEPTION 'BLOCKED: DROP TABLE is disabled on this database.'
      USING ERRCODE = '42501',
            HINT = 'Intentional? Run  SET LOCAL app.allow_destructive = ''on'';  in the same transaction, then retry. Never use the Dashboard Table Editor delete button.';
  END IF;

  IF tg_tag = 'ALTER TABLE' THEN
    q := lower(coalesce(current_query(), ''));

    IF q ~ '\mdrop\s+column\M' THEN
      RAISE EXCEPTION 'BLOCKED: ALTER TABLE ... DROP COLUMN is disabled on this database.'
        USING ERRCODE = '42501',
              HINT = 'Intentional? Run  SET LOCAL app.allow_destructive = ''on'';  in the same transaction, then retry.';
    END IF;

    IF q ~ '\mrename\s+(column|to|constraint)\M' THEN
      RAISE EXCEPTION 'BLOCKED: ALTER TABLE ... RENAME is disabled on this database.'
        USING ERRCODE = '42501',
              HINT = 'Renaming a live column silently breaks every query using the old name (see products.rate -> price, prod, 27 Jul). Intentional? SET LOCAL app.allow_destructive = ''on''; then retry.';
    END IF;
  END IF;
END;
$fn$;

DROP EVENT TRIGGER IF EXISTS guard_destructive_ddl_trg;

CREATE EVENT TRIGGER guard_destructive_ddl_trg
  ON ddl_command_start
  WHEN TAG IN ('DROP TABLE', 'ALTER TABLE')
  EXECUTE FUNCTION public.guard_destructive_ddl();

COMMENT ON FUNCTION public.guard_destructive_ddl() IS
  'Blocks DROP TABLE / DROP COLUMN / RENAME unless app.allow_destructive=on. See migration guard_destructive_ddl.';
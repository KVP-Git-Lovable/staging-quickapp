-- The five reportable RPCs resolve p_filters.scope_user_id into the set of
-- users the recipient may see, by walking employees.manager_id via
-- get_all_subordinates(). They selected a column named "user_id", but that
-- function returns "subordinate_user_id" -- so every call raised 42703, the
-- surrounding EXCEPTION handler swallowed it, and the scope silently collapsed
-- to the manager alone. Hierarchy scoping has therefore never worked.
--
-- Patched textually via CREATE OR REPLACE so signatures, bodies and ACLs are
-- otherwise untouched. The fallback is kept (failing closed is the right
-- direction for a visibility rule) but now raises a WARNING instead of hiding.
DO $migration$
DECLARE
  v_fn    text;
  v_def   text;
  v_fixed text;
  v_old   CONSTANT text := 'SELECT user_id FROM public.get_all_subordinates(v_scope_user)';
  v_new   CONSTANT text := 'SELECT s.subordinate_user_id FROM public.get_all_subordinates(v_scope_user) s';
  v_old_x CONSTANT text := 'EXCEPTION WHEN OTHERS THEN v_user_ids := ARRAY[v_scope_user]; END;';
  v_new_x CONSTANT text := 'EXCEPTION WHEN OTHERS THEN RAISE WARNING ''report scope resolution failed for %: %'', v_scope_user, SQLERRM; v_user_ids := ARRAY[v_scope_user]; END;';
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'get_sales_report', 'get_attendance_report', 'get_visits_report',
    'get_orders_report', 'get_field_activity_report'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_fn;

    IF v_def IS NULL THEN
      RAISE EXCEPTION 'function public.% not found', v_fn;
    END IF;
    IF position(v_old IN v_def) = 0 THEN
      RAISE EXCEPTION 'function public.% does not contain the expected scope block', v_fn;
    END IF;

    v_fixed := replace(replace(v_def, v_old, v_new), v_old_x, v_new_x);
    EXECUTE v_fixed;
    RAISE NOTICE 'patched %', v_fn;
  END LOOP;
END
$migration$;

NOTIFY pgrst, 'reload schema';
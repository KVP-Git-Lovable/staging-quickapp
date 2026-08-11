-- Report promotion 03/06 — fix hierarchy scope resolution in the sibling RPCs.
--
-- Consolidated from the staging migration
-- `fix_report_rpc_subordinate_scope_resolution` (20260805121139), narrowed to
-- the three RPCs that are NOT rewritten wholesale elsewhere in this set
-- (get_sales_report and get_field_activity_report ship as full definitions in
-- files 04 and 05).
--
-- THE BUG: these RPCs resolve p_filters.scope_user_id into the set of users the
-- recipient may see by walking employees.manager_id via get_all_subordinates().
-- They selected a column named "user_id", but that function returns
-- "subordinate_user_id". Every call therefore raised 42703, the surrounding
-- EXCEPTION handler swallowed it, and the scope silently collapsed to the
-- viewer alone. Hierarchy scoping has never worked in any environment that
-- still carries this text.
--
-- Applied as a textual patch via CREATE OR REPLACE so signatures, bodies and
-- ACLs are otherwise untouched — these functions differ between environments
-- and a full redefinition here would clobber those differences.
--
-- Unlike the staging original this version is TOLERANT: a function that is
-- absent, or already fixed, is skipped with a NOTICE rather than aborting.
-- That makes it safe to run against environments at different revisions.
DO $migration$
DECLARE
  v_fn    text;
  v_def   text;
  v_fixed text;
  v_patched int := 0;
  v_skipped int := 0;
  v_old   CONSTANT text := 'SELECT user_id FROM public.get_all_subordinates(v_scope_user)';
  v_new   CONSTANT text := 'SELECT s.subordinate_user_id FROM public.get_all_subordinates(v_scope_user) s';
  v_old_x CONSTANT text := 'EXCEPTION WHEN OTHERS THEN v_user_ids := ARRAY[v_scope_user]; END;';
  v_new_x CONSTANT text := 'EXCEPTION WHEN OTHERS THEN RAISE WARNING ''report scope resolution failed for %: %'', v_scope_user, SQLERRM; v_user_ids := ARRAY[v_scope_user]; END;';
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'get_attendance_report', 'get_visits_report', 'get_orders_report'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_fn AND p.prokind = 'f';

    IF v_def IS NULL THEN
      RAISE NOTICE 'skip %: not present in this database', v_fn;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF position(v_old IN v_def) = 0 THEN
      RAISE NOTICE 'skip %: already fixed or scope block absent', v_fn;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- The fallback is kept (failing closed is the right direction for a
    -- visibility rule) but now raises a WARNING instead of hiding.
    v_fixed := replace(replace(v_def, v_old, v_new), v_old_x, v_new_x);
    EXECUTE v_fixed;
    RAISE NOTICE 'patched %', v_fn;
    v_patched := v_patched + 1;
  END LOOP;

  RAISE NOTICE 'subordinate scope resolution: % patched, % skipped', v_patched, v_skipped;
END
$migration$;

NOTIFY pgrst, 'reload schema';

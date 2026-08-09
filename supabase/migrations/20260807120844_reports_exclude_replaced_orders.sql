-- Edited orders leave the superseded original as status='replaced'.
-- Reporting functions were written before that status existed and filter only
-- 'cancelled'/'rejected', so an edited order is counted twice: once as the
-- superseded original and once as its replacement.
--
-- Rewrites the status predicate in place via pg_get_functiondef so the rest of
-- each body is preserved byte-for-byte. No schema change, no data change.
DO $mig$
DECLARE r RECORD; v_new text; v_cnt int := 0; v_done text := '';
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_sales_report','get_today_sales_summary',
                        'get_sales_quantity_report','get_sales_quantity_summary',
                        'get_field_activity_report')
  LOOP
    v_new := r.def;
    v_new := replace(v_new, 'NOT IN (''cancelled'', ''rejected'')',
                            'NOT IN (''cancelled'', ''rejected'', ''replaced'')');
    v_new := replace(v_new, 'NOT IN (''cancelled'',''rejected'')',
                            'NOT IN (''cancelled'',''rejected'',''replaced'')');
    v_new := replace(v_new, 'status <> ''cancelled''',
                            'status NOT IN (''cancelled'',''replaced'')');

    IF v_new <> r.def THEN
      EXECUTE v_new;
      v_cnt := v_cnt + 1;
      v_done := v_done || r.proname || ' ';
    ELSE
      RAISE WARNING 'no status predicate matched in %, left unchanged', r.proname;
    END IF;
  END LOOP;

  IF v_cnt <> 5 THEN
    RAISE EXCEPTION 'expected 5 functions rewritten, got % (%)', v_cnt, v_done;
  END IF;
  RAISE NOTICE 'rewritten: %', v_done;
END $mig$;
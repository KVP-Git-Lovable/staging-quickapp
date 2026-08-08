-- Body of the capture, called by the permission-checking wrapper.
CREATE OR REPLACE FUNCTION public._capture_db_health_snapshot_impl(p_source text DEFAULT 'manual')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.db_health_snapshots(source, captured_by)
  VALUES (COALESCE(NULLIF(p_source,''), 'manual'), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,object_name,detail)
  SELECT v_id,'table',n.nspname,c.relname,
         jsonb_build_object('rls_enabled',c.relrowsecurity,
                            'row_estimate',GREATEST(c.reltuples,0)::bigint,
                            'size_bytes',pg_total_relation_size(c.oid))
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r';

  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,object_name,detail)
  SELECT v_id,'view',n.nspname,c.relname,jsonb_build_object('materialized',c.relkind='m')
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('v','m');

  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,parent_name,object_name,detail)
  SELECT v_id,'column',c.table_schema,c.table_name,c.column_name,
         jsonb_build_object('data_type',c.data_type,'is_nullable',c.is_nullable,
                            'column_default',c.column_default,'ordinal',c.ordinal_position)
  FROM information_schema.columns c WHERE c.table_schema='public';

  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,parent_name,object_name,detail)
  SELECT v_id,'policy',p.schemaname,p.tablename,p.policyname,
         jsonb_build_object('cmd',p.cmd,'permissive',p.permissive,'roles',p.roles,
                            'qual',p.qual,'with_check',p.with_check)
  FROM pg_policies p WHERE p.schemaname='public';

  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,object_name,detail)
  SELECT v_id,'function',n.nspname,p.oid::regprocedure::text,
         jsonb_build_object('security_definer',p.prosecdef,'language',l.lanname,'kind',p.prokind)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public';

  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,parent_name,object_name,detail)
  SELECT v_id,'trigger',n.nspname,c.relname,t.tgname,jsonb_build_object('enabled',t.tgenabled)
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE NOT t.tgisinternal AND n.nspname='public';

  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,parent_name,object_name,detail)
  SELECT v_id,'index',i.schemaname,i.tablename,i.indexname,jsonb_build_object('definition',i.indexdef)
  FROM pg_indexes i WHERE i.schemaname='public';

  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,parent_name,object_name,detail)
  SELECT v_id,'foreign_key',n.nspname,c.relname,con.conname,
         jsonb_build_object('definition',pg_get_constraintdef(con.oid))
  FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE con.contype='f' AND n.nspname='public';

  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,object_name,detail)
  SELECT v_id,'enum',n.nspname,t.typname,
         jsonb_build_object('labels',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
                                      FROM pg_enum e WHERE e.enumtypid=t.oid))
  FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE t.typtype='e' AND n.nspname='public';

  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,object_name,detail)
  SELECT v_id,'sequence',n.nspname,c.relname,'{}'::jsonb
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='S';

  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,object_name,detail)
  SELECT v_id,'extension',COALESCE(n.nspname,'-'),e.extname,jsonb_build_object('version',e.extversion)
  FROM pg_extension e LEFT JOIN pg_namespace n ON n.oid=e.extnamespace;

  BEGIN
    INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,object_name,detail)
    SELECT v_id,'cron_job','cron',j.jobname,
           jsonb_build_object('schedule',j.schedule,'active',j.active,'command',j.command)
    FROM cron.job j;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'db_health: cron.job not readable (%)', SQLERRM;
  END;

  UPDATE public.db_health_snapshots s SET
    table_count              = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='table'),
    view_count               = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='view'),
    column_count             = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='column'),
    rls_policy_count         = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='policy'),
    rls_enabled_table_count  = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='table' AND (o.detail->>'rls_enabled')::boolean),
    rls_disabled_table_count = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='table' AND NOT (o.detail->>'rls_enabled')::boolean),
    function_count           = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='function'),
    trigger_count            = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='trigger'),
    index_count              = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='index'),
    foreign_key_count        = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='foreign_key'),
    enum_count               = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='enum'),
    sequence_count           = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='sequence'),
    extension_count          = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='extension'),
    cron_job_count           = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='cron_job'),
    cron_job_active_count    = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='cron_job' AND (o.detail->>'active')::boolean),
    total_row_estimate       = (SELECT COALESCE(sum((o.detail->>'row_estimate')::bigint),0) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='table'),
    db_size_bytes            = pg_database_size(current_database())
  WHERE s.id=v_id;

  RETURN v_id;
END $fn$;

REVOKE EXECUTE ON FUNCTION public._capture_db_health_snapshot_impl(text) FROM public, anon, authenticated;

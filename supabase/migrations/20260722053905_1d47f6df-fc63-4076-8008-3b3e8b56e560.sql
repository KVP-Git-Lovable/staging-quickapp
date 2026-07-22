CREATE OR REPLACE FUNCTION public.notif_fill(p_tmpl text, p_actor_name text, p_module text, p_meta jsonb)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    COALESCE(p_tmpl,''),
    '{user_name}',  COALESCE(p_actor_name,'Unknown')),
    '{module_name}',COALESCE(p_module,'')),
    '{record_name}',COALESCE(p_meta->>'record_name','')),
    '{date}',       COALESCE(p_meta->>'date', to_char((now() AT TIME ZONE 'Asia/Kolkata'),'DD-Mon-YYYY'))),
    '{time}',       COALESCE(p_meta->>'time', to_char((now() AT TIME ZONE 'Asia/Kolkata'),'HH12:MI AM'))),
    '{time_24}',    COALESCE(p_meta->>'time_24', to_char((now() AT TIME ZONE 'Asia/Kolkata'),'HH24:MI'))),
    '{timestamp}',  COALESCE(p_meta->>'timestamp', to_char((now() AT TIME ZONE 'Asia/Kolkata'),'DD-Mon-YYYY HH12:MI AM'))),
    '{datetime}',   COALESCE(p_meta->>'datetime',  to_char((now() AT TIME ZONE 'Asia/Kolkata'),'DD-Mon-YYYY HH12:MI AM'))),
    '{points}',     COALESCE(p_meta->>'points','0')),
    '{beat}',       COALESCE(p_meta->>'beat','')),
    '{status}',     COALESCE(p_meta->>'status',''));
$function$;
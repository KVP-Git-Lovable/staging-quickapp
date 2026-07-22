
CREATE OR REPLACE FUNCTION public.notif_fill(p_template text, p_ctx jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result text := coalesce(p_template, '');
  v_now timestamptz := now();
  v_ist timestamp := (v_now AT TIME ZONE 'Asia/Kolkata');
  v_key text;
  v_val text;
BEGIN
  -- Built-in timestamp tokens (IST)
  v_result := replace(v_result, '{time}',          to_char(v_ist, 'HH12:MI AM'));
  v_result := replace(v_result, '{time_24}',       to_char(v_ist, 'HH24:MI'));
  v_result := replace(v_result, '{time_seconds}',  to_char(v_ist, 'HH12:MI:SS AM'));
  v_result := replace(v_result, '{time_hm}',       to_char(v_ist, 'HH24:MI'));
  v_result := replace(v_result, '{date}',          to_char(v_ist, 'DD-Mon-YYYY'));
  v_result := replace(v_result, '{date_long}',     to_char(v_ist, 'DD FMMonth YYYY'));
  v_result := replace(v_result, '{date_numeric}',  to_char(v_ist, 'DD/MM/YYYY'));
  v_result := replace(v_result, '{date_iso}',      to_char(v_ist, 'YYYY-MM-DD'));
  v_result := replace(v_result, '{weekday}',       to_char(v_ist, 'FMDay'));
  v_result := replace(v_result, '{weekday_short}', to_char(v_ist, 'Dy'));
  v_result := replace(v_result, '{month}',         to_char(v_ist, 'FMMonth'));
  v_result := replace(v_result, '{month_short}',   to_char(v_ist, 'Mon'));
  v_result := replace(v_result, '{year}',          to_char(v_ist, 'YYYY'));
  v_result := replace(v_result, '{timestamp}',     to_char(v_ist, 'DD-Mon-YYYY HH12:MI AM'));
  v_result := replace(v_result, '{datetime}',      to_char(v_ist, 'Dy, DD-Mon-YYYY HH12:MI AM'));
  v_result := replace(v_result, '{datetime_long}', to_char(v_ist, 'DD FMMonth YYYY') || ' at ' || to_char(v_ist, 'HH12:MI AM') || ' IST');
  v_result := replace(v_result, '{datetime_iso}',  to_char(v_now AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SSOF'));
  v_result := replace(v_result, '{relative_time}', 'just now');

  -- Context-provided tokens override built-ins
  IF p_ctx IS NOT NULL THEN
    FOR v_key, v_val IN SELECT key, value::text FROM jsonb_each_text(p_ctx) LOOP
      v_result := replace(v_result, '{' || v_key || '}', coalesce(v_val, ''));
    END LOOP;
  END IF;

  RETURN v_result;
END;
$$;

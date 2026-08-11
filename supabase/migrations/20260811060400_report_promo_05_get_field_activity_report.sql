-- Report promotion 05/06 — the field activity RPC.
--
-- Consolidated from the staging migration `create_field_activity_report_rpc`
-- (20260805105011), with the subordinate-scope fix from 20260805121139 already
-- folded in (s.subordinate_user_id, not user_id).
--
-- Every other report RPC starts from an order or a visit, which makes anyone
-- who did nothing structurally invisible. This one starts from the PERSON:
-- the base CTE unions attendance, visits and orders, so a rep who was present
-- but sold nothing still produces a row. p_filters.zero_sales_only narrows it
-- to exactly those people.
--
-- p_row_keys is accepted but unused — it exists so the shared callRpc() in
-- generate-report can pass the same argument shape to every dataset.

CREATE OR REPLACE FUNCTION public.get_field_activity_report(
  p_layout text,
  p_rows text,
  p_columns text,
  p_values text[],
  p_filters jsonb,
  p_row_keys text[] DEFAULT NULL::text[]
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_date_from  DATE := COALESCE((p_filters->>'date_from')::DATE, CURRENT_DATE - 30);
  v_date_to    DATE := COALESCE((p_filters->>'date_to')::DATE,   CURRENT_DATE);
  v_scope_user UUID := NULLIF(p_filters->>'scope_user_id','')::UUID;
  v_zero_only  BOOLEAN := COALESCE((p_filters->>'zero_sales_only')::boolean, false);
  v_user_ids   UUID[];
  v_rec        JSONB;
BEGIN
  IF v_scope_user IS NOT NULL THEN
    BEGIN
      SELECT ARRAY(SELECT s.subordinate_user_id FROM public.get_all_subordinates(v_scope_user) s) || v_scope_user
        INTO v_user_ids;
    EXCEPTION WHEN OTHERS THEN
      v_user_ids := ARRAY[v_scope_user];
    END;
  END IF;

  FOR v_rec IN
    WITH base AS (
      SELECT user_id FROM public.attendance
        WHERE date BETWEEN v_date_from AND v_date_to
          AND (v_user_ids IS NULL OR user_id = ANY(v_user_ids))
      UNION
      SELECT user_id FROM public.visits
        WHERE planned_date BETWEEN v_date_from AND v_date_to
          AND (v_user_ids IS NULL OR user_id = ANY(v_user_ids))
      UNION
      SELECT user_id FROM public.orders
        WHERE order_date::date BETWEEN v_date_from AND v_date_to
          AND cancelled_at IS NULL AND status NOT IN ('cancelled','replaced')
          AND (v_user_ids IS NULL OR user_id = ANY(v_user_ids))
    ),
    att AS (
      SELECT user_id, ROUND(SUM(total_hours)::numeric, 2) AS hours
      FROM public.attendance
      WHERE date BETWEEN v_date_from AND v_date_to GROUP BY user_id
    ),
    vis AS (
      SELECT user_id,
             COUNT(*)                                          AS visits,
             COUNT(*) FILTER (WHERE status = 'productive')      AS productive,
             COUNT(*) FILTER (WHERE status = 'unproductive')    AS unproductive,
             COUNT(*) FILTER (WHERE status = 'planned')         AS pending
      FROM public.visits
      WHERE planned_date BETWEEN v_date_from AND v_date_to GROUP BY user_id
    ),
    ord AS (
      SELECT o.user_id,
             COUNT(DISTINCT o.id)                                  AS orders,
             COALESCE(SUM(oi.quantity),0)::numeric                 AS quantity,
             COALESCE(SUM(oi.quantity * oi.rate),0)::numeric(14,2) AS revenue
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      WHERE o.order_date::date BETWEEN v_date_from AND v_date_to
        AND o.cancelled_at IS NULL AND o.status NOT IN ('cancelled','replaced')
      GROUP BY o.user_id
    ),
    bts AS (
      SELECT user_id, COUNT(DISTINCT beat_id) AS active_beats
      FROM public.beat_plans GROUP BY user_id
    ),
    lastord AS (
      SELECT user_id, MAX(order_date)::date AS last_order_date
      FROM public.orders WHERE cancelled_at IS NULL GROUP BY user_id
    )
    SELECT to_jsonb(t) FROM (
      SELECT
        COALESCE(pr.full_name, pr.username, 'Unknown')  AS team_member,
        COALESCE(a.hours, 0)::numeric                   AS hours,
        COALESCE(v.visits, 0)                           AS visits,
        COALESCE(v.productive, 0)                       AS productive,
        COALESCE(v.unproductive, 0)                     AS unproductive,
        COALESCE(v.pending, 0)                          AS pending,
        COALESCE(bt.active_beats, 0)                    AS active_beats,
        COALESCE(lo.last_order_date::text, 'never')     AS last_order,
        COALESCE(o.orders, 0)                           AS orders,
        COALESCE(o.quantity, 0)::numeric                AS quantity,
        COALESCE(o.revenue, 0)::numeric(14,2)           AS revenue
      FROM base b
      LEFT JOIN public.profiles pr ON pr.id = b.user_id
      LEFT JOIN att a     ON a.user_id  = b.user_id
      LEFT JOIN vis v     ON v.user_id  = b.user_id
      LEFT JOIN ord o     ON o.user_id  = b.user_id
      LEFT JOIN bts bt    ON bt.user_id = b.user_id
      LEFT JOIN lastord lo ON lo.user_id = b.user_id
      WHERE (NOT v_zero_only OR COALESCE(o.orders, 0) = 0)
      ORDER BY COALESCE(o.revenue,0) DESC, COALESCE(a.hours,0) DESC
      LIMIT 2000
    ) t
  LOOP RETURN NEXT v_rec; END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_field_activity_report(text, text, text, text[], jsonb, text[])
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

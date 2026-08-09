-- get_sales_report: allow the GROUPED layout to group by more than one dimension.
--
-- p_rows is a single text key, so a report configured with
-- rows: ["team_member","order_date"] silently dropped order_date before the
-- query ran — in the builder preview and the delivered file alike.
--
-- Adds p_row_keys text[] with a DEFAULT so every existing 5-argument call still
-- resolves. Backward compatible by design:
--   * p_row_keys omitted/NULL -> legacy behaviour, one dimension aliased "grp"
--   * p_row_keys provided     -> one column per dimension, named after the key
-- TABULAR and MATRIX branches are unchanged.

DROP FUNCTION IF EXISTS public.get_sales_report(text, text, text, text[], jsonb);

CREATE OR REPLACE FUNCTION public.get_sales_report(
  p_layout   text,
  p_rows     text,
  p_columns  text,
  p_values   text[],
  p_filters  jsonb,
  p_row_keys text[] DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_date_from     DATE  := COALESCE((p_filters->>'date_from')::DATE, CURRENT_DATE - 30);
  v_date_to       DATE  := COALESCE((p_filters->>'date_to')::DATE,   CURRENT_DATE);
  v_scope_user    UUID  := NULLIF(p_filters->>'scope_user_id','')::UUID;
  v_distributor   UUID  := NULLIF(p_filters->>'distributor_id','')::UUID;
  v_user_ids      UUID[];
  v_row_key       text  := COALESCE(NULLIF(p_rows,''), 'team_member');
  v_col_key       text  := COALESCE(NULLIF(p_columns,''), 'team_member');
  v_val_key       text  := COALESCE(p_values[1], 'quantity');
  v_row_sql       text;
  v_col_sql       text;
  v_val_sql       text;
  v_sql           text;
  v_rec           JSONB;
  v_dims          text[];
  v_aliases       text[];
  v_dim_sql       text := '';
  v_group_sql     text := '';
  v_i             int;
BEGIN
  IF v_scope_user IS NOT NULL THEN
    BEGIN
      SELECT ARRAY(SELECT user_id FROM public.get_all_subordinates(v_scope_user)) || v_scope_user
        INTO v_user_ids;
    EXCEPTION WHEN OTHERS THEN
      v_user_ids := ARRAY[v_scope_user];
    END;
  END IF;

  -- ---------- TABULAR (unchanged) ----------
  IF p_layout = 'tabular' THEN
    FOR v_rec IN
      WITH first_order AS (
        SELECT retailer_id, MIN(order_date::date) AS first_dt
        FROM public.orders
        WHERE cancelled_at IS NULL AND status <> 'cancelled'
          AND (v_user_ids IS NULL OR user_id = ANY(v_user_ids))
          AND (v_distributor IS NULL OR distributor_id = v_distributor)
        GROUP BY retailer_id
      )
      SELECT to_jsonb(t) FROM (
        SELECT
          o.order_date::date                                       AS order_date,
          COALESCE(p.full_name, p.username, 'Unknown')             AS team_member,
          COALESCE(o.beat_name_snapshot, b.beat_name)              AS beat,
          o.retailer_name                                          AS retailer,
          o.distributor_name                                       AS distributor,
          oi.product_name                                          AS product,
          oi.category                                              AS category,
          oi.uom_code                                              AS uom,
          o.status                                                 AS status,
          COALESCE(oi.quantity,0)::numeric                         AS quantity,
          COALESCE(oi.rate,0)::numeric(14,2)                       AS rate,
          COALESCE(oi.quantity * oi.rate,0)::numeric(14,2)         AS revenue,
          CASE WHEN fo.first_dt = o.order_date::date
                AND fo.first_dt BETWEEN v_date_from AND v_date_to
               THEN 1 ELSE 0 END                                   AS new_retailers
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        LEFT JOIN public.profiles p ON p.id = o.user_id
        LEFT JOIN public.beats b   ON b.beat_id = o.beat_id
        LEFT JOIN first_order fo   ON fo.retailer_id = o.retailer_id
        WHERE o.order_date::date BETWEEN v_date_from AND v_date_to
          AND o.cancelled_at IS NULL AND o.status <> 'cancelled'
          AND (v_user_ids IS NULL OR o.user_id = ANY(v_user_ids))
          AND (v_distributor IS NULL OR o.distributor_id = v_distributor)
        ORDER BY o.order_date DESC, o.created_at DESC
        LIMIT 5000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;
    RETURN;
  END IF;

  -- ---------- MATRIX (unchanged) ----------
  IF p_layout = 'matrix' THEN
    v_row_sql := CASE v_row_key
      WHEN 'beat'        THEN 'COALESCE(o.beat_name_snapshot, b.beat_name, ''—'')'
      WHEN 'retailer'    THEN 'COALESCE(o.retailer_name, ''—'')'
      WHEN 'distributor' THEN 'COALESCE(o.distributor_name, ''—'')'
      WHEN 'order_date'  THEN 'o.order_date::date::text'
      WHEN 'date'        THEN 'o.order_date::date::text'
      WHEN 'status'      THEN 'COALESCE(o.status, ''—'')'
      WHEN 'product'     THEN 'COALESCE(oi.product_name, ''—'')'
      WHEN 'category'    THEN 'COALESCE(oi.category, ''—'')'
      WHEN 'uom'         THEN 'COALESCE(oi.uom_code, ''—'')'
      ELSE                    'COALESCE(p.full_name, p.username, ''Unknown'')'
    END;

    v_col_sql := CASE v_col_key
      WHEN 'beat'        THEN 'COALESCE(o.beat_name_snapshot, b.beat_name, ''—'')'
      WHEN 'retailer'    THEN 'COALESCE(o.retailer_name, ''—'')'
      WHEN 'distributor' THEN 'COALESCE(o.distributor_name, ''—'')'
      WHEN 'order_date'  THEN 'o.order_date::date::text'
      WHEN 'date'        THEN 'o.order_date::date::text'
      WHEN 'status'      THEN 'COALESCE(o.status, ''—'')'
      WHEN 'product'     THEN 'COALESCE(oi.product_name, ''—'')'
      WHEN 'category'    THEN 'COALESCE(oi.category, ''—'')'
      WHEN 'uom'         THEN 'COALESCE(oi.uom_code, ''—'')'
      ELSE                    'COALESCE(p.full_name, p.username, ''Unknown'')'
    END;

    v_val_sql := CASE v_val_key
      WHEN 'revenue'       THEN 'COALESCE(SUM(oi.quantity * oi.rate),0)::numeric(14,2)'
      WHEN 'rate'          THEN 'COALESCE(AVG(oi.rate),0)::numeric(14,2)'
      WHEN 'new_retailers' THEN 'COUNT(DISTINCT o.retailer_id)'
      ELSE                      'COALESCE(SUM(oi.quantity),0)::numeric'
    END;

    v_sql := format($SQL$
      SELECT to_jsonb(t) FROM (
        SELECT
          %s AS %I,
          %s AS %I,
          %s AS %I
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        LEFT JOIN public.profiles p ON p.id = o.user_id
        LEFT JOIN public.beats b   ON b.beat_id = o.beat_id
        WHERE o.order_date::date BETWEEN $1 AND $2
          AND o.cancelled_at IS NULL AND o.status <> 'cancelled'
          AND ($3::uuid[] IS NULL OR o.user_id = ANY($3::uuid[]))
          AND ($4::uuid   IS NULL OR o.distributor_id = $4::uuid)
        GROUP BY 1, 2
        ORDER BY 1, 2
        LIMIT 5000
      ) t
    $SQL$, v_row_sql, v_row_key, v_col_sql, v_col_key, v_val_sql, v_val_key);

    FOR v_rec IN EXECUTE v_sql USING v_date_from, v_date_to, v_user_ids, v_distributor
    LOOP RETURN NEXT v_rec; END LOOP;
    RETURN;
  END IF;

  -- ---------- GROUPED (now multi-dimension) ----------
  -- Legacy 5-arg callers keep the single "grp" column; callers that pass
  -- p_row_keys get one properly named column per selected dimension.
  IF p_row_keys IS NULL OR COALESCE(array_length(p_row_keys, 1), 0) = 0 THEN
    v_dims    := ARRAY[v_row_key];
    v_aliases := ARRAY['grp'];
  ELSE
    v_dims    := p_row_keys;
    v_aliases := p_row_keys;
  END IF;

  FOR v_i IN 1..array_length(v_dims, 1) LOOP
    v_dim_sql := v_dim_sql || format('%s AS %I, ',
      CASE v_dims[v_i]
        WHEN 'beat'        THEN 'COALESCE(o.beat_name_snapshot, b.beat_name, ''—'')'
        WHEN 'retailer'    THEN 'COALESCE(o.retailer_name,''—'')'
        WHEN 'distributor' THEN 'COALESCE(o.distributor_name,''—'')'
        WHEN 'product'     THEN 'COALESCE(oi.product_name,''—'')'
        WHEN 'category'    THEN 'COALESCE(oi.category,''—'')'
        WHEN 'uom'         THEN 'COALESCE(oi.uom_code,''—'')'
        WHEN 'order_date'  THEN 'o.order_date::date::text'
        WHEN 'date'        THEN 'o.order_date::date::text'
        WHEN 'status'      THEN 'COALESCE(o.status,''—'')'
        ELSE                    'COALESCE(p.full_name, p.username, ''Unknown'')'
      END, v_aliases[v_i]);
    v_group_sql := v_group_sql || v_i::text || ',';
  END LOOP;
  v_group_sql := rtrim(v_group_sql, ',');

  v_sql := format($SQL$
    WITH first_order AS (
      SELECT retailer_id, MIN(order_date::date) AS first_dt
      FROM public.orders
      WHERE cancelled_at IS NULL AND status <> 'cancelled'
        AND ($3::uuid[] IS NULL OR user_id = ANY($3::uuid[]))
        AND ($4::uuid   IS NULL OR distributor_id = $4::uuid)
      GROUP BY retailer_id
    )
    SELECT to_jsonb(t) FROM (
      SELECT
        %s
        COALESCE(SUM(oi.quantity),0)::numeric                  AS quantity,
        COALESCE(AVG(oi.rate),0)::numeric(14,2)                AS rate,
        COALESCE(SUM(oi.quantity * oi.rate),0)::numeric(14,2)  AS revenue,
        COUNT(DISTINCT o.retailer_id) FILTER (
          WHERE fo.first_dt BETWEEN $1 AND $2
            AND fo.first_dt = o.order_date::date
        )                                                      AS new_retailers
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      LEFT JOIN public.profiles p ON p.id = o.user_id
      LEFT JOIN public.beats b   ON b.beat_id = o.beat_id
      LEFT JOIN first_order fo   ON fo.retailer_id = o.retailer_id
      WHERE o.order_date::date BETWEEN $1 AND $2
        AND o.cancelled_at IS NULL AND o.status <> 'cancelled'
        AND ($3::uuid[] IS NULL OR o.user_id = ANY($3::uuid[]))
        AND ($4::uuid   IS NULL OR o.distributor_id = $4::uuid)
      GROUP BY %s
      ORDER BY %s
      LIMIT 2000
    ) t
  $SQL$, v_dim_sql, v_group_sql, v_group_sql);

  FOR v_rec IN EXECUTE v_sql USING v_date_from, v_date_to, v_user_ids, v_distributor
  LOOP RETURN NEXT v_rec; END LOOP;
END;
$function$;
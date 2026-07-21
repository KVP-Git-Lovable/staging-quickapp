
-- Rewrite get_sales_report to support: matrix layout with dynamic pivot,
-- distributor dimension + filter, separate quantity/revenue measures.

CREATE OR REPLACE FUNCTION public.get_sales_report(
  p_layout text,
  p_rows text,
  p_columns text,
  p_values text[],
  p_filters jsonb
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
BEGIN
  IF v_scope_user IS NOT NULL THEN
    BEGIN
      SELECT ARRAY(SELECT user_id FROM public.get_all_subordinates(v_scope_user)) || v_scope_user
        INTO v_user_ids;
    EXCEPTION WHEN OTHERS THEN
      v_user_ids := ARRAY[v_scope_user];
    END;
  END IF;

  -- ---------- TABULAR ----------
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

  -- ---------- MATRIX (dynamic pivot, long shape) ----------
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

  -- ---------- GROUPED ----------
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
        CASE COALESCE(NULLIF(p_rows,''),'team_member')
          WHEN 'beat'        THEN COALESCE(o.beat_name_snapshot, b.beat_name, '—')
          WHEN 'retailer'    THEN COALESCE(o.retailer_name,'—')
          WHEN 'distributor' THEN COALESCE(o.distributor_name,'—')
          WHEN 'product'     THEN COALESCE(oi.product_name,'—')
          WHEN 'category'    THEN COALESCE(oi.category,'—')
          WHEN 'uom'         THEN COALESCE(oi.uom_code,'—')
          WHEN 'order_date'  THEN o.order_date::date::text
          WHEN 'date'        THEN o.order_date::date::text
          WHEN 'status'      THEN COALESCE(o.status,'—')
          ELSE COALESCE(p.full_name, p.username, 'Unknown')
        END                                              AS grp,
        COALESCE(SUM(oi.quantity),0)::numeric            AS quantity,
        COALESCE(AVG(oi.rate),0)::numeric(14,2)          AS rate,
        COALESCE(SUM(oi.quantity * oi.rate),0)::numeric(14,2) AS revenue,
        COUNT(DISTINCT o.retailer_id) FILTER (
          WHERE fo.first_dt BETWEEN v_date_from AND v_date_to
            AND fo.first_dt = o.order_date::date
        )                                                AS new_retailers
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      LEFT JOIN public.profiles p ON p.id = o.user_id
      LEFT JOIN public.beats b   ON b.beat_id = o.beat_id
      LEFT JOIN first_order fo   ON fo.retailer_id = o.retailer_id
      WHERE o.order_date::date BETWEEN v_date_from AND v_date_to
        AND o.cancelled_at IS NULL AND o.status <> 'cancelled'
        AND (v_user_ids IS NULL OR o.user_id = ANY(v_user_ids))
        AND (v_distributor IS NULL OR o.distributor_id = v_distributor)
      GROUP BY 1
      ORDER BY 1 ASC
      LIMIT 2000
    ) t
  LOOP RETURN NEXT v_rec; END LOOP;
END;
$function$;

-- Update dataset row: add distributor dimension, relabel measures.
UPDATE public.reportable_datasets
SET
  dimensions = '[
    {"key":"order_date","label":"Date"},
    {"key":"team_member","label":"Team member"},
    {"key":"beat","label":"Beat"},
    {"key":"retailer","label":"Retailer"},
    {"key":"distributor","label":"Distributor"},
    {"key":"product","label":"Product"},
    {"key":"category","label":"Category"},
    {"key":"uom","label":"UOM"},
    {"key":"status","label":"Status"}
  ]'::jsonb,
  measures = '[
    {"key":"quantity","label":"Quantity","agg":"sum"},
    {"key":"revenue","label":"Revenue (₹)","agg":"sum"},
    {"key":"rate","label":"Rate","agg":"avg"},
    {"key":"new_retailers","label":"New retailers","agg":"count"}
  ]'::jsonb,
  supports_matrix = true,
  label = 'Secondary sales',
  description = 'Secondary orders — quantity (kg/units) and revenue (₹) per team member, retailer, distributor, product.',
  updated_at = now()
WHERE source = 'get_sales_report';

-- Report promotion 04/08 — dataset registry: sales measures, formats, field activity.
--
-- Consolidates two staging migrations plus the sales measure list that grew
-- alongside them:
--   `reportable_datasets_declare_measure_format` (20260806051742)
--   the dataset row created with `create_field_activity_report_rpc` (20260805105011)
--   the orders/productive/unproductive/pending measures added by
--   `sales_report_zero_activity_users_and_visit_measures` (20260805101847)
--
-- ORDER MATTERS WITHIN THIS FILE: part A sets the sales list (already carrying
-- formats), part B then backfills `format` on every measure that still lacks
-- one, so the two cannot fight.

-- ─────────────────────────────────────────────────────────────────────────────
-- PART A — sales measures.
-- get_sales_report gained orders / productive / unproductive / pending when the
-- zero-activity universe was added. Without them here the RPC can compute those
-- columns but the report builder offers no way to SELECT them — which reads as
-- "the orders column isn't coming through in preview" rather than as missing
-- metadata. Dimensions are already identical across environments and are left
-- untouched.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.reportable_datasets
SET measures = '[
  {"key":"orders",        "label":"Orders",              "agg":"sum",   "format":"number"},
  {"key":"quantity",      "label":"Quantity",            "agg":"sum",   "format":"number"},
  {"key":"revenue",       "label":"Revenue (₹)",         "agg":"sum",   "format":"currency"},
  {"key":"rate",          "label":"Rate",                "agg":"avg",   "format":"currency"},
  {"key":"new_retailers", "label":"New retailers",       "agg":"count", "format":"number"},
  {"key":"productive",    "label":"Productive visits",   "agg":"sum",   "format":"number"},
  {"key":"unproductive",  "label":"Unproductive visits", "agg":"sum",   "format":"number"},
  {"key":"pending",       "label":"Pending visits",      "agg":"sum",   "format":"number"}
]'::jsonb
WHERE key = 'sales';

-- ─────────────────────────────────────────────────────────────────────────────
-- PART B — measure format for every remaining dataset.
-- The PDF renderer decided which columns get a currency symbol by matching the
-- column NAME against a substring list that included 'total'. "total_hours"
-- matched, so the attendance register printed hours as "₹ 8.81".
--
-- Which measures are money is a property of the measure, not of its spelling,
-- so it is declared here next to agg/label. The renderer reads this and only
-- falls back to name matching for a measure that declares nothing.
--
-- Guarded on `NOT (m ? 'format')` so it is a no-op once applied, and so it
-- cannot overwrite the list part A just set.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.reportable_datasets d
SET measures = (
  SELECT jsonb_agg(
           t.m || jsonb_build_object(
             'format',
             CASE WHEN (d.key, t.m->>'key') IN (
               ('sales',          'revenue'),
               ('sales',          'rate'),
               ('orders',         'total_amount'),
               ('orders',         'subtotal'),
               ('orders',         'discount_amount'),
               ('field_activity', 'revenue')
             ) THEN 'currency' ELSE 'number' END)
           ORDER BY t.ord)
  FROM jsonb_array_elements(d.measures) WITH ORDINALITY AS t(m, ord)
)
WHERE jsonb_typeof(d.measures) = 'array'
  AND jsonb_array_length(d.measures) > 0
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(d.measures) m WHERE NOT (m ? 'format')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- PART C — the field_activity dataset.
-- Starts from the person rather than from an order, so people who sold nothing
-- still appear. Backs the zero-sales / field-activity reports.
--
-- Its `source` points at get_field_activity_report, created by file 05. This
-- file runs first, so there is a brief window where the dataset row exists and
-- the function does not — harmless (no FK, and nothing reads it until someone
-- builds a report against it), but that is why 05 follows immediately.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.reportable_datasets
  (key, label, description, source, dimensions, measures, supports_matrix, is_active)
VALUES (
  'field_activity',
  'Field activity',
  'Per-person activity: hours present, visits and outcomes, beats covered, last order, and what they billed. Includes people who sold nothing.',
  'get_field_activity_report',
  '[{"key":"team_member","label":"Team member"},
    {"key":"last_order","label":"Last order"}]'::jsonb,
  '[{"key":"hours",        "label":"Hours",               "agg":"sum","format":"number"},
    {"key":"visits",       "label":"Visits",              "agg":"sum","format":"number"},
    {"key":"productive",   "label":"Productive visits",   "agg":"sum","format":"number"},
    {"key":"unproductive", "label":"Unproductive visits", "agg":"sum","format":"number"},
    {"key":"pending",      "label":"Pending visits",      "agg":"sum","format":"number"},
    {"key":"active_beats", "label":"Active beats",        "agg":"sum","format":"number"},
    {"key":"orders",       "label":"Orders",              "agg":"sum","format":"number"},
    {"key":"quantity",     "label":"Quantity",            "agg":"sum","format":"number"},
    {"key":"revenue",      "label":"Revenue (₹)",         "agg":"sum","format":"currency"}]'::jsonb,
  false,
  true
)
ON CONFLICT (key) DO UPDATE SET
  label           = EXCLUDED.label,
  description     = EXCLUDED.description,
  source          = EXCLUDED.source,
  dimensions      = EXCLUDED.dimensions,
  measures        = EXCLUDED.measures,
  supports_matrix = EXCLUDED.supports_matrix,
  is_active       = EXCLUDED.is_active;

NOTIFY pgrst, 'reload schema';

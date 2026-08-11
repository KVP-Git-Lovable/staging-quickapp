-- Report promotion 04/06 — dataset registry: measure formats + field activity.
--
-- Consolidates two staging migrations:
--   `reportable_datasets_declare_measure_format` (20260806051742)
--   the dataset row created alongside `create_field_activity_report_rpc`
--
-- PART A — measure format
-- The PDF renderer decided which columns get a currency symbol by matching the
-- column NAME against a substring list that included 'total'. "total_hours"
-- matched, so the attendance register printed hours as "₹ 8.81".
--
-- Which measures are money is a property of the measure, not of its spelling,
-- so it is declared here next to agg/label. The renderer reads this and only
-- falls back to name matching for a measure that declares nothing.
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
  AND jsonb_array_length(d.measures) > 0;

-- PART B — the field_activity dataset.
-- Starts from the person rather than from an order, so people who sold nothing
-- still appear. Backs the zero-sales / field-activity reports.
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

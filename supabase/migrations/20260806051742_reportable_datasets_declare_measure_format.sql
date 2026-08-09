-- The PDF renderer decided which columns get a currency symbol by matching the
-- column name against a substring list that included 'total'. "total_hours"
-- matched, so the attendance register printed hours as "₹ 8.81".
--
-- Which measures are money is a property of the measure, not of its spelling,
-- so declare it once here next to agg/label. The renderer reads this and only
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
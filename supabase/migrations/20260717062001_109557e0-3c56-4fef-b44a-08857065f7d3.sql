
DROP FUNCTION IF EXISTS public.match_help_article(text, text);

CREATE OR REPLACE FUNCTION public.match_help_article(p_question text, p_language text DEFAULT NULL)
RETURNS TABLE (
  id uuid, module text, title text, steps text[], language text, score double precision
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE q text := coalesce(lower(trim(p_question)), '');
BEGIN
  IF q = '' THEN RETURN; END IF;
  RETURN QUERY
  SELECT a.id, a.module, a.title, a.steps, a.language,
    (
      (SELECT count(*)::double precision FROM unnest(a.keywords) k WHERE q ILIKE '%' || lower(k) || '%') * 3.0
      + coalesce(ts_rank(
          to_tsvector('simple', a.title || ' ' || coalesce(a.content, '') || ' ' || array_to_string(a.keywords, ' ')),
          websearch_to_tsquery('simple', q)
        ), 0)::double precision * 4.0
      + similarity(lower(a.title), q)::double precision * 2.0
      + CASE WHEN p_language IS NOT NULL AND a.language = p_language THEN 1.0 ELSE 0 END
      + (a.priority::double precision * 0.1)
    ) AS score
  FROM public.quickapp_help_articles a
  WHERE a.is_active = true
  ORDER BY score DESC
  LIMIT 5;
END; $$;
GRANT EXECUTE ON FUNCTION public.match_help_article(text, text) TO anon, authenticated, service_role;

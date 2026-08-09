-- DROP FUNCTION in the previous migration discarded the function's ACL, so the
-- authenticated role lost EXECUTE and every caller failed at the API layer.
-- Restore the same grants get_attendance_report carries.
GRANT EXECUTE ON FUNCTION public.get_sales_report(text, text, text, text[], jsonb, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_report(text, text, text, text[], jsonb, text[]) TO service_role;

-- PostgREST caches the schema; DDL needs an explicit reload or the function
-- stays unresolvable to the API even once grants are correct.
NOTIFY pgrst, 'reload schema';
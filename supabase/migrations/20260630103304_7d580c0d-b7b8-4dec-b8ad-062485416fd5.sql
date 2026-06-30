-- QA mirrors for beats / beat_plans / daily_beat_plans / retailer_beat_assignments
CREATE TABLE IF NOT EXISTS public.qa_beats (LIKE public.beats INCLUDING DEFAULTS INCLUDING IDENTITY);
ALTER TABLE public.qa_beats ADD PRIMARY KEY (id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_beats TO authenticated;
GRANT ALL ON public.qa_beats TO service_role;
ALTER TABLE public.qa_beats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qa_beats_all_authenticated" ON public.qa_beats FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.qa_beat_plans (LIKE public.beat_plans INCLUDING DEFAULTS INCLUDING IDENTITY);
ALTER TABLE public.qa_beat_plans ADD PRIMARY KEY (id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_beat_plans TO authenticated;
GRANT ALL ON public.qa_beat_plans TO service_role;
ALTER TABLE public.qa_beat_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qa_beat_plans_all_authenticated" ON public.qa_beat_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.qa_daily_beat_plans (LIKE public.daily_beat_plans INCLUDING DEFAULTS INCLUDING IDENTITY);
ALTER TABLE public.qa_daily_beat_plans ADD PRIMARY KEY (id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_daily_beat_plans TO authenticated;
GRANT ALL ON public.qa_daily_beat_plans TO service_role;
ALTER TABLE public.qa_daily_beat_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qa_daily_beat_plans_all_authenticated" ON public.qa_daily_beat_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.qa_retailer_beat_assignments (LIKE public.retailer_beat_assignments INCLUDING DEFAULTS INCLUDING IDENTITY);
ALTER TABLE public.qa_retailer_beat_assignments ADD PRIMARY KEY (id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_retailer_beat_assignments TO authenticated;
GRANT ALL ON public.qa_retailer_beat_assignments TO service_role;
ALTER TABLE public.qa_retailer_beat_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qa_retailer_beat_assignments_all_authenticated" ON public.qa_retailer_beat_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
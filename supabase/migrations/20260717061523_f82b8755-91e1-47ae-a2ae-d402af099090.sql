
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.quickapp_help_agents (
  agent_id text PRIMARY KEY,
  name text NOT NULL,
  default_language text NOT NULL DEFAULT 'kn',
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.quickapp_help_agents TO authenticated;
GRANT ALL ON public.quickapp_help_agents TO service_role;
ALTER TABLE public.quickapp_help_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "help_agents_read_auth" ON public.quickapp_help_agents FOR SELECT TO authenticated USING (true);

CREATE TABLE public.quickapp_help_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  title text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  language text NOT NULL DEFAULT 'kn',
  steps text[] NOT NULL DEFAULT '{}',
  content text,
  priority int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.quickapp_help_articles TO anon, authenticated;
GRANT ALL ON public.quickapp_help_articles TO service_role;
ALTER TABLE public.quickapp_help_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "help_articles_read_all" ON public.quickapp_help_articles FOR SELECT USING (is_active = true);

CREATE INDEX idx_help_articles_keywords ON public.quickapp_help_articles USING GIN (keywords);
CREATE INDEX idx_help_articles_title_trgm ON public.quickapp_help_articles USING GIN (title gin_trgm_ops);
CREATE INDEX idx_help_articles_module ON public.quickapp_help_articles (module);
CREATE INDEX idx_help_articles_language ON public.quickapp_help_articles (language);

CREATE TABLE public.quickapp_help_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text,
  caller_phone text,
  detected_module text,
  detected_intent text,
  article_id uuid REFERENCES public.quickapp_help_articles(id) ON DELETE SET NULL,
  question text,
  language text,
  answered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.quickapp_help_logs TO service_role;
GRANT SELECT ON public.quickapp_help_logs TO authenticated;
ALTER TABLE public.quickapp_help_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "help_logs_admin_read" ON public.quickapp_help_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.tg_help_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_help_articles_updated BEFORE UPDATE ON public.quickapp_help_articles
  FOR EACH ROW EXECUTE FUNCTION public.tg_help_updated_at();
CREATE TRIGGER trg_help_agents_updated BEFORE UPDATE ON public.quickapp_help_agents
  FOR EACH ROW EXECUTE FUNCTION public.tg_help_updated_at();

CREATE OR REPLACE FUNCTION public.match_help_article(p_question text, p_language text DEFAULT NULL)
RETURNS TABLE (
  id uuid, module text, title text, steps text[], language text, score real
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE q text := coalesce(lower(trim(p_question)), '');
BEGIN
  IF q = '' THEN RETURN; END IF;
  RETURN QUERY
  SELECT a.id, a.module, a.title, a.steps, a.language,
    (
      (SELECT count(*)::real FROM unnest(a.keywords) k WHERE q ILIKE '%' || lower(k) || '%') * 3.0
      + coalesce(ts_rank(
          to_tsvector('simple', a.title || ' ' || coalesce(a.content, '') || ' ' || array_to_string(a.keywords, ' ')),
          websearch_to_tsquery('simple', q)
        ), 0) * 4.0
      + similarity(lower(a.title), q) * 2.0
      + CASE WHEN p_language IS NOT NULL AND a.language = p_language THEN 1.0 ELSE 0 END
      + (a.priority::real * 0.1)
    ) AS score
  FROM public.quickapp_help_articles a
  WHERE a.is_active = true
  ORDER BY score DESC
  LIMIT 5;
END; $$;
GRANT EXECUTE ON FUNCTION public.match_help_article(text, text) TO anon, authenticated, service_role;

INSERT INTO public.quickapp_help_agents (agent_id, name, default_language, notes)
VALUES ('af3cbfa9-7913-48ff-b6c1-d80e24b2bd4b', 'Madad', 'kn', 'Kannada QuickApp help agent');

INSERT INTO public.quickapp_help_articles (module, title, language, keywords, steps, priority) VALUES
('Attendance', 'Unable to Mark Attendance', 'kn',
 ARRAY['attendance','ಹಾಜರಾತಿ','ಹಾಜರಿ','gps','ಜಿಪಿಎಸ್','location','ಸ್ಥಳ','check in','ಚೆಕ್ ಇನ್'],
 ARRAY['Enable Location (GPS).','Ensure mobile data is turned on.','Stand near the registered retailer location.','Retry attendance.','If it still fails, submit a Regularization Request.'], 10),
('Attendance', 'Unable to Mark Attendance', 'en',
 ARRAY['attendance','mark attendance','gps not working','location','check in','cannot check in'],
 ARRAY['Enable Location (GPS).','Ensure mobile data is turned on.','Stand near the registered retailer location.','Retry attendance.','If it still fails, submit a Regularization Request.'], 10),
('Add Retailer', 'How to Create a New Retailer', 'kn',
 ARRAY['retailer','ರಿಟೇಲರ್','create retailer','add retailer','ಅಂಗಡಿ','new shop','ಹೊಸ ಅಂಗಡಿ'],
 ARRAY['Go to Retailers screen.','Tap the Add Retailer button.','Enter shop name, owner name and phone number.','Capture the shop photo and current GPS location.','Save the retailer.'], 10),
('Add Retailer', 'How to Create a New Retailer', 'en',
 ARRAY['retailer','add retailer','create retailer','new shop','onboard retailer'],
 ARRAY['Go to Retailers screen.','Tap the Add Retailer button.','Enter shop name, owner name and phone number.','Capture the shop photo and current GPS location.','Save the retailer.'], 10),
('Order Entry', 'How to Place an Order', 'kn',
 ARRAY['order','ಆರ್ಡರ್','place order','order entry','ಬಿಲ್','sale'],
 ARRAY['Open the retailer profile.','Tap New Order.','Add products and quantities.','Apply any available schemes.','Review totals and submit the order.'], 10),
('Order Entry', 'How to Place an Order', 'en',
 ARRAY['order','place order','order entry','create order','new order'],
 ARRAY['Open the retailer profile.','Tap New Order.','Add products and quantities.','Apply any available schemes.','Review totals and submit the order.'], 10),
('Beat', 'Beat Not Showing or Wrong Beat', 'kn',
 ARRAY['beat','ಬೀಟ್','route','ಮಾರ್ಗ','my beat','today beat'],
 ARRAY['Go to My Beat screen.','Pull down to refresh.','Confirm today is a working day for that beat.','If the beat is still missing, contact your Supervisor to reassign.'], 5),
('Beat', 'Beat Not Showing or Wrong Beat', 'en',
 ARRAY['beat','my beat','route','todays beat','beat not showing'],
 ARRAY['Go to My Beat screen.','Pull down to refresh.','Confirm today is a working day for that beat.','If the beat is still missing, contact your Supervisor to reassign.'], 5),
('Regularization', 'How to Submit a Regularization Request', 'kn',
 ARRAY['regularization','ರೆಗ್ಯುಲರೈಸೇಶನ್','missed attendance','ಹಾಜರಾತಿ ತಪ್ಪಿದೆ'],
 ARRAY['Open Attendance screen.','Tap Regularization Request.','Select the missed date.','Enter the reason.','Submit and wait for manager approval.'], 5),
('Regularization', 'How to Submit a Regularization Request', 'en',
 ARRAY['regularization','missed attendance','attendance request','regularize'],
 ARRAY['Open Attendance screen.','Tap Regularization Request.','Select the missed date.','Enter the reason.','Submit and wait for manager approval.'], 5),
('Sync', 'Data Not Syncing / Offline Data Stuck', 'kn',
 ARRAY['sync','ಸಿಂಕ್','offline','not syncing','data stuck','upload'],
 ARRAY['Check your internet connection.','Open the app and pull to refresh.','Go to Settings and tap Sync Now.','If it still fails, restart the app.'], 5),
('Sync', 'Data Not Syncing / Offline Data Stuck', 'en',
 ARRAY['sync','not syncing','offline','data not uploading','upload failed'],
 ARRAY['Check your internet connection.','Open the app and pull to refresh.','Go to Settings and tap Sync Now.','If it still fails, restart the app.'], 5),
('Login', 'Unable to Login', 'kn',
 ARRAY['login','ಲಾಗಿನ್','password','ಪಾಸ್ವರ್ಡ್','cannot login','sign in'],
 ARRAY['Confirm the correct phone number or email.','Use Forgot Password to reset if needed.','Check your internet connection.','If it still fails, contact your Administrator.'], 5),
('Login', 'Unable to Login', 'en',
 ARRAY['login','cannot login','password reset','sign in','unable to login'],
 ARRAY['Confirm the correct phone number or email.','Use Forgot Password to reset if needed.','Check your internet connection.','If it still fails, contact your Administrator.'], 5),
('Expenses', 'How to Submit an Expense', 'kn',
 ARRAY['expense','ಖರ್ಚು','ta','da','claim','ಬಿಲ್ ಅಪ್‌ಲೋಡ್'],
 ARRAY['Open Expenses screen.','Tap Add Expense.','Select the category such as TA or DA.','Enter the amount and upload the bill photo.','Submit for approval.'], 3),
('Expenses', 'How to Submit an Expense', 'en',
 ARRAY['expense','submit expense','ta','da','claim','upload bill'],
 ARRAY['Open Expenses screen.','Tap Add Expense.','Select the category such as TA or DA.','Enter the amount and upload the bill photo.','Submit for approval.'], 3);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.copilot_conversations TO authenticated;
GRANT ALL ON TABLE public.copilot_conversations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.copilot_messages TO authenticated;
GRANT ALL ON TABLE public.copilot_messages TO service_role;
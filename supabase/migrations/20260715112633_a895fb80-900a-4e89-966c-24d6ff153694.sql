
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_conversations TO authenticated;
GRANT ALL ON public.copilot_conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_messages TO authenticated;
GRANT ALL ON public.copilot_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_feedback TO authenticated;
GRANT ALL ON public.copilot_feedback TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_tool_audit TO authenticated;
GRANT ALL ON public.copilot_tool_audit TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_user_memory TO authenticated;
GRANT ALL ON public.copilot_user_memory TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_user_quotas TO authenticated;
GRANT ALL ON public.copilot_user_quotas TO service_role;


-- COPILOT v2 — Phase 1 foundation
CREATE TABLE public.copilot_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'New chat',
  model TEXT,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_copilot_conv_user ON public.copilot_conversations(user_id, last_message_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_conversations TO authenticated;
GRANT ALL ON public.copilot_conversations TO service_role;
ALTER TABLE public.copilot_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own conversations" ON public.copilot_conversations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins view all conversations" ON public.copilot_conversations FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.copilot_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.copilot_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content TEXT,
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  token_count INTEGER,
  model TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_copilot_msg_conv ON public.copilot_messages(conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_messages TO authenticated;
GRANT ALL ON public.copilot_messages TO service_role;
ALTER TABLE public.copilot_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages" ON public.copilot_messages FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins view all messages" ON public.copilot_messages FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.copilot_tool_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.copilot_conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.copilot_messages(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  args JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','error','denied','pending_approval')),
  was_write BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_copilot_audit_user ON public.copilot_tool_audit(user_id, created_at DESC);
CREATE INDEX idx_copilot_audit_tool ON public.copilot_tool_audit(tool_name, created_at DESC);
GRANT SELECT, INSERT ON public.copilot_tool_audit TO authenticated;
GRANT ALL ON public.copilot_tool_audit TO service_role;
ALTER TABLE public.copilot_tool_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own audit read" ON public.copilot_tool_audit FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "own audit insert" ON public.copilot_tool_audit FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins view all audit" ON public.copilot_tool_audit FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.copilot_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  message_id UUID NOT NULL REFERENCES public.copilot_messages(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, message_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_feedback TO authenticated;
GRANT ALL ON public.copilot_feedback TO service_role;
ALTER TABLE public.copilot_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own feedback" ON public.copilot_feedback FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins view all feedback" ON public.copilot_feedback FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.copilot_user_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_user_memory TO authenticated;
GRANT ALL ON public.copilot_user_memory TO service_role;
ALTER TABLE public.copilot_user_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memory" ON public.copilot_user_memory FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.copilot_user_quotas (
  user_id UUID NOT NULL PRIMARY KEY,
  daily_token_limit INTEGER NOT NULL DEFAULT 200000,
  daily_tool_call_limit INTEGER NOT NULL DEFAULT 500,
  tokens_used_today INTEGER NOT NULL DEFAULT 0,
  tool_calls_today INTEGER NOT NULL DEFAULT 0,
  quota_reset_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.copilot_user_quotas TO authenticated;
GRANT ALL ON public.copilot_user_quotas TO service_role;
ALTER TABLE public.copilot_user_quotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own quota read" ON public.copilot_user_quotas FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "admins manage quotas" ON public.copilot_user_quotas FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.copilot_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_copilot_conv_updated BEFORE UPDATE ON public.copilot_conversations
  FOR EACH ROW EXECUTE FUNCTION public.copilot_touch_updated_at();
CREATE TRIGGER trg_copilot_memory_updated BEFORE UPDATE ON public.copilot_user_memory
  FOR EACH ROW EXECUTE FUNCTION public.copilot_touch_updated_at();
CREATE TRIGGER trg_copilot_quota_updated BEFORE UPDATE ON public.copilot_user_quotas
  FOR EACH ROW EXECUTE FUNCTION public.copilot_touch_updated_at();

CREATE OR REPLACE FUNCTION public.copilot_bump_conversation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.copilot_conversations
     SET last_message_at = NEW.created_at,
         updated_at = now()
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_copilot_msg_bump AFTER INSERT ON public.copilot_messages
  FOR EACH ROW EXECUTE FUNCTION public.copilot_bump_conversation();

INSERT INTO public.feature_flags (feature_key, feature_name, description, category, is_enabled)
VALUES ('copilot_v2_enabled', 'Copilot v2', 'Enable the new QuickApp Copilot with tool-calling agent, RAG and proactive nudges.', 'ai', false)
ON CONFLICT (feature_key) DO NOTHING;

CREATE TYPE public.ai_agent_status AS ENUM ('prototype', 'coming_soon', 'live');
CREATE TYPE public.workflow_stage AS ENUM ('workflow', 'validation', 'simulation', 'production', 'monitoring');
CREATE TYPE public.workflow_exec_status AS ENUM ('running', 'success', 'failed');

CREATE TABLE public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status public.ai_agent_status NOT NULL DEFAULT 'coming_soon',
  category text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_agents TO authenticated;
GRANT ALL ON public.ai_agents TO service_role;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view ai agents"
  ON public.ai_agents FOR SELECT TO authenticated USING (true);

CREATE TABLE public.workflow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  stage public.workflow_stage NOT NULL DEFAULT 'simulation',
  status public.workflow_exec_status NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  error_message text,
  triggered_by uuid,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.workflow_executions TO authenticated;
GRANT ALL ON public.workflow_executions TO service_role;
ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own workflow executions"
  ON public.workflow_executions FOR SELECT TO authenticated
  USING (triggered_by = auth.uid());
CREATE POLICY "Users can create their own workflow executions"
  ON public.workflow_executions FOR INSERT TO authenticated
  WITH CHECK (triggered_by = auth.uid());
CREATE POLICY "Users can update their own workflow executions"
  ON public.workflow_executions FOR UPDATE TO authenticated
  USING (triggered_by = auth.uid()) WITH CHECK (triggered_by = auth.uid());

CREATE INDEX idx_workflow_executions_agent_started
  ON public.workflow_executions (agent_id, started_at DESC);
CREATE INDEX idx_workflow_executions_triggered_by
  ON public.workflow_executions (triggered_by, started_at DESC);

INSERT INTO public.ai_agents (key, name, description, status, category, sort_order) VALUES
  ('sales_coach', 'Sales Coach', 'Coaches reps on pitch and product mix per retailer.', 'coming_soon', 'coaching', 1),
  ('visit_optimiser', 'Visit Optimiser', 'Reorders the day''s beat to cut travel and add visits.', 'prototype', 'planning', 2),
  ('churn_detector', 'Churn Detector', 'Flags retailers going quiet before they stop ordering.', 'prototype', 'risk', 3),
  ('collections_assistant', 'Collections Assistant', 'Prioritises overdue balances for the next visit.', 'coming_soon', 'finance', 4),
  ('stock_advisor', 'Stock Advisor', 'Suggests distributor stock ahead of demand spikes.', 'coming_soon', 'inventory', 5),
  ('beat_planner', 'Beat Planner', 'Drafts monthly beat plans from coverage targets.', 'coming_soon', 'planning', 6);
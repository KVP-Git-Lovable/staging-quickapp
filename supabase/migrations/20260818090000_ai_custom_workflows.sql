-- Custom AI workflows for the /quickapp-ai/workflows "Create Workflow" builder.
--
-- Admins compose a workflow from predefined deterministic analysis blocks
-- (config jsonb: {version, blocks:[{type, params}], narration:{focus, tone}});
-- every authenticated user can see and run active workflows, with execution
-- data always scoped to the running user's RLS visibility. Additive only:
-- ai_agents and all existing workflow_executions rows are untouched.

CREATE TABLE public.ai_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  config jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  -- Stamped from the authenticated creator's identity; informational only —
  -- authorization comes solely from the RLS admin policy below.
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ai_workflows TO authenticated;
GRANT ALL ON public.ai_workflows TO service_role;

ALTER TABLE public.ai_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view ai workflows"
  ON public.ai_workflows FOR SELECT TO authenticated
  USING (true);

-- Same admin gate as approval_workflows: system-profile admins only.
CREATE POLICY "Admins can manage ai workflows"
  ON public.ai_workflows FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_ai_workflows_updated_at
  BEFORE UPDATE ON public.ai_workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Executions can now belong to either a seed agent or a custom workflow.
-- Deliberately NOT "ON DELETE CASCADE": execution history is audit data —
-- workflows are deactivated (is_active = false), never deleted.
ALTER TABLE public.workflow_executions
  ALTER COLUMN agent_id DROP NOT NULL;

ALTER TABLE public.workflow_executions
  ADD COLUMN workflow_id uuid REFERENCES public.ai_workflows(id);

ALTER TABLE public.workflow_executions
  ADD CONSTRAINT chk_workflow_executions_one_target
    CHECK (num_nonnulls(agent_id, workflow_id) = 1);

CREATE INDEX idx_workflow_executions_workflow_started
  ON public.workflow_executions (workflow_id, started_at DESC);

-- Promote Beat Planner and Sales Coach AI agents from coming_soon to prototype,
-- matching the runnable simulation support added in the ai-workflow-run edge function.
UPDATE public.ai_agents
SET status = 'prototype'
WHERE key IN ('beat_planner', 'sales_coach')
  AND status = 'coming_soon';

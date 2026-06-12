ALTER TABLE public.gamification_points
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.gamification_games(id) ON DELETE CASCADE;

-- Backfill game_id on any existing rows using the action's game.
UPDATE public.gamification_points gp
SET game_id = ga.game_id
FROM public.gamification_actions ga
WHERE gp.action_id = ga.id AND gp.game_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_gamification_points_game_id ON public.gamification_points(game_id);
CREATE INDEX IF NOT EXISTS idx_gamification_points_user_earned ON public.gamification_points(user_id, earned_at);
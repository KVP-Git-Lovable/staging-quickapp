UPDATE public.gamification_points p
SET game_id = a.game_id
FROM public.gamification_actions a
WHERE p.action_id = a.id
  AND a.game_id IS NOT NULL
  AND (p.game_id IS NULL OR p.game_id NOT IN (SELECT id FROM public.gamification_games));

UPDATE public.gamification_points p
SET game_id = NULL
WHERE p.game_id IS NOT NULL
  AND p.game_id NOT IN (SELECT id FROM public.gamification_games);

ALTER TABLE public.gamification_points
  ADD CONSTRAINT gamification_points_game_id_fkey
  FOREIGN KEY (game_id) REFERENCES public.gamification_games(id) ON DELETE SET NULL;
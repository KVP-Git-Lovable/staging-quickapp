
-- === BEFORE: rogue rows to be deleted, grouped by user ===
DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '--- ROGUE ROWS PER USER (before delete) ---';
  FOR r IN
    SELECT user_id, COUNT(*) AS rogue_rows, SUM(points) AS rogue_points
    FROM public.gamification_points
    WHERE game_id IS NULL AND metadata->>'auto_awarded' = 'true'
    GROUP BY user_id ORDER BY rogue_rows DESC
  LOOP
    RAISE NOTICE 'user=% rows=% points=%', r.user_id, r.rogue_rows, r.rogue_points;
  END LOOP;
END $$;

-- === BEFORE: per-affected-user total points ===
DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '--- TOTAL POINTS PER AFFECTED USER (before delete) ---';
  FOR r IN
    SELECT user_id, SUM(points) AS total_points
    FROM public.gamification_points
    WHERE user_id IN (
      SELECT DISTINCT user_id FROM public.gamification_points
      WHERE game_id IS NULL AND metadata->>'auto_awarded' = 'true'
    )
    GROUP BY user_id ORDER BY user_id
  LOOP
    RAISE NOTICE 'user=% total_before=%', r.user_id, r.total_points;
  END LOOP;
END $$;

-- === DELETE rogue duplicates ===
WITH deleted AS (
  DELETE FROM public.gamification_points
  WHERE game_id IS NULL
    AND metadata->>'auto_awarded' = 'true'
  RETURNING id
)
SELECT COUNT(*) AS deleted_count FROM deleted;

-- === AFTER: per-affected-user corrected totals ===
DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '--- TOTAL POINTS PER AFFECTED USER (after delete) ---';
  FOR r IN
    SELECT user_id, SUM(points) AS total_points
    FROM public.gamification_points
    WHERE user_id IN (
      '41070e2f-27a0-47c0-a2ca-b54a1118078f',
      '6be7e2ff-0447-44a0-a3b5-64993b9db54d',
      '206ae2fa-c899-4679-ba13-003666247e3a',
      '2da373bb-af9f-4b5d-a28b-9bd824ecbd2c',
      '94faceeb-36fc-4d51-8be7-87b0d6897006',
      'cadd4c26-bc9c-4d71-8a05-35d3169d2206'
    )
    GROUP BY user_id ORDER BY user_id
  LOOP
    RAISE NOTICE 'user=% total_after=%', r.user_id, r.total_points;
  END LOOP;
END $$;

-- === Verify no rogue rows remain ===
DO $$
DECLARE v_remaining INT;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM public.gamification_points
  WHERE game_id IS NULL AND metadata->>'auto_awarded' = 'true';
  RAISE NOTICE 'Rogue rows remaining: %', v_remaining;
END $$;

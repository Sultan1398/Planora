-- ============================================================
-- Track platforms used by each user
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS platforms_used TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN profiles.platforms_used IS
  'Distinct platforms that user has logged in from (Web, iOS, Android)';


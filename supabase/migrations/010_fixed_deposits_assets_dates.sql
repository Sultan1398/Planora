-- ============================================================
-- Growth: تواريخ البدء / الشراء للودائع والأصول الثابتة
-- ============================================================

ALTER TABLE fixed_deposits
  ADD COLUMN IF NOT EXISTS start_date DATE;

UPDATE fixed_deposits
SET start_date = (created_at AT TIME ZONE 'UTC')::date
WHERE start_date IS NULL;

ALTER TABLE fixed_deposits
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN start_date SET DEFAULT (CURRENT_DATE);

ALTER TABLE fixed_assets
  ADD COLUMN IF NOT EXISTS purchase_date DATE;

UPDATE fixed_assets
SET purchase_date = (created_at AT TIME ZONE 'UTC')::date
WHERE purchase_date IS NULL;

ALTER TABLE fixed_assets
  ALTER COLUMN purchase_date SET NOT NULL,
  ALTER COLUMN purchase_date SET DEFAULT (CURRENT_DATE);

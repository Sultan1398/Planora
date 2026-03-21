-- بداية الهدف (إضافة إلى أهداف المدخرات الموجودة)
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS start_date DATE;

UPDATE savings_goals
SET start_date = (created_at AT TIME ZONE 'UTC')::date
WHERE start_date IS NULL;

UPDATE savings_goals
SET start_date = CURRENT_DATE
WHERE start_date IS NULL;

ALTER TABLE savings_goals ALTER COLUMN start_date SET NOT NULL;
ALTER TABLE savings_goals ALTER COLUMN start_date SET DEFAULT CURRENT_DATE;

COMMENT ON COLUMN savings_goals.start_date IS 'Goal start date';
COMMENT ON COLUMN savings_goals.target_date IS 'Target closing / deadline date';

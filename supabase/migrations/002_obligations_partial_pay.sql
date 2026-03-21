-- ============================================================
-- التزامات مالية: سداد جزئي + ربط سدادات بجدول المصروفات
-- ============================================================

ALTER TABLE obligations
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- ترحيل من status (مرة واحدة فقط إن وُجد العمود)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'obligations'
      AND column_name = 'status'
  ) THEN
    UPDATE obligations SET paid_amount = amount WHERE status = 'paid';
    UPDATE obligations SET paid_amount = 0 WHERE status = 'pending';
    ALTER TABLE obligations DROP COLUMN status;
  END IF;
END $$;

ALTER TABLE obligations
  DROP CONSTRAINT IF EXISTS obligations_paid_amount_check;

ALTER TABLE obligations
  ADD CONSTRAINT obligations_paid_amount_check
  CHECK (paid_amount >= 0 AND paid_amount <= amount);

ALTER TABLE outflows
  ADD COLUMN IF NOT EXISTS obligation_id UUID REFERENCES obligations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_outflows_obligation_id ON outflows (obligation_id);

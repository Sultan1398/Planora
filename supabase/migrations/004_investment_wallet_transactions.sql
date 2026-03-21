-- ============================================================
-- INVESTMENT WALLET TRANSACTIONS (محفظة داخلية + ربط المحفظة)
-- ============================================================

-- types:
-- - deposit      : من المحفظة -> محفظة الاستثمارات
-- - withdrawal   : من محفظة الاستثمارات -> المحفظة
-- - deal_open    : سحب entry_amount من محفظة الاستثمارات عند فتح صفقة
-- - deal_close   : إيداع exit_amount في محفظة الاستثمارات عند إغلاق صفقة

CREATE TABLE IF NOT EXISTS investment_wallet_transactions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'deal_open', 'deal_close')),
  amount        NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  date          DATE NOT NULL,
  investment_id UUID REFERENCES investments(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE investment_wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own investment wallet transactions"
ON investment_wallet_transactions
FOR ALL
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_inv_wallet_tx_user_date
  ON investment_wallet_transactions (user_id, date);

CREATE INDEX IF NOT EXISTS idx_inv_wallet_tx_user_investment
  ON investment_wallet_transactions (user_id, investment_id);


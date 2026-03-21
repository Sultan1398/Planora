-- ============================================================
-- Planora — Initial Database Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start_day    INTEGER NOT NULL DEFAULT 1 CHECK (period_start_day BETWEEN 1 AND 28),
  period_start_month  INTEGER NOT NULL DEFAULT 1 CHECK (period_start_month BETWEEN 1 AND 12),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- INFLOWS (الدخل)
-- ============================================================
CREATE TABLE IF NOT EXISTS inflows (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name_ar     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  type        TEXT NOT NULL CHECK (type IN ('fixed', 'variable')),
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- OUTFLOWS (المصروف)
-- ============================================================
CREATE TABLE IF NOT EXISTS outflows (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name_ar     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending')),
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- OBLIGATIONS (الالتزامات الدورية)
-- ============================================================
CREATE TABLE IF NOT EXISTS obligations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name_ar     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending')),
  due_date    DATE NOT NULL,
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SAVINGS GOALS (أهداف الادخار)
-- ============================================================
CREATE TABLE IF NOT EXISTS savings_goals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name_ar         TEXT NOT NULL,
  name_en         TEXT NOT NULL,
  target_amount   NUMERIC(12, 2) NOT NULL CHECK (target_amount > 0),
  current_amount  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  target_date     DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SAVINGS TRANSACTIONS (معاملات الادخار)
-- ============================================================
CREATE TABLE IF NOT EXISTS savings_transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  goal_id     UUID NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal')),
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update savings_goals.current_amount on transaction
CREATE OR REPLACE FUNCTION update_savings_goal_amount()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'deposit' THEN
      UPDATE savings_goals SET current_amount = current_amount + NEW.amount WHERE id = NEW.goal_id;
    ELSE
      UPDATE savings_goals SET current_amount = GREATEST(0, current_amount - NEW.amount) WHERE id = NEW.goal_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.type = 'deposit' THEN
      UPDATE savings_goals SET current_amount = GREATEST(0, current_amount - OLD.amount) WHERE id = OLD.goal_id;
    ELSE
      UPDATE savings_goals SET current_amount = current_amount + OLD.amount WHERE id = OLD.goal_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER savings_transaction_amount_sync
  AFTER INSERT OR DELETE ON savings_transactions
  FOR EACH ROW EXECUTE FUNCTION update_savings_goal_amount();

-- ============================================================
-- INVESTMENTS (الاستثمارات)
-- ============================================================
CREATE TABLE IF NOT EXISTS investments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name_ar       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('stocks', 'partnership', 'freelance', 'other')),
  entry_amount  NUMERIC(12, 2) NOT NULL CHECK (entry_amount > 0),
  entry_date    DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  exit_amount   NUMERIC(12, 2),
  exit_date     DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE inflows              ENABLE ROW LEVEL SECURITY;
ALTER TABLE outflows             ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments          ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile"   ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Inflows
CREATE POLICY "Users manage own inflows" ON inflows FOR ALL USING (auth.uid() = user_id);

-- Outflows
CREATE POLICY "Users manage own outflows" ON outflows FOR ALL USING (auth.uid() = user_id);

-- Obligations
CREATE POLICY "Users manage own obligations" ON obligations FOR ALL USING (auth.uid() = user_id);

-- Savings Goals
CREATE POLICY "Users manage own savings goals" ON savings_goals FOR ALL USING (auth.uid() = user_id);

-- Savings Transactions
CREATE POLICY "Users manage own savings transactions" ON savings_transactions FOR ALL USING (auth.uid() = user_id);

-- Investments
CREATE POLICY "Users manage own investments" ON investments FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_inflows_user_date        ON inflows (user_id, date);
CREATE INDEX idx_outflows_user_date       ON outflows (user_id, date);
CREATE INDEX idx_obligations_user_date    ON obligations (user_id, date);
CREATE INDEX idx_obligations_due_date     ON obligations (user_id, due_date);
CREATE INDEX idx_savings_tx_user_date     ON savings_transactions (user_id, date);
CREATE INDEX idx_savings_tx_goal          ON savings_transactions (goal_id);
CREATE INDEX idx_investments_user_date    ON investments (user_id, entry_date);
CREATE INDEX idx_investments_status       ON investments (user_id, status);

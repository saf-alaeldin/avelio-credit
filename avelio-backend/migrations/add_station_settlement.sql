-- Station Settlement Migration
-- Run this file to add all tables for Station Settlement feature

-- =====================================================
-- 1. STATIONS TABLE (Master Data)
-- =====================================================
CREATE TABLE IF NOT EXISTS stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_code VARCHAR(10) UNIQUE NOT NULL,
  station_name VARCHAR(255) NOT NULL,
  currencies_allowed TEXT[] DEFAULT ARRAY['USD', 'SSP'],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE stations IS 'Master data for airline stations/POS locations';

-- =====================================================
-- 2. SALES_AGENTS TABLE (Station Sales Agents)
-- =====================================================
CREATE TABLE IF NOT EXISTS sales_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_code VARCHAR(50) UNIQUE NOT NULL,
  agent_name VARCHAR(255) NOT NULL,
  station_id UUID REFERENCES stations(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE sales_agents IS 'Sales agents who handle cash transactions at stations';

CREATE INDEX IF NOT EXISTS idx_sales_agents_station ON sales_agents(station_id);

-- =====================================================
-- 3. EXPENSE_CODES TABLE (Centrally Controlled)
-- =====================================================
CREATE TABLE IF NOT EXISTS expense_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  currencies_allowed TEXT[] DEFAULT ARRAY['USD', 'SSP'],
  requires_receipt BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE expense_codes IS 'Centrally controlled expense codes for settlement expenses';

-- =====================================================
-- 4. SETTLEMENTS TABLE (Main Settlement Record)
-- =====================================================
CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_number VARCHAR(50) UNIQUE NOT NULL,
  station_id UUID REFERENCES stations(id) NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',

  -- Created/Updated tracking
  created_by UUID REFERENCES users(id),
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMP,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,

  -- Approval details
  approval_type VARCHAR(50),
  approval_notes TEXT,
  rejection_reason TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraint to prevent overlapping periods for same station
  CONSTRAINT valid_status CHECK (status IN ('DRAFT', 'REVIEW', 'APPROVED', 'REJECTED', 'CLOSED'))
);

COMMENT ON TABLE settlements IS 'Main settlement records for station cash reconciliation';
COMMENT ON COLUMN settlements.status IS 'DRAFT, REVIEW, APPROVED, REJECTED, CLOSED';
COMMENT ON COLUMN settlements.approval_type IS 'BALANCED or APPROVED_WITH_VARIANCE';

CREATE INDEX IF NOT EXISTS idx_settlements_station ON settlements(station_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlements_period ON settlements(period_from, period_to);

-- =====================================================
-- 5. STATION_SALES TABLE (Sales from Reservation System)
-- =====================================================
CREATE TABLE IF NOT EXISTS station_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_reference VARCHAR(100) UNIQUE NOT NULL,
  station_id UUID REFERENCES stations(id) NOT NULL,
  agent_id UUID REFERENCES sales_agents(id) NOT NULL,
  transaction_date DATE NOT NULL,
  transaction_time TIME,
  flight_reference VARCHAR(50),
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  payment_method VARCHAR(50) DEFAULT 'CASH',
  customer_name VARCHAR(255),
  description TEXT,
  settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE station_sales IS 'Sales transactions from reservation system or manual entry';
COMMENT ON COLUMN station_sales.settlement_id IS 'NULL until sale is included in a settlement';

CREATE INDEX IF NOT EXISTS idx_station_sales_station ON station_sales(station_id);
CREATE INDEX IF NOT EXISTS idx_station_sales_agent ON station_sales(agent_id);
CREATE INDEX IF NOT EXISTS idx_station_sales_date ON station_sales(transaction_date);
CREATE INDEX IF NOT EXISTS idx_station_sales_settlement ON station_sales(settlement_id);
CREATE INDEX IF NOT EXISTS idx_station_sales_unsettled ON station_sales(station_id, transaction_date) WHERE settlement_id IS NULL;

-- =====================================================
-- 6. SETTLEMENT_AGENT_ENTRIES TABLE (Per-Agent Cash)
-- =====================================================
CREATE TABLE IF NOT EXISTS settlement_agent_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID REFERENCES settlements(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES sales_agents(id) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  expected_cash DECIMAL(15,2) NOT NULL DEFAULT 0,
  declared_cash DECIMAL(15,2),
  variance DECIMAL(15,2),
  variance_status VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(settlement_id, agent_id, currency),
  CONSTRAINT valid_variance_status CHECK (variance_status IS NULL OR variance_status IN ('BALANCED', 'SHORT', 'EXTRA', 'PENDING'))
);

COMMENT ON TABLE settlement_agent_entries IS 'Per-agent expected vs declared cash for settlements';
COMMENT ON COLUMN settlement_agent_entries.expected_cash IS 'System-calculated sum of agent sales';
COMMENT ON COLUMN settlement_agent_entries.declared_cash IS 'HQ-declared cash amount sent by agent';
COMMENT ON COLUMN settlement_agent_entries.variance IS 'declared_cash - expected_cash';

CREATE INDEX IF NOT EXISTS idx_settlement_agent_entries_settlement ON settlement_agent_entries(settlement_id);

-- =====================================================
-- 7. SETTLEMENT_EXPENSES TABLE (Expenses per Settlement)
-- =====================================================
CREATE TABLE IF NOT EXISTS settlement_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID REFERENCES settlements(id) ON DELETE CASCADE NOT NULL,
  expense_code_id UUID REFERENCES expense_codes(id) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE settlement_expenses IS 'Expenses that reduce cash holding for a settlement';

CREATE INDEX IF NOT EXISTS idx_settlement_expenses_settlement ON settlement_expenses(settlement_id);

-- =====================================================
-- 8. SETTLEMENT_SUMMARIES TABLE (Per-Currency Summary)
-- =====================================================
CREATE TABLE IF NOT EXISTS settlement_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID REFERENCES settlements(id) ON DELETE CASCADE NOT NULL,
  currency VARCHAR(10) NOT NULL,

  -- Opening balance (carry-forward from previous)
  opening_balance DECIMAL(15,2) DEFAULT 0,
  opening_balance_settlement_id UUID REFERENCES settlements(id),

  -- Calculated values
  expected_cash DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_expenses DECIMAL(15,2) DEFAULT 0,
  expected_net_cash DECIMAL(15,2) NOT NULL DEFAULT 0,

  -- Declared values
  actual_cash_received DECIMAL(15,2),

  -- Final variance
  final_variance DECIMAL(15,2),
  variance_status VARCHAR(20),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(settlement_id, currency),
  CONSTRAINT valid_summary_variance_status CHECK (variance_status IS NULL OR variance_status IN ('BALANCED', 'SHORT', 'EXTRA', 'PENDING'))
);

COMMENT ON TABLE settlement_summaries IS 'Per-currency summary for settlements with carry-forward';
COMMENT ON COLUMN settlement_summaries.opening_balance IS 'Carry-forward variance from previous settlement';
COMMENT ON COLUMN settlement_summaries.expected_net_cash IS 'expected_cash - total_expenses + opening_balance';
COMMENT ON COLUMN settlement_summaries.final_variance IS 'actual_cash_received - expected_net_cash';

CREATE INDEX IF NOT EXISTS idx_settlement_summaries_settlement ON settlement_summaries(settlement_id);

-- =====================================================
-- 9. SETTLEMENT_AUDIT_LOGS TABLE (Detailed Audit Trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS settlement_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID REFERENCES settlements(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  field_changed VARCHAR(100),
  old_value JSONB,
  new_value JSONB,
  notes TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE settlement_audit_logs IS 'Detailed audit trail for all settlement actions';
COMMENT ON COLUMN settlement_audit_logs.action IS 'CREATE, UPDATE, SUBMIT, APPROVE, REJECT, ADD_EXPENSE, etc.';

CREATE INDEX IF NOT EXISTS idx_settlement_audit_settlement ON settlement_audit_logs(settlement_id);
CREATE INDEX IF NOT EXISTS idx_settlement_audit_created ON settlement_audit_logs(created_at DESC);

-- =====================================================
-- INSERT DEFAULT DATA
-- =====================================================

-- Default Stations
INSERT INTO stations (station_code, station_name, currencies_allowed) VALUES
  ('JUB', 'Juba International Airport', ARRAY['USD', 'SSP']),
  ('EBB', 'Entebbe International Airport', ARRAY['USD'])
ON CONFLICT (station_code) DO NOTHING;

-- Default Expense Codes
INSERT INTO expense_codes (code, name, category, currencies_allowed, requires_receipt) VALUES
  ('FUEL-001', 'Aircraft Fuel Payment', 'Operations', ARRAY['USD', 'SSP'], false),
  ('FUEL-002', 'Ground Vehicle Fuel', 'Operations', ARRAY['SSP'], false),
  ('SUPPL-001', 'Office Supplies', 'Admin', ARRAY['SSP'], false),
  ('SUPPL-002', 'Cleaning Supplies', 'Admin', ARRAY['SSP'], false),
  ('SECURITY-001', 'Security Services', 'Operations', ARRAY['USD', 'SSP'], false),
  ('CATERING-001', 'Crew Catering', 'Operations', ARRAY['USD', 'SSP'], false),
  ('HANDLING-001', 'Ground Handling Fees', 'Operations', ARRAY['USD'], false),
  ('COMM-001', 'Communication Expenses', 'Admin', ARRAY['SSP'], false),
  ('TRANSPORT-001', 'Local Transport', 'Operations', ARRAY['SSP'], false),
  ('MISC-001', 'Miscellaneous Expense', 'Admin', ARRAY['USD', 'SSP'], false)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- FUNCTION: Check for overlapping settlement periods
-- =====================================================
CREATE OR REPLACE FUNCTION check_settlement_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM settlements
    WHERE station_id = NEW.station_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND status NOT IN ('REJECTED')
      AND (
        (NEW.period_from, NEW.period_to) OVERLAPS (period_from, period_to)
      )
  ) THEN
    RAISE EXCEPTION 'Settlement period overlaps with an existing settlement for this station';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to prevent overlapping periods
DROP TRIGGER IF EXISTS trg_check_settlement_overlap ON settlements;
CREATE TRIGGER trg_check_settlement_overlap
  BEFORE INSERT OR UPDATE ON settlements
  FOR EACH ROW
  EXECUTE FUNCTION check_settlement_overlap();

-- =====================================================
-- FUNCTION: Auto-calculate variance on declared_cash update
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_agent_variance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.declared_cash IS NOT NULL THEN
    NEW.variance := NEW.declared_cash - NEW.expected_cash;
    IF NEW.variance = 0 THEN
      NEW.variance_status := 'BALANCED';
    ELSIF NEW.variance < 0 THEN
      NEW.variance_status := 'SHORT';
    ELSE
      NEW.variance_status := 'EXTRA';
    END IF;
  ELSE
    NEW.variance := NULL;
    NEW.variance_status := 'PENDING';
  END IF;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_agent_variance ON settlement_agent_entries;
CREATE TRIGGER trg_calculate_agent_variance
  BEFORE INSERT OR UPDATE ON settlement_agent_entries
  FOR EACH ROW
  EXECUTE FUNCTION calculate_agent_variance();

-- =====================================================
-- FUNCTION: Generate settlement number
-- =====================================================
CREATE OR REPLACE FUNCTION generate_settlement_number(p_station_code VARCHAR, p_date DATE)
RETURNS VARCHAR AS $$
DECLARE
  v_date_str VARCHAR;
  v_seq INT;
  v_number VARCHAR;
BEGIN
  v_date_str := TO_CHAR(p_date, 'YYYYMMDD');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(settlement_number FROM '([0-9]+)$') AS INT)
  ), 0) + 1
  INTO v_seq
  FROM settlements
  WHERE settlement_number LIKE 'STL-' || p_station_code || '-' || v_date_str || '-%';

  v_number := 'STL-' || p_station_code || '-' || v_date_str || '-' || LPAD(v_seq::TEXT, 3, '0');
  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- Success message
SELECT 'Station Settlement schema created successfully!' AS message;

-- Migration: Add HQ Settlement feature
-- HQ Settlement consolidates all station settlements and deducts HQ-level expenses from the total

-- =====================================================
-- 1. HQ SETTLEMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS hq_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_number VARCHAR(50) UNIQUE NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',

  -- Tracking
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

  CONSTRAINT valid_hq_status CHECK (status IN ('DRAFT', 'REVIEW', 'APPROVED', 'REJECTED', 'CLOSED'))
);

COMMENT ON TABLE hq_settlements IS 'HQ-level settlements that consolidate all station settlements';

CREATE INDEX IF NOT EXISTS idx_hq_settlements_status ON hq_settlements(status);
CREATE INDEX IF NOT EXISTS idx_hq_settlements_period ON hq_settlements(period_from, period_to);

-- =====================================================
-- 2. HQ SETTLEMENT STATIONS TABLE (Link to station settlements)
-- =====================================================
CREATE TABLE IF NOT EXISTS hq_settlement_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hq_settlement_id UUID REFERENCES hq_settlements(id) ON DELETE CASCADE NOT NULL,
  station_settlement_id UUID REFERENCES settlements(id) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(hq_settlement_id, station_settlement_id)
);

COMMENT ON TABLE hq_settlement_stations IS 'Links HQ settlements to individual station settlements';

CREATE INDEX IF NOT EXISTS idx_hq_settlement_stations_hq ON hq_settlement_stations(hq_settlement_id);
CREATE INDEX IF NOT EXISTS idx_hq_settlement_stations_station ON hq_settlement_stations(station_settlement_id);

-- =====================================================
-- 3. HQ SETTLEMENT EXPENSES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS hq_settlement_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hq_settlement_id UUID REFERENCES hq_settlements(id) ON DELETE CASCADE NOT NULL,
  expense_code_id UUID REFERENCES expense_codes(id) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE hq_settlement_expenses IS 'HQ-level expenses deducted from consolidated settlement';

CREATE INDEX IF NOT EXISTS idx_hq_settlement_expenses_hq ON hq_settlement_expenses(hq_settlement_id);

-- =====================================================
-- 4. HQ SETTLEMENT SUMMARIES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS hq_settlement_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hq_settlement_id UUID REFERENCES hq_settlements(id) ON DELETE CASCADE NOT NULL,
  currency VARCHAR(10) NOT NULL,

  -- Aggregated from station settlements
  total_stations_count INT DEFAULT 0,
  total_station_expected_cash DECIMAL(15,2) DEFAULT 0,
  total_station_actual_cash DECIMAL(15,2) DEFAULT 0,
  total_station_expenses DECIMAL(15,2) DEFAULT 0,
  total_station_net_cash DECIMAL(15,2) DEFAULT 0,

  -- HQ-level expenses
  total_hq_expenses DECIMAL(15,2) DEFAULT 0,

  -- Final calculations
  grand_expected_cash DECIMAL(15,2) DEFAULT 0,
  grand_actual_cash DECIMAL(15,2) DEFAULT 0,
  grand_net_cash DECIMAL(15,2) DEFAULT 0,
  final_variance DECIMAL(15,2),
  variance_status VARCHAR(20),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(hq_settlement_id, currency),
  CONSTRAINT valid_hq_summary_variance_status CHECK (variance_status IS NULL OR variance_status IN ('BALANCED', 'SHORT', 'EXTRA', 'PENDING'))
);

COMMENT ON TABLE hq_settlement_summaries IS 'Per-currency summary for HQ settlements';

CREATE INDEX IF NOT EXISTS idx_hq_settlement_summaries_hq ON hq_settlement_summaries(hq_settlement_id);

-- =====================================================
-- 5. HQ SETTLEMENT AUDIT LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS hq_settlement_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hq_settlement_id UUID REFERENCES hq_settlements(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  field_changed VARCHAR(100),
  old_value JSONB,
  new_value JSONB,
  notes TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE hq_settlement_audit_logs IS 'Audit trail for HQ settlement actions';

CREATE INDEX IF NOT EXISTS idx_hq_settlement_audit_hq ON hq_settlement_audit_logs(hq_settlement_id);
CREATE INDEX IF NOT EXISTS idx_hq_settlement_audit_created ON hq_settlement_audit_logs(created_at DESC);

-- =====================================================
-- 6. FUNCTION: Generate HQ settlement number
-- =====================================================
CREATE OR REPLACE FUNCTION generate_hq_settlement_number(p_date DATE)
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
  FROM hq_settlements
  WHERE settlement_number LIKE 'HQ-STL-' || v_date_str || '-%';

  v_number := 'HQ-STL-' || v_date_str || '-' || LPAD(v_seq::TEXT, 3, '0');
  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- Success message
SELECT 'Migration 006: HQ Settlement tables created successfully!' AS message;

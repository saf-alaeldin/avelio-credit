-- Migration: Add HQ Income feature
-- Allows managers/admins to add income items that increase the TO SAFE amount

-- =====================================================
-- 1. HQ SETTLEMENT INCOME TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS hq_settlement_income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hq_settlement_id UUID REFERENCES hq_settlements(id) ON DELETE CASCADE NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE hq_settlement_income IS 'HQ-level income items that increase the TO SAFE amount';

CREATE INDEX IF NOT EXISTS idx_hq_settlement_income_hq ON hq_settlement_income(hq_settlement_id);

-- =====================================================
-- 2. ADD total_hq_income COLUMN TO hq_settlement_summaries
-- =====================================================
ALTER TABLE hq_settlement_summaries
  ADD COLUMN IF NOT EXISTS total_hq_income DECIMAL(15,2) DEFAULT 0;

-- Success message
SELECT 'Migration 009: HQ Income table and column added successfully!' AS message;

-- Migration: Add station total cash verification fields
-- This allows verification between sum of agent cash and station declared total

-- =====================================================
-- 1. ADD NEW COLUMNS TO SETTLEMENT_SUMMARIES
-- =====================================================
ALTER TABLE settlement_summaries
  ADD COLUMN IF NOT EXISTS station_declared_cash DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS agent_cash_total DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS cash_match_status VARCHAR(20) DEFAULT 'PENDING';

-- =====================================================
-- 2. ADD CONSTRAINT FOR CASH_MATCH_STATUS
-- =====================================================
ALTER TABLE settlement_summaries
  DROP CONSTRAINT IF EXISTS valid_cash_match_status;

ALTER TABLE settlement_summaries
  ADD CONSTRAINT valid_cash_match_status CHECK (
    cash_match_status IS NULL OR cash_match_status IN ('MATCH', 'MISMATCH', 'PENDING')
  );

-- =====================================================
-- 3. CREATE TRIGGER TO AUTO-CHECK CASH MATCH
-- =====================================================
CREATE OR REPLACE FUNCTION check_cash_match()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate match status based on station_declared_cash and agent_cash_total
  IF NEW.station_declared_cash IS NOT NULL AND NEW.agent_cash_total IS NOT NULL THEN
    IF NEW.station_declared_cash = NEW.agent_cash_total THEN
      NEW.cash_match_status := 'MATCH';
    ELSE
      NEW.cash_match_status := 'MISMATCH';
    END IF;
  ELSE
    NEW.cash_match_status := 'PENDING';
  END IF;

  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_check_cash_match ON settlement_summaries;

-- Create trigger for INSERT and UPDATE
CREATE TRIGGER trg_check_cash_match
  BEFORE INSERT OR UPDATE ON settlement_summaries
  FOR EACH ROW
  EXECUTE FUNCTION check_cash_match();

-- =====================================================
-- 4. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================
COMMENT ON COLUMN settlement_summaries.station_declared_cash IS 'Total cash declared by station (entered by finance officer)';
COMMENT ON COLUMN settlement_summaries.agent_cash_total IS 'Sum of all agent declared_cash amounts (calculated)';
COMMENT ON COLUMN settlement_summaries.cash_match_status IS 'MATCH if station and agent totals match, MISMATCH otherwise, PENDING if incomplete';

-- Success message
SELECT 'Migration 005: Added station total cash verification fields successfully!' AS message;

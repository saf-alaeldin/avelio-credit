-- Migration: Add sales_amount and cashout_amount fields to station_sales
-- This allows tracking reservation system sales and cashout/refunds separately

-- =====================================================
-- 1. ADD NEW COLUMNS
-- =====================================================
ALTER TABLE station_sales
  ADD COLUMN IF NOT EXISTS sales_amount DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS cashout_amount DECIMAL(15,2) DEFAULT 0;

-- =====================================================
-- 2. MIGRATE EXISTING DATA
-- =====================================================
-- Existing positive amounts become sales_amount
-- Existing negative amounts become cashout_amount (stored as positive)
-- The `amount` field will be the calculated balance (sales_amount - cashout_amount)

UPDATE station_sales
SET
  sales_amount = CASE WHEN amount >= 0 THEN amount ELSE 0 END,
  cashout_amount = CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END
WHERE sales_amount IS NULL;

-- =====================================================
-- 3. ADD CONSTRAINTS
-- =====================================================
-- Ensure amounts are non-negative
ALTER TABLE station_sales
  DROP CONSTRAINT IF EXISTS chk_sales_amount,
  DROP CONSTRAINT IF EXISTS chk_cashout_amount;

ALTER TABLE station_sales
  ADD CONSTRAINT chk_sales_amount CHECK (sales_amount IS NULL OR sales_amount >= 0),
  ADD CONSTRAINT chk_cashout_amount CHECK (cashout_amount IS NULL OR cashout_amount >= 0);

-- =====================================================
-- 4. CREATE TRIGGER TO AUTO-CALCULATE BALANCE
-- =====================================================
-- The `amount` field becomes the calculated balance: sales_amount - cashout_amount

CREATE OR REPLACE FUNCTION calculate_sale_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate balance (amount) from sales_amount and cashout_amount
  NEW.amount := COALESCE(NEW.sales_amount, 0) - COALESCE(NEW.cashout_amount, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_calculate_sale_balance ON station_sales;

-- Create trigger for INSERT and UPDATE
CREATE TRIGGER trg_calculate_sale_balance
  BEFORE INSERT OR UPDATE ON station_sales
  FOR EACH ROW
  EXECUTE FUNCTION calculate_sale_balance();

-- =====================================================
-- 5. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================
COMMENT ON COLUMN station_sales.sales_amount IS 'Amount from airline reservation system (positive sales)';
COMMENT ON COLUMN station_sales.cashout_amount IS 'Cashout/refund/void amount (stored as positive value)';
COMMENT ON COLUMN station_sales.amount IS 'Calculated balance: sales_amount - cashout_amount';

-- =====================================================
-- 6. UPDATE EXISTING RECORDS TO TRIGGER BALANCE CALCULATION
-- =====================================================
-- Force recalculation of amount for all existing records
UPDATE station_sales SET sales_amount = sales_amount WHERE sales_amount IS NOT NULL;

-- Success message
SELECT 'Migration 004: Added sales_amount and cashout_amount fields successfully!' AS message;

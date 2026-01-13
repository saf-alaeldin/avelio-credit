-- Migration: 007_station_summary_changes.sql
-- Transform HQ Settlement to Station Summary (daily cash consolidation)
-- Changes:
--   1. Simplify status to DRAFT/CLOSED only
--   2. Add summary_date column for daily summaries
--   3. Add safe_amount for carry-forward opening balance

-- ============================================
-- 1. Update status constraint
-- ============================================
ALTER TABLE hq_settlements DROP CONSTRAINT IF EXISTS valid_hq_status;

-- Update existing non-DRAFT/CLOSED records to CLOSED
UPDATE hq_settlements
SET status = 'CLOSED'
WHERE status NOT IN ('DRAFT', 'CLOSED');

-- Add new simplified constraint
ALTER TABLE hq_settlements ADD CONSTRAINT valid_hq_status
  CHECK (status IN ('DRAFT', 'CLOSED'));

-- ============================================
-- 2. Add summary_date column (daily summary)
-- ============================================
ALTER TABLE hq_settlements
ADD COLUMN IF NOT EXISTS summary_date DATE;

-- Populate summary_date from existing period_from for existing records
UPDATE hq_settlements
SET summary_date = period_from
WHERE summary_date IS NULL;

-- Add unique constraint to prevent duplicate summaries for same date
-- (commented out in case there are existing duplicates - run manually after cleanup)
-- ALTER TABLE hq_settlements ADD CONSTRAINT unique_summary_date UNIQUE (summary_date);

-- ============================================
-- 3. Add safe_amount to summaries
-- ============================================
ALTER TABLE hq_settlement_summaries
ADD COLUMN IF NOT EXISTS safe_amount DECIMAL(15,2) DEFAULT 0;

-- Add opening_balance column to track carry-forward
ALTER TABLE hq_settlement_summaries
ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(15,2) DEFAULT 0;

-- Add cash_from_stations to track station settlements total
ALTER TABLE hq_settlement_summaries
ADD COLUMN IF NOT EXISTS cash_from_stations DECIMAL(15,2) DEFAULT 0;

-- Add total_available (opening_balance + cash_from_stations)
ALTER TABLE hq_settlement_summaries
ADD COLUMN IF NOT EXISTS total_available DECIMAL(15,2) DEFAULT 0;

-- ============================================
-- 4. Clean up unused columns (optional)
-- ============================================
-- Keep period_from and period_to for backward compatibility
-- They can be removed in a future migration if needed

-- ============================================
-- 5. Update settlement number format function (optional)
-- ============================================
-- The existing generate_hq_settlement_number() function can remain as-is
-- Format: HQ-STL-YYYYMMDD-NNN

COMMIT;

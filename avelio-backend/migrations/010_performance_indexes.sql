-- Migration 010: Performance indexes and unique constraint for settlements
-- Adds composite indexes for common query patterns and prevents duplicate settlements

-- ============================================================
-- COMPOSITE INDEXES FOR RECEIPTS
-- ============================================================

-- For filtered receipt queries (status + date + non-void)
CREATE INDEX IF NOT EXISTS idx_receipts_active_status_date
ON receipts(status, issue_date DESC) WHERE is_void = false;

-- For payment date queries
CREATE INDEX IF NOT EXISTS idx_receipts_payment_date
ON receipts(payment_date DESC) WHERE payment_date IS NOT NULL AND is_void = false;

-- For station-based receipt queries
CREATE INDEX IF NOT EXISTS idx_receipts_station_date
ON receipts(station_code, issue_date DESC) WHERE is_void = false;

-- For currency-filtered receipt queries
CREATE INDEX IF NOT EXISTS idx_receipts_currency
ON receipts(currency) WHERE is_void = false;

-- ============================================================
-- COMPOSITE INDEXES FOR STATION SALES
-- ============================================================

-- For settlement calculation queries (station + date range)
CREATE INDEX IF NOT EXISTS idx_station_sales_station_date
ON station_sales(station_id, transaction_date DESC);

-- For currency-filtered sales queries
CREATE INDEX IF NOT EXISTS idx_station_sales_currency
ON station_sales(currency);

-- For POS-filtered sales queries
CREATE INDEX IF NOT EXISTS idx_station_sales_payment_method
ON station_sales(payment_method);

-- ============================================================
-- COMPOSITE INDEXES FOR SETTLEMENT TABLES
-- ============================================================

-- For agent variance queries
CREATE INDEX IF NOT EXISTS idx_agent_entries_agent_currency
ON settlement_agent_entries(agent_id, currency) WHERE is_deleted = false;

-- For variance status reporting
CREATE INDEX IF NOT EXISTS idx_agent_entries_variance
ON settlement_agent_entries(variance_status) WHERE is_deleted = false;

-- For expense queries by code and currency
CREATE INDEX IF NOT EXISTS idx_settlement_expenses_code_currency
ON settlement_expenses(expense_code_id, currency) WHERE is_deleted = false;

-- For settlement summaries by currency
CREATE INDEX IF NOT EXISTS idx_settlement_summaries_currency
ON settlement_summaries(currency) WHERE is_deleted = false;

-- For settlement date-based lookups
CREATE INDEX IF NOT EXISTS idx_settlements_created_date
ON settlements(created_at DESC) WHERE is_deleted = false;

-- ============================================================
-- COMPOSITE INDEXES FOR HQ SETTLEMENT TABLES
-- ============================================================

-- For HQ summary variance reporting
CREATE INDEX IF NOT EXISTS idx_hq_summaries_variance
ON hq_settlement_summaries(variance_status);

-- For HQ summary currency queries
CREATE INDEX IF NOT EXISTS idx_hq_summaries_currency
ON hq_settlement_summaries(currency);

-- For HQ income queries by currency
CREATE INDEX IF NOT EXISTS idx_hq_income_currency
ON hq_settlement_income(currency);

-- For HQ settlement date lookups (Station Summary page)
CREATE INDEX IF NOT EXISTS idx_hq_settlements_summary_date
ON hq_settlements(summary_date DESC) WHERE summary_date IS NOT NULL;

-- ============================================================
-- UNIQUE CONSTRAINT TO PREVENT DUPLICATE SETTLEMENTS
-- ============================================================

-- Prevent duplicate settlements for the same station and date range
-- Only applies to non-deleted settlements
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlements_unique_station_period
ON settlements(station_id, period_from, period_to) WHERE is_deleted = false;

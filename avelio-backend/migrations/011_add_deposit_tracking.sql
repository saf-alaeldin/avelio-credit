-- Migration 011: Add deposit tracking columns to receipts
-- Tracks whether a receipt has been confirmed in the Zenith/main system

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS is_deposited BOOLEAN DEFAULT false;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS deposited_at TIMESTAMP;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false;

-- Index for filtering by deposit status
CREATE INDEX IF NOT EXISTS idx_receipts_is_deposited ON receipts(is_deposited);
CREATE INDEX IF NOT EXISTS idx_receipts_is_external ON receipts(is_external);

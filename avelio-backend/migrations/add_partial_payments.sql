-- Add partial payment support to receipts table
-- Run this migration on your database

-- Add columns to track partial payments
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS amount_remaining DECIMAL(10, 2);

-- Update existing receipts to set amount_remaining
UPDATE receipts
SET amount_remaining = amount - COALESCE(amount_paid, 0)
WHERE amount_remaining IS NULL;

-- Set amount_paid for already paid receipts
UPDATE receipts
SET amount_paid = amount
WHERE status = 'PAID' AND amount_paid = 0;

-- Create payments table to track individual payment transactions
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  payment_number VARCHAR(50) UNIQUE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_time TIME DEFAULT CURRENT_TIME,
  payment_method VARCHAR(50) DEFAULT 'CASH',
  remarks TEXT,
  created_by INTEGER REFERENCES users(id),
  created_by_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT positive_payment_amount CHECK (amount > 0)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payments_receipt_id ON payments(receipt_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

-- Comments for documentation
COMMENT ON TABLE payments IS 'Tracks individual payment transactions for receipts';
COMMENT ON COLUMN receipts.amount_paid IS 'Total amount paid so far (sum of all payments)';
COMMENT ON COLUMN receipts.amount_remaining IS 'Remaining amount to be paid (amount - amount_paid)';

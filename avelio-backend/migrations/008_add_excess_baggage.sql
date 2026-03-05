-- Migration: Add Excess Baggage (X-BAG) tracking for Juba station
-- Created: 2026-01-27

-- 1. Create flights master table
CREATE TABLE IF NOT EXISTS flights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_code VARCHAR(20) UNIQUE NOT NULL,  -- e.g., "JUB-MAK"
  origin VARCHAR(10) NOT NULL,               -- e.g., "JUB"
  destination VARCHAR(10) NOT NULL,          -- e.g., "MAK"
  description VARCHAR(255),                  -- e.g., "Juba to Malakal"
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial flights for Juba
INSERT INTO flights (flight_code, origin, destination, description) VALUES
  ('JUB-MAK', 'JUB', 'MAK', 'Juba to Malakal'),
  ('JUB-YB1', 'JUB', 'YB1', 'Juba to Yambio'),
  ('JUB-WUU', 'JUB', 'WUU', 'Juba to Wau'),
  ('JUB-AW1', 'JUB', 'AW1', 'Juba to Aweil'),
  ('JUB-BE1', 'JUB', 'BE1', 'Juba to Bentiu'),
  ('JUB-EBB', 'JUB', 'EBB', 'Juba to Entebbe')
ON CONFLICT (flight_code) DO NOTHING;

-- 2. Create settlement_excess_baggage table
CREATE TABLE IF NOT EXISTS settlement_excess_baggage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID REFERENCES settlements(id) ON DELETE RESTRICT NOT NULL,
  flight_id UUID REFERENCES flights(id) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  weight_kg DECIMAL(10,2) NOT NULL DEFAULT 0,  -- Total excess weight
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,      -- Total revenue
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP,
  deleted_by UUID REFERENCES users(id),
  UNIQUE(settlement_id, flight_id, currency)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_excess_baggage_settlement ON settlement_excess_baggage(settlement_id);
CREATE INDEX IF NOT EXISTS idx_excess_baggage_flight ON settlement_excess_baggage(flight_id);
CREATE INDEX IF NOT EXISTS idx_excess_baggage_currency ON settlement_excess_baggage(currency);
CREATE INDEX IF NOT EXISTS idx_flights_active ON flights(is_active);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_excess_baggage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_excess_baggage_updated_at ON settlement_excess_baggage;
CREATE TRIGGER trigger_excess_baggage_updated_at
  BEFORE UPDATE ON settlement_excess_baggage
  FOR EACH ROW
  EXECUTE FUNCTION update_excess_baggage_updated_at();

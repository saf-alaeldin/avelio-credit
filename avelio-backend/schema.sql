-- Avelio Credit-Lite Database Schema
-- Run this file to create all tables

-- 1. USERS TABLE (Staff who can log in)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  employee_id VARCHAR(50) UNIQUE,
  station_code VARCHAR(3) NOT NULL,
  role VARCHAR(50) NOT NULL,
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. AGENCIES TABLE (Travel agencies)
CREATE TABLE agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id VARCHAR(50) UNIQUE NOT NULL,
  agency_name VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(20),
  contact_email VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),
  credit_limit DECIMAL(15,2) DEFAULT 0,
  outstanding_balance DECIMAL(15,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. RECEIPTS TABLE (The actual receipts)
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number VARCHAR(100) UNIQUE NOT NULL,
  agency_id UUID REFERENCES agencies(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  payment_method VARCHAR(50) DEFAULT 'CASH',
  status VARCHAR(20) NOT NULL,
  
  issue_date DATE NOT NULL,
  issue_time TIME NOT NULL,
  payment_date TIMESTAMP,
  due_date DATE,
  
  station_code VARCHAR(3) NOT NULL,
  issued_by_name VARCHAR(255),
  
  purpose TEXT DEFAULT 'Agency Credit Account Deposit',
  remarks TEXT,
  transaction_ref VARCHAR(100),
  document_hash VARCHAR(255),
  
  is_synced BOOLEAN DEFAULT false,
  is_void BOOLEAN DEFAULT false,
  void_reason TEXT,
  void_date TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. AUDIT LOGS TABLE (Track all actions)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  receipt_id UUID REFERENCES receipts(id),
  action VARCHAR(50) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. OFFLINE QUEUE TABLE (For offline sync)
CREATE TABLE offline_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  retry_count INTEGER DEFAULT 0,
  is_synced BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  synced_at TIMESTAMP
);

-- CREATE INDEXES (Makes searches faster)
CREATE INDEX idx_receipts_agency ON receipts(agency_id);
CREATE INDEX idx_receipts_user ON receipts(user_id);
CREATE INDEX idx_receipts_status ON receipts(status);
CREATE INDEX idx_receipts_date ON receipts(issue_date DESC);
CREATE INDEX idx_receipts_number ON receipts(receipt_number);
CREATE INDEX idx_agencies_id ON agencies(agency_id);
CREATE INDEX idx_offline_queue_sync ON offline_queue(is_synced, created_at);

-- CRITICAL PERFORMANCE INDEXES (Required for fast queries)
-- These indexes are essential - do NOT remove them
CREATE INDEX idx_receipts_is_void ON receipts(is_void);
CREATE INDEX idx_receipts_void_date ON receipts(is_void, issue_date DESC);
CREATE INDEX idx_receipts_void_created ON receipts(is_void, created_at DESC);
CREATE INDEX idx_receipts_void_status ON receipts(is_void, status);
CREATE INDEX idx_receipts_void_user ON receipts(is_void, user_id);
CREATE INDEX idx_receipts_void_agency ON receipts(is_void, agency_id);

-- Partial indexes for active receipts (very efficient)
CREATE INDEX idx_receipts_active ON receipts(created_at DESC) WHERE is_void = false;
CREATE INDEX idx_receipts_active_date ON receipts(issue_date DESC) WHERE is_void = false;

-- Case-insensitive search index
CREATE INDEX idx_receipts_number_lower ON receipts(LOWER(receipt_number));

-- Success message
SELECT 'Database schema created successfully!' AS message;
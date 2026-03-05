-- Migration: Protect Settlement Data from Accidental Deletion
-- This migration fixes critical data loss issues with CASCADE DELETE
-- Run this file to add protection to settlement data

-- =====================================================
-- 1. CREATE ARCHIVE TABLES FOR DELETED RECORDS
-- =====================================================

-- Archive table for deleted settlement agent entries
CREATE TABLE IF NOT EXISTS settlement_agent_entries_archive (
  id UUID NOT NULL,
  settlement_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  currency VARCHAR(10) NOT NULL,
  expected_cash DECIMAL(15,2) NOT NULL DEFAULT 0,
  declared_cash DECIMAL(15,2),
  variance DECIMAL(15,2),
  variance_status VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  -- Archive metadata
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_by UUID,
  archive_reason TEXT,
  original_settlement_number VARCHAR(50)
);

COMMENT ON TABLE settlement_agent_entries_archive IS 'Archive of deleted settlement agent entries for data recovery';

CREATE INDEX IF NOT EXISTS idx_agent_entries_archive_settlement ON settlement_agent_entries_archive(settlement_id);
CREATE INDEX IF NOT EXISTS idx_agent_entries_archive_date ON settlement_agent_entries_archive(archived_at DESC);

-- Archive table for deleted settlement summaries
CREATE TABLE IF NOT EXISTS settlement_summaries_archive (
  id UUID NOT NULL,
  settlement_id UUID NOT NULL,
  currency VARCHAR(10) NOT NULL,
  opening_balance DECIMAL(15,2) DEFAULT 0,
  opening_balance_settlement_id UUID,
  expected_cash DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_expenses DECIMAL(15,2) DEFAULT 0,
  expected_net_cash DECIMAL(15,2) NOT NULL DEFAULT 0,
  actual_cash_received DECIMAL(15,2),
  final_variance DECIMAL(15,2),
  variance_status VARCHAR(20),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  -- Archive metadata
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_by UUID,
  archive_reason TEXT,
  original_settlement_number VARCHAR(50)
);

COMMENT ON TABLE settlement_summaries_archive IS 'Archive of deleted settlement summaries for data recovery';

-- Archive table for deleted settlement expenses
CREATE TABLE IF NOT EXISTS settlement_expenses_archive (
  id UUID NOT NULL,
  settlement_id UUID NOT NULL,
  expense_code_id UUID NOT NULL,
  currency VARCHAR(10) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMP,
  -- Archive metadata
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_by UUID,
  archive_reason TEXT,
  original_settlement_number VARCHAR(50)
);

COMMENT ON TABLE settlement_expenses_archive IS 'Archive of deleted settlement expenses for data recovery';

-- =====================================================
-- 2. ADD SOFT DELETE COLUMNS TO MAIN TABLES
-- =====================================================

-- Add soft delete columns to settlement_agent_entries
ALTER TABLE settlement_agent_entries
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

COMMENT ON COLUMN settlement_agent_entries.is_deleted IS 'Soft delete flag - record is hidden but not removed';
COMMENT ON COLUMN settlement_agent_entries.deleted_at IS 'Timestamp when record was soft deleted';
COMMENT ON COLUMN settlement_agent_entries.deleted_by IS 'User who soft deleted this record';

-- Add soft delete columns to settlement_summaries
ALTER TABLE settlement_summaries
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- Add soft delete columns to settlement_expenses
ALTER TABLE settlement_expenses
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- Add soft delete columns to settlements
ALTER TABLE settlements
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- Create indexes for soft delete filtering
CREATE INDEX IF NOT EXISTS idx_agent_entries_active ON settlement_agent_entries(settlement_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_summaries_active ON settlement_summaries(settlement_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_expenses_active ON settlement_expenses(settlement_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_settlements_active ON settlements(station_id) WHERE is_deleted = false;

-- =====================================================
-- 3. CHANGE CASCADE DELETE TO RESTRICT
-- =====================================================

-- Drop existing foreign key constraints and recreate with RESTRICT
-- settlement_agent_entries
ALTER TABLE settlement_agent_entries
DROP CONSTRAINT IF EXISTS settlement_agent_entries_settlement_id_fkey;

ALTER TABLE settlement_agent_entries
ADD CONSTRAINT settlement_agent_entries_settlement_id_fkey
FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE RESTRICT;

-- settlement_summaries
ALTER TABLE settlement_summaries
DROP CONSTRAINT IF EXISTS settlement_summaries_settlement_id_fkey;

ALTER TABLE settlement_summaries
ADD CONSTRAINT settlement_summaries_settlement_id_fkey
FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE RESTRICT;

-- settlement_expenses
ALTER TABLE settlement_expenses
DROP CONSTRAINT IF EXISTS settlement_expenses_settlement_id_fkey;

ALTER TABLE settlement_expenses
ADD CONSTRAINT settlement_expenses_settlement_id_fkey
FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE RESTRICT;

-- settlement_audit_logs - keep CASCADE since audit logs can be deleted with settlement
-- (or change to RESTRICT if you want to keep audit logs forever)
-- ALTER TABLE settlement_audit_logs
-- DROP CONSTRAINT IF EXISTS settlement_audit_logs_settlement_id_fkey;
-- ALTER TABLE settlement_audit_logs
-- ADD CONSTRAINT settlement_audit_logs_settlement_id_fkey
-- FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE RESTRICT;

-- =====================================================
-- 4. CREATE TRIGGER TO PROTECT NON-DRAFT SETTLEMENTS
-- =====================================================

CREATE OR REPLACE FUNCTION protect_settlement_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow deletion of DRAFT or REJECTED settlements
  IF OLD.status NOT IN ('DRAFT', 'REJECTED') THEN
    RAISE EXCEPTION 'Cannot delete settlement with status %. Only DRAFT or REJECTED settlements can be deleted. Use soft delete instead.', OLD.status;
  END IF;

  -- If settlement has any declared_cash data, prevent hard delete
  IF EXISTS (
    SELECT 1 FROM settlement_agent_entries
    WHERE settlement_id = OLD.id
    AND declared_cash IS NOT NULL
    AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Cannot delete settlement that has declared cash data. Archive the data first or use soft delete.';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_settlement_delete ON settlements;
CREATE TRIGGER trg_protect_settlement_delete
  BEFORE DELETE ON settlements
  FOR EACH ROW
  EXECUTE FUNCTION protect_settlement_delete();

COMMENT ON FUNCTION protect_settlement_delete() IS 'Prevents deletion of non-DRAFT settlements and settlements with declared cash';

-- =====================================================
-- 5. CREATE TRIGGER TO ARCHIVE DATA BEFORE DELETE
-- =====================================================

CREATE OR REPLACE FUNCTION archive_agent_entries_before_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_settlement_number VARCHAR(50);
BEGIN
  -- Get settlement number for reference
  SELECT settlement_number INTO v_settlement_number
  FROM settlements WHERE id = OLD.settlement_id;

  -- Archive the record
  INSERT INTO settlement_agent_entries_archive (
    id, settlement_id, agent_id, currency, expected_cash, declared_cash,
    variance, variance_status, notes, created_at, updated_at,
    archived_at, archived_by, archive_reason, original_settlement_number
  ) VALUES (
    OLD.id, OLD.settlement_id, OLD.agent_id, OLD.currency, OLD.expected_cash, OLD.declared_cash,
    OLD.variance, OLD.variance_status, OLD.notes, OLD.created_at, OLD.updated_at,
    CURRENT_TIMESTAMP, OLD.deleted_by, 'DELETED', v_settlement_number
  );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_archive_agent_entries ON settlement_agent_entries;
CREATE TRIGGER trg_archive_agent_entries
  BEFORE DELETE ON settlement_agent_entries
  FOR EACH ROW
  EXECUTE FUNCTION archive_agent_entries_before_delete();

-- Archive summaries before delete
CREATE OR REPLACE FUNCTION archive_summaries_before_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_settlement_number VARCHAR(50);
BEGIN
  SELECT settlement_number INTO v_settlement_number
  FROM settlements WHERE id = OLD.settlement_id;

  INSERT INTO settlement_summaries_archive (
    id, settlement_id, currency, opening_balance, opening_balance_settlement_id,
    expected_cash, total_expenses, expected_net_cash, actual_cash_received,
    final_variance, variance_status, created_at, updated_at,
    archived_at, archived_by, archive_reason, original_settlement_number
  ) VALUES (
    OLD.id, OLD.settlement_id, OLD.currency, OLD.opening_balance, OLD.opening_balance_settlement_id,
    OLD.expected_cash, OLD.total_expenses, OLD.expected_net_cash, OLD.actual_cash_received,
    OLD.final_variance, OLD.variance_status, OLD.created_at, OLD.updated_at,
    CURRENT_TIMESTAMP, OLD.deleted_by, 'DELETED', v_settlement_number
  );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_archive_summaries ON settlement_summaries;
CREATE TRIGGER trg_archive_summaries
  BEFORE DELETE ON settlement_summaries
  FOR EACH ROW
  EXECUTE FUNCTION archive_summaries_before_delete();

-- Archive expenses before delete
CREATE OR REPLACE FUNCTION archive_expenses_before_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_settlement_number VARCHAR(50);
BEGIN
  SELECT settlement_number INTO v_settlement_number
  FROM settlements WHERE id = OLD.settlement_id;

  INSERT INTO settlement_expenses_archive (
    id, settlement_id, expense_code_id, currency, amount, description, created_by, created_at,
    archived_at, archived_by, archive_reason, original_settlement_number
  ) VALUES (
    OLD.id, OLD.settlement_id, OLD.expense_code_id, OLD.currency, OLD.amount, OLD.description, OLD.created_by, OLD.created_at,
    CURRENT_TIMESTAMP, OLD.deleted_by, 'DELETED', v_settlement_number
  );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_archive_expenses ON settlement_expenses;
CREATE TRIGGER trg_archive_expenses
  BEFORE DELETE ON settlement_expenses
  FOR EACH ROW
  EXECUTE FUNCTION archive_expenses_before_delete();

-- =====================================================
-- 6. CREATE FUNCTION TO SAFELY DELETE SETTLEMENT (SOFT DELETE)
-- =====================================================

CREATE OR REPLACE FUNCTION soft_delete_settlement(
  p_settlement_id UUID,
  p_user_id UUID,
  p_reason TEXT DEFAULT 'User requested deletion'
)
RETURNS JSONB AS $$
DECLARE
  v_settlement RECORD;
  v_result JSONB;
BEGIN
  -- Get settlement info
  SELECT * INTO v_settlement FROM settlements WHERE id = p_settlement_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Settlement not found');
  END IF;

  -- Soft delete agent entries
  UPDATE settlement_agent_entries
  SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP, deleted_by = p_user_id
  WHERE settlement_id = p_settlement_id AND is_deleted = false;

  -- Soft delete summaries
  UPDATE settlement_summaries
  SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP, deleted_by = p_user_id
  WHERE settlement_id = p_settlement_id AND is_deleted = false;

  -- Soft delete expenses
  UPDATE settlement_expenses
  SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP, deleted_by = p_user_id
  WHERE settlement_id = p_settlement_id AND is_deleted = false;

  -- Unlink sales (don't delete, just unlink)
  UPDATE station_sales SET settlement_id = NULL WHERE settlement_id = p_settlement_id;

  -- Soft delete the settlement itself
  UPDATE settlements
  SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP, deleted_by = p_user_id
  WHERE id = p_settlement_id;

  -- Log the action in audit trail
  INSERT INTO settlement_audit_logs (settlement_id, user_id, action, notes, created_at)
  VALUES (p_settlement_id, p_user_id, 'SOFT_DELETE', p_reason, CURRENT_TIMESTAMP);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Settlement soft deleted successfully',
    'settlement_number', v_settlement.settlement_number
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION soft_delete_settlement(UUID, UUID, TEXT) IS 'Safely soft deletes a settlement and all related records without permanent data loss';

-- =====================================================
-- 7. CREATE FUNCTION TO RESTORE SOFT DELETED SETTLEMENT
-- =====================================================

CREATE OR REPLACE FUNCTION restore_settlement(
  p_settlement_id UUID,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_settlement RECORD;
BEGIN
  -- Get settlement info
  SELECT * INTO v_settlement FROM settlements WHERE id = p_settlement_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Settlement not found');
  END IF;

  IF NOT v_settlement.is_deleted THEN
    RETURN jsonb_build_object('success', false, 'message', 'Settlement is not deleted');
  END IF;

  -- Restore agent entries
  UPDATE settlement_agent_entries
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
  WHERE settlement_id = p_settlement_id;

  -- Restore summaries
  UPDATE settlement_summaries
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
  WHERE settlement_id = p_settlement_id;

  -- Restore expenses
  UPDATE settlement_expenses
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
  WHERE settlement_id = p_settlement_id;

  -- Restore the settlement
  UPDATE settlements
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
  WHERE id = p_settlement_id;

  -- Log the restoration
  INSERT INTO settlement_audit_logs (settlement_id, user_id, action, notes, created_at)
  VALUES (p_settlement_id, p_user_id, 'RESTORE', 'Settlement restored from soft delete', CURRENT_TIMESTAMP);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Settlement restored successfully',
    'settlement_number', v_settlement.settlement_number
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION restore_settlement(UUID, UUID) IS 'Restores a soft deleted settlement and all related records';

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================
SELECT 'Settlement data protection migration completed successfully!' AS message;

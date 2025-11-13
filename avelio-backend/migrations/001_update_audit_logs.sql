-- Migration to update audit_logs table for flexible resource tracking
-- This allows tracking of any resource type (receipts, agencies, users, etc.)

-- Add new columns for flexible resource tracking
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS resource_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS resource_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Update old_value and new_value to be JSONB if not already
ALTER TABLE audit_logs
  ALTER COLUMN old_value TYPE JSONB USING old_value::jsonb,
  ALTER COLUMN new_value TYPE JSONB USING new_value::jsonb;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Success message
SELECT 'Audit logs table updated successfully!' AS message;

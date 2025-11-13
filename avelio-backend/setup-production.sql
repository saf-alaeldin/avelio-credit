-- Kush Air Credit System - Production Setup Script
-- This script clears test data and sets up production users

BEGIN;

-- 1. Clear all test data
TRUNCATE TABLE receipts CASCADE;
TRUNCATE TABLE agencies CASCADE;
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE audit_logs CASCADE;

-- 2. Reset sequences
ALTER SEQUENCE IF EXISTS receipts_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS agencies_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS users_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS audit_logs_id_seq RESTART WITH 1;

-- 3. Add username column to users table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='username') THEN
        ALTER TABLE users ADD COLUMN username VARCHAR(100) UNIQUE;
    END IF;
END $$;

-- 4. Create production users with usernames
-- Password hashes are for temporary passwords - users should change them

-- Admin: Mohamed Saeed
-- Username: mohamed.saeed
-- Password: KushAir@2025
INSERT INTO users (username, email, name, password_hash, employee_id, station_code, role, phone, is_active)
VALUES (
    'mohamed.saeed',
    'mohamed.saeed@kushair.net',
    'Mohamed Saeed',
    '$2b$10$xQZJx5vK5F8yYxHZK9n9.uh4jHZZQ9yYxHZK9n9uh4jHZZQ9yYxHZK', -- Temporary hash, will be updated by seed script
    'ADM-001',
    'JUB',
    'admin',
    '+211929754555',
    true
);

-- Staff: Ahmed Sami
-- Username: ahmed.sami
-- Password: KushAir@2025
INSERT INTO users (username, email, name, password_hash, employee_id, station_code, role, phone, is_active)
VALUES (
    'ahmed.sami',
    'ahmed.sami@kushair.net',
    'Ahmed Sami',
    '$2b$10$xQZJx5vK5F8yYxHZK9n9.uh4jHZZQ9yYxHZK9n9uh4jHZZQ9yYxHZK',
    'STF-002',
    'JUB',
    'staff',
    '+211929754556',
    true
);

-- Staff: Sarah Lado
-- Username: sarah.lado
-- Password: KushAir@2025
INSERT INTO users (username, email, name, password_hash, employee_id, station_code, role, phone, is_active)
VALUES (
    'sarah.lado',
    'sarah.lado@kushair.net',
    'Sarah Lado',
    '$2b$10$xQZJx5vK5F8yYxHZK9n9.uh4jHZZQ9yYxHZK9n9uh4jHZZQ9yYxHZK',
    'STF-003',
    'JUB',
    'staff',
    '+211929754557',
    true
);

COMMIT;

-- Display results
SELECT
    username,
    email,
    name,
    role,
    employee_id,
    station_code,
    is_active
FROM users
ORDER BY role DESC, name;

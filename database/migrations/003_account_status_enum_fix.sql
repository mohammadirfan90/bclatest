-- Migration: 003_account_status_enum_fix
-- Description: Align status ENUM with strict requirements (SUSPENDED instead of FROZEN)

-- Update accounts table
ALTER TABLE accounts 
    MODIFY COLUMN status ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED') NOT NULL DEFAULT 'PENDING';

-- Update accounts_history table
ALTER TABLE accounts_history 
    MODIFY COLUMN status ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED') NOT NULL;

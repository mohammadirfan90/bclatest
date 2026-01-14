-- Migration: 002_account_approval_workflow
-- Description: Implement strict Account Creation & Approval Workflow
-- Author: Antigravity

-- 1. Create account_applications table
CREATE TABLE IF NOT EXISTS account_applications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id BIGINT UNSIGNED NOT NULL,
    account_type ENUM('SAVINGS', 'CURRENT', 'BUSINESS') NOT NULL,
    status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    reviewed_by BIGINT UNSIGNED NULL,
    review_reason TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME NULL,
    PRIMARY KEY (id),
    KEY idx_applications_customer (customer_id),
    KEY idx_applications_status (status),
    CONSTRAINT fk_applications_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_applications_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Modify accounts table to match strict requirements
-- We need to handle potential foreign key constraints and existing data carefully.
-- Since this is a "Strict" re-definition, we will align it exactly.

-- Drop conflicting keys/constraints if they exist (safe operations)
-- DROP FK FIRST
SET @exist := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_NAME = 'accounts' AND CONSTRAINT_NAME = 'fk_accounts_type' AND TABLE_SCHEMA = DATABASE());
SET @sqlstmt := IF(@exist > 0, 'ALTER TABLE accounts DROP FOREIGN KEY fk_accounts_type', 'SELECT "FK fk_accounts_type does not exist"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- DROP INDEX SECOND
SET @exist := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_name = 'accounts' AND index_name = 'idx_accounts_type' AND table_schema = DATABASE());
SET @sqlstmt := IF(@exist > 0, 'DROP INDEX idx_accounts_type ON accounts', 'SELECT "Index idx_accounts_type does not exist"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Now alter the accounts table
ALTER TABLE accounts
    -- Remove old column
    DROP COLUMN account_type_id,
    -- Add new strict columns
    ADD COLUMN account_type ENUM('SAVINGS', 'CURRENT', 'BUSINESS') NOT NULL AFTER customer_id,
    ADD COLUMN balance_locked BOOLEAN NOT NULL DEFAULT FALSE AFTER status,
    CHANGE COLUMN version row_version BIGINT UNSIGNED NOT NULL DEFAULT 1;

-- 3. Update accounts_history to match strict temporal requirements
-- We will recreate structure or alter heavily.
-- Given strict requirement: account_id, valid_from, valid_to, status, balance_locked, snapshot_payload, changed_by, changed_at

ALTER TABLE accounts_history
    DROP COLUMN account_number, -- Not in strict spec (can be in snapshot)
    DROP COLUMN customer_id, -- Not in strict spec
    DROP COLUMN account_type_id, -- Not in strict spec
    DROP COLUMN version, -- Not in strict spec
    DROP COLUMN change_reason, -- Not in strict spec (maybe implied?)
    ADD COLUMN valid_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN valid_to DATETIME NULL,
    ADD COLUMN balance_locked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN snapshot_payload JSON NULL,
    MODIFY COLUMN changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add index for temporal queries
CREATE INDEX idx_accounts_history_temporal ON accounts_history (account_id, valid_from, valid_to);

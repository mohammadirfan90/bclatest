-- =============================================================================
-- Migration 009: Reconciliation Engine Enhancements
-- =============================================================================
-- This migration updates the reconciliation tables to support the full
-- reconciliation workflow with CSV import, auto-matching, and closure.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add imported_at to reconciliations
-- -----------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
-- 1. Add imported_at to reconciliations
-- -----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS upgrade_reconciliations_schema;
DELIMITER //
CREATE PROCEDURE upgrade_reconciliations_schema()
BEGIN
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'reconciliations' 
        AND COLUMN_NAME = 'imported_at'
    ) THEN
        ALTER TABLE reconciliations ADD COLUMN imported_at TIMESTAMP NULL AFTER source_file;
    END IF;
END //
DELIMITER ;
CALL upgrade_reconciliations_schema();
DROP PROCEDURE upgrade_reconciliations_schema;

-- -----------------------------------------------------------------------------
-- 2. Modify status enum to include OPEN and CLOSED
-- We need to update the enum to: OPEN, IN_PROGRESS, MATCHED, CLOSED, FAILED
-- Note: MySQL requires recreating the column for enum changes
-- -----------------------------------------------------------------------------

-- First, update existing values to be compatible
UPDATE reconciliations SET status = 'IN_PROGRESS' WHERE status = 'PENDING';

-- Alter the column with new enum values
ALTER TABLE reconciliations
    MODIFY COLUMN status ENUM('OPEN', 'IN_PROGRESS', 'MATCHED', 'CLOSED', 'FAILED') 
    NOT NULL DEFAULT 'OPEN';

-- -----------------------------------------------------------------------------
-- 3. Add matched_ledger_entry_id as alternative link (keep transaction link too)
-- This allows linking to specific ledger entries if needed
-- -----------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
-- 3. Add matched_ledger_entry_id as alternative link (keep transaction link too)
-- -----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS upgrade_reconciliation_items_schema;
DELIMITER //
CREATE PROCEDURE upgrade_reconciliation_items_schema()
BEGIN
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'reconciliation_items' 
        AND COLUMN_NAME = 'matched_ledger_entry_id'
    ) THEN
        ALTER TABLE reconciliation_items ADD COLUMN matched_ledger_entry_id BIGINT UNSIGNED NULL AFTER matched_transaction_id;
    END IF;
END //
DELIMITER ;
CALL upgrade_reconciliation_items_schema();
DROP PROCEDURE upgrade_reconciliation_items_schema;

-- Add foreign key for ledger entry link (without partition reference issue)
-- Note: ledger_entries is partitioned, so we skip FK constraint
-- The application layer will enforce referential integrity

-- -----------------------------------------------------------------------------
-- 4. Create audit table for reconciliation actions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reconciliation_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    reconciliation_id BIGINT UNSIGNED NOT NULL,
    reconciliation_item_id BIGINT UNSIGNED NULL,
    action ENUM('CREATED', 'IMPORTED', 'AUTO_MATCHED', 'MANUAL_MATCHED', 'UNMATCHED', 'CLOSED') NOT NULL,
    old_status VARCHAR(50) NULL,
    new_status VARCHAR(50) NULL,
    matched_transaction_id BIGINT UNSIGNED NULL,
    reason VARCHAR(500) NULL,
    performed_by BIGINT UNSIGNED NOT NULL,
    performed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSON NULL,
    PRIMARY KEY (id),
    KEY idx_recon_audit_recon (reconciliation_id),
    KEY idx_recon_audit_item (reconciliation_item_id),
    KEY idx_recon_audit_action (action),
    KEY idx_recon_audit_performed (performed_at),
    CONSTRAINT fk_recon_audit_recon FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE,
    CONSTRAINT fk_recon_audit_item FOREIGN KEY (reconciliation_item_id) REFERENCES reconciliation_items(id) ON DELETE SET NULL,
    CONSTRAINT fk_recon_audit_user FOREIGN KEY (performed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 5. Add index for efficient ledger matching queries
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ledger_amount_date 
    ON ledger_entries(amount, entry_date);

-- Done
SELECT 'Migration 009 completed successfully' AS status;

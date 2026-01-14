-- =============================================================================
-- Banking Core - Triggers v1.0
-- Automatic audit trail generation
-- =============================================================================
-- Version: 1.0.0
-- Date: 2026-01-14
-- Purpose: Immutable audit logging that cannot be bypassed by application code
-- =============================================================================

DELIMITER //

-- =============================================================================
-- TRIGGER: trg_ledger_audit_insert
-- Fires AFTER every INSERT on ledger_entries
-- Creates immutable audit record
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ledger_audit_insert//

CREATE TRIGGER trg_ledger_audit_insert
AFTER INSERT ON ledger_entries
FOR EACH ROW
BEGIN
    INSERT INTO transaction_audit (
        ledger_entry_id,
        transaction_id,
        account_id,
        entry_type,
        amount,
        balance_after,
        audit_timestamp
    ) VALUES (
        NEW.id,
        NEW.transaction_id,
        NEW.account_id,
        NEW.entry_type,
        NEW.amount,
        NEW.balance_after,
        NOW()
    );
END//

DELIMITER ;

-- =============================================================================
-- TRIGGERS COMPLETE
-- =============================================================================
-- trg_ledger_audit_insert: Automatic audit trail on all ledger entries
-- 
-- WHY TRIGGERS?
-- 1. Cannot be bypassed by application code (unlike service-layer logging)
-- 2. Fires atomically within the same transaction
-- 3. Guaranteed to execute even if called via different code paths
-- 4. Demonstrates trigger-based auditing for DBMS viva
-- =============================================================================

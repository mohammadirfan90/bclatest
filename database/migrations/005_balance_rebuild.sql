-- =============================================================================
-- Migration 005: Balance Rebuild Stored Procedure
-- sp_refresh_account_balances - Admin-only balance rebuild from ledger
-- =============================================================================

DELIMITER //

DROP PROCEDURE IF EXISTS sp_refresh_account_balances//

CREATE PROCEDURE sp_refresh_account_balances(
    IN p_admin_user_id BIGINT UNSIGNED,
    OUT p_accounts_refreshed INT UNSIGNED,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(500)
)
BEGIN
    DECLARE v_start_time DATETIME;
    DECLARE v_account_count INT UNSIGNED DEFAULT 0;
    
    -- Error handler
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = 'Balance refresh failed due to a database error';
        SET p_accounts_refreshed = 0;
    END;
    
    -- Initialize
    SET v_start_time = NOW();
    SET p_accounts_refreshed = 0;
    SET p_status = 'PENDING';
    SET p_message = '';
    
    -- Start transaction
    START TRANSACTION;
    
    -- 1. Log the rebuild action start
    INSERT INTO events (
        event_type,
        aggregate_type,
        aggregate_id,
        payload
    ) VALUES (
        'BALANCE_REBUILD_STARTED',
        'SYSTEM',
        COALESCE(p_admin_user_id, 0),
        JSON_OBJECT(
            'initiated_by', p_admin_user_id,
            'started_at', v_start_time
        )
    );
    
    -- 2. Clear existing balances for all accounts
    -- We rebuild completely from ledger
    UPDATE account_balances
    SET available_balance = 0,
        pending_balance = 0,
        hold_balance = 0,
        last_transaction_id = NULL,
        last_calculated_at = NOW(),
        version = version + 1;
    
    -- 3. Recalculate balances from ledger entries
    -- Credits add, Debits subtract
    UPDATE account_balances ab
    INNER JOIN (
        SELECT 
            account_id,
            SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) -
            SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) AS computed_balance,
            MAX(transaction_id) AS last_txn_id
        FROM ledger_entries
        GROUP BY account_id
    ) AS computed ON ab.account_id = computed.account_id
    SET 
        ab.available_balance = computed.computed_balance,
        ab.last_transaction_id = computed.last_txn_id,
        ab.last_calculated_at = NOW(),
        ab.version = ab.version + 1;
    
    -- 4. Count refreshed accounts
    SELECT COUNT(*) INTO v_account_count FROM account_balances;
    
    -- 5. Ensure no negative balances (safety check)
    -- If any negative balance found, it indicates ledger inconsistency
    IF EXISTS (SELECT 1 FROM account_balances WHERE available_balance < 0) THEN
        -- Log warning but continue (don't fail the rebuild)
        INSERT INTO events (
            event_type,
            aggregate_type,
            aggregate_id,
            payload
        ) VALUES (
            'BALANCE_REBUILD_WARNING',
            'SYSTEM',
            COALESCE(p_admin_user_id, 0),
            JSON_OBJECT(
                'warning', 'Negative balances detected after rebuild',
                'action', 'Manual review required'
            )
        );
    END IF;
    
    -- 6. Log the rebuild action completion
    INSERT INTO events (
        event_type,
        aggregate_type,
        aggregate_id,
        payload
    ) VALUES (
        'BALANCE_REBUILD_COMPLETED',
        'SYSTEM',
        COALESCE(p_admin_user_id, 0),
        JSON_OBJECT(
            'initiated_by', p_admin_user_id,
            'accounts_refreshed', v_account_count,
            'started_at', v_start_time,
            'completed_at', NOW()
        )
    );
    
    COMMIT;
    
    SET p_accounts_refreshed = v_account_count;
    SET p_status = 'COMPLETED';
    SET p_message = CONCAT('Successfully refreshed ', v_account_count, ' account balances');
    
END//

-- =============================================================================
-- PROCEDURE: sp_check_balance_consistency
-- Checks if materialized balances match computed values from ledger
-- Returns mismatches for audit purposes
-- =============================================================================

DROP PROCEDURE IF EXISTS sp_check_balance_consistency//

CREATE PROCEDURE sp_check_balance_consistency(
    OUT p_total_accounts INT UNSIGNED,
    OUT p_consistent_accounts INT UNSIGNED,
    OUT p_mismatch_count INT UNSIGNED,
    OUT p_status VARCHAR(20)
)
BEGIN
    DECLARE v_total INT UNSIGNED DEFAULT 0;
    DECLARE v_mismatches INT UNSIGNED DEFAULT 0;
    
    -- Count total accounts with balances
    SELECT COUNT(*) INTO v_total FROM account_balances;
    
    -- Count mismatches (where materialized != computed)
    SELECT COUNT(*) INTO v_mismatches
    FROM account_balances ab
    LEFT JOIN (
        SELECT 
            account_id,
            SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) -
            SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) AS computed_balance
        FROM ledger_entries
        GROUP BY account_id
    ) AS computed ON ab.account_id = computed.account_id
    WHERE ABS(ab.available_balance - COALESCE(computed.computed_balance, 0)) > 0.0001;
    
    SET p_total_accounts = v_total;
    SET p_consistent_accounts = v_total - v_mismatches;
    SET p_mismatch_count = v_mismatches;
    SET p_status = IF(v_mismatches = 0, 'HEALTHY', 'INCONSISTENT');
    
END//

DELIMITER ;

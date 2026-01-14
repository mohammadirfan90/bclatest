-- =============================================================================
-- Migration 010: Fix Stored Procedures
-- 1. Update sp_transfer to write to outbox (Event Sourcing requirement)
-- 2. Update sp_refresh_account_balances to expose error details
-- =============================================================================

DELIMITER //

-- -----------------------------------------------------------------------------
-- Fix sp_transfer
-- -----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_transfer //

CREATE PROCEDURE sp_transfer(
    IN p_from_account_id BIGINT UNSIGNED,
    IN p_to_account_id BIGINT UNSIGNED,
    IN p_amount DECIMAL(19,4),
    IN p_description VARCHAR(255),
    IN p_idempotency_key VARCHAR(64),
    IN p_initiated_by BIGINT UNSIGNED,
    OUT p_transaction_id VARCHAR(36),
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_source_currency CHAR(3);
    DECLARE v_dest_currency CHAR(3);
    DECLARE v_source_balance DECIMAL(19,4);
    DECLARE v_source_status VARCHAR(20);
    DECLARE v_dest_status VARCHAR(20);
    DECLARE v_numeric_tx_id BIGINT UNSIGNED;
    DECLARE v_uuid VARCHAR(36);
    DECLARE v_existing_status INT;
    DECLARE v_existing_response JSON;
    DECLARE v_customer_id BIGINT UNSIGNED;
    DECLARE v_from_account_number VARCHAR(20);
    DECLARE v_to_account_number VARCHAR(20);
    DECLARE v_dest_balance DECIMAL(19,4);
    
    -- Error handling
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1 @sqlstate = RETURNED_SQLSTATE, @errno = MYSQL_ERRNO, @text = MESSAGE_TEXT;
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = CONCAT('Internal Error: ', COALESCE(@text, 'Unknown'));
    END;

    SET p_status = 'PENDING';
    SET p_message = '';
    SET p_transaction_id = NULL;
    
    -- 1. Check Idempotency
    SELECT response_status, response_body INTO v_existing_status, v_existing_response
    FROM idempotency_keys 
    WHERE idempotency_key = p_idempotency_key COLLATE utf8mb4_unicode_ci
    LIMIT 1;
    
    IF v_existing_status IS NOT NULL THEN
        SET p_status = JSON_UNQUOTE(JSON_EXTRACT(v_existing_response, '$.status'));
        SET p_transaction_id = JSON_UNQUOTE(JSON_EXTRACT(v_existing_response, '$.transactionId'));
        SET p_message = 'Idempotent replay';
    ELSEIF p_amount <= 0 THEN
        SET p_status = 'FAILED';
        SET p_message = 'Amount must be greater than 0';
    ELSEIF p_from_account_id = p_to_account_id THEN
        SET p_status = 'FAILED';
        SET p_message = 'Cannot transfer to the same account';
    ELSE
        START TRANSACTION;
        
        -- Lock Source Account and get balance
        SELECT a.currency, ab.available_balance, a.status, a.account_number, a.customer_id
        INTO v_source_currency, v_source_balance, v_source_status, v_from_account_number, v_customer_id
        FROM accounts a
        JOIN account_balances ab ON a.id = ab.account_id
        WHERE a.id = p_from_account_id 
        FOR UPDATE;
        
        -- Lock Destination Account
        SELECT a.currency, a.status, a.account_number
        INTO v_dest_currency, v_dest_status, v_to_account_number
        FROM accounts a
        WHERE a.id = p_to_account_id 
        FOR UPDATE;
        
        IF v_source_currency IS NULL THEN
            ROLLBACK;
            SET p_status = 'FAILED';
            SET p_message = 'Source account not found';
        ELSEIF v_dest_currency IS NULL THEN
            ROLLBACK;
            SET p_status = 'FAILED';
            SET p_message = 'Destination account not found';
        ELSEIF v_source_currency != v_dest_currency THEN
            ROLLBACK;
            SET p_status = 'FAILED';
            SET p_message = 'Currency mismatch';
        ELSEIF v_source_status COLLATE utf8mb4_unicode_ci != 'ACTIVE' THEN
            ROLLBACK;
            SET p_status = 'FAILED';
            SET p_message = CONCAT('Source account is ', v_source_status);
        ELSEIF v_dest_status COLLATE utf8mb4_unicode_ci != 'ACTIVE' THEN
            ROLLBACK;
            SET p_status = 'FAILED';
            SET p_message = CONCAT('Destination account is ', v_dest_status);
        ELSEIF v_source_balance < p_amount THEN
            ROLLBACK;
            SET p_status = 'FAILED';
            SET p_message = 'Insufficient funds';
        ELSE
            SET v_uuid = UUID();
            SET p_transaction_id = v_uuid;
            
            -- Insert Transaction
            INSERT INTO transactions (
                transaction_reference, transaction_type_id, amount, currency, description, 
                status, source_account_id, destination_account_id, created_by, processed_at
            ) VALUES (
                v_uuid, (SELECT id FROM transaction_types WHERE code = 'TRANSFER' COLLATE utf8mb4_unicode_ci), 
                p_amount, v_source_currency, p_description,
                'COMPLETED', p_from_account_id, p_to_account_id, p_initiated_by, NOW()
            );
            
            SET v_numeric_tx_id = LAST_INSERT_ID();
            
            -- Debit Source
            INSERT INTO ledger_entries (
                transaction_id, account_id, entry_type, amount, currency, 
                balance_after, description, entry_date
            ) VALUES (
                v_numeric_tx_id, p_from_account_id, 'DEBIT', p_amount, v_source_currency,
                v_source_balance - p_amount, CONCAT('Transfer to ', v_to_account_number), CURDATE()
            );
            
            -- Get Destination Balance
            SELECT available_balance INTO v_dest_balance
            FROM account_balances WHERE account_id = p_to_account_id FOR UPDATE;
            
            IF v_dest_balance IS NULL THEN
                SET v_dest_balance = 0;
            END IF;

            -- Credit Destination
            INSERT INTO ledger_entries (
                transaction_id, account_id, entry_type, amount, currency, 
                balance_after, description, entry_date
            ) VALUES (
                v_numeric_tx_id, p_to_account_id, 'CREDIT', p_amount, v_dest_currency,
                v_dest_balance + p_amount, CONCAT('Transfer from ', v_from_account_number), CURDATE()
            );
            
            -- Update Balances
            UPDATE account_balances 
            SET available_balance = available_balance - p_amount,
                last_transaction_id = v_numeric_tx_id,
                version = version + 1,
                last_calculated_at = NOW()
            WHERE account_id = p_from_account_id;
            
            UPDATE account_balances 
            SET available_balance = available_balance + p_amount,
                last_transaction_id = v_numeric_tx_id,
                version = version + 1,
                last_calculated_at = NOW()
            WHERE account_id = p_to_account_id;
            
            -- Record Idempotency
            INSERT INTO idempotency_keys (
                idempotency_key, request_hash, response_status, response_body, expires_at
            ) VALUES (
                p_idempotency_key, 'hash', 200, 
                JSON_OBJECT('transactionId', v_uuid, 'status', 'COMPLETED'),
                DATE_ADD(NOW(), INTERVAL 24 HOUR)
            );
            
            -- Emit Event
            INSERT INTO events (
                event_type, aggregate_type, aggregate_id, payload
            ) VALUES (
                'TRANSFER_COMPLETED', 'TRANSACTION', v_numeric_tx_id,
                JSON_OBJECT(
                    'transactionId', v_uuid,
                    'fromAccountId', p_from_account_id,
                    'toAccountId', p_to_account_id,
                    'amount', p_amount,
                    'currency', v_source_currency
                )
            );

            -- Emit Outbox
            INSERT INTO outbox (
                event_type, aggregate_type, aggregate_id, payload
            ) VALUES (
                'TRANSFER_COMPLETED', 'TRANSACTION', v_numeric_tx_id,
                JSON_OBJECT(
                    'transactionId', v_uuid,
                    'fromAccountId', p_from_account_id,
                    'toAccountId', p_to_account_id,
                    'amount', p_amount,
                    'currency', v_source_currency
                )
            );
            
            SET p_status = 'COMPLETED';
            SET p_message = 'Transfer successful';
            
            COMMIT;
        END IF;
    END IF;

END //

-- -----------------------------------------------------------------------------
-- Fix sp_refresh_account_balances
-- -----------------------------------------------------------------------------
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
    
    -- Error handler EXPOSING THE ERROR
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1 @sqlstate = RETURNED_SQLSTATE, @errno = MYSQL_ERRNO, @text = MESSAGE_TEXT;
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = CONCAT('Error ', @errno, ': ', COALESCE(@text, 'Unknown error'));
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

DELIMITER ;

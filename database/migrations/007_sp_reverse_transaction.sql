-- =============================================================================
-- Migration 007: Update sp_reverse_transaction for DEPOSIT/WITHDRAWAL support
-- =============================================================================

DELIMITER //

DROP PROCEDURE IF EXISTS sp_reverse_transaction//

CREATE PROCEDURE sp_reverse_transaction(
    IN p_original_transaction_id BIGINT UNSIGNED,
    IN p_reason VARCHAR(500),
    IN p_user_id BIGINT UNSIGNED,
    OUT p_reversal_transaction_id BIGINT UNSIGNED,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(500)
)
BEGIN
    DECLARE v_original_amount DECIMAL(19,4);
    DECLARE v_original_status VARCHAR(20);
    DECLARE v_original_type VARCHAR(20);
    DECLARE v_source_account_id BIGINT UNSIGNED;
    DECLARE v_dest_account_id BIGINT UNSIGNED;
    DECLARE v_source_balance DECIMAL(19,4);
    DECLARE v_dest_balance DECIMAL(19,4);
    DECLARE v_new_source_balance DECIMAL(19,4);
    DECLARE v_new_dest_balance DECIMAL(19,4);
    DECLARE v_transaction_ref VARCHAR(36);
    DECLARE v_transaction_type_id BIGINT UNSIGNED;
    DECLARE v_today DATE;
    DECLARE v_is_reversible BOOLEAN;
    
    -- Error handler
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = 'Reversal failed due to a database error';
        SET p_reversal_transaction_id = NULL;
    END;
    
    -- Initialize
    SET v_today = CURDATE();
    SET p_reversal_transaction_id = NULL;
    SET p_status = 'PENDING';
    SET p_message = '';
    
    -- Start transaction
    START TRANSACTION;
    
    -- 1. Get original transaction details
    SELECT t.amount, t.status, tt.code, t.source_account_id, t.destination_account_id, tt.is_reversible
    INTO v_original_amount, v_original_status, v_original_type, v_source_account_id, v_dest_account_id, v_is_reversible
    FROM transactions t
    INNER JOIN transaction_types tt ON tt.id = t.transaction_type_id
    WHERE t.id = p_original_transaction_id
    FOR UPDATE;
    
    IF v_original_amount IS NULL THEN
        SET p_status = 'FAILED';
        SET p_message = 'Original transaction not found';
        ROLLBACK;
    ELSEIF v_original_status != 'COMPLETED' THEN
        SET p_status = 'FAILED';
        SET p_message = 'Only completed transactions can be reversed';
        ROLLBACK;
    ELSEIF v_is_reversible = FALSE THEN
        SET p_status = 'FAILED';
        SET p_message = 'This transaction type cannot be reversed';
        ROLLBACK;
    ELSE
        -- 2. Check if already reversed
        IF EXISTS (SELECT 1 FROM transactions WHERE reversal_of_id = p_original_transaction_id) THEN
            SET p_status = 'FAILED';
            SET p_message = 'Transaction has already been reversed';
            ROLLBACK;
        ELSE
            -- 3. Handle based on transaction type
            IF v_original_type = 'TRANSFER' THEN
                -- For transfers, we need to reverse both sides
                SELECT available_balance INTO v_dest_balance
                FROM account_balances
                WHERE account_id = v_dest_account_id
                FOR UPDATE;
                
                IF v_dest_balance < v_original_amount THEN
                    SET p_status = 'FAILED';
                    SET p_message = 'Destination account has insufficient balance for reversal';
                    ROLLBACK;
                ELSE
                    SELECT available_balance INTO v_source_balance
                    FROM account_balances
                    WHERE account_id = v_source_account_id
                    FOR UPDATE;
                    
                    SET v_new_source_balance = v_source_balance + v_original_amount;
                    SET v_new_dest_balance = v_dest_balance - v_original_amount;
                    
                    SET v_transaction_ref = UUID();
                    
                    SELECT id INTO v_transaction_type_id
                    FROM transaction_types
                    WHERE code = 'REVERSAL';
                    
                    IF v_transaction_type_id IS NULL THEN
                        SET v_transaction_type_id = 4;
                    END IF;
                    
                    INSERT INTO transactions (
                        transaction_reference, transaction_type_id, amount, currency,
                        description, status, source_account_id, destination_account_id,
                        reversal_of_id, processed_at, created_by
                    ) VALUES (
                        v_transaction_ref, v_transaction_type_id, v_original_amount, 'BDT',
                        CONCAT('Reversal: ', p_reason), 'COMPLETED',
                        v_dest_account_id, v_source_account_id,
                        p_original_transaction_id, NOW(), p_user_id
                    );
                    
                    SET p_reversal_transaction_id = LAST_INSERT_ID();
                    
                    UPDATE transactions
                    SET status = 'REVERSED', reversed_by_id = p_reversal_transaction_id
                    WHERE id = p_original_transaction_id;
                    
                    INSERT INTO ledger_entries (
                        transaction_id, account_id, entry_type, amount, currency,
                        balance_after, description, entry_date
                    ) VALUES (
                        p_reversal_transaction_id, v_source_account_id, 'CREDIT',
                        v_original_amount, 'BDT', v_new_source_balance,
                        CONCAT('Reversal credit - ', p_reason), v_today
                    );
                    
                    INSERT INTO ledger_entries (
                        transaction_id, account_id, entry_type, amount, currency,
                        balance_after, description, entry_date
                    ) VALUES (
                        p_reversal_transaction_id, v_dest_account_id, 'DEBIT',
                        v_original_amount, 'BDT', v_new_dest_balance,
                        CONCAT('Reversal debit - ', p_reason), v_today
                    );
                    
                    UPDATE account_balances
                    SET available_balance = v_new_source_balance,
                        last_transaction_id = p_reversal_transaction_id,
                        last_calculated_at = NOW(), version = version + 1
                    WHERE account_id = v_source_account_id;
                    
                    UPDATE account_balances
                    SET available_balance = v_new_dest_balance,
                        last_transaction_id = p_reversal_transaction_id,
                        last_calculated_at = NOW(), version = version + 1
                    WHERE account_id = v_dest_account_id;
                    
                    INSERT INTO events (event_type, aggregate_type, aggregate_id, payload)
                    VALUES ('TRANSACTION_REVERSED', 'TRANSACTION', p_reversal_transaction_id,
                        JSON_OBJECT('reversal_transaction_id', p_reversal_transaction_id,
                            'original_transaction_id', p_original_transaction_id,
                            'amount', v_original_amount, 'reason', p_reason));
                    
                    COMMIT;
                    SET p_status = 'COMPLETED';
                    SET p_message = 'Transaction reversed successfully';
                END IF;
                
            ELSEIF v_original_type = 'DEPOSIT' THEN
                -- For deposits, create DEBIT to reverse the CREDIT
                SELECT available_balance INTO v_dest_balance
                FROM account_balances
                WHERE account_id = v_dest_account_id
                FOR UPDATE;
                
                IF v_dest_balance < v_original_amount THEN
                    SET p_status = 'FAILED';
                    SET p_message = 'Account has insufficient balance for deposit reversal';
                    ROLLBACK;
                ELSE
                    SET v_new_dest_balance = v_dest_balance - v_original_amount;
                    SET v_transaction_ref = UUID();
                    
                    SELECT id INTO v_transaction_type_id
                    FROM transaction_types WHERE code = 'REVERSAL';
                    IF v_transaction_type_id IS NULL THEN SET v_transaction_type_id = 4; END IF;
                    
                    INSERT INTO transactions (
                        transaction_reference, transaction_type_id, amount, currency,
                        description, status, source_account_id, reversal_of_id,
                        processed_at, created_by
                    ) VALUES (
                        v_transaction_ref, v_transaction_type_id, v_original_amount, 'BDT',
                        CONCAT('Deposit Reversal: ', p_reason), 'COMPLETED',
                        v_dest_account_id, p_original_transaction_id, NOW(), p_user_id
                    );
                    
                    SET p_reversal_transaction_id = LAST_INSERT_ID();
                    
                    UPDATE transactions
                    SET status = 'REVERSED', reversed_by_id = p_reversal_transaction_id
                    WHERE id = p_original_transaction_id;
                    
                    INSERT INTO ledger_entries (
                        transaction_id, account_id, entry_type, amount, currency,
                        balance_after, description, entry_date
                    ) VALUES (
                        p_reversal_transaction_id, v_dest_account_id, 'DEBIT',
                        v_original_amount, 'BDT', v_new_dest_balance,
                        CONCAT('Deposit reversal - ', p_reason), v_today
                    );
                    
                    UPDATE account_balances
                    SET available_balance = v_new_dest_balance,
                        last_transaction_id = p_reversal_transaction_id,
                        last_calculated_at = NOW(), version = version + 1
                    WHERE account_id = v_dest_account_id;
                    
                    INSERT INTO events (event_type, aggregate_type, aggregate_id, payload)
                    VALUES ('TRANSACTION_REVERSED', 'TRANSACTION', p_reversal_transaction_id,
                        JSON_OBJECT('reversal_transaction_id', p_reversal_transaction_id,
                            'original_transaction_id', p_original_transaction_id,
                            'original_type', 'DEPOSIT', 'amount', v_original_amount, 'reason', p_reason));
                    
                    COMMIT;
                    SET p_status = 'COMPLETED';
                    SET p_message = 'Deposit reversed successfully';
                END IF;
                
            ELSEIF v_original_type = 'WITHDRAWAL' THEN
                -- For withdrawals, create CREDIT to reverse the DEBIT
                SELECT available_balance INTO v_source_balance
                FROM account_balances
                WHERE account_id = v_source_account_id
                FOR UPDATE;
                
                SET v_new_source_balance = v_source_balance + v_original_amount;
                SET v_transaction_ref = UUID();
                
                SELECT id INTO v_transaction_type_id
                FROM transaction_types WHERE code = 'REVERSAL';
                IF v_transaction_type_id IS NULL THEN SET v_transaction_type_id = 4; END IF;
                
                INSERT INTO transactions (
                    transaction_reference, transaction_type_id, amount, currency,
                    description, status, destination_account_id, reversal_of_id,
                    processed_at, created_by
                ) VALUES (
                    v_transaction_ref, v_transaction_type_id, v_original_amount, 'BDT',
                    CONCAT('Withdrawal Reversal: ', p_reason), 'COMPLETED',
                    v_source_account_id, p_original_transaction_id, NOW(), p_user_id
                );
                
                SET p_reversal_transaction_id = LAST_INSERT_ID();
                
                UPDATE transactions
                SET status = 'REVERSED', reversed_by_id = p_reversal_transaction_id
                WHERE id = p_original_transaction_id;
                
                INSERT INTO ledger_entries (
                    transaction_id, account_id, entry_type, amount, currency,
                    balance_after, description, entry_date
                ) VALUES (
                    p_reversal_transaction_id, v_source_account_id, 'CREDIT',
                    v_original_amount, 'BDT', v_new_source_balance,
                    CONCAT('Withdrawal reversal - ', p_reason), v_today
                );
                
                UPDATE account_balances
                SET available_balance = v_new_source_balance,
                    last_transaction_id = p_reversal_transaction_id,
                    last_calculated_at = NOW(), version = version + 1
                WHERE account_id = v_source_account_id;
                
                INSERT INTO events (event_type, aggregate_type, aggregate_id, payload)
                VALUES ('TRANSACTION_REVERSED', 'TRANSACTION', p_reversal_transaction_id,
                    JSON_OBJECT('reversal_transaction_id', p_reversal_transaction_id,
                        'original_transaction_id', p_original_transaction_id,
                        'original_type', 'WITHDRAWAL', 'amount', v_original_amount, 'reason', p_reason));
                
                COMMIT;
                SET p_status = 'COMPLETED';
                SET p_message = 'Withdrawal reversed successfully';
                
            ELSE
                SET p_status = 'FAILED';
                SET p_message = 'Reversal for this transaction type not supported';
                ROLLBACK;
            END IF;
        END IF;
    END IF;
END//

DELIMITER ;

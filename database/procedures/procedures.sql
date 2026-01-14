-- =============================================================================
-- Banking Core - Stored Procedures
-- All money movement MUST happen through these procedures
-- =============================================================================

DELIMITER //

-- =============================================================================
-- PROCEDURE: sp_transfer
-- Transfers money between two accounts within the system
-- =============================================================================

DROP PROCEDURE IF EXISTS sp_transfer//

CREATE PROCEDURE sp_transfer(
    IN p_from_account_id BIGINT UNSIGNED,
    IN p_to_account_id BIGINT UNSIGNED,
    IN p_amount DECIMAL(19,4),
    IN p_description VARCHAR(500),
    IN p_idempotency_key VARCHAR(64),
    IN p_user_id BIGINT UNSIGNED,
    OUT p_transaction_id BIGINT UNSIGNED,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(500)
)
BEGIN
    DECLARE v_from_balance DECIMAL(19,4);
    DECLARE v_to_balance DECIMAL(19,4);
    DECLARE v_new_from_balance DECIMAL(19,4);
    DECLARE v_new_to_balance DECIMAL(19,4);
    DECLARE v_from_status VARCHAR(20);
    DECLARE v_to_status VARCHAR(20);
    DECLARE v_transaction_ref VARCHAR(36);
    DECLARE v_transaction_type_id BIGINT UNSIGNED;
    DECLARE v_existing_response JSON;
    DECLARE v_today DATE;
    DECLARE v_from_customer_id BIGINT UNSIGNED;
    DECLARE v_to_customer_id BIGINT UNSIGNED;
    
    -- Error handler
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = 'Transaction failed due to a database error';
        SET p_transaction_id = NULL;
    END;
    
    -- Initialize
    SET v_today = CURDATE();
    SET p_transaction_id = NULL;
    SET p_status = 'PENDING';
    SET p_message = '';
    
    -- Start transaction
    START TRANSACTION;
    
    -- 1. Check idempotency key
    SELECT response_body INTO v_existing_response
    FROM idempotency_keys
    WHERE idempotency_key = p_idempotency_key
    AND expires_at > NOW()
    FOR UPDATE;
    
    IF v_existing_response IS NOT NULL THEN
        -- Return cached response
        SET p_transaction_id = JSON_UNQUOTE(JSON_EXTRACT(v_existing_response, '$.transaction_id'));
        SET p_status = JSON_UNQUOTE(JSON_EXTRACT(v_existing_response, '$.status'));
        SET p_message = JSON_UNQUOTE(JSON_EXTRACT(v_existing_response, '$.message'));
        COMMIT;
        -- SIGNAL to indicate idempotent return (not an error)
        -- SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Idempotent request - returning cached response';
    ELSE
        -- 2. Validate amount
        IF p_amount <= 0 THEN
            SET p_status = 'FAILED';
            SET p_message = 'Amount must be greater than zero';
            ROLLBACK;
        ELSE
            -- 3. Lock and validate source account
            SELECT ab.available_balance, a.status, a.customer_id
            INTO v_from_balance, v_from_status, v_from_customer_id
            FROM account_balances ab
            INNER JOIN accounts a ON a.id = ab.account_id
            WHERE ab.account_id = p_from_account_id
            FOR UPDATE;
            
            IF v_from_status IS NULL THEN
                SET p_status = 'FAILED';
                SET p_message = 'Source account not found';
                ROLLBACK;
            ELSEIF v_from_status != 'ACTIVE' THEN
                SET p_status = 'FAILED';
                SET p_message = 'Source account is not active';
                ROLLBACK;
            ELSEIF v_from_balance < p_amount THEN
                SET p_status = 'FAILED';
                SET p_message = 'Insufficient balance';
                ROLLBACK;
            ELSE
                -- 4. Lock and validate destination account
                SELECT ab.available_balance, a.status, a.customer_id
                INTO v_to_balance, v_to_status, v_to_customer_id
                FROM account_balances ab
                INNER JOIN accounts a ON a.id = ab.account_id
                WHERE ab.account_id = p_to_account_id
                FOR UPDATE;
                
                IF v_to_status IS NULL THEN
                    SET p_status = 'FAILED';
                    SET p_message = 'Destination account not found';
                    ROLLBACK;
                ELSEIF v_to_status != 'ACTIVE' THEN
                    SET p_status = 'FAILED';
                    SET p_message = 'Destination account is not active';
                    ROLLBACK;
                ELSEIF p_from_account_id = p_to_account_id THEN
                    SET p_status = 'FAILED';
                    SET p_message = 'Cannot transfer to the same account';
                    ROLLBACK;
                ELSE
                    -- 5. Calculate new balances
                    SET v_new_from_balance = v_from_balance - p_amount;
                    SET v_new_to_balance = v_to_balance + p_amount;
                    
                    -- Additional check (should never fail due to earlier check, but defense in depth)
                    IF v_new_from_balance < 0 THEN
                        SET p_status = 'FAILED';
                        SET p_message = 'Insufficient balance (concurrent modification)';
                        ROLLBACK;
                    ELSE
                        -- 6. Generate transaction reference
                        SET v_transaction_ref = UUID();
                        
                        -- 7. Get transaction type ID
                        SELECT id INTO v_transaction_type_id
                        FROM transaction_types
                        WHERE code = 'TRANSFER';
                        
                        IF v_transaction_type_id IS NULL THEN
                            SET v_transaction_type_id = 1; -- Default if not found
                        END IF;
                        
                        -- 8. Insert transaction record
                        INSERT INTO transactions (
                            transaction_reference,
                            transaction_type_id,
                            amount,
                            currency,
                            description,
                            status,
                            source_account_id,
                            destination_account_id,
                            processed_at,
                            created_by
                        ) VALUES (
                            v_transaction_ref,
                            v_transaction_type_id,
                            p_amount,
                            'BDT',
                            p_description,
                            'COMPLETED',
                            p_from_account_id,
                            p_to_account_id,
                            NOW(),
                            p_user_id
                        );
                        
                        SET p_transaction_id = LAST_INSERT_ID();
                        
                        -- 9. Insert DEBIT ledger entry (source account)
                        INSERT INTO ledger_entries (
                            transaction_id,
                            account_id,
                            entry_type,
                            amount,
                            currency,
                            balance_after,
                            description,
                            entry_date
                        ) VALUES (
                            p_transaction_id,
                            p_from_account_id,
                            'DEBIT',
                            p_amount,
                            'BDT',
                            v_new_from_balance,
                            CONCAT('Transfer to account - ', p_description),
                            v_today
                        );
                        
                        -- 10. Insert CREDIT ledger entry (destination account)
                        INSERT INTO ledger_entries (
                            transaction_id,
                            account_id,
                            entry_type,
                            amount,
                            currency,
                            balance_after,
                            description,
                            entry_date
                        ) VALUES (
                            p_transaction_id,
                            p_to_account_id,
                            'CREDIT',
                            p_amount,
                            'BDT',
                            v_new_to_balance,
                            CONCAT('Transfer from account - ', p_description),
                            v_today
                        );
                        
                        -- 11. Update materialized balances
                        UPDATE account_balances
                        SET available_balance = v_new_from_balance,
                            last_transaction_id = p_transaction_id,
                            last_calculated_at = NOW(),
                            version = version + 1
                        WHERE account_id = p_from_account_id;
                        
                        UPDATE account_balances
                        SET available_balance = v_new_to_balance,
                            last_transaction_id = p_transaction_id,
                            last_calculated_at = NOW(),
                            version = version + 1
                        WHERE account_id = p_to_account_id;
                        
                        -- 12. Update account last_transaction_at
                        UPDATE accounts
                        SET last_transaction_at = NOW()
                        WHERE id IN (p_from_account_id, p_to_account_id);
                        
                        -- 13. Emit event to outbox
                        INSERT INTO outbox (
                            event_type,
                            aggregate_type,
                            aggregate_id,
                            payload,
                            status
                        ) VALUES (
                            'TRANSFER_COMPLETED',
                            'TRANSACTION',
                            p_transaction_id,
                            JSON_OBJECT(
                                'transaction_id', p_transaction_id,
                                'transaction_reference', v_transaction_ref,
                                'from_account_id', p_from_account_id,
                                'to_account_id', p_to_account_id,
                                'amount', p_amount,
                                'from_customer_id', v_from_customer_id,
                                'to_customer_id', v_to_customer_id
                            ),
                            'PENDING'
                        );
                        
                        -- 14. Store event
                        INSERT INTO events (
                            event_type,
                            aggregate_type,
                            aggregate_id,
                            payload
                        ) VALUES (
                            'TRANSFER_COMPLETED',
                            'TRANSACTION',
                            p_transaction_id,
                            JSON_OBJECT(
                                'transaction_id', p_transaction_id,
                                'transaction_reference', v_transaction_ref,
                                'from_account_id', p_from_account_id,
                                'to_account_id', p_to_account_id,
                                'amount', p_amount,
                                'new_from_balance', v_new_from_balance,
                                'new_to_balance', v_new_to_balance,
                                'description', p_description
                            )
                        );
                        
                        -- 15. Store idempotency result
                        INSERT INTO idempotency_keys (
                            idempotency_key,
                            request_hash,
                            response_status,
                            response_body,
                            expires_at
                        ) VALUES (
                            p_idempotency_key,
                            SHA2(CONCAT(p_from_account_id, p_to_account_id, p_amount), 256),
                            200,
                            JSON_OBJECT(
                                'transaction_id', p_transaction_id,
                                'status', 'COMPLETED',
                                'message', 'Transfer completed successfully'
                            ),
                            DATE_ADD(NOW(), INTERVAL 24 HOUR)
                        );
                        
                        -- 16. Commit transaction
                        COMMIT;
                        
                        SET p_status = 'COMPLETED';
                        SET p_message = 'Transfer completed successfully';
                    END IF;
                END IF;
            END IF;
        END IF;
    END IF;
END//


-- =============================================================================
-- PROCEDURE: sp_deposit
-- Deposits money into an account (external source -> customer account)
-- =============================================================================

DROP PROCEDURE IF EXISTS sp_deposit//

CREATE PROCEDURE sp_deposit(
    IN p_account_id BIGINT UNSIGNED,
    IN p_amount DECIMAL(19,4),
    IN p_description VARCHAR(500),
    IN p_external_reference VARCHAR(100),
    IN p_user_id BIGINT UNSIGNED,
    OUT p_transaction_id BIGINT UNSIGNED,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(500)
)
BEGIN
    DECLARE v_current_balance DECIMAL(19,4);
    DECLARE v_new_balance DECIMAL(19,4);
    DECLARE v_account_status VARCHAR(20);
    DECLARE v_transaction_ref VARCHAR(36);
    DECLARE v_transaction_type_id BIGINT UNSIGNED;
    DECLARE v_today DATE;
    DECLARE v_customer_id BIGINT UNSIGNED;
    
    -- Error handler
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = 'Deposit failed due to a database error';
        SET p_transaction_id = NULL;
    END;
    
    -- Initialize
    SET v_today = CURDATE();
    SET p_transaction_id = NULL;
    SET p_status = 'PENDING';
    SET p_message = '';
    
    -- Start transaction
    START TRANSACTION;
    
    -- 1. Validate amount
    IF p_amount <= 0 THEN
        SET p_status = 'FAILED';
        SET p_message = 'Amount must be greater than zero';
        ROLLBACK;
    ELSE
        -- 2. Lock and validate account
        SELECT ab.available_balance, a.status, a.customer_id
        INTO v_current_balance, v_account_status, v_customer_id
        FROM account_balances ab
        INNER JOIN accounts a ON a.id = ab.account_id
        WHERE ab.account_id = p_account_id
        FOR UPDATE;
        
        IF v_account_status IS NULL THEN
            SET p_status = 'FAILED';
            SET p_message = 'Account not found';
            ROLLBACK;
        ELSEIF v_account_status != 'ACTIVE' THEN
            SET p_status = 'FAILED';
            SET p_message = 'Account is not active';
            ROLLBACK;
        ELSE
            -- 3. Calculate new balance
            SET v_new_balance = v_current_balance + p_amount;
            
            -- 4. Generate transaction reference
            SET v_transaction_ref = UUID();
            
            -- 5. Get transaction type ID
            SELECT id INTO v_transaction_type_id
            FROM transaction_types
            WHERE code = 'DEPOSIT';
            
            IF v_transaction_type_id IS NULL THEN
                SET v_transaction_type_id = 2; -- Default if not found
            END IF;
            
            -- 6. Insert transaction record
            INSERT INTO transactions (
                transaction_reference,
                transaction_type_id,
                amount,
                currency,
                description,
                status,
                destination_account_id,
                external_reference,
                processed_at,
                created_by
            ) VALUES (
                v_transaction_ref,
                v_transaction_type_id,
                p_amount,
                'BDT',
                p_description,
                'COMPLETED',
                p_account_id,
                p_external_reference,
                NOW(),
                p_user_id
            );
            
            SET p_transaction_id = LAST_INSERT_ID();
            
            -- 7. Insert CREDIT ledger entry
            INSERT INTO ledger_entries (
                transaction_id,
                account_id,
                entry_type,
                amount,
                currency,
                balance_after,
                description,
                entry_date
            ) VALUES (
                p_transaction_id,
                p_account_id,
                'CREDIT',
                p_amount,
                'BDT',
                v_new_balance,
                CONCAT('Deposit - ', p_description),
                v_today
            );
            
            -- 8. Update materialized balance
            UPDATE account_balances
            SET available_balance = v_new_balance,
                last_transaction_id = p_transaction_id,
                last_calculated_at = NOW(),
                version = version + 1
            WHERE account_id = p_account_id;
            
            -- 9. Update account last_transaction_at
            UPDATE accounts
            SET last_transaction_at = NOW()
            WHERE id = p_account_id;
            
            -- 10. Emit event
            INSERT INTO outbox (
                event_type,
                aggregate_type,
                aggregate_id,
                payload,
                status
            ) VALUES (
                'DEPOSIT_COMPLETED',
                'TRANSACTION',
                p_transaction_id,
                JSON_OBJECT(
                    'transaction_id', p_transaction_id,
                    'transaction_reference', v_transaction_ref,
                    'account_id', p_account_id,
                    'amount', p_amount,
                    'customer_id', v_customer_id
                ),
                'PENDING'
            );
            
            -- 11. Store event
            INSERT INTO events (
                event_type,
                aggregate_type,
                aggregate_id,
                payload
            ) VALUES (
                'DEPOSIT_COMPLETED',
                'TRANSACTION',
                p_transaction_id,
                JSON_OBJECT(
                    'transaction_id', p_transaction_id,
                    'account_id', p_account_id,
                    'amount', p_amount,
                    'new_balance', v_new_balance
                )
            );
            
            COMMIT;
            
            SET p_status = 'COMPLETED';
            SET p_message = 'Deposit completed successfully';
        END IF;
    END IF;
END//


-- =============================================================================
-- PROCEDURE: sp_withdraw
-- Withdraws money from an account (customer account -> external)
-- =============================================================================

DROP PROCEDURE IF EXISTS sp_withdraw//

CREATE PROCEDURE sp_withdraw(
    IN p_account_id BIGINT UNSIGNED,
    IN p_amount DECIMAL(19,4),
    IN p_description VARCHAR(500),
    IN p_external_reference VARCHAR(100),
    IN p_user_id BIGINT UNSIGNED,
    OUT p_transaction_id BIGINT UNSIGNED,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(500)
)
BEGIN
    DECLARE v_current_balance DECIMAL(19,4);
    DECLARE v_new_balance DECIMAL(19,4);
    DECLARE v_account_status VARCHAR(20);
    DECLARE v_transaction_ref VARCHAR(36);
    DECLARE v_transaction_type_id BIGINT UNSIGNED;
    DECLARE v_today DATE;
    DECLARE v_customer_id BIGINT UNSIGNED;
    
    -- Error handler
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = 'Withdrawal failed due to a database error';
        SET p_transaction_id = NULL;
    END;
    
    -- Initialize
    SET v_today = CURDATE();
    SET p_transaction_id = NULL;
    SET p_status = 'PENDING';
    SET p_message = '';
    
    -- Start transaction
    START TRANSACTION;
    
    -- 1. Validate amount
    IF p_amount <= 0 THEN
        SET p_status = 'FAILED';
        SET p_message = 'Amount must be greater than zero';
        ROLLBACK;
    ELSE
        -- 2. Lock and validate account
        SELECT ab.available_balance, a.status, a.customer_id
        INTO v_current_balance, v_account_status, v_customer_id
        FROM account_balances ab
        INNER JOIN accounts a ON a.id = ab.account_id
        WHERE ab.account_id = p_account_id
        FOR UPDATE;
        
        IF v_account_status IS NULL THEN
            SET p_status = 'FAILED';
            SET p_message = 'Account not found';
            ROLLBACK;
        ELSEIF v_account_status != 'ACTIVE' THEN
            SET p_status = 'FAILED';
            SET p_message = 'Account is not active';
            ROLLBACK;
        ELSEIF v_current_balance < p_amount THEN
            SET p_status = 'FAILED';
            SET p_message = 'Insufficient balance';
            ROLLBACK;
        ELSE
            -- 3. Calculate new balance
            SET v_new_balance = v_current_balance - p_amount;
            
            -- Defense in depth
            IF v_new_balance < 0 THEN
                SET p_status = 'FAILED';
                SET p_message = 'Insufficient balance';
                ROLLBACK;
            ELSE
                -- 4. Generate transaction reference
                SET v_transaction_ref = UUID();
                
                -- 5. Get transaction type ID
                SELECT id INTO v_transaction_type_id
                FROM transaction_types
                WHERE code = 'WITHDRAWAL';
                
                IF v_transaction_type_id IS NULL THEN
                    SET v_transaction_type_id = 3; -- Default if not found
                END IF;
                
                -- 6. Insert transaction record
                INSERT INTO transactions (
                    transaction_reference,
                    transaction_type_id,
                    amount,
                    currency,
                    description,
                    status,
                    source_account_id,
                    external_reference,
                    processed_at,
                    created_by
                ) VALUES (
                    v_transaction_ref,
                    v_transaction_type_id,
                    p_amount,
                    'BDT',
                    p_description,
                    'COMPLETED',
                    p_account_id,
                    p_external_reference,
                    NOW(),
                    p_user_id
                );
                
                SET p_transaction_id = LAST_INSERT_ID();
                
                -- 7. Insert DEBIT ledger entry
                INSERT INTO ledger_entries (
                    transaction_id,
                    account_id,
                    entry_type,
                    amount,
                    currency,
                    balance_after,
                    description,
                    entry_date
                ) VALUES (
                    p_transaction_id,
                    p_account_id,
                    'DEBIT',
                    p_amount,
                    'BDT',
                    v_new_balance,
                    CONCAT('Withdrawal - ', p_description),
                    v_today
                );
                
                -- 8. Update materialized balance
                UPDATE account_balances
                SET available_balance = v_new_balance,
                    last_transaction_id = p_transaction_id,
                    last_calculated_at = NOW(),
                    version = version + 1
                WHERE account_id = p_account_id;
                
                -- 9. Update account last_transaction_at
                UPDATE accounts
                SET last_transaction_at = NOW()
                WHERE id = p_account_id;
                
                -- 10. Emit event
                INSERT INTO outbox (
                    event_type,
                    aggregate_type,
                    aggregate_id,
                    payload,
                    status
                ) VALUES (
                    'WITHDRAWAL_COMPLETED',
                    'TRANSACTION',
                    p_transaction_id,
                    JSON_OBJECT(
                        'transaction_id', p_transaction_id,
                        'transaction_reference', v_transaction_ref,
                        'account_id', p_account_id,
                        'amount', p_amount,
                        'customer_id', v_customer_id
                    ),
                    'PENDING'
                );
                
                -- 11. Store event
                INSERT INTO events (
                    event_type,
                    aggregate_type,
                    aggregate_id,
                    payload
                ) VALUES (
                    'WITHDRAWAL_COMPLETED',
                    'TRANSACTION',
                    p_transaction_id,
                    JSON_OBJECT(
                        'transaction_id', p_transaction_id,
                        'account_id', p_account_id,
                        'amount', p_amount,
                        'new_balance', v_new_balance
                    )
                );
                
                COMMIT;
                
                SET p_status = 'COMPLETED';
                SET p_message = 'Withdrawal completed successfully';
            END IF;
        END IF;
    END IF;
END//


-- =============================================================================
-- PROCEDURE: sp_reverse_transaction
-- Creates a compensating transaction to reverse a previous transaction
-- =============================================================================

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
                -- Lock destination account first (it will receive money back)
                SELECT available_balance INTO v_dest_balance
                FROM account_balances
                WHERE account_id = v_dest_account_id
                FOR UPDATE;
                
                IF v_dest_balance < v_original_amount THEN
                    SET p_status = 'FAILED';
                    SET p_message = 'Destination account has insufficient balance for reversal';
                    ROLLBACK;
                ELSE
                    -- Lock source account (it will get money back)
                    SELECT available_balance INTO v_source_balance
                    FROM account_balances
                    WHERE account_id = v_source_account_id
                    FOR UPDATE;
                    
                    -- Calculate new balances (reverse the original)
                    SET v_new_source_balance = v_source_balance + v_original_amount;
                    SET v_new_dest_balance = v_dest_balance - v_original_amount;
                    
                    -- Generate transaction reference
                    SET v_transaction_ref = UUID();
                    
                    -- Get reversal transaction type
                    SELECT id INTO v_transaction_type_id
                    FROM transaction_types
                    WHERE code = 'REVERSAL';
                    
                    IF v_transaction_type_id IS NULL THEN
                        SET v_transaction_type_id = 4;
                    END IF;
                    
                    -- Insert reversal transaction
                    INSERT INTO transactions (
                        transaction_reference,
                        transaction_type_id,
                        amount,
                        currency,
                        description,
                        status,
                        source_account_id,
                        destination_account_id,
                        reversal_of_id,
                        processed_at,
                        created_by
                    ) VALUES (
                        v_transaction_ref,
                        v_transaction_type_id,
                        v_original_amount,
                        'BDT',
                        CONCAT('Reversal: ', p_reason),
                        'COMPLETED',
                        v_dest_account_id,  -- Reversed: dest becomes source
                        v_source_account_id, -- Reversed: source becomes dest
                        p_original_transaction_id,
                        NOW(),
                        p_user_id
                    );
                    
                    SET p_reversal_transaction_id = LAST_INSERT_ID();
                    
                    -- Update original transaction
                    UPDATE transactions
                    SET status = 'REVERSED',
                        reversed_by_id = p_reversal_transaction_id
                    WHERE id = p_original_transaction_id;
                    
                    -- Insert ledger entries (opposite of original)
                    -- CREDIT to original source (getting money back)
                    INSERT INTO ledger_entries (
                        transaction_id,
                        account_id,
                        entry_type,
                        amount,
                        currency,
                        balance_after,
                        description,
                        entry_date
                    ) VALUES (
                        p_reversal_transaction_id,
                        v_source_account_id,
                        'CREDIT',
                        v_original_amount,
                        'BDT',
                        v_new_source_balance,
                        CONCAT('Reversal credit - ', p_reason),
                        v_today
                    );
                    
                    -- DEBIT from original destination (money taken back)
                    INSERT INTO ledger_entries (
                        transaction_id,
                        account_id,
                        entry_type,
                        amount,
                        currency,
                        balance_after,
                        description,
                        entry_date
                    ) VALUES (
                        p_reversal_transaction_id,
                        v_dest_account_id,
                        'DEBIT',
                        v_original_amount,
                        'BDT',
                        v_new_dest_balance,
                        CONCAT('Reversal debit - ', p_reason),
                        v_today
                    );
                    
                    -- Update balances
                    UPDATE account_balances
                    SET available_balance = v_new_source_balance,
                        last_transaction_id = p_reversal_transaction_id,
                        last_calculated_at = NOW(),
                        version = version + 1
                    WHERE account_id = v_source_account_id;
                    
                    UPDATE account_balances
                    SET available_balance = v_new_dest_balance,
                        last_transaction_id = p_reversal_transaction_id,
                        last_calculated_at = NOW(),
                        version = version + 1
                    WHERE account_id = v_dest_account_id;
                    
                    -- Emit event
                    INSERT INTO events (
                        event_type,
                        aggregate_type,
                        aggregate_id,
                        payload
                    ) VALUES (
                        'TRANSACTION_REVERSED',
                        'TRANSACTION',
                        p_reversal_transaction_id,
                        JSON_OBJECT(
                            'reversal_transaction_id', p_reversal_transaction_id,
                            'original_transaction_id', p_original_transaction_id,
                            'amount', v_original_amount,
                            'reason', p_reason
                        )
                    );
                    
                    COMMIT;
                    
                    SET p_status = 'COMPLETED';
                    SET p_message = 'Transaction reversed successfully';
                END IF;
            ELSEIF v_original_type = 'DEPOSIT' THEN
                -- For deposits, we create a DEBIT to reverse the CREDIT
                -- destination_account_id holds the account that received the deposit
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
                    
                    -- Generate transaction reference
                    SET v_transaction_ref = UUID();
                    
                    -- Get reversal transaction type
                    SELECT id INTO v_transaction_type_id
                    FROM transaction_types
                    WHERE code = 'REVERSAL';
                    
                    IF v_transaction_type_id IS NULL THEN
                        SET v_transaction_type_id = 4;
                    END IF;
                    
                    -- Insert reversal transaction (source becomes dest_account since money leaves)
                    INSERT INTO transactions (
                        transaction_reference,
                        transaction_type_id,
                        amount,
                        currency,
                        description,
                        status,
                        source_account_id,
                        reversal_of_id,
                        processed_at,
                        created_by
                    ) VALUES (
                        v_transaction_ref,
                        v_transaction_type_id,
                        v_original_amount,
                        'BDT',
                        CONCAT('Deposit Reversal: ', p_reason),
                        'COMPLETED',
                        v_dest_account_id,
                        p_original_transaction_id,
                        NOW(),
                        p_user_id
                    );
                    
                    SET p_reversal_transaction_id = LAST_INSERT_ID();
                    
                    -- Update original transaction
                    UPDATE transactions
                    SET status = 'REVERSED',
                        reversed_by_id = p_reversal_transaction_id
                    WHERE id = p_original_transaction_id;
                    
                    -- Insert DEBIT ledger entry (reversing the original CREDIT)
                    INSERT INTO ledger_entries (
                        transaction_id,
                        account_id,
                        entry_type,
                        amount,
                        currency,
                        balance_after,
                        description,
                        entry_date
                    ) VALUES (
                        p_reversal_transaction_id,
                        v_dest_account_id,
                        'DEBIT',
                        v_original_amount,
                        'BDT',
                        v_new_dest_balance,
                        CONCAT('Deposit reversal - ', p_reason),
                        v_today
                    );
                    
                    -- Update balance
                    UPDATE account_balances
                    SET available_balance = v_new_dest_balance,
                        last_transaction_id = p_reversal_transaction_id,
                        last_calculated_at = NOW(),
                        version = version + 1
                    WHERE account_id = v_dest_account_id;
                    
                    -- Emit event
                    INSERT INTO events (
                        event_type,
                        aggregate_type,
                        aggregate_id,
                        payload
                    ) VALUES (
                        'TRANSACTION_REVERSED',
                        'TRANSACTION',
                        p_reversal_transaction_id,
                        JSON_OBJECT(
                            'reversal_transaction_id', p_reversal_transaction_id,
                            'original_transaction_id', p_original_transaction_id,
                            'original_type', 'DEPOSIT',
                            'amount', v_original_amount,
                            'reason', p_reason
                        )
                    );
                    
                    COMMIT;
                    
                    SET p_status = 'COMPLETED';
                    SET p_message = 'Deposit reversed successfully';
                END IF;
            ELSEIF v_original_type = 'WITHDRAWAL' THEN
                -- For withdrawals, we create a CREDIT to reverse the DEBIT
                -- source_account_id holds the account that was debited
                SELECT available_balance INTO v_source_balance
                FROM account_balances
                WHERE account_id = v_source_account_id
                FOR UPDATE;
                
                SET v_new_source_balance = v_source_balance + v_original_amount;
                
                -- Generate transaction reference
                SET v_transaction_ref = UUID();
                
                -- Get reversal transaction type
                SELECT id INTO v_transaction_type_id
                FROM transaction_types
                WHERE code = 'REVERSAL';
                
                IF v_transaction_type_id IS NULL THEN
                    SET v_transaction_type_id = 4;
                END IF;
                
                -- Insert reversal transaction (dest becomes source_account since money enters)
                INSERT INTO transactions (
                    transaction_reference,
                    transaction_type_id,
                    amount,
                    currency,
                    description,
                    status,
                    destination_account_id,
                    reversal_of_id,
                    processed_at,
                    created_by
                ) VALUES (
                    v_transaction_ref,
                    v_transaction_type_id,
                    v_original_amount,
                    'BDT',
                    CONCAT('Withdrawal Reversal: ', p_reason),
                    'COMPLETED',
                    v_source_account_id,
                    p_original_transaction_id,
                    NOW(),
                    p_user_id
                );
                
                SET p_reversal_transaction_id = LAST_INSERT_ID();
                
                -- Update original transaction
                UPDATE transactions
                SET status = 'REVERSED',
                    reversed_by_id = p_reversal_transaction_id
                WHERE id = p_original_transaction_id;
                
                -- Insert CREDIT ledger entry (reversing the original DEBIT)
                INSERT INTO ledger_entries (
                    transaction_id,
                    account_id,
                    entry_type,
                    amount,
                    currency,
                    balance_after,
                    description,
                    entry_date
                ) VALUES (
                    p_reversal_transaction_id,
                    v_source_account_id,
                    'CREDIT',
                    v_original_amount,
                    'BDT',
                    v_new_source_balance,
                    CONCAT('Withdrawal reversal - ', p_reason),
                    v_today
                );
                
                -- Update balance
                UPDATE account_balances
                SET available_balance = v_new_source_balance,
                    last_transaction_id = p_reversal_transaction_id,
                    last_calculated_at = NOW(),
                    version = version + 1
                WHERE account_id = v_source_account_id;
                
                -- Emit event
                INSERT INTO events (
                    event_type,
                    aggregate_type,
                    aggregate_id,
                    payload
                ) VALUES (
                    'TRANSACTION_REVERSED',
                    'TRANSACTION',
                    p_reversal_transaction_id,
                    JSON_OBJECT(
                        'reversal_transaction_id', p_reversal_transaction_id,
                        'original_transaction_id', p_original_transaction_id,
                        'original_type', 'WITHDRAWAL',
                        'amount', v_original_amount,
                        'reason', p_reason
                    )
                );
                
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


-- =============================================================================
-- PROCEDURE: sp_refresh_account_balances
-- Rebuilds materialized balances from the ledger (recovery/verification)
-- =============================================================================

DROP PROCEDURE IF EXISTS sp_refresh_account_balances//

CREATE PROCEDURE sp_refresh_account_balances(
    IN p_account_id BIGINT UNSIGNED,
    OUT p_calculated_balance DECIMAL(19,4),
    OUT p_current_balance DECIMAL(19,4),
    OUT p_discrepancy DECIMAL(19,4),
    OUT p_status VARCHAR(20)
)
BEGIN
    DECLARE v_total_credits DECIMAL(19,4) DEFAULT 0;
    DECLARE v_total_debits DECIMAL(19,4) DEFAULT 0;
    DECLARE v_last_transaction_id BIGINT UNSIGNED;
    
    -- Calculate balance from ledger
    SELECT 
        COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0),
        MAX(transaction_id)
    INTO v_total_credits, v_total_debits, v_last_transaction_id
    FROM ledger_entries
    WHERE account_id = p_account_id;
    
    SET p_calculated_balance = v_total_credits - v_total_debits;
    
    -- Get current materialized balance
    SELECT available_balance INTO p_current_balance
    FROM account_balances
    WHERE account_id = p_account_id;
    
    -- Calculate discrepancy
    SET p_discrepancy = p_calculated_balance - COALESCE(p_current_balance, 0);
    
    -- Update if there's a discrepancy
    IF p_discrepancy != 0 OR p_current_balance IS NULL THEN
        INSERT INTO account_balances (account_id, available_balance, last_transaction_id, last_calculated_at)
        VALUES (p_account_id, p_calculated_balance, v_last_transaction_id, NOW())
        ON DUPLICATE KEY UPDATE
            available_balance = p_calculated_balance,
            last_transaction_id = v_last_transaction_id,
            last_calculated_at = NOW(),
            version = version + 1;
        
        SET p_status = 'CORRECTED';
    ELSE
        SET p_status = 'OK';
    END IF;
END//


-- =============================================================================
-- PROCEDURE: sp_post_monthly_interest
-- Posts interest to all eligible savings accounts
-- =============================================================================

DROP PROCEDURE IF EXISTS sp_post_monthly_interest//

CREATE PROCEDURE sp_post_monthly_interest(
    IN p_year INT,
    IN p_month INT,
    IN p_user_id BIGINT UNSIGNED,
    OUT p_accounts_processed INT,
    OUT p_total_interest DECIMAL(19,4),
    OUT p_status VARCHAR(20)
)
BEGIN
    DECLARE v_done INT DEFAULT FALSE;
    DECLARE v_account_id BIGINT UNSIGNED;
    DECLARE v_avg_balance DECIMAL(19,4);
    DECLARE v_interest_rate DECIMAL(5,4);
    DECLARE v_interest_amount DECIMAL(19,4);
    DECLARE v_transaction_id BIGINT UNSIGNED;
    DECLARE v_transaction_ref VARCHAR(36);
    DECLARE v_transaction_type_id BIGINT UNSIGNED;
    DECLARE v_current_balance DECIMAL(19,4);
    DECLARE v_new_balance DECIMAL(19,4);
    DECLARE v_today DATE;
    
    -- Cursor for eligible accounts
    DECLARE account_cursor CURSOR FOR
        SELECT a.id, COALESCE(ms.avg_daily_balance, ab.available_balance), at.interest_rate
        FROM accounts a
        INNER JOIN account_types at ON at.id = a.account_type_id
        INNER JOIN account_balances ab ON ab.account_id = a.id
        LEFT JOIN monthly_account_summaries ms ON ms.account_id = a.id 
            AND ms.year = p_year AND ms.month = p_month
        WHERE a.status = 'ACTIVE'
        AND at.interest_rate > 0;
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
    
    -- Initialize
    SET v_today = CURDATE();
    SET p_accounts_processed = 0;
    SET p_total_interest = 0;
    SET p_status = 'PROCESSING';
    
    -- Get interest transaction type
    SELECT id INTO v_transaction_type_id
    FROM transaction_types
    WHERE code = 'INTEREST';
    
    IF v_transaction_type_id IS NULL THEN
        SET v_transaction_type_id = 5;
    END IF;
    
    OPEN account_cursor;
    
    interest_loop: LOOP
        FETCH account_cursor INTO v_account_id, v_avg_balance, v_interest_rate;
        
        IF v_done THEN
            LEAVE interest_loop;
        END IF;
        
        -- Calculate monthly interest (annual rate / 12)
        SET v_interest_amount = ROUND(v_avg_balance * (v_interest_rate / 12), 4);
        
        -- Skip if interest is too small
        IF v_interest_amount >= 0.01 THEN
            START TRANSACTION;
            
            -- Lock account
            SELECT available_balance INTO v_current_balance
            FROM account_balances
            WHERE account_id = v_account_id
            FOR UPDATE;
            
            SET v_new_balance = v_current_balance + v_interest_amount;
            SET v_transaction_ref = UUID();
            
            -- Insert transaction
            INSERT INTO transactions (
                transaction_reference,
                transaction_type_id,
                amount,
                currency,
                description,
                status,
                destination_account_id,
                processed_at,
                created_by
            ) VALUES (
                v_transaction_ref,
                v_transaction_type_id,
                v_interest_amount,
                'BDT',
                CONCAT('Monthly interest for ', p_year, '-', LPAD(p_month, 2, '0')),
                'COMPLETED',
                v_account_id,
                NOW(),
                p_user_id
            );
            
            SET v_transaction_id = LAST_INSERT_ID();
            
            -- Insert ledger entry
            INSERT INTO ledger_entries (
                transaction_id,
                account_id,
                entry_type,
                amount,
                currency,
                balance_after,
                description,
                entry_date
            ) VALUES (
                v_transaction_id,
                v_account_id,
                'CREDIT',
                v_interest_amount,
                'BDT',
                v_new_balance,
                CONCAT('Interest credit for ', p_year, '-', LPAD(p_month, 2, '0')),
                v_today
            );
            
            -- Update balance
            UPDATE account_balances
            SET available_balance = v_new_balance,
                last_transaction_id = v_transaction_id,
                last_calculated_at = NOW(),
                version = version + 1
            WHERE account_id = v_account_id;
            
            -- Update monthly summary
            UPDATE monthly_account_summaries
            SET interest_earned = v_interest_amount,
                updated_at = NOW()
            WHERE account_id = v_account_id
            AND year = p_year
            AND month = p_month;
            
            COMMIT;
            
            SET p_accounts_processed = p_accounts_processed + 1;
            SET p_total_interest = p_total_interest + v_interest_amount;
        END IF;
    END LOOP;
    
    CLOSE account_cursor;
    
    SET p_status = 'COMPLETED';
END//


-- =============================================================================
-- PROCEDURE: sp_eod_process
-- End-of-day processing: creates daily summaries, runs fraud checks
-- =============================================================================

DROP PROCEDURE IF EXISTS sp_eod_process//

CREATE PROCEDURE sp_eod_process(
    IN p_process_date DATE,
    IN p_user_id BIGINT UNSIGNED,
    OUT p_accounts_processed INT,
    OUT p_fraud_alerts INT,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(500)
)
BEGIN
    DECLARE v_done INT DEFAULT FALSE;
    DECLARE v_account_id BIGINT UNSIGNED;
    DECLARE v_opening_balance DECIMAL(19,4);
    DECLARE v_closing_balance DECIMAL(19,4);
    DECLARE v_total_debits DECIMAL(19,4);
    DECLARE v_total_credits DECIMAL(19,4);
    DECLARE v_debit_count INT;
    DECLARE v_credit_count INT;
    DECLARE v_job_id BIGINT UNSIGNED;
    DECLARE v_start_time TIMESTAMP;
    
    -- Cursor for all active accounts
    DECLARE account_cursor CURSOR FOR
        SELECT a.id
        FROM accounts a
        WHERE a.status = 'ACTIVE';
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
    
    -- Initialize
    SET v_start_time = NOW();
    SET p_accounts_processed = 0;
    SET p_fraud_alerts = 0;
    SET p_status = 'PROCESSING';
    SET p_message = '';
    
    -- Create job record
    INSERT INTO system_jobs (
        job_name,
        job_type,
        status,
        scheduled_at,
        started_at,
        created_by
    ) VALUES (
        CONCAT('EOD Process - ', p_process_date),
        'EOD',
        'RUNNING',
        NOW(),
        NOW(),
        p_user_id
    );
    
    SET v_job_id = LAST_INSERT_ID();
    
    OPEN account_cursor;
    
    eod_loop: LOOP
        FETCH account_cursor INTO v_account_id;
        
        IF v_done THEN
            LEAVE eod_loop;
        END IF;
        
        -- Get opening balance (previous day's closing or current if first day)
        SELECT COALESCE(
            (SELECT closing_balance FROM daily_account_totals 
             WHERE account_id = v_account_id 
             AND date = DATE_SUB(p_process_date, INTERVAL 1 DAY)),
            (SELECT available_balance FROM account_balances WHERE account_id = v_account_id)
        ) INTO v_opening_balance;
        
        -- Calculate day's activity
        SELECT 
            COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN 1 ELSE 0 END), 0)
        INTO v_total_debits, v_total_credits, v_debit_count, v_credit_count
        FROM ledger_entries
        WHERE account_id = v_account_id
        AND entry_date = p_process_date;
        
        -- Calculate closing balance
        SET v_closing_balance = v_opening_balance + v_total_credits - v_total_debits;
        
        -- Insert or update daily totals
        INSERT INTO daily_account_totals (
            account_id,
            date,
            opening_balance,
            closing_balance,
            total_debits,
            total_credits,
            debit_count,
            credit_count
        ) VALUES (
            v_account_id,
            p_process_date,
            COALESCE(v_opening_balance, 0),
            v_closing_balance,
            v_total_debits,
            v_total_credits,
            v_debit_count,
            v_credit_count
        )
        ON DUPLICATE KEY UPDATE
            opening_balance = COALESCE(v_opening_balance, 0),
            closing_balance = v_closing_balance,
            total_debits = v_total_debits,
            total_credits = v_total_credits,
            debit_count = v_debit_count,
            credit_count = v_credit_count;
        
        SET p_accounts_processed = p_accounts_processed + 1;
    END LOOP;
    
    CLOSE account_cursor;
    
    -- Run fraud detection for large transactions
    INSERT INTO fraud_queue (
        transaction_id,
        customer_id,
        rule_triggered,
        severity,
        status,
        fraud_score,
        details
    )
    SELECT 
        t.id,
        a.customer_id,
        'LARGE_AMOUNT',
        CASE 
            WHEN t.amount >= 5000000 THEN 'CRITICAL'
            WHEN t.amount >= 1000000 THEN 'HIGH'
            ELSE 'MEDIUM'
        END,
        'PENDING',
        CASE 
            WHEN t.amount >= 5000000 THEN 90
            WHEN t.amount >= 1000000 THEN 70
            ELSE 50
        END,
        JSON_OBJECT('amount', t.amount, 'threshold', 1000000)
    FROM transactions t
    INNER JOIN accounts a ON a.id = COALESCE(t.source_account_id, t.destination_account_id)
    WHERE DATE(t.created_at) = p_process_date
    AND t.amount >= 1000000
    AND NOT EXISTS (
        SELECT 1 FROM fraud_queue fq WHERE fq.transaction_id = t.id
    );
    
    SET p_fraud_alerts = ROW_COUNT();
    
    -- Update job record
    UPDATE system_jobs
    SET status = 'COMPLETED',
        completed_at = NOW(),
        duration_ms = TIMESTAMPDIFF(MICROSECOND, v_start_time, NOW()) / 1000,
        result = JSON_OBJECT(
            'accounts_processed', p_accounts_processed,
            'fraud_alerts', p_fraud_alerts
        )
    WHERE id = v_job_id;
    
    SET p_status = 'COMPLETED';
    SET p_message = CONCAT('EOD completed: ', p_accounts_processed, ' accounts, ', p_fraud_alerts, ' fraud alerts');
END//


DELIMITER ;

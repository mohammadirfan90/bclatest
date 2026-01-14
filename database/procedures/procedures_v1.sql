-- =============================================================================
-- Banking Core - Stored Procedures v1.0
-- All money movement MUST happen through these procedures
-- =============================================================================
-- Version: 1.0.0
-- Date: 2026-01-14
-- Procedures: sp_deposit, sp_withdraw, sp_transfer, sp_rebuild_balance
-- =============================================================================

DELIMITER //

-- =============================================================================
-- PROCEDURE: sp_deposit
-- Deposits money into an account (banker operation)
-- Double-entry: CREDIT to customer account
-- =============================================================================

DROP PROCEDURE IF EXISTS sp_deposit//

CREATE PROCEDURE sp_deposit(
    IN p_account_id BIGINT UNSIGNED,
    IN p_amount DECIMAL(18,4),
    IN p_description VARCHAR(255),
    IN p_banker_id BIGINT UNSIGNED,
    OUT p_transaction_id BIGINT UNSIGNED,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_current_balance DECIMAL(18,4);
    DECLARE v_new_balance DECIMAL(18,4);
    DECLARE v_account_status VARCHAR(20);
    DECLARE v_transaction_ref VARCHAR(36);
    DECLARE v_transaction_type_id BIGINT UNSIGNED;
    DECLARE v_today DATE;
    
    -- Error handler: rollback on any SQL exception
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = 'Deposit failed due to database error';
        SET p_transaction_id = NULL;
    END;
    
    -- Initialize
    SET v_today = CURDATE();
    SET p_transaction_id = NULL;
    SET p_status = 'PENDING';
    SET p_message = '';
    
    -- Start atomic transaction
    START TRANSACTION;
    
    -- 1. Validate amount
    IF p_amount <= 0 THEN
        SET p_status = 'FAILED';
        SET p_message = 'Amount must be greater than zero';
        ROLLBACK;
    ELSE
        -- 2. Lock and validate account
        SELECT ab.available_balance, a.status
        INTO v_current_balance, v_account_status
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
            
            -- 5. Get transaction type ID for DEPOSIT
            SELECT id INTO v_transaction_type_id
            FROM transaction_types
            WHERE code = 'DEPOSIT';
            
            IF v_transaction_type_id IS NULL THEN
                SET v_transaction_type_id = 2; -- Fallback
            END IF;
            
            -- 6. Insert transaction header
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
                p_amount,
                'BDT',
                COALESCE(p_description, 'Cash Deposit'),
                'COMPLETED',
                p_account_id,
                NOW(),
                p_banker_id
            );
            
            SET p_transaction_id = LAST_INSERT_ID();
            
            -- 7. Insert CREDIT ledger entry (money coming IN)
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
                CONCAT('Deposit - ', COALESCE(p_description, 'Cash')),
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
            
            -- 10. Commit transaction
            COMMIT;
            
            SET p_status = 'COMPLETED';
            SET p_message = 'Deposit completed successfully';
        END IF;
    END IF;
END//


-- =============================================================================
-- PROCEDURE: sp_withdraw
-- Withdraws money from an account (banker operation)
-- Double-entry: DEBIT from customer account
-- Enforces non-negative balance constraint
-- =============================================================================

DROP PROCEDURE IF EXISTS sp_withdraw//

CREATE PROCEDURE sp_withdraw(
    IN p_account_id BIGINT UNSIGNED,
    IN p_amount DECIMAL(18,4),
    IN p_description VARCHAR(255),
    IN p_banker_id BIGINT UNSIGNED,
    OUT p_transaction_id BIGINT UNSIGNED,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_current_balance DECIMAL(18,4);
    DECLARE v_new_balance DECIMAL(18,4);
    DECLARE v_account_status VARCHAR(20);
    DECLARE v_transaction_ref VARCHAR(36);
    DECLARE v_transaction_type_id BIGINT UNSIGNED;
    DECLARE v_today DATE;
    
    -- Error handler
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = 'Withdrawal failed due to database error';
        SET p_transaction_id = NULL;
    END;
    
    -- Initialize
    SET v_today = CURDATE();
    SET p_transaction_id = NULL;
    SET p_status = 'PENDING';
    SET p_message = '';
    
    -- Start atomic transaction
    START TRANSACTION;
    
    -- 1. Validate amount
    IF p_amount <= 0 THEN
        SET p_status = 'FAILED';
        SET p_message = 'Amount must be greater than zero';
        ROLLBACK;
    ELSE
        -- 2. Lock and validate account
        SELECT ab.available_balance, a.status
        INTO v_current_balance, v_account_status
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
            -- Enforce non-negative balance
            SET p_status = 'FAILED';
            SET p_message = 'Insufficient balance';
            ROLLBACK;
        ELSE
            -- 3. Calculate new balance
            SET v_new_balance = v_current_balance - p_amount;
            
            -- 4. Defense in depth: double-check non-negative
            IF v_new_balance < 0 THEN
                SET p_status = 'FAILED';
                SET p_message = 'Insufficient balance (concurrent modification)';
                ROLLBACK;
            ELSE
                -- 5. Generate transaction reference
                SET v_transaction_ref = UUID();
                
                -- 6. Get transaction type ID for WITHDRAWAL
                SELECT id INTO v_transaction_type_id
                FROM transaction_types
                WHERE code = 'WITHDRAWAL';
                
                IF v_transaction_type_id IS NULL THEN
                    SET v_transaction_type_id = 3; -- Fallback
                END IF;
                
                -- 7. Insert transaction header
                INSERT INTO transactions (
                    transaction_reference,
                    transaction_type_id,
                    amount,
                    currency,
                    description,
                    status,
                    source_account_id,
                    processed_at,
                    created_by
                ) VALUES (
                    v_transaction_ref,
                    v_transaction_type_id,
                    p_amount,
                    'BDT',
                    COALESCE(p_description, 'Cash Withdrawal'),
                    'COMPLETED',
                    p_account_id,
                    NOW(),
                    p_banker_id
                );
                
                SET p_transaction_id = LAST_INSERT_ID();
                
                -- 8. Insert DEBIT ledger entry (money going OUT)
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
                    CONCAT('Withdrawal - ', COALESCE(p_description, 'Cash')),
                    v_today
                );
                
                -- 9. Update materialized balance
                UPDATE account_balances
                SET available_balance = v_new_balance,
                    last_transaction_id = p_transaction_id,
                    last_calculated_at = NOW(),
                    version = version + 1
                WHERE account_id = p_account_id;
                
                -- 10. Update account last_transaction_at
                UPDATE accounts
                SET last_transaction_at = NOW()
                WHERE id = p_account_id;
                
                -- 11. Commit transaction
                COMMIT;
                
                SET p_status = 'COMPLETED';
                SET p_message = 'Withdrawal completed successfully';
            END IF;
        END IF;
    END IF;
END//


-- =============================================================================
-- PROCEDURE: sp_transfer
-- Transfers money between two accounts (customer or banker operation)
-- Double-entry: DEBIT from source + CREDIT to destination
-- Enforces non-negative balance on source account
-- =============================================================================

DROP PROCEDURE IF EXISTS sp_transfer//

CREATE PROCEDURE sp_transfer(
    IN p_from_account_id BIGINT UNSIGNED,
    IN p_to_account_id BIGINT UNSIGNED,
    IN p_amount DECIMAL(18,4),
    IN p_description VARCHAR(255),
    IN p_performed_by BIGINT UNSIGNED,
    OUT p_transaction_id BIGINT UNSIGNED,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_from_balance DECIMAL(18,4);
    DECLARE v_to_balance DECIMAL(18,4);
    DECLARE v_new_from_balance DECIMAL(18,4);
    DECLARE v_new_to_balance DECIMAL(18,4);
    DECLARE v_from_status VARCHAR(20);
    DECLARE v_to_status VARCHAR(20);
    DECLARE v_transaction_ref VARCHAR(36);
    DECLARE v_transaction_type_id BIGINT UNSIGNED;
    DECLARE v_today DATE;
    
    -- Error handler
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = 'Transfer failed due to database error';
        SET p_transaction_id = NULL;
    END;
    
    -- Initialize
    SET v_today = CURDATE();
    SET p_transaction_id = NULL;
    SET p_status = 'PENDING';
    SET p_message = '';
    
    -- Start atomic transaction
    START TRANSACTION;
    
    -- 1. Validate amount
    IF p_amount <= 0 THEN
        SET p_status = 'FAILED';
        SET p_message = 'Amount must be greater than zero';
        ROLLBACK;
    ELSEIF p_from_account_id = p_to_account_id THEN
        SET p_status = 'FAILED';
        SET p_message = 'Cannot transfer to the same account';
        ROLLBACK;
    ELSE
        -- 2. Lock source account first (consistent ordering prevents deadlocks)
        SELECT ab.available_balance, a.status
        INTO v_from_balance, v_from_status
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
            -- 3. Lock destination account
            SELECT ab.available_balance, a.status
            INTO v_to_balance, v_to_status
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
            ELSE
                -- 4. Calculate new balances
                SET v_new_from_balance = v_from_balance - p_amount;
                SET v_new_to_balance = v_to_balance + p_amount;
                
                -- 5. Defense in depth
                IF v_new_from_balance < 0 THEN
                    SET p_status = 'FAILED';
                    SET p_message = 'Insufficient balance (concurrent modification)';
                    ROLLBACK;
                ELSE
                    -- 6. Generate transaction reference
                    SET v_transaction_ref = UUID();
                    
                    -- 7. Get transaction type ID for TRANSFER
                    SELECT id INTO v_transaction_type_id
                    FROM transaction_types
                    WHERE code = 'TRANSFER';
                    
                    IF v_transaction_type_id IS NULL THEN
                        SET v_transaction_type_id = 1; -- Fallback
                    END IF;
                    
                    -- 8. Insert transaction header
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
                        COALESCE(p_description, 'Fund Transfer'),
                        'COMPLETED',
                        p_from_account_id,
                        p_to_account_id,
                        NOW(),
                        p_performed_by
                    );
                    
                    SET p_transaction_id = LAST_INSERT_ID();
                    
                    -- 9. Insert DEBIT ledger entry (source - money going OUT)
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
                        CONCAT('Transfer Out - ', COALESCE(p_description, 'Fund Transfer')),
                        v_today
                    );
                    
                    -- 10. Insert CREDIT ledger entry (destination - money coming IN)
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
                        CONCAT('Transfer In - ', COALESCE(p_description, 'Fund Transfer')),
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
                    
                    -- 13. Commit transaction
                    COMMIT;
                    
                    SET p_status = 'COMPLETED';
                    SET p_message = 'Transfer completed successfully';
                END IF;
            END IF;
        END IF;
    END IF;
END//


-- =============================================================================
-- PROCEDURE: sp_rebuild_balance
-- Recalculates account balance from ledger entries (admin recovery tool)
-- Used to fix any balance discrepancies
-- =============================================================================

DROP PROCEDURE IF EXISTS sp_rebuild_balance//

CREATE PROCEDURE sp_rebuild_balance(
    IN p_account_id BIGINT UNSIGNED,
    OUT p_old_balance DECIMAL(18,4),
    OUT p_new_balance DECIMAL(18,4),
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_calculated_balance DECIMAL(18,4);
    DECLARE v_last_txn_id BIGINT UNSIGNED;
    
    -- Error handler
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = 'Balance rebuild failed';
    END;
    
    -- Initialize
    SET p_old_balance = 0;
    SET p_new_balance = 0;
    SET p_status = 'PENDING';
    SET p_message = '';
    
    START TRANSACTION;
    
    -- 1. Get current materialized balance
    SELECT available_balance INTO p_old_balance
    FROM account_balances
    WHERE account_id = p_account_id
    FOR UPDATE;
    
    IF p_old_balance IS NULL THEN
        SET p_status = 'FAILED';
        SET p_message = 'Account not found';
        ROLLBACK;
    ELSE
        -- 2. Calculate actual balance from ledger
        SELECT 
            COALESCE(SUM(CASE 
                WHEN entry_type = 'CREDIT' THEN amount 
                WHEN entry_type = 'DEBIT' THEN -amount 
            END), 0),
            MAX(transaction_id)
        INTO v_calculated_balance, v_last_txn_id
        FROM ledger_entries
        WHERE account_id = p_account_id;
        
        SET p_new_balance = v_calculated_balance;
        
        -- 3. Update materialized balance
        UPDATE account_balances
        SET available_balance = v_calculated_balance,
            last_transaction_id = v_last_txn_id,
            last_calculated_at = NOW(),
            version = version + 1
        WHERE account_id = p_account_id;
        
        COMMIT;
        
        SET p_status = 'COMPLETED';
        IF p_old_balance = p_new_balance THEN
            SET p_message = 'Balance verified - no discrepancy';
        ELSE
            SET p_message = CONCAT('Balance corrected. Old: ', p_old_balance, ', New: ', p_new_balance);
        END IF;
    END IF;
END//


DELIMITER ;

-- =============================================================================
-- PROCEDURES COMPLETE
-- =============================================================================
-- sp_deposit: Banker deposits cash into customer account
-- sp_withdraw: Banker withdraws cash from customer account
-- sp_transfer: Transfer between two internal accounts
-- sp_rebuild_balance: Admin tool to recalculate balance from ledger
-- =============================================================================

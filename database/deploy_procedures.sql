-- =============================================================================
-- Banking Core v1.0 - Stored Procedures and Triggers
-- Run this AFTER deploy_schema.sql completes successfully
-- =============================================================================

DELIMITER //

-- Drop existing procedures if they exist
DROP PROCEDURE IF EXISTS sp_deposit//
DROP PROCEDURE IF EXISTS sp_withdraw//
DROP PROCEDURE IF EXISTS sp_transfer//
DROP PROCEDURE IF EXISTS sp_rebuild_balance//

-- ============================================
-- PROCEDURE: sp_deposit
-- ============================================
CREATE PROCEDURE sp_deposit(
    IN p_account_id BIGINT,
    IN p_amount DECIMAL(18,4),
    IN p_description VARCHAR(255),
    IN p_banker_id BIGINT,
    OUT p_transaction_id BIGINT,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_account_status VARCHAR(20);
    DECLARE v_current_balance DECIMAL(18,4);
    DECLARE v_new_balance DECIMAL(18,4);
    DECLARE v_transaction_type_id BIGINT;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = 'Database error occurred';
    END;
    
    START TRANSACTION;
    
    IF p_amount <= 0 THEN
        SET p_status = 'FAILED';
        SET p_message = 'Amount must be positive';
        ROLLBACK;
    ELSE
        SELECT status INTO v_account_status FROM accounts WHERE id = p_account_id FOR UPDATE;
        
        IF v_account_status IS NULL THEN
            SET p_status = 'FAILED';
            SET p_message = 'Account not found';
            ROLLBACK;
        ELSEIF v_account_status != 'ACTIVE' THEN
            SET p_status = 'FAILED';
            SET p_message = 'Account is not active';
            ROLLBACK;
        ELSE
            SELECT id INTO v_transaction_type_id FROM transaction_types WHERE code = 'DEPOSIT';
            SELECT available_balance INTO v_current_balance FROM account_balances WHERE account_id = p_account_id FOR UPDATE;
            SET v_new_balance = COALESCE(v_current_balance, 0) + p_amount;
            
            INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, description, status, destination_account_id, processed_at, created_by)
            VALUES (UUID(), v_transaction_type_id, p_amount, 'BDT', COALESCE(p_description, 'Cash deposit'), 'COMPLETED', p_account_id, NOW(), p_banker_id);
            SET p_transaction_id = LAST_INSERT_ID();
            
            INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date)
            VALUES (p_transaction_id, p_account_id, 'CREDIT', p_amount, 'BDT', v_new_balance, COALESCE(p_description, 'Cash deposit'), CURDATE());
            
            INSERT INTO account_balances (account_id, available_balance, last_transaction_id, version)
            VALUES (p_account_id, v_new_balance, p_transaction_id, 1)
            ON DUPLICATE KEY UPDATE available_balance = v_new_balance, last_transaction_id = p_transaction_id, version = version + 1;
            
            COMMIT;
            SET p_status = 'COMPLETED';
            SET p_message = 'Deposit completed successfully';
        END IF;
    END IF;
END//

-- ============================================
-- PROCEDURE: sp_withdraw
-- ============================================
CREATE PROCEDURE sp_withdraw(
    IN p_account_id BIGINT,
    IN p_amount DECIMAL(18,4),
    IN p_description VARCHAR(255),
    IN p_banker_id BIGINT,
    OUT p_transaction_id BIGINT,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_account_status VARCHAR(20);
    DECLARE v_current_balance DECIMAL(18,4);
    DECLARE v_new_balance DECIMAL(18,4);
    DECLARE v_transaction_type_id BIGINT;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = 'Database error occurred';
    END;
    
    START TRANSACTION;
    
    IF p_amount <= 0 THEN
        SET p_status = 'FAILED';
        SET p_message = 'Amount must be positive';
        ROLLBACK;
    ELSE
        SELECT status INTO v_account_status FROM accounts WHERE id = p_account_id FOR UPDATE;
        
        IF v_account_status IS NULL THEN
            SET p_status = 'FAILED';
            SET p_message = 'Account not found';
            ROLLBACK;
        ELSEIF v_account_status != 'ACTIVE' THEN
            SET p_status = 'FAILED';
            SET p_message = 'Account is not active';
            ROLLBACK;
        ELSE
            SELECT available_balance INTO v_current_balance FROM account_balances WHERE account_id = p_account_id FOR UPDATE;
            SET v_current_balance = COALESCE(v_current_balance, 0);
            
            IF v_current_balance < p_amount THEN
                SET p_status = 'FAILED';
                SET p_message = 'Insufficient balance';
                ROLLBACK;
            ELSE
                SET v_new_balance = v_current_balance - p_amount;
                SELECT id INTO v_transaction_type_id FROM transaction_types WHERE code = 'WITHDRAWAL';
                
                INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, description, status, source_account_id, processed_at, created_by)
                VALUES (UUID(), v_transaction_type_id, p_amount, 'BDT', COALESCE(p_description, 'Cash withdrawal'), 'COMPLETED', p_account_id, NOW(), p_banker_id);
                SET p_transaction_id = LAST_INSERT_ID();
                
                INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date)
                VALUES (p_transaction_id, p_account_id, 'DEBIT', p_amount, 'BDT', v_new_balance, COALESCE(p_description, 'Cash withdrawal'), CURDATE());
                
                UPDATE account_balances SET available_balance = v_new_balance, last_transaction_id = p_transaction_id, version = version + 1 WHERE account_id = p_account_id;
                
                COMMIT;
                SET p_status = 'COMPLETED';
                SET p_message = 'Withdrawal completed successfully';
            END IF;
        END IF;
    END IF;
END//

-- ============================================
-- PROCEDURE: sp_transfer
-- ============================================
CREATE PROCEDURE sp_transfer(
    IN p_from_account_id BIGINT,
    IN p_to_account_id BIGINT,
    IN p_amount DECIMAL(18,4),
    IN p_description VARCHAR(255),
    IN p_performed_by BIGINT,
    OUT p_transaction_id BIGINT,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_from_status VARCHAR(20);
    DECLARE v_to_status VARCHAR(20);
    DECLARE v_from_balance DECIMAL(18,4);
    DECLARE v_to_balance DECIMAL(18,4);
    DECLARE v_new_from_balance DECIMAL(18,4);
    DECLARE v_new_to_balance DECIMAL(18,4);
    DECLARE v_transaction_type_id BIGINT;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = 'Database error occurred';
    END;
    
    START TRANSACTION;
    
    IF p_amount <= 0 THEN
        SET p_status = 'FAILED';
        SET p_message = 'Amount must be positive';
        ROLLBACK;
    ELSEIF p_from_account_id = p_to_account_id THEN
        SET p_status = 'FAILED';
        SET p_message = 'Cannot transfer to the same account';
        ROLLBACK;
    ELSE
        SELECT status INTO v_from_status FROM accounts WHERE id = p_from_account_id FOR UPDATE;
        
        IF v_from_status IS NULL THEN
            SET p_status = 'FAILED';
            SET p_message = 'Source account not found';
            ROLLBACK;
        ELSEIF v_from_status != 'ACTIVE' THEN
            SET p_status = 'FAILED';
            SET p_message = 'Source account is not active';
            ROLLBACK;
        ELSE
            SELECT available_balance INTO v_from_balance FROM account_balances WHERE account_id = p_from_account_id FOR UPDATE;
            SET v_from_balance = COALESCE(v_from_balance, 0);
            
            IF v_from_balance < p_amount THEN
                SET p_status = 'FAILED';
                SET p_message = 'Insufficient balance';
                ROLLBACK;
            ELSE
                SELECT status INTO v_to_status FROM accounts WHERE id = p_to_account_id FOR UPDATE;
                
                IF v_to_status IS NULL THEN
                    SET p_status = 'FAILED';
                    SET p_message = 'Destination account not found';
                    ROLLBACK;
                ELSEIF v_to_status != 'ACTIVE' THEN
                    SET p_status = 'FAILED';
                    SET p_message = 'Destination account is not active';
                    ROLLBACK;
                ELSE
                    SELECT available_balance INTO v_to_balance FROM account_balances WHERE account_id = p_to_account_id FOR UPDATE;
                    SET v_to_balance = COALESCE(v_to_balance, 0);
                    SET v_new_from_balance = v_from_balance - p_amount;
                    SET v_new_to_balance = v_to_balance + p_amount;
                    
                    SELECT id INTO v_transaction_type_id FROM transaction_types WHERE code = 'TRANSFER';
                    
                    INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, description, status, source_account_id, destination_account_id, processed_at, created_by)
                    VALUES (UUID(), v_transaction_type_id, p_amount, 'BDT', COALESCE(p_description, 'Fund transfer'), 'COMPLETED', p_from_account_id, p_to_account_id, NOW(), p_performed_by);
                    SET p_transaction_id = LAST_INSERT_ID();
                    
                    -- DEBIT from source
                    INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date)
                    VALUES (p_transaction_id, p_from_account_id, 'DEBIT', p_amount, 'BDT', v_new_from_balance, COALESCE(p_description, 'Transfer out'), CURDATE());
                    
                    -- CREDIT to destination
                    INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date)
                    VALUES (p_transaction_id, p_to_account_id, 'CREDIT', p_amount, 'BDT', v_new_to_balance, COALESCE(p_description, 'Transfer in'), CURDATE());
                    
                    UPDATE account_balances SET available_balance = v_new_from_balance, last_transaction_id = p_transaction_id, version = version + 1 WHERE account_id = p_from_account_id;
                    
                    INSERT INTO account_balances (account_id, available_balance, last_transaction_id, version)
                    VALUES (p_to_account_id, v_new_to_balance, p_transaction_id, 1)
                    ON DUPLICATE KEY UPDATE available_balance = v_new_to_balance, last_transaction_id = p_transaction_id, version = version + 1;
                    
                    COMMIT;
                    SET p_status = 'COMPLETED';
                    SET p_message = 'Transfer completed successfully';
                END IF;
            END IF;
        END IF;
    END IF;
END//

-- ============================================
-- PROCEDURE: sp_rebuild_balance
-- ============================================
CREATE PROCEDURE sp_rebuild_balance(
    IN p_account_id BIGINT,
    OUT p_old_balance DECIMAL(18,4),
    OUT p_new_balance DECIMAL(18,4),
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_calculated_balance DECIMAL(18,4);
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = 'Database error occurred';
    END;
    
    START TRANSACTION;
    
    SELECT available_balance INTO p_old_balance FROM account_balances WHERE account_id = p_account_id FOR UPDATE;
    
    SELECT COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE -amount END), 0) INTO v_calculated_balance
    FROM ledger_entries WHERE account_id = p_account_id;
    SET p_new_balance = v_calculated_balance;
    
    IF p_old_balance IS NULL THEN
        INSERT INTO account_balances (account_id, available_balance, version) VALUES (p_account_id, v_calculated_balance, 1);
        SET p_status = 'COMPLETED';
        SET p_message = 'Balance initialized from ledger';
    ELSEIF ABS(p_old_balance - v_calculated_balance) > 0.0001 THEN
        UPDATE account_balances SET available_balance = v_calculated_balance, version = version + 1 WHERE account_id = p_account_id;
        SET p_status = 'COMPLETED';
        SET p_message = 'Balance corrected - discrepancy found';
    ELSE
        SET p_status = 'COMPLETED';
        SET p_message = 'Balance verified - no discrepancy';
    END IF;
    
    COMMIT;
END//

DELIMITER ;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

DELIMITER //

DROP TRIGGER IF EXISTS trg_ledger_audit_insert//

CREATE TRIGGER trg_ledger_audit_insert
AFTER INSERT ON ledger_entries
FOR EACH ROW
BEGIN
    INSERT INTO transaction_audit (ledger_entry_id, transaction_id, account_id, entry_type, amount, balance_after, audit_timestamp)
    VALUES (NEW.id, NEW.transaction_id, NEW.account_id, NEW.entry_type, NEW.amount, NEW.balance_after, NOW());
END//

DELIMITER ;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT 'Procedures created:' AS info;
SHOW PROCEDURE STATUS WHERE Db = DATABASE();

SELECT 'Triggers created:' AS info;
SHOW TRIGGERS;

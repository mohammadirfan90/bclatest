DROP PROCEDURE IF EXISTS sp_debug_withdraw;

CREATE PROCEDURE sp_debug_withdraw(
    IN p_account_id BIGINT UNSIGNED,
    IN p_amount DECIMAL(19,4),
    IN p_description VARCHAR(500),
    IN p_user_id BIGINT UNSIGNED,
    IN p_idempotency_key VARCHAR(64),
    OUT p_transaction_id BIGINT UNSIGNED,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(500)
)
BEGIN
    DECLARE v_cash_account_id BIGINT UNSIGNED;
    DECLARE v_cash_balance DECIMAL(19,4);
    DECLARE v_customer_balance DECIMAL(19,4);
    DECLARE v_new_cash_balance DECIMAL(19,4);
    DECLARE v_new_customer_balance DECIMAL(19,4);
    DECLARE v_account_status VARCHAR(20);
    DECLARE v_transaction_ref VARCHAR(36);
    DECLARE v_transaction_type_id BIGINT UNSIGNED;
    DECLARE v_today DATE;
    DECLARE v_customer_id BIGINT UNSIGNED;
    
    -- NO ERROR HANDLER
    
    SET v_today = CURDATE();
    SET p_transaction_id = NULL;
    SET p_status = 'PENDING';
    SET p_message = '';
    
    START TRANSACTION;
    
        SELECT id INTO v_cash_account_id FROM accounts WHERE account_number = 'BANK-CASH-001' LIMIT 1;
        
        SELECT ab.available_balance, a.status, a.customer_id
        INTO v_customer_balance, v_account_status, v_customer_id
        FROM account_balances ab
        INNER JOIN accounts a ON a.id = ab.account_id
        WHERE ab.account_id = p_account_id FOR UPDATE;
        
        -- Simplified logic for debugging: assume checks pass
        SELECT available_balance INTO v_cash_balance FROM account_balances WHERE account_id = v_cash_account_id FOR UPDATE;
        
        SET v_new_customer_balance = v_customer_balance - p_amount;
        SET v_new_cash_balance = v_cash_balance + p_amount;
        SET v_transaction_ref = UUID();
                    
        INSERT INTO transactions (
            transaction_reference, transaction_type_id, amount, currency, description, status,
            source_account_id, destination_account_id, processed_at, created_by
        ) VALUES (
            v_transaction_ref, 3, p_amount, 'BDT', p_description, 'COMPLETED',
            p_account_id, v_cash_account_id, NOW(), p_user_id
        );
        
        SET p_transaction_id = LAST_INSERT_ID();
        
        INSERT INTO ledger_entries (
            transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date
        ) VALUES (
            p_transaction_id, p_account_id, 'DEBIT', p_amount, 'BDT',
            v_new_customer_balance, CONCAT('Debug Draw - ', p_description), v_today
        );
        
        INSERT INTO ledger_entries (
            transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date
        ) VALUES (
            p_transaction_id, v_cash_account_id, 'CREDIT', p_amount, 'BDT',
            v_new_cash_balance, CONCAT('Debug Draw Cash - ', p_description), v_today
        );
        
        UPDATE account_balances SET available_balance = v_new_customer_balance, version = version + 1 WHERE account_id = p_account_id;
        UPDATE account_balances SET available_balance = v_new_cash_balance, version = version + 1 WHERE account_id = v_cash_account_id;
        
        -- The suspect: OUTBOX
        INSERT INTO outbox (event_type, aggregate_type, aggregate_id, payload, status)
        VALUES ('WITHDRAWAL_COMPLETED', 'TRANSACTION', p_transaction_id,
            JSON_OBJECT('transaction_id', p_transaction_id, 'amount', p_amount, 'initiatedBy', p_user_id), 'PENDING');
            
    COMMIT;
    SET p_status = 'COMPLETED';
END;

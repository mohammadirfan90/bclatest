-- =============================================================================
-- Banking Core v1.0 - MINIMAL DEPLOYMENT (No Foreign Keys)
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- DROP ALL TABLES
DROP TABLE IF EXISTS transaction_audit;
DROP TABLE IF EXISTS ledger_entries;
DROP TABLE IF EXISTS account_balances;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS transaction_types;
DROP TABLE IF EXISTS account_types;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS outbox;
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS reconciliations;
DROP TABLE IF EXISTS reconciliation_items;
DROP TABLE IF EXISTS fraud_queue;
DROP TABLE IF EXISTS account_applications;
DROP TABLE IF EXISTS customer_kyc_requests;
DROP TABLE IF EXISTS onboarding_tokens;
DROP TABLE IF EXISTS kyc_applications;
DROP TABLE IF EXISTS accounts_history;
DROP TABLE IF EXISTS accrued_interest;
DROP TABLE IF EXISTS interest_rules;
DROP TABLE IF EXISTS reconciliation_audit;
DROP TABLE IF EXISTS system_config;
DROP TABLE IF EXISTS top_accounts_monthly;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS fraud_scores;
DROP TABLE IF EXISTS daily_account_totals;
DROP TABLE IF EXISTS monthly_account_summaries;
DROP TABLE IF EXISTS disputes;
DROP TABLE IF EXISTS scheduled_transfers;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS system_jobs;
DROP TABLE IF EXISTS customer_pseudonymizations;
DROP TABLE IF EXISTS signup_tokens;
DROP TABLE IF EXISTS customer_documents;
DROP TABLE IF EXISTS kyc_documents;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS interest_rates;

-- DROP PROCEDURES
DROP PROCEDURE IF EXISTS sp_transfer;
DROP PROCEDURE IF EXISTS sp_deposit;
DROP PROCEDURE IF EXISTS sp_withdraw;
DROP PROCEDURE IF EXISTS sp_rebuild_balance;
DROP PROCEDURE IF EXISTS sp_teller_deposit;
DROP PROCEDURE IF EXISTS sp_teller_withdraw;
DROP PROCEDURE IF EXISTS sp_refresh_account_balances;


-- =============================================================================
-- CREATE TABLES (NO FOREIGN KEYS - JUST SIMPLE TABLES)
-- =============================================================================

CREATE TABLE roles (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSON,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE account_types (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    min_balance DECIMAL(18,4) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE transaction_types (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    requires_approval BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role_id BIGINT NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE customers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    customer_number VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    national_id VARCHAR(50),
    date_of_birth DATE,
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(50),
    status VARCHAR(20) DEFAULT 'PENDING',
    kyc_status VARCHAR(20) DEFAULT 'PENDING',
    kyc_version INT UNSIGNED NOT NULL DEFAULT 1,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE accounts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_number VARCHAR(20) NOT NULL,
    customer_id BIGINT NOT NULL,
    account_type_id BIGINT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    opened_at TIMESTAMP NULL,
    closed_at TIMESTAMP NULL,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    balance_locked BOOLEAN DEFAULT FALSE,
    currency VARCHAR(3) DEFAULT 'BDT'
) ENGINE=InnoDB;

CREATE TABLE transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transaction_reference VARCHAR(50) NOT NULL,
    transaction_type_id BIGINT NOT NULL,
    amount DECIMAL(18,4) NOT NULL,
    currency VARCHAR(3) DEFAULT 'BDT',
    description VARCHAR(255),
    status VARCHAR(20) DEFAULT 'PENDING',
    source_account_id BIGINT,
    destination_account_id BIGINT,
    processed_at TIMESTAMP NULL,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE ledger_entries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transaction_id BIGINT NOT NULL,
    account_id BIGINT NOT NULL,
    entry_type VARCHAR(10) NOT NULL,
    amount DECIMAL(18,4) NOT NULL,
    currency VARCHAR(3) DEFAULT 'BDT',
    balance_after DECIMAL(18,4) NOT NULL,
    description VARCHAR(255),
    entry_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE account_balances (
    account_id BIGINT PRIMARY KEY,
    available_balance DECIMAL(18,4) NOT NULL DEFAULT 0,
    pending_balance DECIMAL(18,4) NOT NULL DEFAULT 0,
    hold_balance DECIMAL(18,4) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'BDT',
    last_transaction_id BIGINT,
    last_calculated_at TIMESTAMP NULL,
    version INT DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE transaction_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ledger_entry_id BIGINT NOT NULL,
    transaction_id BIGINT NOT NULL,
    account_id BIGINT NOT NULL,
    entry_type VARCHAR(10) NOT NULL,
    amount DECIMAL(18,4) NOT NULL,
    balance_after DECIMAL(18,4) NOT NULL,
    audit_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE idempotency_keys (
    idempotency_key VARCHAR(64) PRIMARY KEY,
    request_hash VARCHAR(64),
    response_status INT,
    response_body JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE system_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value TEXT,
    value_type VARCHAR(20) DEFAULT 'STRING',
    description TEXT,
    is_sensitive BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE outbox (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id BIGINT NOT NULL,
    payload JSON,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id BIGINT NOT NULL,
    payload JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =============================================================================
-- SEED DATA
-- =============================================================================

INSERT INTO roles (id, code, name, description, permissions, is_system) VALUES
(1, 'ADMIN', 'Administrator', 'Full access', '["*"]', TRUE),
(2, 'BANKER', 'Banker', 'Teller operations', '["transactions:*"]', TRUE),
(3, 'AUDITOR', 'Auditor', 'Read-only', '["read:*"]', TRUE),
(4, 'CUSTOMER', 'Customer', 'Portal access', '["own:*"]', TRUE);

INSERT INTO account_types (id, code, name, description, min_balance, is_active) VALUES
(1, 'SAVINGS', 'Savings Account', 'Standard savings', 500.0000, TRUE),
(2, 'CHECKING', 'Checking Account', 'Current account', 0.0000, TRUE),
(3, 'FIXED', 'Fixed Deposit', 'Term deposit', 10000.0000, TRUE),
(4, 'INTERNAL', 'Internal Account', 'Bank internal funds', 0.0000, TRUE);

INSERT INTO transaction_types (id, code, name, description, requires_approval) VALUES
(1, 'TRANSFER', 'Fund Transfer', 'Account transfer', FALSE),
(2, 'DEPOSIT', 'Cash Deposit', 'Teller deposit', FALSE),
(3, 'WITHDRAWAL', 'Cash Withdrawal', 'Teller withdrawal', FALSE);

-- Users (password: password123)
-- Updated with correct bcrypt hash
INSERT INTO users (id, email, password_hash, first_name, last_name, role_id, status) VALUES
(1, 'admin@bnkcore.com', '$2b$10$g0koe3YK6D4VWLt6VAkq3eZ6uCxV8WvzKfkSMgKIWPuRsHQOAS9lK', 'System', 'Admin', 1, 'ACTIVE'),
(2, 'banker1@bnkcore.com', '$2b$10$g0koe3YK6D4VWLt6VAkq3eZ6uCxV8WvzKfkSMgKIWPuRsHQOAS9lK', 'John', 'Doe', 2, 'ACTIVE'),
(3, 'banker2@bnkcore.com', '$2b$10$g0koe3YK6D4VWLt6VAkq3eZ6uCxV8WvzKfkSMgKIWPuRsHQOAS9lK', 'Jane', 'Smith', 2, 'ACTIVE'),
(4, 'auditor@bnkcore.com', '$2b$10$g0koe3YK6D4VWLt6VAkq3eZ6uCxV8WvzKfkSMgKIWPuRsHQOAS9lK', 'Audit', 'Officer', 3, 'ACTIVE');

-- Customers (password: customer123)
-- Updated with correct bcrypt hash
INSERT INTO customers (id, customer_number, email, password_hash, first_name, last_name, phone, national_id, address_line1, city, status, kyc_status, created_by) VALUES
(1, 'CUS-0001', 'alice@example.com', '$2b$10$ZLtx9AWWhHoIZMvtins/FuVsB7rJEznjRjUkxMxMS6WJ/yXz82Omi', 'Alice', 'Rahman', '01711000001', '1234567890123', '123 Gulshan Ave', 'Dhaka', 'ACTIVE', 'VERIFIED', 2),
(2, 'CUS-0002', 'bob@example.com', '$2b$10$ZLtx9AWWhHoIZMvtins/FuVsB7rJEznjRjUkxMxMS6WJ/yXz82Omi', 'Bob', 'Khan', '01711000002', '2345678901234', '456 Banani Road', 'Dhaka', 'ACTIVE', 'VERIFIED', 2),
(3, 'CUS-0003', 'carol@example.com', '$2b$10$ZLtx9AWWhHoIZMvtins/FuVsB7rJEznjRjUkxMxMS6WJ/yXz82Omi', 'Carol', 'Ahmed', '01711000003', '3456789012345', '789 Dhanmondi Lane', 'Dhaka', 'ACTIVE', 'VERIFIED', 3);

-- System Customer (for Bank internal accounts)
INSERT INTO customers (id, customer_number, email, password_hash, first_name, last_name, status, kyc_status, country) VALUES
(999, 'SYSTEM-BANK', 'system@bank.internal', '$2b$10$SYSTEM_ACCOUNT_NO_LOGIN', 'Bank', 'System', 'ACTIVE', 'VERIFIED', 'BD');

-- Accounts
INSERT INTO accounts (id, account_number, customer_id, account_type_id, status, opened_at, created_by, currency) VALUES
(1, '1001-0001-0001', 1, 1, 'ACTIVE', NOW(), 2, 'BDT'),
(2, '1001-0001-0002', 1, 2, 'ACTIVE', NOW(), 2, 'BDT'),
(3, '1001-0002-0001', 2, 1, 'ACTIVE', NOW(), 2, 'BDT'),
(4, '1001-0003-0001', 3, 1, 'ACTIVE', NOW(), 3, 'BDT'),
(5, '1001-0003-0002', 3, 2, 'ACTIVE', NOW(), 3, 'BDT'),
-- Bank Cash Account (Internal)
(999, 'BANK-CASH-001', 999, 4, 'ACTIVE', NOW(), 1, 'BDT');

-- Balances
INSERT INTO account_balances (account_id, available_balance, currency, version, last_calculated_at) VALUES
(1, 50000.0000, 'BDT', 1, NOW()),
(2, 10000.0000, 'BDT', 1, NOW()),
(3, 25000.0000, 'BDT', 1, NOW()),
(4, 75000.0000, 'BDT', 1, NOW()),
(5, 5000.0000, 'BDT', 1, NOW()),
(999, 100000000.0000, 'BDT', 1, NOW());

-- System Config
INSERT INTO system_config (config_key, config_value, value_type, description) VALUES
('teller.cash_account_number', 'BANK-CASH-001', 'STRING', 'Bank cash account number for teller operations');

-- Initial deposit transactions
INSERT INTO transactions (id, transaction_reference, transaction_type_id, amount, currency, description, status, destination_account_id, processed_at, created_by) VALUES
(1, UUID(), 2, 50000.0000, 'BDT', 'Initial deposit', 'COMPLETED', 1, NOW(), 2),
(2, UUID(), 2, 10000.0000, 'BDT', 'Initial deposit', 'COMPLETED', 2, NOW(), 2),
(3, UUID(), 2, 25000.0000, 'BDT', 'Initial deposit', 'COMPLETED', 3, NOW(), 2),
(4, UUID(), 2, 75000.0000, 'BDT', 'Initial deposit', 'COMPLETED', 4, NOW(), 3),
(5, UUID(), 2, 5000.0000, 'BDT', 'Initial deposit', 'COMPLETED', 5, NOW(), 3);

-- Ledger entries
INSERT INTO ledger_entries (id, transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date) VALUES
(1, 1, 1, 'CREDIT', 50000.0000, 'BDT', 50000.0000, 'Initial deposit', CURDATE()),
(2, 2, 2, 'CREDIT', 10000.0000, 'BDT', 10000.0000, 'Initial deposit', CURDATE()),
(3, 3, 3, 'CREDIT', 25000.0000, 'BDT', 25000.0000, 'Initial deposit', CURDATE()),
(4, 4, 4, 'CREDIT', 75000.0000, 'BDT', 75000.0000, 'Initial deposit', CURDATE()),
(5, 5, 5, 'CREDIT', 5000.0000, 'BDT', 5000.0000, 'Initial deposit', CURDATE());

-- Audit entries
INSERT INTO transaction_audit (id, ledger_entry_id, transaction_id, account_id, entry_type, amount, balance_after, audit_timestamp) VALUES
(1, 1, 1, 1, 'CREDIT', 50000.0000, 50000.0000, NOW()),
(2, 2, 2, 2, 'CREDIT', 10000.0000, 10000.0000, NOW()),
(3, 3, 3, 3, 'CREDIT', 25000.0000, 25000.0000, NOW()),
(4, 4, 4, 4, 'CREDIT', 75000.0000, 75000.0000, NOW()),
(5, 5, 5, 5, 'CREDIT', 5000.0000, 5000.0000, NOW());

-- =============================================================================
-- STORED PROCEDURES
-- =============================================================================

DELIMITER //

CREATE PROCEDURE sp_transfer(
    IN p_from_account_id BIGINT UNSIGNED,
    IN p_to_account_id BIGINT UNSIGNED,
    IN p_amount DECIMAL(19,4),
    IN p_description VARCHAR(255),
    IN p_idempotency_key VARCHAR(64),
    IN p_initiated_by BIGINT UNSIGNED,
    OUT p_transaction_id BIGINT UNSIGNED,
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
        
        SELECT a.currency, ab.available_balance, a.status, a.account_number, a.customer_id
        INTO v_source_currency, v_source_balance, v_source_status, v_from_account_number, v_customer_id
        FROM accounts a
        JOIN account_balances ab ON a.id = ab.account_id
        WHERE a.id = p_from_account_id 
        FOR UPDATE;
        
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
            -- Use numeric ID for output param
            
            INSERT INTO transactions (
                transaction_reference, transaction_type_id, amount, currency, description, 
                status, source_account_id, destination_account_id, created_by, processed_at
            ) VALUES (
                v_uuid, (SELECT id FROM transaction_types WHERE code = 'TRANSFER' COLLATE utf8mb4_unicode_ci LIMIT 1), 
                p_amount, v_source_currency, p_description,
                'COMPLETED', p_from_account_id, p_to_account_id, p_initiated_by, NOW()
            );
            
            SET v_numeric_tx_id = LAST_INSERT_ID();
            SET p_transaction_id = v_numeric_tx_id;
            
            INSERT INTO ledger_entries (
                transaction_id, account_id, entry_type, amount, currency, 
                balance_after, description, entry_date
            ) VALUES (
                v_numeric_tx_id, p_from_account_id, 'DEBIT', p_amount, v_source_currency,
                v_source_balance - p_amount, CONCAT('Transfer to ', v_to_account_number), CURDATE()
            );
            
            SELECT available_balance INTO v_dest_balance
            FROM account_balances WHERE account_id = p_to_account_id FOR UPDATE;
            
            IF v_dest_balance IS NULL THEN
                SET v_dest_balance = 0;
            END IF;

            INSERT INTO ledger_entries (
                transaction_id, account_id, entry_type, amount, currency, 
                balance_after, description, entry_date
            ) VALUES (
                v_numeric_tx_id, p_to_account_id, 'CREDIT', p_amount, v_dest_currency,
                v_dest_balance + p_amount, CONCAT('Transfer from ', v_from_account_number), CURDATE()
            );
            
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
            
            INSERT INTO idempotency_keys (
                idempotency_key, request_hash, response_status, response_body, expires_at
            ) VALUES (
                p_idempotency_key, 'hash', 200, 
                JSON_OBJECT('transactionId', v_numeric_tx_id, 'status', 'COMPLETED'),
                DATE_ADD(NOW(), INTERVAL 24 HOUR)
            );
            
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

DELIMITER ;

DELIMITER //
CREATE PROCEDURE sp_deposit(
    IN p_account_id BIGINT UNSIGNED,
    IN p_amount DECIMAL(19,4),
    IN p_description VARCHAR(500),
    IN p_user_id BIGINT UNSIGNED,
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
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1 @sqlstate = RETURNED_SQLSTATE, @errno = MYSQL_ERRNO, @text = MESSAGE_TEXT;
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = CONCAT('Deposit failed: ', COALESCE(@text, 'Unknown'));
        SET p_transaction_id = NULL;
    END;
    
    SET v_today = CURDATE();
    SET p_transaction_id = NULL;
    SET p_status = 'PENDING';
    SET p_message = '';
    
    START TRANSACTION;
    
    IF p_amount <= 0 THEN
        SET p_status = 'FAILED';
        SET p_message = 'Amount must be greater than zero';
        ROLLBACK;
    ELSE
        SELECT id INTO v_cash_account_id
        FROM accounts
        WHERE account_number = 'BANK-CASH-001'
        LIMIT 1;
        
        IF v_cash_account_id IS NULL THEN
            SET p_status = 'FAILED';
            SET p_message = 'Bank cash account not found';
            ROLLBACK;
        ELSE
            SELECT available_balance INTO v_cash_balance
            FROM account_balances
            WHERE account_id = v_cash_account_id
            FOR UPDATE;
            
            SELECT ab.available_balance, a.status, a.customer_id
            INTO v_customer_balance, v_account_status, v_customer_id
            FROM account_balances ab
            INNER JOIN accounts a ON a.id = ab.account_id
            WHERE ab.account_id = p_account_id
            FOR UPDATE;
            
            IF v_account_status IS NULL THEN
                SET p_status = 'FAILED';
                SET p_message = 'Customer account not found';
                ROLLBACK;
            ELSEIF v_account_status COLLATE utf8mb4_unicode_ci != 'ACTIVE' THEN
                SET p_status = 'FAILED';
                SET p_message = 'Customer account is not active';
                ROLLBACK;
            ELSE
                SET v_new_cash_balance = v_cash_balance - p_amount;
                SET v_new_customer_balance = v_customer_balance + p_amount;
                
                SET v_transaction_ref = UUID();
                
                SELECT id INTO v_transaction_type_id
                FROM transaction_types
                WHERE code = 'DEPOSIT' LIMIT 1;
                
                IF v_transaction_type_id IS NULL THEN
                    SET v_transaction_type_id = 2;
                END IF;
                
                INSERT INTO transactions (
                    transaction_reference, transaction_type_id, amount, currency, description,
                    status, source_account_id, destination_account_id, processed_at, created_by
                ) VALUES (
                    v_transaction_ref, v_transaction_type_id, p_amount, 'BDT', p_description,
                    'COMPLETED', v_cash_account_id, p_account_id, NOW(), p_user_id
                );
                
                SET p_transaction_id = LAST_INSERT_ID();
                
                INSERT INTO ledger_entries (
                    transaction_id, account_id, entry_type, amount, currency,
                    balance_after, description, entry_date
                ) VALUES (
                    p_transaction_id, v_cash_account_id, 'DEBIT', p_amount, 'BDT',
                    GREATEST(v_new_cash_balance, 0), CONCAT('Cash deposit to customer - ', p_description), v_today
                );
                
                INSERT INTO ledger_entries (
                    transaction_id, account_id, entry_type, amount, currency,
                    balance_after, description, entry_date
                ) VALUES (
                    p_transaction_id, p_account_id, 'CREDIT', p_amount, 'BDT',
                    v_new_customer_balance, CONCAT('Cash deposit - ', p_description), v_today
                );
                
                UPDATE account_balances
                SET available_balance = v_new_cash_balance,
                    last_transaction_id = p_transaction_id,
                    last_calculated_at = NOW(),
                    version = version + 1
                WHERE account_id = v_cash_account_id;
                
                UPDATE account_balances
                SET available_balance = v_new_customer_balance,
                    last_transaction_id = p_transaction_id,
                    last_calculated_at = NOW(),
                    version = version + 1
                WHERE account_id = p_account_id;
                
                INSERT INTO outbox (
                    event_type, aggregate_type, aggregate_id, payload, status
                ) VALUES (
                    'DEPOSIT_COMPLETED', 'TRANSACTION', p_transaction_id,
                    JSON_OBJECT(
                        'transaction_id', p_transaction_id,
                        'transaction_reference', v_transaction_ref,
                        'account_id', p_account_id,
                        'amount', p_amount,
                        'customer_id', v_customer_id,
                        'initiatedBy', p_user_id
                    ),
                    'PENDING'
                );
                
                INSERT INTO events (
                    event_type, aggregate_type, aggregate_id, payload
                ) VALUES (
                    'DEPOSIT_COMPLETED', 'TRANSACTION', p_transaction_id,
                    JSON_OBJECT(
                        'transaction_id', p_transaction_id,
                        'account_id', p_account_id,
                        'amount', p_amount,
                        'new_balance', v_new_customer_balance,
                        'cash_account_id', v_cash_account_id
                    )
                );
                
                COMMIT;
                
                SET p_status = 'COMPLETED';
                SET p_message = 'Deposit completed successfully';
            END IF;
        END IF;
    END IF;
END //

DELIMITER ;

DELIMITER //

CREATE PROCEDURE sp_withdraw(
    IN p_account_id BIGINT UNSIGNED,
    IN p_amount DECIMAL(19,4),
    IN p_description VARCHAR(500),
    IN p_user_id BIGINT UNSIGNED,
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
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1 @sqlstate = RETURNED_SQLSTATE, @errno = MYSQL_ERRNO, @text = MESSAGE_TEXT;
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = CONCAT('Withdrawal failed: ', COALESCE(@text, 'Unknown'));
        SET p_transaction_id = NULL;
    END;
    
    SET v_today = CURDATE();
    SET p_transaction_id = NULL;
    SET p_status = 'PENDING';
    SET p_message = '';
    
    START TRANSACTION;
    
    IF p_amount <= 0 THEN
        SET p_status = 'FAILED';
        SET p_message = 'Amount must be greater than zero';
        ROLLBACK;
    ELSE
        SELECT id INTO v_cash_account_id
        FROM accounts
        WHERE account_number = 'BANK-CASH-001'
        LIMIT 1;
        
        IF v_cash_account_id IS NULL THEN
            SET p_status = 'FAILED';
            SET p_message = 'Bank cash account not found';
            ROLLBACK;
        ELSE
            SELECT ab.available_balance, a.status, a.customer_id
            INTO v_customer_balance, v_account_status, v_customer_id
            FROM account_balances ab
            INNER JOIN accounts a ON a.id = ab.account_id
            WHERE ab.account_id = p_account_id
            FOR UPDATE;
            
            IF v_account_status IS NULL THEN
                SET p_status = 'FAILED';
                SET p_message = 'Customer account not found';
                ROLLBACK;
            ELSEIF v_account_status COLLATE utf8mb4_unicode_ci != 'ACTIVE' THEN
                SET p_status = 'FAILED';
                SET p_message = 'Customer account is not active';
                ROLLBACK;
            ELSEIF v_customer_balance < p_amount THEN
                SET p_status = 'FAILED';
                SET p_message = 'Insufficient balance';
                ROLLBACK;
            ELSE
                SELECT available_balance INTO v_cash_balance
                FROM account_balances
                WHERE account_id = v_cash_account_id
                FOR UPDATE;
                
                SET v_new_customer_balance = v_customer_balance - p_amount;
                SET v_new_cash_balance = v_cash_balance + p_amount;
                
                IF v_new_customer_balance < 0 THEN
                    SET p_status = 'FAILED';
                    SET p_message = 'Insufficient balance';
                    ROLLBACK;
                ELSE
                    SET v_transaction_ref = UUID();
                    
                    SELECT id INTO v_transaction_type_id
                    FROM transaction_types
                    WHERE code = 'WITHDRAWAL' LIMIT 1;
                    
                    IF v_transaction_type_id IS NULL THEN
                        SET v_transaction_type_id = 3;
                    END IF;
                    
                    INSERT INTO transactions (
                        transaction_reference, transaction_type_id, amount, currency, description,
                        status, source_account_id, destination_account_id, processed_at, created_by
                    ) VALUES (
                        v_transaction_ref, v_transaction_type_id, p_amount, 'BDT', p_description,
                        'COMPLETED', p_account_id, v_cash_account_id, NOW(), p_user_id
                    );
                    
                    SET p_transaction_id = LAST_INSERT_ID();
                    
                    INSERT INTO ledger_entries (
                        transaction_id, account_id, entry_type, amount, currency,
                        balance_after, description, entry_date
                    ) VALUES (
                        p_transaction_id, p_account_id, 'DEBIT', p_amount, 'BDT',
                        v_new_customer_balance, CONCAT('Cash withdrawal - ', p_description), v_today
                    );
                    
                    INSERT INTO ledger_entries (
                        transaction_id, account_id, entry_type, amount, currency,
                        balance_after, description, entry_date
                    ) VALUES (
                        p_transaction_id, v_cash_account_id, 'CREDIT', p_amount, 'BDT',
                        v_new_cash_balance, CONCAT('Cash withdrawal from customer - ', p_description), v_today
                    );
                    
                    UPDATE account_balances
                    SET available_balance = v_new_customer_balance,
                        last_transaction_id = p_transaction_id,
                        last_calculated_at = NOW(),
                        version = version + 1
                    WHERE account_id = p_account_id;
                    
                    UPDATE account_balances
                    SET available_balance = v_new_cash_balance,
                        last_transaction_id = p_transaction_id,
                        last_calculated_at = NOW(),
                        version = version + 1
                    WHERE account_id = v_cash_account_id;
                    
                    INSERT INTO outbox (
                        event_type, aggregate_type, aggregate_id, payload, status
                    ) VALUES (
                        'WITHDRAWAL_COMPLETED', 'TRANSACTION', p_transaction_id,
                        JSON_OBJECT(
                            'transaction_id', p_transaction_id,
                            'transaction_reference', v_transaction_ref,
                            'account_id', p_account_id,
                            'amount', p_amount,
                            'customer_id', v_customer_id,
                            'initiatedBy', p_user_id
                        ),
                        'PENDING'
                    );
                    
                    INSERT INTO events (
                        event_type, aggregate_type, aggregate_id, payload
                    ) VALUES (
                        'WITHDRAWAL_COMPLETED', 'TRANSACTION', p_transaction_id,
                        JSON_OBJECT(
                            'transaction_id', p_transaction_id,
                            'account_id', p_account_id,
                            'amount', p_amount,
                            'new_balance', v_new_customer_balance,
                            'cash_account_id', v_cash_account_id
                        )
                    );
                    
                    COMMIT;
                    
                    SET p_status = 'COMPLETED';
                    SET p_message = 'Withdrawal completed successfully';
                END IF;
            END IF;
        END IF;
    END IF;
END //

DELIMITER ;

DELIMITER //

CREATE PROCEDURE sp_rebuild_balance(
    IN p_account_id BIGINT UNSIGNED,
    OUT p_old_balance DECIMAL(19,4),
    OUT p_new_balance DECIMAL(19,4),
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(500)
)
BEGIN
    DECLARE v_calculated_balance DECIMAL(19,4);
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1 @sqlstate = RETURNED_SQLSTATE, @errno = MYSQL_ERRNO, @text = MESSAGE_TEXT;
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = CONCAT('Rebuild failed: ', COALESCE(@text, 'Unknown'));
    END;
    
    SET p_status = 'PENDING';
    SET p_message = '';
    
    START TRANSACTION;
    
    SELECT available_balance INTO p_old_balance
    FROM account_balances
    WHERE account_id = p_account_id
    FOR UPDATE;
    
    IF p_old_balance IS NULL THEN
        SET p_status = 'FAILED';
        SET p_message = 'Account not found';
        ROLLBACK;
    ELSE
        SELECT 
            COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0)
        INTO v_calculated_balance
        FROM ledger_entries
        WHERE account_id = p_account_id;
        
        UPDATE account_balances
        SET available_balance = v_calculated_balance,
            last_calculated_at = NOW(),
            version = version + 1
        WHERE account_id = p_account_id;
        
        SET p_new_balance = v_calculated_balance;
        
        INSERT INTO events (
            event_type, aggregate_type, aggregate_id, payload
        ) VALUES (
            'BALANCE_REBUILT', 'ACCOUNT', p_account_id,
            JSON_OBJECT(
                'account_id', p_account_id,
                'old_balance', p_old_balance,
                'new_balance', p_new_balance
            )
        );
        
        COMMIT;
        
        SET p_status = 'COMPLETED';
        SET p_message = 'Balance rebuilt successfully';
    END IF;
END //

DELIMITER ;

SET FOREIGN_KEY_CHECKS = 1;

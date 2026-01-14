-- =============================================================================
-- Banking Core v1.0 - COMPLETE DATABASE RESET
-- =============================================================================
-- This script DROPS and RECREATES the entire database
-- Run this to completely clear all cached constraints
-- =============================================================================

-- STEP 1: Drop and recreate database
DROP DATABASE IF EXISTS banking_core;
CREATE DATABASE banking_core CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE banking_core;

-- =============================================================================
-- STEP 2: Create all tables (no foreign keys)
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
    status VARCHAR(20) DEFAULT 'PENDING',
    kyc_status VARCHAR(20) DEFAULT 'PENDING',
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
    currency VARCHAR(3) DEFAULT 'BDT',
    last_transaction_id BIGINT,
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

-- =============================================================================
-- STEP 3: Seed data
-- =============================================================================

INSERT INTO roles (id, code, name, description, permissions, is_system) VALUES
(1, 'ADMIN', 'Administrator', 'Full access', '["*"]', TRUE),
(2, 'BANKER', 'Banker', 'Teller operations', '["transactions:*"]', TRUE),
(3, 'AUDITOR', 'Auditor', 'Read-only', '["read:*"]', TRUE),
(4, 'CUSTOMER', 'Customer', 'Portal access', '["own:*"]', TRUE);

INSERT INTO account_types (id, code, name, description, min_balance, is_active) VALUES
(1, 'SAVINGS', 'Savings Account', 'Standard savings', 500.0000, TRUE),
(2, 'CHECKING', 'Checking Account', 'Current account', 0.0000, TRUE),
(3, 'FIXED', 'Fixed Deposit', 'Term deposit', 10000.0000, TRUE);

INSERT INTO transaction_types (id, code, name, description, requires_approval) VALUES
(1, 'TRANSFER', 'Fund Transfer', 'Account transfer', FALSE),
(2, 'DEPOSIT', 'Cash Deposit', 'Teller deposit', FALSE),
(3, 'WITHDRAWAL', 'Cash Withdrawal', 'Teller withdrawal', FALSE);

-- Users (password: password123)
INSERT INTO users (id, email, password_hash, first_name, last_name, role_id, status) VALUES
(1, 'admin@bnkcore.com', '$2b$10$SN3yeSnY6Kizg/ddEE.tXe6FY9X6bLPHS.9wu2QGHM4vyOnN.ILZW', 'System', 'Admin', 1, 'ACTIVE'),
(2, 'banker1@bnkcore.com', '$2b$10$SN3yeSnY6Kizg/ddEE.tXe6FY9X6bLPHS.9wu2QGHM4vyOnN.ILZW', 'John', 'Doe', 2, 'ACTIVE'),
(3, 'banker2@bnkcore.com', '$2b$10$SN3yeSnY6Kizg/ddEE.tXe6FY9X6bLPHS.9wu2QGHM4vyOnN.ILZW', 'Jane', 'Smith', 2, 'ACTIVE'),
(4, 'auditor@bnkcore.com', '$2b$10$SN3yeSnY6Kizg/ddEE.tXe6FY9X6bLPHS.9wu2QGHM4vyOnN.ILZW', 'Audit', 'Officer', 3, 'ACTIVE');

-- Customers (password: customer123)
INSERT INTO customers (id, customer_number, email, password_hash, first_name, last_name, phone, national_id, address_line1, city, status, kyc_status, created_by) VALUES
(1, 'CUS-0001', 'alice@example.com', '$2b$10$ZN/dZ8I8fQUW9YdULEdQT.xZGJrxA3A1WAjE5BrRsu2siibSxmmEa', 'Alice', 'Rahman', '01711000001', '1234567890123', '123 Gulshan Ave', 'Dhaka', 'ACTIVE', 'VERIFIED', 2),
(2, 'CUS-0002', 'bob@example.com', '$2b$10$ZN/dZ8I8fQUW9YdULEdQT.xZGJrxA3A1WAjE5BrRsu2siibSxmmEa', 'Bob', 'Khan', '01711000002', '2345678901234', '456 Banani Road', 'Dhaka', 'ACTIVE', 'VERIFIED', 2),
(3, 'CUS-0003', 'carol@example.com', '$2b$10$ZN/dZ8I8fQUW9YdULEdQT.xZGJrxA3A1WAjE5BrRsu2siibSxmmEa', 'Carol', 'Ahmed', '01711000003', '3456789012345', '789 Dhanmondi Lane', 'Dhaka', 'ACTIVE', 'VERIFIED', 3);

-- Accounts
INSERT INTO accounts (id, account_number, customer_id, account_type_id, status, opened_at, created_by) VALUES
(1, '1001-0001-0001', 1, 1, 'ACTIVE', NOW(), 2),
(2, '1001-0001-0002', 1, 2, 'ACTIVE', NOW(), 2),
(3, '1001-0002-0001', 2, 1, 'ACTIVE', NOW(), 2),
(4, '1001-0003-0001', 3, 1, 'ACTIVE', NOW(), 3),
(5, '1001-0003-0002', 3, 2, 'ACTIVE', NOW(), 3);

-- Balances (with initial amounts)
INSERT INTO account_balances (account_id, available_balance, currency, version) VALUES
(1, 50000.0000, 'BDT', 1),
(2, 10000.0000, 'BDT', 1),
(3, 25000.0000, 'BDT', 1),
(4, 75000.0000, 'BDT', 1),
(5, 5000.0000, 'BDT', 1);

-- Transactions
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
-- STEP 4: Store Procedures & Triggers
-- =============================================================================

DELIMITER //

DROP PROCEDURE IF EXISTS sp_deposit//
DROP PROCEDURE IF EXISTS sp_withdraw//
DROP PROCEDURE IF EXISTS sp_transfer//
DROP PROCEDURE IF EXISTS sp_rebuild_balance//

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
-- VERIFY
-- =============================================================================

SELECT 'Database created successfully!' AS status;
SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema = 'banking_core';
SELECT COUNT(*) AS users FROM users;
SELECT COUNT(*) AS customers FROM customers;
SELECT COUNT(*) AS accounts FROM accounts;
SELECT SUM(available_balance) AS total_balance FROM account_balances;

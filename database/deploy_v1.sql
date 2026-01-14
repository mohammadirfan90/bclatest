-- =============================================================================
-- Banking Core v1.0 - Full Deployment Script
-- =============================================================================
-- This script combines all v1 SQL files into a single deployment.
-- WARNING: This will DROP all existing tables and reset the database!
-- =============================================================================
-- Generated: 2026-01-14
-- =============================================================================

-- Disable foreign key checks during deployment
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================================
-- SECTION 1: SCHEMA (Tables)
-- =============================================================================

-- Drop existing tables in reverse dependency order
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

-- Drop old enterprise tables if they exist
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS outbox;
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS reconciliations;
DROP TABLE IF EXISTS reconciliation_items;
DROP TABLE IF EXISTS fraud_queue;
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

-- ============================================
-- Reference Tables
-- ============================================

CREATE TABLE IF NOT EXISTS roles (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSON,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_types (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    min_balance DECIMAL(18,4) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_account_types_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transaction_types (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    requires_approval BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_transaction_types_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Core Tables
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role_id BIGINT NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE',
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id),
    INDEX idx_users_email (email),
    INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    customer_number VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
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
    status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING') DEFAULT 'PENDING',
    kyc_status ENUM('PENDING', 'VERIFIED', 'REJECTED') DEFAULT 'PENDING',
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_customers_number (customer_number),
    INDEX idx_customers_email (email),
    INDEX idx_customers_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS accounts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_number VARCHAR(20) NOT NULL UNIQUE,
    customer_id BIGINT NOT NULL,
    account_type_id BIGINT NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE', 'FROZEN', 'CLOSED', 'PENDING') DEFAULT 'PENDING',
    opened_at TIMESTAMP NULL,
    closed_at TIMESTAMP NULL,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (account_type_id) REFERENCES account_types(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_accounts_number (account_number),
    INDEX idx_accounts_customer (customer_id),
    INDEX idx_accounts_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transaction_reference VARCHAR(50) NOT NULL UNIQUE,
    transaction_type_id BIGINT NOT NULL,
    amount DECIMAL(18,4) NOT NULL,
    currency VARCHAR(3) DEFAULT 'BDT',
    description VARCHAR(255),
    status ENUM('PENDING', 'COMPLETED', 'FAILED', 'REVERSED') DEFAULT 'PENDING',
    source_account_id BIGINT,
    destination_account_id BIGINT,
    processed_at TIMESTAMP NULL,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_type_id) REFERENCES transaction_types(id),
    FOREIGN KEY (source_account_id) REFERENCES accounts(id),
    FOREIGN KEY (destination_account_id) REFERENCES accounts(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_transactions_reference (transaction_reference),
    INDEX idx_transactions_source (source_account_id),
    INDEX idx_transactions_destination (destination_account_id),
    INDEX idx_transactions_status (status),
    INDEX idx_transactions_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ledger_entries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transaction_id BIGINT NOT NULL,
    account_id BIGINT NOT NULL,
    entry_type ENUM('DEBIT', 'CREDIT') NOT NULL,
    amount DECIMAL(18,4) NOT NULL,
    currency VARCHAR(3) DEFAULT 'BDT',
    balance_after DECIMAL(18,4) NOT NULL,
    description VARCHAR(255),
    entry_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    INDEX idx_ledger_transaction (transaction_id),
    INDEX idx_ledger_account (account_id),
    INDEX idx_ledger_entry_type (entry_type),
    INDEX idx_ledger_date (entry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_balances (
    account_id BIGINT PRIMARY KEY,
    available_balance DECIMAL(18,4) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'BDT',
    last_transaction_id BIGINT,
    version INT DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (last_transaction_id) REFERENCES transactions(id),
    CONSTRAINT chk_non_negative_balance CHECK (available_balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transaction_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ledger_entry_id BIGINT NOT NULL,
    transaction_id BIGINT NOT NULL,
    account_id BIGINT NOT NULL,
    entry_type ENUM('DEBIT', 'CREDIT') NOT NULL,
    amount DECIMAL(18,4) NOT NULL,
    balance_after DECIMAL(18,4) NOT NULL,
    audit_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_ledger (ledger_entry_id),
    INDEX idx_audit_transaction (transaction_id),
    INDEX idx_audit_account (account_id),
    INDEX idx_audit_timestamp (audit_timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- SECTION 2: STORED PROCEDURES
-- =============================================================================

DELIMITER //

-- Drop existing procedures
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
    DECLARE v_version INT;
    
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
        SELECT status INTO v_account_status
        FROM accounts WHERE id = p_account_id FOR UPDATE;
        
        IF v_account_status IS NULL THEN
            SET p_status = 'FAILED';
            SET p_message = 'Account not found';
            ROLLBACK;
        ELSEIF v_account_status != 'ACTIVE' THEN
            SET p_status = 'FAILED';
            SET p_message = 'Account is not active';
            ROLLBACK;
        ELSE
            SELECT id INTO v_transaction_type_id
            FROM transaction_types WHERE code = 'DEPOSIT';
            
            SELECT available_balance, version INTO v_current_balance, v_version
            FROM account_balances WHERE account_id = p_account_id FOR UPDATE;
            
            SET v_new_balance = COALESCE(v_current_balance, 0) + p_amount;
            
            INSERT INTO transactions (
                transaction_reference, transaction_type_id, amount, currency,
                description, status, destination_account_id, processed_at, created_by
            ) VALUES (
                UUID(), v_transaction_type_id, p_amount, 'BDT',
                COALESCE(p_description, 'Cash deposit'), 'COMPLETED', p_account_id, NOW(), p_banker_id
            );
            
            SET p_transaction_id = LAST_INSERT_ID();
            
            INSERT INTO ledger_entries (
                transaction_id, account_id, entry_type, amount, currency,
                balance_after, description, entry_date
            ) VALUES (
                p_transaction_id, p_account_id, 'CREDIT', p_amount, 'BDT',
                v_new_balance, COALESCE(p_description, 'Cash deposit'), CURDATE()
            );
            
            INSERT INTO account_balances (account_id, available_balance, last_transaction_id, version)
            VALUES (p_account_id, v_new_balance, p_transaction_id, 1)
            ON DUPLICATE KEY UPDATE
                available_balance = v_new_balance,
                last_transaction_id = p_transaction_id,
                version = version + 1;
            
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
        SELECT status INTO v_account_status
        FROM accounts WHERE id = p_account_id FOR UPDATE;
        
        IF v_account_status IS NULL THEN
            SET p_status = 'FAILED';
            SET p_message = 'Account not found';
            ROLLBACK;
        ELSEIF v_account_status != 'ACTIVE' THEN
            SET p_status = 'FAILED';
            SET p_message = 'Account is not active';
            ROLLBACK;
        ELSE
            SELECT available_balance INTO v_current_balance
            FROM account_balances WHERE account_id = p_account_id FOR UPDATE;
            
            SET v_current_balance = COALESCE(v_current_balance, 0);
            
            IF v_current_balance < p_amount THEN
                SET p_status = 'FAILED';
                SET p_message = 'Insufficient balance';
                ROLLBACK;
            ELSE
                SET v_new_balance = v_current_balance - p_amount;
                
                SELECT id INTO v_transaction_type_id
                FROM transaction_types WHERE code = 'WITHDRAWAL';
                
                INSERT INTO transactions (
                    transaction_reference, transaction_type_id, amount, currency,
                    description, status, source_account_id, processed_at, created_by
                ) VALUES (
                    UUID(), v_transaction_type_id, p_amount, 'BDT',
                    COALESCE(p_description, 'Cash withdrawal'), 'COMPLETED', p_account_id, NOW(), p_banker_id
                );
                
                SET p_transaction_id = LAST_INSERT_ID();
                
                INSERT INTO ledger_entries (
                    transaction_id, account_id, entry_type, amount, currency,
                    balance_after, description, entry_date
                ) VALUES (
                    p_transaction_id, p_account_id, 'DEBIT', p_amount, 'BDT',
                    v_new_balance, COALESCE(p_description, 'Cash withdrawal'), CURDATE()
                );
                
                UPDATE account_balances SET
                    available_balance = v_new_balance,
                    last_transaction_id = p_transaction_id,
                    version = version + 1
                WHERE account_id = p_account_id;
                
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
        SELECT status INTO v_from_status
        FROM accounts WHERE id = p_from_account_id FOR UPDATE;
        
        IF v_from_status IS NULL THEN
            SET p_status = 'FAILED';
            SET p_message = 'Source account not found';
            ROLLBACK;
        ELSEIF v_from_status != 'ACTIVE' THEN
            SET p_status = 'FAILED';
            SET p_message = 'Source account is not active';
            ROLLBACK;
        ELSE
            SELECT available_balance INTO v_from_balance
            FROM account_balances WHERE account_id = p_from_account_id FOR UPDATE;
            
            SET v_from_balance = COALESCE(v_from_balance, 0);
            
            IF v_from_balance < p_amount THEN
                SET p_status = 'FAILED';
                SET p_message = 'Insufficient balance';
                ROLLBACK;
            ELSE
                SELECT status INTO v_to_status
                FROM accounts WHERE id = p_to_account_id FOR UPDATE;
                
                IF v_to_status IS NULL THEN
                    SET p_status = 'FAILED';
                    SET p_message = 'Destination account not found';
                    ROLLBACK;
                ELSEIF v_to_status != 'ACTIVE' THEN
                    SET p_status = 'FAILED';
                    SET p_message = 'Destination account is not active';
                    ROLLBACK;
                ELSE
                    SELECT available_balance INTO v_to_balance
                    FROM account_balances WHERE account_id = p_to_account_id FOR UPDATE;
                    
                    SET v_to_balance = COALESCE(v_to_balance, 0);
                    SET v_new_from_balance = v_from_balance - p_amount;
                    SET v_new_to_balance = v_to_balance + p_amount;
                    
                    SELECT id INTO v_transaction_type_id
                    FROM transaction_types WHERE code = 'TRANSFER';
                    
                    INSERT INTO transactions (
                        transaction_reference, transaction_type_id, amount, currency,
                        description, status, source_account_id, destination_account_id,
                        processed_at, created_by
                    ) VALUES (
                        UUID(), v_transaction_type_id, p_amount, 'BDT',
                        COALESCE(p_description, 'Fund transfer'), 'COMPLETED',
                        p_from_account_id, p_to_account_id, NOW(), p_performed_by
                    );
                    
                    SET p_transaction_id = LAST_INSERT_ID();
                    
                    INSERT INTO ledger_entries (
                        transaction_id, account_id, entry_type, amount, currency,
                        balance_after, description, entry_date
                    ) VALUES (
                        p_transaction_id, p_from_account_id, 'DEBIT', p_amount, 'BDT',
                        v_new_from_balance, COALESCE(p_description, 'Transfer out'), CURDATE()
                    );
                    
                    INSERT INTO ledger_entries (
                        transaction_id, account_id, entry_type, amount, currency,
                        balance_after, description, entry_date
                    ) VALUES (
                        p_transaction_id, p_to_account_id, 'CREDIT', p_amount, 'BDT',
                        v_new_to_balance, COALESCE(p_description, 'Transfer in'), CURDATE()
                    );
                    
                    UPDATE account_balances SET
                        available_balance = v_new_from_balance,
                        last_transaction_id = p_transaction_id,
                        version = version + 1
                    WHERE account_id = p_from_account_id;
                    
                    INSERT INTO account_balances (account_id, available_balance, last_transaction_id, version)
                    VALUES (p_to_account_id, v_new_to_balance, p_transaction_id, 1)
                    ON DUPLICATE KEY UPDATE
                        available_balance = v_new_to_balance,
                        last_transaction_id = p_transaction_id,
                        version = version + 1;
                    
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
    
    SELECT available_balance INTO p_old_balance
    FROM account_balances WHERE account_id = p_account_id FOR UPDATE;
    
    SELECT COALESCE(
        SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE -amount END), 0
    ) INTO v_calculated_balance
    FROM ledger_entries WHERE account_id = p_account_id;
    
    SET p_new_balance = v_calculated_balance;
    
    IF p_old_balance IS NULL THEN
        INSERT INTO account_balances (account_id, available_balance, version)
        VALUES (p_account_id, v_calculated_balance, 1);
        SET p_status = 'COMPLETED';
        SET p_message = 'Balance initialized from ledger';
    ELSEIF ABS(p_old_balance - v_calculated_balance) > 0.0001 THEN
        UPDATE account_balances SET
            available_balance = v_calculated_balance,
            version = version + 1
        WHERE account_id = p_account_id;
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
-- SECTION 3: TRIGGERS
-- =============================================================================

DELIMITER //

DROP TRIGGER IF EXISTS trg_ledger_audit_insert//

CREATE TRIGGER trg_ledger_audit_insert
AFTER INSERT ON ledger_entries
FOR EACH ROW
BEGIN
    INSERT INTO transaction_audit (
        ledger_entry_id, transaction_id, account_id,
        entry_type, amount, balance_after, audit_timestamp
    ) VALUES (
        NEW.id, NEW.transaction_id, NEW.account_id,
        NEW.entry_type, NEW.amount, NEW.balance_after, NOW()
    );
END//

DELIMITER ;

-- =============================================================================
-- SECTION 4: SEED DATA
-- =============================================================================

-- Roles
INSERT INTO roles (code, name, description, permissions, is_system) VALUES
('ADMIN', 'Administrator', 'System administrator with full access', 
 '["users:*", "customers:*", "accounts:*", "transactions:*", "reports:*", "system:*"]', TRUE),
('BANKER', 'Banker/Teller', 'Bank teller for customer operations', 
 '["customers:read", "customers:create", "accounts:*", "transactions:create", "transactions:read", "ledger:read"]', TRUE),
('AUDITOR', 'Auditor', 'Read-only access for audit purposes', 
 '["transactions:read", "ledger:read", "audit:read", "reports:read"]', TRUE),
('CUSTOMER', 'Customer', 'Bank customer with portal access', 
 '["own:accounts:read", "own:transactions:read", "own:transfers:create"]', TRUE);

-- Account Types
INSERT INTO account_types (code, name, description, min_balance, is_active) VALUES
('SAVINGS', 'Savings Account', 'Standard savings account with interest', 500.0000, TRUE),
('CHECKING', 'Checking Account', 'Current account for daily transactions', 0.0000, TRUE),
('FIXED', 'Fixed Deposit', 'Fixed term deposit account', 10000.0000, TRUE);

-- Transaction Types
INSERT INTO transaction_types (code, name, description, requires_approval) VALUES
('TRANSFER', 'Fund Transfer', 'Transfer between internal accounts', FALSE),
('DEPOSIT', 'Cash Deposit', 'Cash deposit by banker', FALSE),
('WITHDRAWAL', 'Cash Withdrawal', 'Cash withdrawal by banker', FALSE);

-- Demo Users (password: password123)
INSERT INTO users (email, password_hash, first_name, last_name, role_id, status) VALUES
('admin@bnkcore.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqO.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 
 'System', 'Admin', (SELECT id FROM roles WHERE code = 'ADMIN'), 'ACTIVE'),
('banker1@bnkcore.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqO.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 
 'John', 'Doe', (SELECT id FROM roles WHERE code = 'BANKER'), 'ACTIVE'),
('banker2@bnkcore.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqO.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 
 'Jane', 'Smith', (SELECT id FROM roles WHERE code = 'BANKER'), 'ACTIVE'),
('auditor@bnkcore.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqO.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 
 'Audit', 'Officer', (SELECT id FROM roles WHERE code = 'AUDITOR'), 'ACTIVE');

-- Demo Customers (password: customer123)
INSERT INTO customers (customer_number, email, password_hash, first_name, last_name, 
                       phone, national_id, address_line1, city, status, kyc_status, created_by) VALUES
('CUS-0001', 'alice@example.com', '$2a$10$rQnM1z3vHxL5PjY8kD2wPeZtF.H2I.QQHBRw2nLZqtj.CkPk.BkAu',
 'Alice', 'Rahman', '01711000001', '1234567890123', '123 Gulshan Ave', 'Dhaka', 
 'ACTIVE', 'VERIFIED', (SELECT id FROM users WHERE email = 'banker1@bnkcore.com')),
('CUS-0002', 'bob@example.com', '$2a$10$rQnM1z3vHxL5PjY8kD2wPeZtF.H2I.QQHBRw2nLZqtj.CkPk.BkAu',
 'Bob', 'Khan', '01711000002', '2345678901234', '456 Banani Road', 'Dhaka', 
 'ACTIVE', 'VERIFIED', (SELECT id FROM users WHERE email = 'banker1@bnkcore.com')),
('CUS-0003', 'carol@example.com', '$2a$10$rQnM1z3vHxL5PjY8kD2wPeZtF.H2I.QQHBRw2nLZqtj.CkPk.BkAu',
 'Carol', 'Ahmed', '01711000003', '3456789012345', '789 Dhanmondi Lane', 'Dhaka', 
 'ACTIVE', 'VERIFIED', (SELECT id FROM users WHERE email = 'banker2@bnkcore.com'));

-- Demo Accounts
INSERT INTO accounts (account_number, customer_id, account_type_id, status, opened_at, created_by) VALUES
('1001-0001-0001', (SELECT id FROM customers WHERE customer_number = 'CUS-0001'),
 (SELECT id FROM account_types WHERE code = 'SAVINGS'), 'ACTIVE', NOW(),
 (SELECT id FROM users WHERE email = 'banker1@bnkcore.com')),
('1001-0001-0002', (SELECT id FROM customers WHERE customer_number = 'CUS-0001'),
 (SELECT id FROM account_types WHERE code = 'CHECKING'), 'ACTIVE', NOW(),
 (SELECT id FROM users WHERE email = 'banker1@bnkcore.com')),
('1001-0002-0001', (SELECT id FROM customers WHERE customer_number = 'CUS-0002'),
 (SELECT id FROM account_types WHERE code = 'SAVINGS'), 'ACTIVE', NOW(),
 (SELECT id FROM users WHERE email = 'banker1@bnkcore.com')),
('1001-0003-0001', (SELECT id FROM customers WHERE customer_number = 'CUS-0003'),
 (SELECT id FROM account_types WHERE code = 'SAVINGS'), 'ACTIVE', NOW(),
 (SELECT id FROM users WHERE email = 'banker2@bnkcore.com')),
('1001-0003-0002', (SELECT id FROM customers WHERE customer_number = 'CUS-0003'),
 (SELECT id FROM account_types WHERE code = 'CHECKING'), 'ACTIVE', NOW(),
 (SELECT id FROM users WHERE email = 'banker2@bnkcore.com'));

-- Initialize account balances
INSERT INTO account_balances (account_id, available_balance, currency, version)
SELECT id, 0.0000, 'BDT', 1 FROM accounts;

-- Initial deposits using stored procedure simulation
-- Alice Savings: 50,000 BDT
SET @alice_savings_id = (SELECT id FROM accounts WHERE account_number = '1001-0001-0001');
SET @banker_id = (SELECT id FROM users WHERE email = 'banker1@bnkcore.com');
SET @deposit_type_id = (SELECT id FROM transaction_types WHERE code = 'DEPOSIT');

INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, description, status, destination_account_id, processed_at, created_by)
VALUES (UUID(), @deposit_type_id, 50000.0000, 'BDT', 'Initial deposit', 'COMPLETED', @alice_savings_id, NOW(), @banker_id);
SET @txn_id = LAST_INSERT_ID();
INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date)
VALUES (@txn_id, @alice_savings_id, 'CREDIT', 50000.0000, 'BDT', 50000.0000, 'Initial deposit', CURDATE());
UPDATE account_balances SET available_balance = 50000.0000, last_transaction_id = @txn_id, version = 2 WHERE account_id = @alice_savings_id;

-- Alice Checking: 10,000 BDT
SET @alice_checking_id = (SELECT id FROM accounts WHERE account_number = '1001-0001-0002');
INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, description, status, destination_account_id, processed_at, created_by)
VALUES (UUID(), @deposit_type_id, 10000.0000, 'BDT', 'Initial deposit', 'COMPLETED', @alice_checking_id, NOW(), @banker_id);
SET @txn_id = LAST_INSERT_ID();
INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date)
VALUES (@txn_id, @alice_checking_id, 'CREDIT', 10000.0000, 'BDT', 10000.0000, 'Initial deposit', CURDATE());
UPDATE account_balances SET available_balance = 10000.0000, last_transaction_id = @txn_id, version = 2 WHERE account_id = @alice_checking_id;

-- Bob Savings: 25,000 BDT
SET @bob_savings_id = (SELECT id FROM accounts WHERE account_number = '1001-0002-0001');
INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, description, status, destination_account_id, processed_at, created_by)
VALUES (UUID(), @deposit_type_id, 25000.0000, 'BDT', 'Initial deposit', 'COMPLETED', @bob_savings_id, NOW(), @banker_id);
SET @txn_id = LAST_INSERT_ID();
INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date)
VALUES (@txn_id, @bob_savings_id, 'CREDIT', 25000.0000, 'BDT', 25000.0000, 'Initial deposit', CURDATE());
UPDATE account_balances SET available_balance = 25000.0000, last_transaction_id = @txn_id, version = 2 WHERE account_id = @bob_savings_id;

-- Carol Savings: 75,000 BDT
SET @banker2_id = (SELECT id FROM users WHERE email = 'banker2@bnkcore.com');
SET @carol_savings_id = (SELECT id FROM accounts WHERE account_number = '1001-0003-0001');
INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, description, status, destination_account_id, processed_at, created_by)
VALUES (UUID(), @deposit_type_id, 75000.0000, 'BDT', 'Initial deposit', 'COMPLETED', @carol_savings_id, NOW(), @banker2_id);
SET @txn_id = LAST_INSERT_ID();
INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date)
VALUES (@txn_id, @carol_savings_id, 'CREDIT', 75000.0000, 'BDT', 75000.0000, 'Initial deposit', CURDATE());
UPDATE account_balances SET available_balance = 75000.0000, last_transaction_id = @txn_id, version = 2 WHERE account_id = @carol_savings_id;

-- Carol Checking: 5,000 BDT
SET @carol_checking_id = (SELECT id FROM accounts WHERE account_number = '1001-0003-0002');
INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, description, status, destination_account_id, processed_at, created_by)
VALUES (UUID(), @deposit_type_id, 5000.0000, 'BDT', 'Initial deposit', 'COMPLETED', @carol_checking_id, NOW(), @banker2_id);
SET @txn_id = LAST_INSERT_ID();
INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date)
VALUES (@txn_id, @carol_checking_id, 'CREDIT', 5000.0000, 'BDT', 5000.0000, 'Initial deposit', CURDATE());
UPDATE account_balances SET available_balance = 5000.0000, last_transaction_id = @txn_id, version = 2 WHERE account_id = @carol_checking_id;

-- =============================================================================
-- DEPLOYMENT COMPLETE
-- =============================================================================
-- 
-- Tables: 10
-- Stored Procedures: 4 (sp_deposit, sp_withdraw, sp_transfer, sp_rebuild_balance)
-- Triggers: 1 (trg_ledger_audit_insert)
-- 
-- Demo Credentials:
-- Staff:    admin@bnkcore.com / password123
--           banker1@bnkcore.com / password123
--           banker2@bnkcore.com / password123
--           auditor@bnkcore.com / password123
-- 
-- Customers: alice@example.com / customer123
--            bob@example.com / customer123
--            carol@example.com / customer123
-- =============================================================================

SELECT 'Deployment completed successfully!' AS result;
SELECT COUNT(*) AS tables_created FROM information_schema.tables WHERE table_schema = DATABASE();
SELECT COUNT(*) AS customers FROM customers;
SELECT COUNT(*) AS accounts FROM accounts;
SELECT SUM(available_balance) AS total_deposits FROM account_balances;

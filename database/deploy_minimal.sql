-- =============================================================================
-- Banking Core v1.0 - MINIMAL DEPLOYMENT (No Foreign Keys)
-- =============================================================================
-- Simplest possible version - no FK constraints at all
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

SET FOREIGN_KEY_CHECKS = 1;

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
(3, 'FIXED', 'Fixed Deposit', 'Term deposit', 10000.0000, TRUE);

INSERT INTO transaction_types (id, code, name, description, requires_approval) VALUES
(1, 'TRANSFER', 'Fund Transfer', 'Account transfer', FALSE),
(2, 'DEPOSIT', 'Cash Deposit', 'Teller deposit', FALSE),
(3, 'WITHDRAWAL', 'Cash Withdrawal', 'Teller withdrawal', FALSE);

-- Users (password: password123)
INSERT INTO users (id, email, password_hash, first_name, last_name, role_id, status) VALUES
(1, 'admin@bnkcore.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqO.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 'System', 'Admin', 1, 'ACTIVE'),
(2, 'banker1@bnkcore.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqO.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 'John', 'Doe', 2, 'ACTIVE'),
(3, 'banker2@bnkcore.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqO.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 'Jane', 'Smith', 2, 'ACTIVE'),
(4, 'auditor@bnkcore.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqO.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 'Audit', 'Officer', 3, 'ACTIVE');

-- Customers (password: customer123)
INSERT INTO customers (id, customer_number, email, password_hash, first_name, last_name, phone, national_id, address_line1, city, status, kyc_status, created_by) VALUES
(1, 'CUS-0001', 'alice@example.com', '$2a$10$rQnM1z3vHxL5PjY8kD2wPeZtF.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 'Alice', 'Rahman', '01711000001', '1234567890123', '123 Gulshan Ave', 'Dhaka', 'ACTIVE', 'VERIFIED', 2),
(2, 'CUS-0002', 'bob@example.com', '$2a$10$rQnM1z3vHxL5PjY8kD2wPeZtF.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 'Bob', 'Khan', '01711000002', '2345678901234', '456 Banani Road', 'Dhaka', 'ACTIVE', 'VERIFIED', 2),
(3, 'CUS-0003', 'carol@example.com', '$2a$10$rQnM1z3vHxL5PjY8kD2wPeZtF.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 'Carol', 'Ahmed', '01711000003', '3456789012345', '789 Dhanmondi Lane', 'Dhaka', 'ACTIVE', 'VERIFIED', 3);

-- Accounts
INSERT INTO accounts (id, account_number, customer_id, account_type_id, status, opened_at, created_by) VALUES
(1, '1001-0001-0001', 1, 1, 'ACTIVE', NOW(), 2),
(2, '1001-0001-0002', 1, 2, 'ACTIVE', NOW(), 2),
(3, '1001-0002-0001', 2, 1, 'ACTIVE', NOW(), 2),
(4, '1001-0003-0001', 3, 1, 'ACTIVE', NOW(), 3),
(5, '1001-0003-0002', 3, 2, 'ACTIVE', NOW(), 3);

-- Balances
INSERT INTO account_balances (account_id, available_balance, currency, version) VALUES
(1, 50000.0000, 'BDT', 1),
(2, 10000.0000, 'BDT', 1),
(3, 25000.0000, 'BDT', 1),
(4, 75000.0000, 'BDT', 1),
(5, 5000.0000, 'BDT', 1);

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
-- VERIFY
-- =============================================================================

SELECT 'SUCCESS' AS deployment_status;
SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema = DATABASE();
SELECT COUNT(*) AS users FROM users;
SELECT COUNT(*) AS customers FROM customers;
SELECT COUNT(*) AS accounts FROM accounts;
SELECT SUM(available_balance) AS total_balance FROM account_balances;

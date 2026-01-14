-- =============================================================================
-- Banking Core v1.0 - Robust Deployment (No FK during table creation)
-- =============================================================================
-- This version creates all tables WITHOUT foreign keys first,
-- then adds foreign keys via ALTER TABLE to avoid constraint issues.
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'TRADITIONAL';

-- =============================================================================
-- STEP 1: DROP ALL TABLES
-- =============================================================================

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

-- =============================================================================
-- STEP 2: CREATE TABLES (NO FOREIGN KEYS)
-- =============================================================================

CREATE TABLE roles (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSON,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE account_types (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    min_balance DECIMAL(18,4) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE transaction_types (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    requires_approval BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role_id BIGINT NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE',
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE accounts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_number VARCHAR(20) NOT NULL UNIQUE,
    customer_id BIGINT NOT NULL,
    account_type_id BIGINT NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE', 'FROZEN', 'CLOSED', 'PENDING') DEFAULT 'PENDING',
    opened_at TIMESTAMP NULL,
    closed_at TIMESTAMP NULL,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE transactions (
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ledger_entries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transaction_id BIGINT NOT NULL,
    account_id BIGINT NOT NULL,
    entry_type ENUM('DEBIT', 'CREDIT') NOT NULL,
    amount DECIMAL(18,4) NOT NULL,
    currency VARCHAR(3) DEFAULT 'BDT',
    balance_after DECIMAL(18,4) NOT NULL,
    description VARCHAR(255),
    entry_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE account_balances (
    account_id BIGINT PRIMARY KEY,
    available_balance DECIMAL(18,4) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'BDT',
    last_transaction_id BIGINT,
    version INT DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE transaction_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ledger_entry_id BIGINT NOT NULL,
    transaction_id BIGINT NOT NULL,
    account_id BIGINT NOT NULL,
    entry_type ENUM('DEBIT', 'CREDIT') NOT NULL,
    amount DECIMAL(18,4) NOT NULL,
    balance_after DECIMAL(18,4) NOT NULL,
    audit_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- STEP 3: ADD FOREIGN KEYS VIA ALTER TABLE
-- =============================================================================

ALTER TABLE users ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id);
ALTER TABLE customers ADD CONSTRAINT fk_customers_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE accounts ADD CONSTRAINT fk_accounts_customer FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE accounts ADD CONSTRAINT fk_accounts_type FOREIGN KEY (account_type_id) REFERENCES account_types(id);
ALTER TABLE accounts ADD CONSTRAINT fk_accounts_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_type FOREIGN KEY (transaction_type_id) REFERENCES transaction_types(id);
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_source FOREIGN KEY (source_account_id) REFERENCES accounts(id);
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_dest FOREIGN KEY (destination_account_id) REFERENCES accounts(id);
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id);
ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_account FOREIGN KEY (account_id) REFERENCES accounts(id);
ALTER TABLE account_balances ADD CONSTRAINT fk_balance_account FOREIGN KEY (account_id) REFERENCES accounts(id);
ALTER TABLE account_balances ADD CONSTRAINT fk_balance_last_txn FOREIGN KEY (last_transaction_id) REFERENCES transactions(id);

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- STEP 4: ADD INDEXES
-- =============================================================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_customers_number ON customers(customer_number);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_accounts_number ON accounts(account_number);
CREATE INDEX idx_accounts_customer ON accounts(customer_id);
CREATE INDEX idx_transactions_reference ON transactions(transaction_reference);
CREATE INDEX idx_ledger_transaction ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_account ON ledger_entries(account_id);
CREATE INDEX idx_audit_timestamp ON transaction_audit(audit_timestamp);

-- =============================================================================
-- STEP 5: SEED REFERENCE DATA
-- =============================================================================

INSERT INTO roles (code, name, description, permissions, is_system) VALUES
('ADMIN', 'Administrator', 'Full access', '["*"]', TRUE),
('BANKER', 'Banker', 'Teller operations', '["transactions:*", "customers:*"]', TRUE),
('AUDITOR', 'Auditor', 'Read-only', '["read:*"]', TRUE),
('CUSTOMER', 'Customer', 'Portal access', '["own:*"]', TRUE);

INSERT INTO account_types (code, name, description, min_balance, is_active) VALUES
('SAVINGS', 'Savings Account', 'Standard savings', 500.0000, TRUE),
('CHECKING', 'Checking Account', 'Current account', 0.0000, TRUE),
('FIXED', 'Fixed Deposit', 'Term deposit', 10000.0000, TRUE);

INSERT INTO transaction_types (code, name, description, requires_approval) VALUES
('TRANSFER', 'Fund Transfer', 'Account transfer', FALSE),
('DEPOSIT', 'Cash Deposit', 'Teller deposit', FALSE),
('WITHDRAWAL', 'Cash Withdrawal', 'Teller withdrawal', FALSE);

-- =============================================================================
-- STEP 6: SEED USERS (password: password123)
-- =============================================================================

INSERT INTO users (email, password_hash, first_name, last_name, role_id, status) VALUES
('admin@bnkcore.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqO.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 'System', 'Admin', 1, 'ACTIVE'),
('banker1@bnkcore.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqO.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 'John', 'Doe', 2, 'ACTIVE'),
('banker2@bnkcore.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqO.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 'Jane', 'Smith', 2, 'ACTIVE'),
('auditor@bnkcore.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqO.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 'Audit', 'Officer', 3, 'ACTIVE');

-- =============================================================================
-- STEP 7: SEED CUSTOMERS (password: customer123)
-- =============================================================================

INSERT INTO customers (customer_number, email, password_hash, first_name, last_name, phone, national_id, address_line1, city, status, kyc_status, created_by) VALUES
('CUS-0001', 'alice@example.com', '$2a$10$rQnM1z3vHxL5PjY8kD2wPeZtF.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 'Alice', 'Rahman', '01711000001', '1234567890123', '123 Gulshan Ave', 'Dhaka', 'ACTIVE', 'VERIFIED', 2),
('CUS-0002', 'bob@example.com', '$2a$10$rQnM1z3vHxL5PjY8kD2wPeZtF.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 'Bob', 'Khan', '01711000002', '2345678901234', '456 Banani Road', 'Dhaka', 'ACTIVE', 'VERIFIED', 2),
('CUS-0003', 'carol@example.com', '$2a$10$rQnM1z3vHxL5PjY8kD2wPeZtF.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 'Carol', 'Ahmed', '01711000003', '3456789012345', '789 Dhanmondi Lane', 'Dhaka', 'ACTIVE', 'VERIFIED', 3);

-- =============================================================================
-- STEP 8: SEED ACCOUNTS
-- =============================================================================

INSERT INTO accounts (account_number, customer_id, account_type_id, status, opened_at, created_by) VALUES
('1001-0001-0001', 1, 1, 'ACTIVE', NOW(), 2),
('1001-0001-0002', 1, 2, 'ACTIVE', NOW(), 2),
('1001-0002-0001', 2, 1, 'ACTIVE', NOW(), 2),
('1001-0003-0001', 3, 1, 'ACTIVE', NOW(), 3),
('1001-0003-0002', 3, 2, 'ACTIVE', NOW(), 3);

-- Initialize balances
INSERT INTO account_balances (account_id, available_balance, currency, version) VALUES
(1, 0, 'BDT', 1), (2, 0, 'BDT', 1), (3, 0, 'BDT', 1), (4, 0, 'BDT', 1), (5, 0, 'BDT', 1);

-- =============================================================================
-- STEP 9: INITIAL DEPOSITS
-- =============================================================================

-- Alice Savings: 50,000
INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, description, status, destination_account_id, processed_at, created_by)
VALUES (UUID(), 2, 50000.0000, 'BDT', 'Initial deposit', 'COMPLETED', 1, NOW(), 2);
INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date)
VALUES (LAST_INSERT_ID(), 1, 'CREDIT', 50000.0000, 'BDT', 50000.0000, 'Initial deposit', CURDATE());
UPDATE account_balances SET available_balance = 50000.0000, last_transaction_id = 1, version = 2 WHERE account_id = 1;

-- Alice Checking: 10,000
INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, description, status, destination_account_id, processed_at, created_by)
VALUES (UUID(), 2, 10000.0000, 'BDT', 'Initial deposit', 'COMPLETED', 2, NOW(), 2);
INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date)
VALUES (LAST_INSERT_ID(), 2, 'CREDIT', 10000.0000, 'BDT', 10000.0000, 'Initial deposit', CURDATE());
UPDATE account_balances SET available_balance = 10000.0000, last_transaction_id = 2, version = 2 WHERE account_id = 2;

-- Bob Savings: 25,000
INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, description, status, destination_account_id, processed_at, created_by)
VALUES (UUID(), 2, 25000.0000, 'BDT', 'Initial deposit', 'COMPLETED', 3, NOW(), 2);
INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date)
VALUES (LAST_INSERT_ID(), 3, 'CREDIT', 25000.0000, 'BDT', 25000.0000, 'Initial deposit', CURDATE());
UPDATE account_balances SET available_balance = 25000.0000, last_transaction_id = 3, version = 2 WHERE account_id = 3;

-- Carol Savings: 75,000
INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, description, status, destination_account_id, processed_at, created_by)
VALUES (UUID(), 2, 75000.0000, 'BDT', 'Initial deposit', 'COMPLETED', 4, NOW(), 3);
INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date)
VALUES (LAST_INSERT_ID(), 4, 'CREDIT', 75000.0000, 'BDT', 75000.0000, 'Initial deposit', CURDATE());
UPDATE account_balances SET available_balance = 75000.0000, last_transaction_id = 4, version = 2 WHERE account_id = 4;

-- Carol Checking: 5,000
INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, description, status, destination_account_id, processed_at, created_by)
VALUES (UUID(), 2, 5000.0000, 'BDT', 'Initial deposit', 'COMPLETED', 5, NOW(), 3);
INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date)
VALUES (LAST_INSERT_ID(), 5, 'CREDIT', 5000.0000, 'BDT', 5000.0000, 'Initial deposit', CURDATE());
UPDATE account_balances SET available_balance = 5000.0000, last_transaction_id = 5, version = 2 WHERE account_id = 5;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT 'Schema deployed!' AS status;
SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = DATABASE();
SELECT COUNT(*) AS customers FROM customers;
SELECT COUNT(*) AS accounts FROM accounts;
SELECT SUM(available_balance) AS total_balance FROM account_balances;

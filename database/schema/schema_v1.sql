-- =============================================================================
-- Banking Core - Simplified Schema v1.0
-- Academic-Grade Double-Entry Ledger System
-- Currency: BDT Only | Engine: InnoDB | Charset: utf8mb4
-- =============================================================================
-- Version: 1.0.0
-- Date: 2026-01-14
-- Description: Minimal schema for DBMS course demonstration
-- Tables: 10 (3 reference + 7 core)
-- =============================================================================

-- Drop existing tables in reverse dependency order (for fresh reset)
SET FOREIGN_KEY_CHECKS = 0;

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

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- SECTION 1: REFERENCE TABLES
-- =============================================================================

-- Roles table for RBAC
CREATE TABLE roles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    permissions JSON NOT NULL DEFAULT ('[]'),
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Account types reference table
CREATE TABLE account_types (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500) NULL,
    min_balance DECIMAL(18,4) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_account_types_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transaction types reference
CREATE TABLE transaction_types (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500) NULL,
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_transaction_types_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 2: IDENTITY & ACCESS MANAGEMENT
-- =============================================================================

-- Users table (internal staff: admin, banker, auditor)
CREATE TABLE users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role_id BIGINT UNSIGNED NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE', 'LOCKED') NOT NULL DEFAULT 'ACTIVE',
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_email (email),
    KEY idx_users_role (role_id),
    KEY idx_users_status (status),
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 3: CUSTOMERS & ACCOUNTS
-- =============================================================================

-- Customers table (bank customers who use the portal)
CREATE TABLE customers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_number VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NULL,
    date_of_birth DATE NULL,
    national_id VARCHAR(50) NULL,
    address_line1 VARCHAR(255) NULL,
    city VARCHAR(100) NULL,
    country VARCHAR(2) NOT NULL DEFAULT 'BD',
    status ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED') NOT NULL DEFAULT 'PENDING',
    kyc_status ENUM('NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'NOT_STARTED',
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by BIGINT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_customers_number (customer_number),
    UNIQUE KEY uk_customers_email (email),
    KEY idx_customers_status (status),
    CONSTRAINT fk_customers_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Accounts table
CREATE TABLE accounts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    account_number VARCHAR(20) NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    account_type_id BIGINT UNSIGNED NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'BDT',
    status ENUM('PENDING', 'ACTIVE', 'FROZEN', 'CLOSED') NOT NULL DEFAULT 'PENDING',
    opened_at TIMESTAMP NULL,
    closed_at TIMESTAMP NULL,
    last_transaction_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by BIGINT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_accounts_number (account_number),
    KEY idx_accounts_customer (customer_id),
    KEY idx_accounts_type (account_type_id),
    KEY idx_accounts_status (status),
    CONSTRAINT fk_accounts_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_accounts_type FOREIGN KEY (account_type_id) REFERENCES account_types(id),
    CONSTRAINT fk_accounts_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_accounts_currency CHECK (currency = 'BDT')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 4: FINANCIAL CORE (DOUBLE-ENTRY LEDGER)
-- =============================================================================

-- Transactions master table (transaction headers)
CREATE TABLE transactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    transaction_reference VARCHAR(36) NOT NULL,
    transaction_type_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(18,4) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'BDT',
    description VARCHAR(500) NULL,
    status ENUM('PENDING', 'COMPLETED', 'FAILED', 'REVERSED') NOT NULL DEFAULT 'PENDING',
    source_account_id BIGINT UNSIGNED NULL,
    destination_account_id BIGINT UNSIGNED NULL,
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_transactions_reference (transaction_reference),
    KEY idx_transactions_type (transaction_type_id),
    KEY idx_transactions_status (status),
    KEY idx_transactions_source (source_account_id),
    KEY idx_transactions_dest (destination_account_id),
    KEY idx_transactions_created (created_at),
    CONSTRAINT fk_transactions_type FOREIGN KEY (transaction_type_id) REFERENCES transaction_types(id),
    CONSTRAINT fk_transactions_source FOREIGN KEY (source_account_id) REFERENCES accounts(id),
    CONSTRAINT fk_transactions_dest FOREIGN KEY (destination_account_id) REFERENCES accounts(id),
    CONSTRAINT chk_transactions_currency CHECK (currency = 'BDT'),
    CONSTRAINT chk_transactions_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ledger entries (IMMUTABLE - the source of truth for double-entry)
CREATE TABLE ledger_entries (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    transaction_id BIGINT UNSIGNED NOT NULL,
    account_id BIGINT UNSIGNED NOT NULL,
    entry_type ENUM('DEBIT', 'CREDIT') NOT NULL,
    amount DECIMAL(18,4) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'BDT',
    balance_after DECIMAL(18,4) NOT NULL,
    description VARCHAR(500) NULL,
    entry_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_ledger_transaction (transaction_id),
    KEY idx_ledger_account (account_id),
    KEY idx_ledger_date (entry_date),
    KEY idx_ledger_account_date (account_id, entry_date),
    CONSTRAINT fk_ledger_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    CONSTRAINT fk_ledger_account FOREIGN KEY (account_id) REFERENCES accounts(id),
    CONSTRAINT chk_ledger_currency CHECK (currency = 'BDT'),
    CONSTRAINT chk_ledger_amount CHECK (amount > 0),
    CONSTRAINT chk_ledger_balance CHECK (balance_after >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Account balances (materialized view - derived from ledger for O(1) reads)
CREATE TABLE account_balances (
    account_id BIGINT UNSIGNED NOT NULL,
    available_balance DECIMAL(18,4) NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'BDT',
    last_transaction_id BIGINT UNSIGNED NULL,
    last_calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (account_id),
    CONSTRAINT fk_balances_account FOREIGN KEY (account_id) REFERENCES accounts(id),
    CONSTRAINT fk_balances_last_txn FOREIGN KEY (last_transaction_id) REFERENCES transactions(id),
    CONSTRAINT chk_balances_currency CHECK (currency = 'BDT'),
    CONSTRAINT chk_balances_available CHECK (available_balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 5: AUDIT TRAIL (TRIGGER-POPULATED)
-- =============================================================================

-- Transaction audit log (immutable, populated by trigger)
CREATE TABLE transaction_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ledger_entry_id BIGINT UNSIGNED NOT NULL,
    transaction_id BIGINT UNSIGNED NOT NULL,
    account_id BIGINT UNSIGNED NOT NULL,
    entry_type ENUM('DEBIT', 'CREDIT') NOT NULL,
    amount DECIMAL(18,4) NOT NULL,
    balance_after DECIMAL(18,4) NOT NULL,
    audit_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_ledger (ledger_entry_id),
    KEY idx_audit_transaction (transaction_id),
    KEY idx_audit_account (account_id),
    KEY idx_audit_timestamp (audit_timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SCHEMA COMPLETE
-- =============================================================================
-- Total Tables: 10
-- Reference Tables: roles, account_types, transaction_types
-- Core Tables: users, customers, accounts, transactions, ledger_entries,
--              account_balances, transaction_audit
-- =============================================================================

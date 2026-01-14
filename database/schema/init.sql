-- =============================================================================
-- Banking Core - Database Schema
-- Production-Grade Double-Entry Ledger System
-- Currency: BDT Only
-- =============================================================================

-- Ensure we're using the correct database
-- CREATE DATABASE IF NOT EXISTS bnkcore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE bnkcore;

-- =============================================================================
-- SECTION 1: IDENTITY & ACCESS MANAGEMENT
-- =============================================================================

-- Roles table for RBAC
CREATE TABLE IF NOT EXISTS roles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    permissions JSON NOT NULL DEFAULT ('[]'),
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Users table (internal staff)
CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role_id BIGINT UNSIGNED NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE', 'LOCKED', 'PENDING') NOT NULL DEFAULT 'PENDING',
    failed_login_attempts INT UNSIGNED NOT NULL DEFAULT 0,
    last_login_at TIMESTAMP NULL,
    password_changed_at TIMESTAMP NULL,
    token_version INT UNSIGNED NOT NULL DEFAULT 1,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by BIGINT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_email (email),
    KEY idx_users_role (role_id),
    KEY idx_users_status (status),
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User sessions for JWT tracking
CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255) NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(500) NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_sessions_user (user_id),
    KEY idx_sessions_token (token_hash),
    KEY idx_sessions_expires (expires_at),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 2: CUSTOMERS & ACCOUNTS
-- =============================================================================

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
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
    address_line2 VARCHAR(255) NULL,
    city VARCHAR(100) NULL,
    postal_code VARCHAR(20) NULL,
    country VARCHAR(2) NOT NULL DEFAULT 'BD',
    status ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED') NOT NULL DEFAULT 'PENDING',
    kyc_status ENUM('NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'NOT_STARTED',
    kyc_verified_at TIMESTAMP NULL,
    kyc_verified_by BIGINT UNSIGNED NULL,
    risk_score INT UNSIGNED NOT NULL DEFAULT 0,
    token_version INT UNSIGNED NOT NULL DEFAULT 1,
    failed_login_attempts INT UNSIGNED NOT NULL DEFAULT 0,
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by BIGINT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_customers_number (customer_number),
    UNIQUE KEY uk_customers_email (email),
    UNIQUE KEY uk_customers_national_id (national_id),
    KEY idx_customers_status (status),
    KEY idx_customers_kyc (kyc_status),
    CONSTRAINT fk_customers_kyc_verified FOREIGN KEY (kyc_verified_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Account types reference table
CREATE TABLE IF NOT EXISTS account_types (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500) NULL,
    interest_rate DECIMAL(5,4) NOT NULL DEFAULT 0,
    min_balance DECIMAL(19,4) NOT NULL DEFAULT 0,
    max_daily_withdrawal DECIMAL(19,4) NULL,
    max_daily_transfer DECIMAL(19,4) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_account_types_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    account_number VARCHAR(20) NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    account_type_id BIGINT UNSIGNED NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'BDT',
    status ENUM('PENDING', 'ACTIVE', 'FROZEN', 'DORMANT', 'CLOSED') NOT NULL DEFAULT 'PENDING',
    opened_at TIMESTAMP NULL,
    closed_at TIMESTAMP NULL,
    last_transaction_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by BIGINT UNSIGNED NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY uk_accounts_number (account_number),
    KEY idx_accounts_customer (customer_id),
    KEY idx_accounts_type (account_type_id),
    KEY idx_accounts_status (status),
    CONSTRAINT fk_accounts_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_accounts_type FOREIGN KEY (account_type_id) REFERENCES account_types(id),
    CONSTRAINT chk_accounts_currency CHECK (currency = 'BDT')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Accounts history (temporal/versioned)
CREATE TABLE IF NOT EXISTS accounts_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    account_id BIGINT UNSIGNED NOT NULL,
    account_number VARCHAR(20) NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    account_type_id BIGINT UNSIGNED NOT NULL,
    status ENUM('PENDING', 'ACTIVE', 'FROZEN', 'DORMANT', 'CLOSED') NOT NULL,
    version INT UNSIGNED NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    changed_by BIGINT UNSIGNED NULL,
    change_reason VARCHAR(500) NULL,
    PRIMARY KEY (id),
    KEY idx_accounts_history_account (account_id),
    KEY idx_accounts_history_changed (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 3: FINANCIAL CORE (DOUBLE-ENTRY LEDGER)
-- =============================================================================

-- Transaction types reference
CREATE TABLE IF NOT EXISTS transaction_types (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500) NULL,
    debit_account_type VARCHAR(50) NULL,
    credit_account_type VARCHAR(50) NULL,
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    is_reversible BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_transaction_types_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transactions master table
CREATE TABLE IF NOT EXISTS transactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    transaction_reference VARCHAR(36) NOT NULL,
    transaction_type_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(19,4) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'BDT',
    description VARCHAR(500) NULL,
    status ENUM('PENDING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    source_account_id BIGINT UNSIGNED NULL,
    destination_account_id BIGINT UNSIGNED NULL,
    reversal_of_id BIGINT UNSIGNED NULL,
    reversed_by_id BIGINT UNSIGNED NULL,
    external_reference VARCHAR(100) NULL,
    metadata JSON NULL,
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
    KEY idx_transactions_external (external_reference),
    CONSTRAINT fk_transactions_type FOREIGN KEY (transaction_type_id) REFERENCES transaction_types(id),
    CONSTRAINT fk_transactions_source FOREIGN KEY (source_account_id) REFERENCES accounts(id),
    CONSTRAINT fk_transactions_dest FOREIGN KEY (destination_account_id) REFERENCES accounts(id),
    CONSTRAINT fk_transactions_reversal_of FOREIGN KEY (reversal_of_id) REFERENCES transactions(id),
    CONSTRAINT fk_transactions_reversed_by FOREIGN KEY (reversed_by_id) REFERENCES transactions(id),
    CONSTRAINT chk_transactions_currency CHECK (currency = 'BDT'),
    CONSTRAINT chk_transactions_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ledger entries (IMMUTABLE - the source of truth)
-- Partitioned by year for performance
CREATE TABLE IF NOT EXISTS ledger_entries (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    transaction_id BIGINT UNSIGNED NOT NULL,
    account_id BIGINT UNSIGNED NOT NULL,
    entry_type ENUM('DEBIT', 'CREDIT') NOT NULL,
    amount DECIMAL(19,4) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'BDT',
    balance_after DECIMAL(19,4) NOT NULL,
    description VARCHAR(500) NULL,
    entry_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, entry_date),
    KEY idx_ledger_transaction (transaction_id),
    KEY idx_ledger_account (account_id),
    KEY idx_ledger_date (entry_date),
    KEY idx_ledger_account_date (account_id, entry_date),
    CONSTRAINT fk_ledger_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    CONSTRAINT fk_ledger_account FOREIGN KEY (account_id) REFERENCES accounts(id),
    CONSTRAINT chk_ledger_currency CHECK (currency = 'BDT'),
    CONSTRAINT chk_ledger_amount CHECK (amount > 0),
    CONSTRAINT chk_ledger_balance CHECK (balance_after >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (YEAR(entry_date)) (
    PARTITION p2024 VALUES LESS THAN (2025),
    PARTITION p2025 VALUES LESS THAN (2026),
    PARTITION p2026 VALUES LESS THAN (2027),
    PARTITION p2027 VALUES LESS THAN (2028),
    PARTITION pmax VALUES LESS THAN MAXVALUE
);

-- Account balances (materialized view - derived from ledger)
CREATE TABLE IF NOT EXISTS account_balances (
    account_id BIGINT UNSIGNED NOT NULL,
    available_balance DECIMAL(19,4) NOT NULL DEFAULT 0,
    pending_balance DECIMAL(19,4) NOT NULL DEFAULT 0,
    hold_balance DECIMAL(19,4) NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'BDT',
    last_transaction_id BIGINT UNSIGNED NULL,
    last_calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (account_id),
    CONSTRAINT fk_balances_account FOREIGN KEY (account_id) REFERENCES accounts(id),
    CONSTRAINT fk_balances_last_txn FOREIGN KEY (last_transaction_id) REFERENCES transactions(id),
    CONSTRAINT chk_balances_currency CHECK (currency = 'BDT'),
    CONSTRAINT chk_balances_available CHECK (available_balance >= 0),
    CONSTRAINT chk_balances_pending CHECK (pending_balance >= 0),
    CONSTRAINT chk_balances_hold CHECK (hold_balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transaction audit log (trigger-populated)
CREATE TABLE IF NOT EXISTS transaction_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    transaction_id BIGINT UNSIGNED NOT NULL,
    action ENUM('CREATE', 'STATUS_CHANGE', 'REVERSE') NOT NULL,
    old_status VARCHAR(20) NULL,
    new_status VARCHAR(20) NOT NULL,
    changed_by BIGINT UNSIGNED NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(500) NULL,
    metadata JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_transaction (transaction_id),
    KEY idx_audit_created (created_at),
    CONSTRAINT fk_audit_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 4: RELIABILITY & MESSAGING
-- =============================================================================

-- Events table (event sourcing)
CREATE TABLE IF NOT EXISTS events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id BIGINT UNSIGNED NOT NULL,
    payload JSON NOT NULL,
    metadata JSON NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_events_type (event_type),
    KEY idx_events_aggregate (aggregate_type, aggregate_id),
    KEY idx_events_created (created_at),
    KEY idx_events_processed (processed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Outbox table (transactional outbox pattern)
CREATE TABLE IF NOT EXISTS outbox (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id BIGINT UNSIGNED NOT NULL,
    payload JSON NOT NULL,
    status ENUM('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    retry_count INT UNSIGNED NOT NULL DEFAULT 0,
    max_retries INT UNSIGNED NOT NULL DEFAULT 3,
    last_error TEXT NULL,
    scheduled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_outbox_status (status),
    KEY idx_outbox_scheduled (scheduled_at),
    KEY idx_outbox_aggregate (aggregate_type, aggregate_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Idempotency keys table
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    idempotency_key VARCHAR(64) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response_status INT NOT NULL,
    response_body JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_idempotency_key (idempotency_key),
    KEY idx_idempotency_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 5: RECONCILIATION
-- =============================================================================

-- Reconciliation batches
CREATE TABLE IF NOT EXISTS reconciliations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    source_type ENUM('BANK_STATEMENT', 'PAYMENT_GATEWAY', 'MANUAL') NOT NULL,
    source_file VARCHAR(500) NULL,
    status ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    total_items INT UNSIGNED NOT NULL DEFAULT 0,
    matched_items INT UNSIGNED NOT NULL DEFAULT 0,
    unmatched_items INT UNSIGNED NOT NULL DEFAULT 0,
    discrepancy_amount DECIMAL(19,4) NOT NULL DEFAULT 0,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_recon_status (status),
    KEY idx_recon_created (created_at),
    CONSTRAINT fk_recon_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reconciliation items
CREATE TABLE IF NOT EXISTS reconciliation_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    reconciliation_id BIGINT UNSIGNED NOT NULL,
    external_reference VARCHAR(100) NULL,
    external_date DATE NOT NULL,
    external_amount DECIMAL(19,4) NOT NULL,
    external_description VARCHAR(500) NULL,
    matched_transaction_id BIGINT UNSIGNED NULL,
    match_status ENUM('PENDING', 'AUTO_MATCHED', 'MANUAL_MATCHED', 'UNMATCHED', 'DISPUTED') NOT NULL DEFAULT 'PENDING',
    match_confidence DECIMAL(5,2) NULL,
    match_reason VARCHAR(500) NULL,
    discrepancy_amount DECIMAL(19,4) NULL,
    reviewed_at TIMESTAMP NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_recon_items_recon (reconciliation_id),
    KEY idx_recon_items_status (match_status),
    KEY idx_recon_items_matched (matched_transaction_id),
    CONSTRAINT fk_recon_items_recon FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE,
    CONSTRAINT fk_recon_items_matched FOREIGN KEY (matched_transaction_id) REFERENCES transactions(id),
    CONSTRAINT fk_recon_items_reviewed FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 6: FRAUD & RISK
-- =============================================================================

-- Fraud detection queue
CREATE TABLE IF NOT EXISTS fraud_queue (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    transaction_id BIGINT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    rule_triggered VARCHAR(100) NOT NULL,
    severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
    status ENUM('PENDING', 'REVIEWING', 'APPROVED', 'REJECTED', 'ESCALATED') NOT NULL DEFAULT 'PENDING',
    fraud_score INT UNSIGNED NOT NULL DEFAULT 0,
    details JSON NULL,
    assigned_to BIGINT UNSIGNED NULL,
    reviewed_at TIMESTAMP NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    review_notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_fraud_transaction (transaction_id),
    KEY idx_fraud_customer (customer_id),
    KEY idx_fraud_status (status),
    KEY idx_fraud_severity (severity),
    KEY idx_fraud_assigned (assigned_to),
    CONSTRAINT fk_fraud_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    CONSTRAINT fk_fraud_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_fraud_assigned FOREIGN KEY (assigned_to) REFERENCES users(id),
    CONSTRAINT fk_fraud_reviewed FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fraud scores (customer-level)
CREATE TABLE IF NOT EXISTS fraud_scores (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id BIGINT UNSIGNED NOT NULL,
    score INT UNSIGNED NOT NULL DEFAULT 0,
    risk_level ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'LOW',
    features JSON NULL,
    last_transaction_at TIMESTAMP NULL,
    last_calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_fraud_scores_customer (customer_id),
    KEY idx_fraud_scores_level (risk_level),
    CONSTRAINT fk_fraud_scores_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 7: ANALYTICS (MATERIALIZED TABLES)
-- =============================================================================

-- Daily account totals
CREATE TABLE IF NOT EXISTS daily_account_totals (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    account_id BIGINT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    opening_balance DECIMAL(19,4) NOT NULL,
    closing_balance DECIMAL(19,4) NOT NULL,
    total_debits DECIMAL(19,4) NOT NULL DEFAULT 0,
    total_credits DECIMAL(19,4) NOT NULL DEFAULT 0,
    debit_count INT UNSIGNED NOT NULL DEFAULT 0,
    credit_count INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_daily_totals (account_id, date),
    KEY idx_daily_totals_date (date),
    CONSTRAINT fk_daily_totals_account FOREIGN KEY (account_id) REFERENCES accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Monthly account summaries
CREATE TABLE IF NOT EXISTS monthly_account_summaries (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    account_id BIGINT UNSIGNED NOT NULL,
    year INT UNSIGNED NOT NULL,
    month INT UNSIGNED NOT NULL,
    opening_balance DECIMAL(19,4) NOT NULL,
    closing_balance DECIMAL(19,4) NOT NULL,
    total_debits DECIMAL(19,4) NOT NULL DEFAULT 0,
    total_credits DECIMAL(19,4) NOT NULL DEFAULT 0,
    debit_count INT UNSIGNED NOT NULL DEFAULT 0,
    credit_count INT UNSIGNED NOT NULL DEFAULT 0,
    avg_daily_balance DECIMAL(19,4) NOT NULL DEFAULT 0,
    interest_earned DECIMAL(19,4) NOT NULL DEFAULT 0,
    fees_charged DECIMAL(19,4) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_monthly_summaries (account_id, year, month),
    KEY idx_monthly_summaries_period (year, month),
    CONSTRAINT fk_monthly_summaries_account FOREIGN KEY (account_id) REFERENCES accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Top accounts monthly (for dashboards)
CREATE TABLE IF NOT EXISTS top_accounts_monthly (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    year INT UNSIGNED NOT NULL,
    month INT UNSIGNED NOT NULL,
    category ENUM('HIGHEST_BALANCE', 'MOST_TRANSACTIONS', 'HIGHEST_VOLUME') NOT NULL,
    rank_position INT UNSIGNED NOT NULL,
    account_id BIGINT UNSIGNED NOT NULL,
    metric_value DECIMAL(19,4) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_top_accounts (year, month, category, rank_position),
    KEY idx_top_accounts_account (account_id),
    CONSTRAINT fk_top_accounts_account FOREIGN KEY (account_id) REFERENCES accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 8: OPERATIONS & COMPLIANCE
-- =============================================================================

-- System jobs (scheduler)
CREATE TABLE IF NOT EXISTS system_jobs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    job_name VARCHAR(100) NOT NULL,
    job_type ENUM('EOD', 'INTEREST', 'RECONCILIATION', 'FRAUD_SCAN', 'CLEANUP', 'REPORT') NOT NULL,
    status ENUM('SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
    scheduled_at TIMESTAMP NOT NULL,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    duration_ms INT UNSIGNED NULL,
    result JSON NULL,
    error_message TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT UNSIGNED NULL,
    PRIMARY KEY (id),
    KEY idx_jobs_type (job_type),
    KEY idx_jobs_status (status),
    KEY idx_jobs_scheduled (scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Customer pseudonymizations (GDPR)
CREATE TABLE IF NOT EXISTS customer_pseudonymizations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id BIGINT UNSIGNED NOT NULL,
    original_email_hash VARCHAR(64) NOT NULL,
    pseudonymized_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pseudonymized_by BIGINT UNSIGNED NOT NULL,
    reason VARCHAR(500) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_pseudo_customer (customer_id),
    KEY idx_pseudo_date (pseudonymized_at),
    CONSTRAINT fk_pseudo_by FOREIGN KEY (pseudonymized_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- System configuration
CREATE TABLE IF NOT EXISTS system_config (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    config_key VARCHAR(100) NOT NULL,
    config_value TEXT NOT NULL,
    value_type ENUM('STRING', 'NUMBER', 'BOOLEAN', 'JSON') NOT NULL DEFAULT 'STRING',
    description VARCHAR(500) NULL,
    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by BIGINT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_config_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    recipient_type ENUM('USER', 'CUSTOMER') NOT NULL,
    recipient_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    metadata JSON NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_notifications_recipient (recipient_type, recipient_id),
    KEY idx_notifications_read (is_read),
    KEY idx_notifications_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Disputes
CREATE TABLE IF NOT EXISTS disputes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    dispute_reference VARCHAR(20) NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    transaction_id BIGINT UNSIGNED NOT NULL,
    type ENUM('UNAUTHORIZED', 'DUPLICATE', 'WRONG_AMOUNT', 'NOT_RECEIVED', 'OTHER') NOT NULL,
    status ENUM('OPEN', 'INVESTIGATING', 'RESOLVED', 'REJECTED', 'ESCALATED') NOT NULL DEFAULT 'OPEN',
    description TEXT NOT NULL,
    resolution TEXT NULL,
    amount_disputed DECIMAL(19,4) NOT NULL,
    amount_refunded DECIMAL(19,4) NULL,
    assigned_to BIGINT UNSIGNED NULL,
    resolved_at TIMESTAMP NULL,
    resolved_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_disputes_reference (dispute_reference),
    KEY idx_disputes_customer (customer_id),
    KEY idx_disputes_transaction (transaction_id),
    KEY idx_disputes_status (status),
    CONSTRAINT fk_disputes_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_disputes_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    CONSTRAINT fk_disputes_assigned FOREIGN KEY (assigned_to) REFERENCES users(id),
    CONSTRAINT fk_disputes_resolved FOREIGN KEY (resolved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 9: SCHEDULED TRANSFERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS scheduled_transfers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id BIGINT UNSIGNED NOT NULL,
    source_account_id BIGINT UNSIGNED NOT NULL,
    destination_account_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(19,4) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'BDT',
    description VARCHAR(500) NULL,
    frequency ENUM('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY') NOT NULL,
    next_execution_date DATE NOT NULL,
    last_execution_date DATE NULL,
    end_date DATE NULL,
    execution_count INT UNSIGNED NOT NULL DEFAULT 0,
    max_executions INT UNSIGNED NULL,
    status ENUM('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'ACTIVE',
    last_transaction_id BIGINT UNSIGNED NULL,
    failure_count INT UNSIGNED NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_scheduled_customer (customer_id),
    KEY idx_scheduled_source (source_account_id),
    KEY idx_scheduled_next (next_execution_date),
    KEY idx_scheduled_status (status),
    CONSTRAINT fk_scheduled_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_scheduled_source FOREIGN KEY (source_account_id) REFERENCES accounts(id),
    CONSTRAINT fk_scheduled_dest FOREIGN KEY (destination_account_id) REFERENCES accounts(id),
    CONSTRAINT fk_scheduled_last_txn FOREIGN KEY (last_transaction_id) REFERENCES transactions(id),
    CONSTRAINT chk_scheduled_currency CHECK (currency = 'BDT'),
    CONSTRAINT chk_scheduled_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 10: KYC APPLICATIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS kyc_applications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id BIGINT UNSIGNED NOT NULL,
    application_type ENUM('INITIAL', 'UPDATE', 'RENEWAL') NOT NULL DEFAULT 'INITIAL',
    status ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REQUIRES_INFO') NOT NULL DEFAULT 'DRAFT',
    id_type VARCHAR(50) NULL,
    id_number VARCHAR(50) NULL,
    id_expiry_date DATE NULL,
    id_document_path VARCHAR(500) NULL,
    address_proof_type VARCHAR(50) NULL,
    address_proof_path VARCHAR(500) NULL,
    selfie_path VARCHAR(500) NULL,
    submitted_at TIMESTAMP NULL,
    reviewed_at TIMESTAMP NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    review_notes TEXT NULL,
    rejection_reason TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_kyc_customer (customer_id),
    KEY idx_kyc_status (status),
    CONSTRAINT fk_kyc_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_kyc_reviewed FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

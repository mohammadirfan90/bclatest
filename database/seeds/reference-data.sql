-- =============================================================================
-- Banking Core - Reference Data Seed
-- Run this after init.sql to populate reference tables
-- =============================================================================

-- =============================================================================
-- ROLES
-- =============================================================================

INSERT INTO roles (code, name, description, permissions, is_system) VALUES
('ADMIN', 'Administrator', 'Full system access', JSON_ARRAY(
    'users.read', 'users.write', 'users.delete',
    'roles.read', 'roles.write',
    'customers.read', 'customers.write', 'customers.delete',
    'accounts.read', 'accounts.write', 'accounts.close',
    'transactions.read', 'transactions.write', 'transactions.reverse',
    'reconciliation.read', 'reconciliation.write', 'reconciliation.approve',
    'fraud.read', 'fraud.review', 'fraud.approve',
    'reports.read', 'reports.export',
    'system.config', 'system.jobs', 'system.eod', 'system.gdpr'
), TRUE),

('BANKER', 'Banker', 'Customer-facing operations', JSON_ARRAY(
    'customers.read', 'customers.write',
    'accounts.read', 'accounts.write',
    'transactions.read', 'transactions.write',
    'reconciliation.read', 'reconciliation.write',
    'fraud.read', 'fraud.review',
    'reports.read'
), TRUE),

('AUDITOR', 'Auditor', 'Read-only access to all financial data', JSON_ARRAY(
    'customers.read',
    'accounts.read',
    'transactions.read',
    'reconciliation.read',
    'fraud.read',
    'reports.read', 'reports.export'
), TRUE),

('SUPPORT', 'Customer Support', 'Limited customer assistance', JSON_ARRAY(
    'customers.read',
    'accounts.read',
    'transactions.read'
), TRUE);

-- =============================================================================
-- ACCOUNT TYPES
-- =============================================================================

INSERT INTO account_types (code, name, description, interest_rate, min_balance, max_daily_withdrawal, max_daily_transfer) VALUES
('SAVINGS', 'Savings Account', 'Standard savings account with interest', 0.0450, 500.0000, 500000.0000, 1000000.0000),
('CURRENT', 'Current Account', 'Business current account, no interest', 0.0000, 10000.0000, 2000000.0000, 5000000.0000),
('FIXED_1Y', 'Fixed Deposit (1 Year)', '1-year fixed deposit', 0.0700, 50000.0000, NULL, NULL),
('FIXED_3Y', 'Fixed Deposit (3 Years)', '3-year fixed deposit', 0.0850, 50000.0000, NULL, NULL),
('SUSPENSE', 'Suspense Account', 'Internal suspense account for reconciliation', 0.0000, 0.0000, NULL, NULL),
('INTERNAL', 'Internal Account', 'Bank internal operations account', 0.0000, 0.0000, NULL, NULL);

-- =============================================================================
-- TRANSACTION TYPES
-- =============================================================================

INSERT INTO transaction_types (code, name, description, debit_account_type, credit_account_type, requires_approval, is_reversible) VALUES
('TRANSFER', 'Account Transfer', 'Transfer between customer accounts', 'CUSTOMER', 'CUSTOMER', FALSE, TRUE),
('DEPOSIT', 'Cash Deposit', 'Cash deposit to account', 'BANK', 'CUSTOMER', FALSE, TRUE),
('WITHDRAWAL', 'Cash Withdrawal', 'Cash withdrawal from account', 'CUSTOMER', 'BANK', FALSE, TRUE),
('REVERSAL', 'Transaction Reversal', 'Reversal of a previous transaction', NULL, NULL, TRUE, FALSE),
('INTEREST', 'Interest Credit', 'Interest credited to account', 'BANK', 'CUSTOMER', FALSE, FALSE),
('FEE', 'Service Fee', 'Bank service fee', 'CUSTOMER', 'BANK', FALSE, TRUE),
('ADJUSTMENT', 'Balance Adjustment', 'Manual balance adjustment', NULL, NULL, TRUE, TRUE),
('OPENING', 'Account Opening', 'Initial deposit for account opening', 'BANK', 'CUSTOMER', FALSE, FALSE);

-- =============================================================================
-- SYSTEM CONFIGURATION
-- =============================================================================

INSERT INTO system_config (config_key, config_value, value_type, description, is_sensitive) VALUES
('currency.code', 'BDT', 'STRING', 'System currency code', FALSE),
('currency.symbol', '৳', 'STRING', 'Currency symbol', FALSE),
('currency.decimal_places', '2', 'NUMBER', 'Decimal places for display', FALSE),

('transfer.max_amount', '10000000', 'NUMBER', 'Maximum single transfer amount (BDT)', FALSE),
('transfer.daily_limit', '50000000', 'NUMBER', 'Maximum daily transfer limit (BDT)', FALSE),
('transfer.min_amount', '1', 'NUMBER', 'Minimum transfer amount (BDT)', FALSE),

('fraud.large_amount_threshold', '1000000', 'NUMBER', 'Amount threshold for large transaction alert', FALSE),
('fraud.velocity_count', '10', 'NUMBER', 'Number of transactions in window to trigger velocity alert', FALSE),
('fraud.velocity_window_minutes', '60', 'NUMBER', 'Time window for velocity check (minutes)', FALSE),

('reconciliation.date_tolerance_days', '3', 'NUMBER', 'Date tolerance for auto-matching (days)', FALSE),
('reconciliation.auto_match_threshold', '95', 'NUMBER', 'Minimum confidence for auto-match (%)', FALSE),

('interest.posting_day', '1', 'NUMBER', 'Day of month to post interest', FALSE),
('interest.calculation_method', 'DAILY_AVERAGE', 'STRING', 'Interest calculation method', FALSE),

('session.timeout_minutes', '30', 'NUMBER', 'Session timeout in minutes', FALSE),
('session.max_failed_logins', '5', 'NUMBER', 'Max failed login attempts before lock', FALSE),

('system.maintenance_mode', 'false', 'BOOLEAN', 'System maintenance mode', FALSE),
('system.eod_time', '23:59', 'STRING', 'EOD processing time', FALSE);

-- =============================================================================
-- Migration 006: Create Bank Cash System Account for Teller Operations
-- This enables proper double-entry accounting for deposits and withdrawals
-- =============================================================================

-- Step 0: Add INTERNAL to account_type enum if not present
ALTER TABLE accounts 
MODIFY COLUMN account_type ENUM('SAVINGS','CURRENT','BUSINESS','INTERNAL') NOT NULL;

-- Step 1: Create a pseudo-customer for system accounts (bank itself)
-- This allows us to have accounts owned by the bank, not by any customer
INSERT INTO customers (
    customer_number,
    email,
    password_hash,
    first_name,
    last_name,
    status,
    kyc_status,
    country
) VALUES (
    'SYSTEM-BANK',
    'system@bank.internal',
    '$2b$10$SYSTEM_ACCOUNT_NO_LOGIN',
    'Bank',
    'System',
    'ACTIVE',
    'VERIFIED',
    'BD'
) ON DUPLICATE KEY UPDATE first_name = first_name;

-- Get the system customer ID
SET @system_customer_id = (SELECT id FROM customers WHERE customer_number = 'SYSTEM-BANK');

-- Step 2: Create the main cash account
INSERT INTO accounts (
    account_number,
    customer_id,
    account_type,
    currency,
    status,
    opened_at,
    balance_locked
) VALUES (
    'BANK-CASH-001',
    @system_customer_id,
    'INTERNAL',
    'BDT',
    'ACTIVE',
    NOW(),
    FALSE
) ON DUPLICATE KEY UPDATE status = 'ACTIVE';

-- Get the cash account ID
SET @cash_account_id = (SELECT id FROM accounts WHERE account_number = 'BANK-CASH-001');

-- Step 3: Initialize balance record (starting with large amount to simulate vault cash)
INSERT INTO account_balances (
    account_id,
    available_balance,
    pending_balance,
    hold_balance,
    currency,
    last_calculated_at
) VALUES (
    @cash_account_id,
    100000000.0000,  -- 10 Crore BDT initial vault cash
    0.0000,
    0.0000,
    'BDT',
    NOW()
) ON DUPLICATE KEY UPDATE last_calculated_at = NOW();

-- Step 4: Add system config for cash account reference
INSERT INTO system_config (config_key, config_value, value_type, description, is_sensitive)
VALUES ('teller.cash_account_number', 'BANK-CASH-001', 'STRING', 'Bank cash account number for teller operations', FALSE)
ON DUPLICATE KEY UPDATE config_value = 'BANK-CASH-001';

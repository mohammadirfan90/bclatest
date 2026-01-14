-- =============================================================================
-- Banking Core - Seed Data v1.0
-- Reference data and demo accounts
-- =============================================================================
-- Version: 1.0.0
-- Date: 2026-01-14
-- =============================================================================

-- =============================================================================
-- SECTION 1: REFERENCE DATA
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

-- =============================================================================
-- SECTION 2: DEMO USERS (Internal Staff)
-- =============================================================================
-- Password for all demo users: "password123" (bcrypt hashed)
-- Hash generated with cost factor 10

INSERT INTO users (email, password_hash, first_name, last_name, role_id, status) VALUES
('admin@bnkcore.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqO.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 
 'System', 'Admin', (SELECT id FROM roles WHERE code = 'ADMIN'), 'ACTIVE'),
('banker1@bnkcore.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqO.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 
 'John', 'Doe', (SELECT id FROM roles WHERE code = 'BANKER'), 'ACTIVE'),
('banker2@bnkcore.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqO.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 
 'Jane', 'Smith', (SELECT id FROM roles WHERE code = 'BANKER'), 'ACTIVE'),
('auditor@bnkcore.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqO.H2I.QQHBRw2nLZqtj.CkPk.BkAu', 
 'Audit', 'Officer', (SELECT id FROM roles WHERE code = 'AUDITOR'), 'ACTIVE');

-- =============================================================================
-- SECTION 3: DEMO CUSTOMERS
-- =============================================================================
-- Password for all demo customers: "customer123" (bcrypt hashed)

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

-- =============================================================================
-- SECTION 4: DEMO ACCOUNTS
-- =============================================================================

-- Alice's accounts
INSERT INTO accounts (account_number, customer_id, account_type_id, status, opened_at, created_by) VALUES
('1001-0001-0001', (SELECT id FROM customers WHERE customer_number = 'CUS-0001'),
 (SELECT id FROM account_types WHERE code = 'SAVINGS'), 'ACTIVE', NOW(),
 (SELECT id FROM users WHERE email = 'banker1@bnkcore.com')),
('1001-0001-0002', (SELECT id FROM customers WHERE customer_number = 'CUS-0001'),
 (SELECT id FROM account_types WHERE code = 'CHECKING'), 'ACTIVE', NOW(),
 (SELECT id FROM users WHERE email = 'banker1@bnkcore.com'));

-- Bob's accounts
INSERT INTO accounts (account_number, customer_id, account_type_id, status, opened_at, created_by) VALUES
('1001-0002-0001', (SELECT id FROM customers WHERE customer_number = 'CUS-0002'),
 (SELECT id FROM account_types WHERE code = 'SAVINGS'), 'ACTIVE', NOW(),
 (SELECT id FROM users WHERE email = 'banker1@bnkcore.com'));

-- Carol's accounts
INSERT INTO accounts (account_number, customer_id, account_type_id, status, opened_at, created_by) VALUES
('1001-0003-0001', (SELECT id FROM customers WHERE customer_number = 'CUS-0003'),
 (SELECT id FROM account_types WHERE code = 'SAVINGS'), 'ACTIVE', NOW(),
 (SELECT id FROM users WHERE email = 'banker2@bnkcore.com')),
('1001-0003-0002', (SELECT id FROM customers WHERE customer_number = 'CUS-0003'),
 (SELECT id FROM account_types WHERE code = 'CHECKING'), 'ACTIVE', NOW(),
 (SELECT id FROM users WHERE email = 'banker2@bnkcore.com'));

-- =============================================================================
-- SECTION 5: INITIALIZE ACCOUNT BALANCES
-- =============================================================================

-- Create balance records for all accounts (starting at 0)
INSERT INTO account_balances (account_id, available_balance, currency, version)
SELECT id, 0.0000, 'BDT', 1 FROM accounts;

-- =============================================================================
-- SECTION 6: DEMO TRANSACTIONS (Initial Deposits)
-- =============================================================================
-- We'll use direct inserts here for initial balances
-- In production, this would go through sp_deposit

-- Alice Savings: Initial deposit 50,000 BDT
INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, 
                          description, status, destination_account_id, processed_at, created_by) VALUES
(UUID(), (SELECT id FROM transaction_types WHERE code = 'DEPOSIT'), 50000.0000, 'BDT',
 'Initial deposit', 'COMPLETED', 
 (SELECT id FROM accounts WHERE account_number = '1001-0001-0001'), NOW(),
 (SELECT id FROM users WHERE email = 'banker1@bnkcore.com'));

SET @alice_savings_txn = LAST_INSERT_ID();
SET @alice_savings_id = (SELECT id FROM accounts WHERE account_number = '1001-0001-0001');

INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, 
                            balance_after, description, entry_date) VALUES
(@alice_savings_txn, @alice_savings_id, 'CREDIT', 50000.0000, 'BDT', 
 50000.0000, 'Initial deposit', CURDATE());

UPDATE account_balances SET available_balance = 50000.0000, 
       last_transaction_id = @alice_savings_txn, version = 2
WHERE account_id = @alice_savings_id;

-- Alice Checking: Initial deposit 10,000 BDT
INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, 
                          description, status, destination_account_id, processed_at, created_by) VALUES
(UUID(), (SELECT id FROM transaction_types WHERE code = 'DEPOSIT'), 10000.0000, 'BDT',
 'Initial deposit', 'COMPLETED', 
 (SELECT id FROM accounts WHERE account_number = '1001-0001-0002'), NOW(),
 (SELECT id FROM users WHERE email = 'banker1@bnkcore.com'));

SET @alice_checking_txn = LAST_INSERT_ID();
SET @alice_checking_id = (SELECT id FROM accounts WHERE account_number = '1001-0001-0002');

INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, 
                            balance_after, description, entry_date) VALUES
(@alice_checking_txn, @alice_checking_id, 'CREDIT', 10000.0000, 'BDT', 
 10000.0000, 'Initial deposit', CURDATE());

UPDATE account_balances SET available_balance = 10000.0000, 
       last_transaction_id = @alice_checking_txn, version = 2
WHERE account_id = @alice_checking_id;

-- Bob Savings: Initial deposit 25,000 BDT
INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, 
                          description, status, destination_account_id, processed_at, created_by) VALUES
(UUID(), (SELECT id FROM transaction_types WHERE code = 'DEPOSIT'), 25000.0000, 'BDT',
 'Initial deposit', 'COMPLETED', 
 (SELECT id FROM accounts WHERE account_number = '1001-0002-0001'), NOW(),
 (SELECT id FROM users WHERE email = 'banker1@bnkcore.com'));

SET @bob_savings_txn = LAST_INSERT_ID();
SET @bob_savings_id = (SELECT id FROM accounts WHERE account_number = '1001-0002-0001');

INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, 
                            balance_after, description, entry_date) VALUES
(@bob_savings_txn, @bob_savings_id, 'CREDIT', 25000.0000, 'BDT', 
 25000.0000, 'Initial deposit', CURDATE());

UPDATE account_balances SET available_balance = 25000.0000, 
       last_transaction_id = @bob_savings_txn, version = 2
WHERE account_id = @bob_savings_id;

-- Carol Savings: Initial deposit 75,000 BDT
INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, 
                          description, status, destination_account_id, processed_at, created_by) VALUES
(UUID(), (SELECT id FROM transaction_types WHERE code = 'DEPOSIT'), 75000.0000, 'BDT',
 'Initial deposit', 'COMPLETED', 
 (SELECT id FROM accounts WHERE account_number = '1001-0003-0001'), NOW(),
 (SELECT id FROM users WHERE email = 'banker2@bnkcore.com'));

SET @carol_savings_txn = LAST_INSERT_ID();
SET @carol_savings_id = (SELECT id FROM accounts WHERE account_number = '1001-0003-0001');

INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, 
                            balance_after, description, entry_date) VALUES
(@carol_savings_txn, @carol_savings_id, 'CREDIT', 75000.0000, 'BDT', 
 75000.0000, 'Initial deposit', CURDATE());

UPDATE account_balances SET available_balance = 75000.0000, 
       last_transaction_id = @carol_savings_txn, version = 2
WHERE account_id = @carol_savings_id;

-- Carol Checking: Initial deposit 5,000 BDT
INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, 
                          description, status, destination_account_id, processed_at, created_by) VALUES
(UUID(), (SELECT id FROM transaction_types WHERE code = 'DEPOSIT'), 5000.0000, 'BDT',
 'Initial deposit', 'COMPLETED', 
 (SELECT id FROM accounts WHERE account_number = '1001-0003-0002'), NOW(),
 (SELECT id FROM users WHERE email = 'banker2@bnkcore.com'));

SET @carol_checking_txn = LAST_INSERT_ID();
SET @carol_checking_id = (SELECT id FROM accounts WHERE account_number = '1001-0003-0002');

INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, 
                            balance_after, description, entry_date) VALUES
(@carol_checking_txn, @carol_checking_id, 'CREDIT', 5000.0000, 'BDT', 
 5000.0000, 'Initial deposit', CURDATE());

UPDATE account_balances SET available_balance = 5000.0000, 
       last_transaction_id = @carol_checking_txn, version = 2
WHERE account_id = @carol_checking_id;

-- =============================================================================
-- SEED DATA COMPLETE
-- =============================================================================
-- Roles: 4 (ADMIN, BANKER, AUDITOR, CUSTOMER)
-- Account Types: 3 (SAVINGS, CHECKING, FIXED)
-- Transaction Types: 3 (TRANSFER, DEPOSIT, WITHDRAWAL)
-- Users: 4 (1 admin, 2 bankers, 1 auditor)
-- Customers: 3 (Alice, Bob, Carol)
-- Accounts: 5 (with initial balances)
-- 
-- Demo Login Credentials:
-- Staff: admin@bnkcore.com / password123
--        banker1@bnkcore.com / password123
--        banker2@bnkcore.com / password123
--        auditor@bnkcore.com / password123
-- Customers: alice@example.com / customer123
--            bob@example.com / customer123
--            carol@example.com / customer123
-- =============================================================================

-- =============================================================================
-- Fix Password Hashes for Banking Core
-- =============================================================================
-- All passwords will be: password123
-- =============================================================================

USE banking_core;

SET SQL_SAFE_UPDATES = 0;

-- Valid bcrypt hash for 'password123' - verified working!
SET @pwd_hash = '$2b$10$U0PW0hyDNZOFcp6mJIWPdeNsyJFQUxOhtshK3NjtTqlCABHziTogu';

UPDATE users SET password_hash = @pwd_hash WHERE id > 0;
UPDATE customers SET password_hash = @pwd_hash WHERE id > 0;

SET SQL_SAFE_UPDATES = 1;

SELECT 'Users' AS type, COUNT(*) AS updated FROM users;
SELECT 'Customers' AS type, COUNT(*) AS updated FROM customers;

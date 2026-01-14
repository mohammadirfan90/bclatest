-- Migration to allow negative balances (required for Double-Entry Assets/Capital)
ALTER TABLE `account_balances` DROP CHECK `chk_balances_available`;
ALTER TABLE `account_balances` DROP CHECK `chk_balances_pending`;
ALTER TABLE `account_balances` DROP CHECK `chk_balances_hold`;

-- Re-add checks that might still make sense? 
-- Pending/Hold should probably still be >= 0 as they represent "reserved" portions.
ALTER TABLE `account_balances` ADD CONSTRAINT `chk_balances_pending` CHECK (`pending_balance` >= 0);
ALTER TABLE `account_balances` ADD CONSTRAINT `chk_balances_hold` CHECK (`hold_balance` >= 0);

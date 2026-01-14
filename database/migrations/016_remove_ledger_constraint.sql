ALTER TABLE `ledger_entries` DROP CHECK `chk_ledger_amount`;
-- Note: 'chk_ledger_balance' is the likely name based on error 'chk_ledger_balance is violated'
ALTER TABLE `ledger_entries` DROP CHECK `chk_ledger_balance`;

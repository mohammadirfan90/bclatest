-- 014_fix_collation.sql
ALTER TABLE interest_rules CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE accrued_interest CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE system_jobs CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

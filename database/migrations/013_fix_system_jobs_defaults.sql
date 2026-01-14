-- 013_fix_system_jobs_defaults.sql
ALTER TABLE system_jobs MODIFY COLUMN scheduled_at TIMESTAMP NULL;
ALTER TABLE system_jobs MODIFY COLUMN job_type VARCHAR(50) NULL; -- Also likely problematic if strict

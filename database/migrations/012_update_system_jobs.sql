-- 012_update_system_jobs.sql
ALTER TABLE system_jobs 
ADD COLUMN metadata JSON NULL AFTER status;

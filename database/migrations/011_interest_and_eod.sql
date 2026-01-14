-- 011_interest_and_eod.sql
-- Feature 12: Interest Calculation, Monthly Posting & EOD Processing

-- =============================================================================
-- 1. Tables
-- =============================================================================

-- Interest Rules
CREATE TABLE IF NOT EXISTS interest_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    account_type ENUM('SAVINGS', 'BUSINESS') NOT NULL,
    annual_rate DECIMAL(5, 2) NOT NULL, -- e.g., 5.00 for 5%
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_interest_rules_type_date (account_type, effective_from)
) ENGINE=InnoDB;

-- Accrued Interest (Daily Log)
CREATE TABLE IF NOT EXISTS accrued_interest (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT UNSIGNED NOT NULL,
    calculation_date DATE NOT NULL,
    balance_at_eod DECIMAL(15, 2) NOT NULL,
    annual_rate_applied DECIMAL(5, 2) NOT NULL,
    interest_amount DECIMAL(15, 6) NOT NULL,
    is_posted BOOLEAN DEFAULT FALSE,
    posted_at TIMESTAMP NULL,
    ledger_entry_id BIGINT UNSIGNED NULL, -- Linked transaction ID when posted
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_accrual_daily (account_id, calculation_date),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
) ENGINE=InnoDB;

-- System Jobs (Audit & Tracking)
CREATE TABLE IF NOT EXISTS system_jobs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    job_name VARCHAR(100) NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    status ENUM('RUNNING', 'COMPLETED', 'FAILED') NOT NULL,
    metadata JSON NULL,
    error_message TEXT NULL,
    INDEX idx_system_jobs_name (job_name),
    INDEX idx_system_jobs_created (started_at)
) ENGINE=InnoDB;

-- =============================================================================
-- 2. System Entities Seed
-- =============================================================================

-- 2.1 System User
INSERT INTO users (email, password_hash, role_id, status, first_name, last_name)
SELECT 'system@bnkcore.internal', 
       'DISABLED', 
       (SELECT id FROM roles WHERE code = 'ADMIN' LIMIT 1),
       'ACTIVE',
       'System',
       'Internal'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'system@bnkcore.internal');

-- 2.2 System Customer
INSERT INTO customers (user_id, first_name, last_name, email, phone, kyc_status, customer_number, status)
SELECT 
    (SELECT id FROM users WHERE email = 'system@bnkcore.internal'),
    'System',
    'Internal',
    'system@bnkcore.internal',
    '+00000000000',
    'VERIFIED',
    'SYS-INTERNAL',
    'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE email = 'system@bnkcore.internal');

-- 2.3 System Account (Expense)
INSERT INTO accounts (customer_id, account_number, account_type, currency, status)
SELECT 
    (SELECT id FROM customers WHERE email = 'system@bnkcore.internal'),
    'INT-EXPENSE-001',
    'BUSINESS',
    'BDT',
    'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_number = 'INT-EXPENSE-001');

-- 2.4 System Account Balance
INSERT INTO account_balances (account_id, available_balance, pending_balance, hold_balance, currency, version)
SELECT 
    (SELECT id FROM accounts WHERE account_number = 'INT-EXPENSE-001'),
    0.00, 0.00, 0.00, 'BDT', 1
WHERE NOT EXISTS (
    SELECT 1 FROM account_balances 
    WHERE account_id = (SELECT id FROM accounts WHERE account_number = 'INT-EXPENSE-001')
);

-- =============================================================================
-- 3. Stored Procedures
-- =============================================================================

DELIMITER //

-- -----------------------------------------------------------------------------
-- SP: Calculate Daily Interest
-- -----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_calculate_daily_interest //
CREATE PROCEDURE sp_calculate_daily_interest(
    IN p_calculation_date DATE,
    OUT p_affected_rows INT
)
BEGIN
    DECLARE v_job_id BIGINT;
    DECLARE v_today DATE;
    
    SET v_today = IFNULL(p_calculation_date, CURRENT_DATE());
    SET p_affected_rows = 0;

    -- Track Job Start
    INSERT INTO system_jobs (job_name, status, metadata) 
    VALUES ('DAILY_INTEREST_CALC', 'RUNNING', JSON_OBJECT('calculation_date', v_today));
    SET v_job_id = LAST_INSERT_ID();

    START TRANSACTION;

    BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
            ROLLBACK;
            UPDATE system_jobs 
            SET status = 'FAILED', error_message = 'SQL Exception', completed_at = NOW() 
            WHERE id = v_job_id;
            RESIGNAL;
        END;

        -- Bulk Insert Accruals
        INSERT INTO accrued_interest (account_id, calculation_date, balance_at_eod, annual_rate_applied, interest_amount)
        SELECT 
            a.id,
            v_today,
            ab.available_balance,
            r.annual_rate,
            (ab.available_balance * (r.annual_rate / 100) / 365) -- Simple Day Count
        FROM accounts a
        JOIN account_balances ab ON a.id = ab.account_id
        JOIN interest_rules r ON a.account_type = r.account_type
        WHERE a.status = 'ACTIVE' 
          AND ab.available_balance > 0
          AND v_today >= r.effective_from 
          AND (r.effective_to IS NULL OR v_today <= r.effective_to)
          AND NOT EXISTS (
              SELECT 1 FROM accrued_interest ai 
              WHERE ai.account_id = a.id AND ai.calculation_date = v_today
          );
        
        SET p_affected_rows = ROW_COUNT();

        COMMIT;

        -- Track Job Completion
        UPDATE system_jobs 
        SET status = 'COMPLETED', 
            completed_at = NOW(),
            metadata = JSON_MERGE_PATCH(metadata, JSON_OBJECT('processed_accounts', p_affected_rows))
        WHERE id = v_job_id;
    END;
END //

-- -----------------------------------------------------------------------------
-- SP: Post Monthly Interest
-- -----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_post_monthly_interest //
CREATE PROCEDURE sp_post_monthly_interest(
    IN p_posting_date DATE,
    OUT p_total_posted DECIMAL(15,2),
    OUT p_processed_accounts INT
)
BEGIN
    DECLARE v_job_id BIGINT;
    DECLARE v_month_start DATE;
    DECLARE v_month_end DATE;
    DECLARE v_expense_account_id BIGINT UNSIGNED;
    DECLARE v_system_user_id BIGINT UNSIGNED;
    DECLARE done INT DEFAULT 0;
    
    -- Cursors
    DECLARE v_account_id BIGINT UNSIGNED;
    DECLARE v_total_interest DECIMAL(15,2); 
    DECLARE v_tx_id VARCHAR(36);
    DECLARE v_tx_status VARCHAR(20);
    DECLARE v_tx_msg VARCHAR(255);
    
    DECLARE cur_interest CURSOR FOR 
        SELECT 
            account_id, 
            SUM(interest_amount) 
        FROM accrued_interest 
        WHERE is_posted = FALSE 
          AND calculation_date BETWEEN v_month_start AND v_month_end
        GROUP BY account_id
        HAVING SUM(interest_amount) >= 0.01;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    SET v_month_start = DATE_FORMAT(p_posting_date, '%Y-%m-01');
    SET v_month_end = LAST_DAY(p_posting_date);

    -- Get Expense Account & System User
    SELECT id INTO v_expense_account_id FROM accounts WHERE account_number = 'INT-EXPENSE-001' LIMIT 1;
    SELECT id INTO v_system_user_id FROM users WHERE email = 'system@bnkcore.internal' LIMIT 1;
    
    IF v_expense_account_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bank Interest Expense Account Not Found';
    END IF;

    INSERT INTO system_jobs (job_name, status, metadata) 
    VALUES ('MONTHLY_INTEREST_POSTING', 'RUNNING', JSON_OBJECT('period', DATE_FORMAT(v_month_start, '%Y-%m')));
    SET v_job_id = LAST_INSERT_ID();

    SET p_total_posted = 0;
    SET p_processed_accounts = 0;

    OPEN cur_interest;

    read_loop: LOOP
        FETCH cur_interest INTO v_account_id, v_total_interest;
        IF done THEN
            LEAVE read_loop;
        END IF;

        -- Call sp_transfer for Atomic Ledger Update
        -- Note: sp_transfer handles its own Start Transaction/Commit
        CALL sp_transfer(
            v_expense_account_id,
            v_account_id,
            v_total_interest,
            CONCAT('Interest Payout - ', DATE_FORMAT(v_month_start, '%b %Y')),
            CONCAT('INT-', v_account_id, '-', DATE_FORMAT(v_month_start, '%Y%m')), -- Idempotency Key
            v_system_user_id,
            v_tx_id,
            v_tx_status,
            v_tx_msg
        );

        IF v_tx_status = 'COMPLETED' THEN
            -- Mark Accruals as Posted
            UPDATE accrued_interest 
            SET is_posted = TRUE, posted_at = NOW(), ledger_entry_id = NULL -- We don't have numeric ID easily returned by sp_transfer (returns UUID)
            WHERE account_id = v_account_id 
              AND calculation_date BETWEEN v_month_start AND v_month_end
              AND is_posted = FALSE;
              
            SET p_total_posted = p_total_posted + v_total_interest;
            SET p_processed_accounts = p_processed_accounts + 1;
        ELSE
            -- Log failure but continue? Or fail job?
            -- For batch jobs, usually logging and continuing is better, 
            -- but let's accumulate errors in metadata later if needed.
            ITERATE read_loop;
        END IF;

    END LOOP;

    CLOSE cur_interest;

    UPDATE system_jobs 
    SET status = 'COMPLETED', 
        completed_at = NOW(),
        metadata = JSON_MERGE_PATCH(metadata, JSON_OBJECT('total_posted', p_total_posted, 'accounts', p_processed_accounts))
    WHERE id = v_job_id;

END //


-- -----------------------------------------------------------------------------
-- SP: EOD Process Orchestrator
-- -----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_eod_process //
CREATE PROCEDURE sp_eod_process(
    IN p_run_date DATE
)
BEGIN
    DECLARE v_job_id BIGINT;
    DECLARE v_dummy INT;
    DECLARE v_date DATE;

    SET v_date = IFNULL(p_run_date, CURRENT_DATE());

    INSERT INTO system_jobs (job_name, status, metadata) 
    VALUES ('EOD_PROCESS', 'RUNNING', JSON_OBJECT('run_date', v_date));
    SET v_job_id = LAST_INSERT_ID();

    BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
            ROLLBACK;
            UPDATE system_jobs 
            SET status = 'FAILED', error_message = 'EOD Process Failed', completed_at = NOW() 
            WHERE id = v_job_id;
            RESIGNAL;
        END;

        -- 1. Daily Interest Calculation
        CALL sp_calculate_daily_interest(v_date, v_dummy);

        UPDATE system_jobs 
        SET status = 'COMPLETED', completed_at = NOW() 
        WHERE id = v_job_id;
    END;
END //

DELIMITER ;

-- =============================================================================
-- 4. Initial Global Seed Data
-- =============================================================================

INSERT INTO interest_rules (account_type, annual_rate, effective_from)
SELECT 'SAVINGS', 3.50, CURRENT_DATE()
WHERE NOT EXISTS (SELECT 1 FROM interest_rules WHERE account_type = 'SAVINGS');

INSERT INTO interest_rules (account_type, annual_rate, effective_from)
SELECT 'BUSINESS', 1.50, CURRENT_DATE()
WHERE NOT EXISTS (SELECT 1 FROM interest_rules WHERE account_type = 'BUSINESS');

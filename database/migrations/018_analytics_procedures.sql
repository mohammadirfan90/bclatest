-- =============================================================================
-- Migration: 018_analytics_procedures.sql
-- Feature 15: Analytics, Reporting & Materialized Aggregates
-- 
-- Creates stored procedures for generating monthly aggregates and rebuilding
-- analytics tables from the ledger (source of truth).
-- =============================================================================

DELIMITER //

-- =============================================================================
-- PROCEDURE: sp_generate_monthly_aggregates
-- Generates monthly summaries from daily totals for all accounts
-- Should be run at month-end after EOD processing completes
-- =============================================================================

DROP PROCEDURE IF EXISTS sp_generate_monthly_aggregates//

CREATE PROCEDURE sp_generate_monthly_aggregates(
    IN p_year INT,
    IN p_month INT,
    IN p_user_id BIGINT UNSIGNED,
    OUT p_accounts_processed INT,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(500)
)
BEGIN
    DECLARE v_done INT DEFAULT FALSE;
    DECLARE v_account_id BIGINT UNSIGNED;
    DECLARE v_opening_balance DECIMAL(19,4);
    DECLARE v_closing_balance DECIMAL(19,4);
    DECLARE v_total_debits DECIMAL(19,4);
    DECLARE v_total_credits DECIMAL(19,4);
    DECLARE v_debit_count INT;
    DECLARE v_credit_count INT;
    DECLARE v_avg_daily_balance DECIMAL(19,4);
    DECLARE v_days_in_month INT;
    DECLARE v_first_day DATE;
    DECLARE v_last_day DATE;
    DECLARE v_job_id BIGINT UNSIGNED;
    DECLARE v_start_time TIMESTAMP;
    
    -- Cursor for all accounts with activity in the month
    DECLARE account_cursor CURSOR FOR
        SELECT DISTINCT a.id
        FROM accounts a
        LEFT JOIN daily_account_totals dat ON dat.account_id = a.id
            AND YEAR(dat.date) = p_year AND MONTH(dat.date) = p_month
        WHERE a.status IN ('ACTIVE', 'FROZEN', 'DORMANT');
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
    
    -- Initialize
    SET v_start_time = NOW();
    SET p_accounts_processed = 0;
    SET p_status = 'PROCESSING';
    SET p_message = '';
    
    -- Calculate month boundaries
    SET v_first_day = MAKEDATE(p_year, 1) + INTERVAL (p_month - 1) MONTH;
    SET v_last_day = LAST_DAY(v_first_day);
    SET v_days_in_month = DAY(v_last_day);
    
    -- Create job record
    INSERT INTO system_jobs (
        job_name,
        job_type,
        status,
        scheduled_at,
        started_at,
        created_by
    ) VALUES (
        CONCAT('Monthly Aggregates - ', p_year, '-', LPAD(p_month, 2, '0')),
        'REPORT',
        'RUNNING',
        NOW(),
        NOW(),
        p_user_id
    );
    
    SET v_job_id = LAST_INSERT_ID();
    
    OPEN account_cursor;
    
    aggregate_loop: LOOP
        FETCH account_cursor INTO v_account_id;
        
        IF v_done THEN
            LEAVE aggregate_loop;
        END IF;
        
        -- Get opening balance (previous month's closing or from account_balances)
        SELECT COALESCE(
            (SELECT closing_balance FROM monthly_account_summaries 
             WHERE account_id = v_account_id 
             AND (year = p_year AND month = p_month - 1)
             OR (year = p_year - 1 AND month = 12 AND p_month = 1)),
            (SELECT closing_balance FROM daily_account_totals
             WHERE account_id = v_account_id
             AND date < v_first_day
             ORDER BY date DESC LIMIT 1),
            0
        ) INTO v_opening_balance;
        
        -- Aggregate from daily totals
        SELECT 
            COALESCE(SUM(total_debits), 0),
            COALESCE(SUM(total_credits), 0),
            COALESCE(SUM(debit_count), 0),
            COALESCE(SUM(credit_count), 0),
            COALESCE(
                (SELECT closing_balance FROM daily_account_totals
                 WHERE account_id = v_account_id
                 AND YEAR(date) = p_year AND MONTH(date) = p_month
                 ORDER BY date DESC LIMIT 1),
                v_opening_balance + COALESCE(SUM(total_credits), 0) - COALESCE(SUM(total_debits), 0)
            )
        INTO v_total_debits, v_total_credits, v_debit_count, v_credit_count, v_closing_balance
        FROM daily_account_totals
        WHERE account_id = v_account_id
        AND YEAR(date) = p_year AND MONTH(date) = p_month;
        
        -- Calculate average daily balance
        SELECT COALESCE(AVG(closing_balance), v_opening_balance)
        INTO v_avg_daily_balance
        FROM daily_account_totals
        WHERE account_id = v_account_id
        AND YEAR(date) = p_year AND MONTH(date) = p_month;
        
        -- Insert or update monthly summary
        INSERT INTO monthly_account_summaries (
            account_id,
            year,
            month,
            opening_balance,
            closing_balance,
            total_debits,
            total_credits,
            debit_count,
            credit_count,
            avg_daily_balance
        ) VALUES (
            v_account_id,
            p_year,
            p_month,
            COALESCE(v_opening_balance, 0),
            COALESCE(v_closing_balance, 0),
            v_total_debits,
            v_total_credits,
            v_debit_count,
            v_credit_count,
            COALESCE(v_avg_daily_balance, 0)
        )
        ON DUPLICATE KEY UPDATE
            opening_balance = COALESCE(v_opening_balance, 0),
            closing_balance = COALESCE(v_closing_balance, 0),
            total_debits = v_total_debits,
            total_credits = v_total_credits,
            debit_count = v_debit_count,
            credit_count = v_credit_count,
            avg_daily_balance = COALESCE(v_avg_daily_balance, 0),
            updated_at = NOW();
        
        SET p_accounts_processed = p_accounts_processed + 1;
    END LOOP;
    
    CLOSE account_cursor;
    
    -- Generate top accounts rankings
    -- Highest Balance
    DELETE FROM top_accounts_monthly 
    WHERE year = p_year AND month = p_month AND category = 'HIGHEST_BALANCE';
    
    INSERT INTO top_accounts_monthly (year, month, category, rank_position, account_id, metric_value)
    SELECT p_year, p_month, 'HIGHEST_BALANCE', 
           ROW_NUMBER() OVER (ORDER BY closing_balance DESC),
           account_id, closing_balance
    FROM monthly_account_summaries
    WHERE year = p_year AND month = p_month
    ORDER BY closing_balance DESC
    LIMIT 10;
    
    -- Most Transactions
    DELETE FROM top_accounts_monthly 
    WHERE year = p_year AND month = p_month AND category = 'MOST_TRANSACTIONS';
    
    INSERT INTO top_accounts_monthly (year, month, category, rank_position, account_id, metric_value)
    SELECT p_year, p_month, 'MOST_TRANSACTIONS', 
           ROW_NUMBER() OVER (ORDER BY (debit_count + credit_count) DESC),
           account_id, (debit_count + credit_count)
    FROM monthly_account_summaries
    WHERE year = p_year AND month = p_month
    ORDER BY (debit_count + credit_count) DESC
    LIMIT 10;
    
    -- Highest Volume
    DELETE FROM top_accounts_monthly 
    WHERE year = p_year AND month = p_month AND category = 'HIGHEST_VOLUME';
    
    INSERT INTO top_accounts_monthly (year, month, category, rank_position, account_id, metric_value)
    SELECT p_year, p_month, 'HIGHEST_VOLUME', 
           ROW_NUMBER() OVER (ORDER BY (total_debits + total_credits) DESC),
           account_id, (total_debits + total_credits)
    FROM monthly_account_summaries
    WHERE year = p_year AND month = p_month
    ORDER BY (total_debits + total_credits) DESC
    LIMIT 10;
    
    -- Update job record
    UPDATE system_jobs
    SET status = 'COMPLETED',
        completed_at = NOW(),
        duration_ms = TIMESTAMPDIFF(MICROSECOND, v_start_time, NOW()) / 1000,
        result = JSON_OBJECT(
            'accounts_processed', p_accounts_processed,
            'year', p_year,
            'month', p_month
        )
    WHERE id = v_job_id;
    
    SET p_status = 'COMPLETED';
    SET p_message = CONCAT('Monthly aggregates generated: ', p_accounts_processed, ' accounts for ', p_year, '-', LPAD(p_month, 2, '0'));
END//


-- =============================================================================
-- PROCEDURE: sp_rebuild_analytics
-- Full rebuild of all analytics tables from ledger (source of truth)
-- Admin-only, runs for extended periods on large datasets
-- =============================================================================

DROP PROCEDURE IF EXISTS sp_rebuild_analytics//

CREATE PROCEDURE sp_rebuild_analytics(
    IN p_user_id BIGINT UNSIGNED,
    OUT p_daily_rows INT,
    OUT p_monthly_rows INT,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(500)
)
BEGIN
    DECLARE v_done INT DEFAULT FALSE;
    DECLARE v_account_id BIGINT UNSIGNED;
    DECLARE v_date DATE;
    DECLARE v_opening_balance DECIMAL(19,4);
    DECLARE v_closing_balance DECIMAL(19,4);
    DECLARE v_total_debits DECIMAL(19,4);
    DECLARE v_total_credits DECIMAL(19,4);
    DECLARE v_debit_count INT;
    DECLARE v_credit_count INT;
    DECLARE v_job_id BIGINT UNSIGNED;
    DECLARE v_start_time TIMESTAMP;
    DECLARE v_min_date DATE;
    DECLARE v_max_date DATE;
    
    -- Initialize
    SET v_start_time = NOW();
    SET p_daily_rows = 0;
    SET p_monthly_rows = 0;
    SET p_status = 'PROCESSING';
    SET p_message = '';
    
    -- Create job record
    INSERT INTO system_jobs (
        job_name,
        job_type,
        status,
        scheduled_at,
        started_at,
        created_by
    ) VALUES (
        CONCAT('Analytics Rebuild - ', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s')),
        'REPORT',
        'RUNNING',
        NOW(),
        NOW(),
        p_user_id
    );
    
    SET v_job_id = LAST_INSERT_ID();
    
    -- Get date range from ledger
    SELECT MIN(entry_date), MAX(entry_date)
    INTO v_min_date, v_max_date
    FROM ledger_entries;
    
    IF v_min_date IS NULL THEN
        SET p_status = 'COMPLETED';
        SET p_message = 'No ledger entries found - nothing to rebuild';
        
        UPDATE system_jobs
        SET status = 'COMPLETED',
            completed_at = NOW(),
            result = JSON_OBJECT('message', 'No data to process')
        WHERE id = v_job_id;
        
    ELSE
        -- Clear existing analytics data
        TRUNCATE TABLE top_accounts_monthly;
        TRUNCATE TABLE monthly_account_summaries;
        TRUNCATE TABLE daily_account_totals;
        
        -- Rebuild daily totals directly from ledger
        INSERT INTO daily_account_totals (
            account_id,
            date,
            opening_balance,
            closing_balance,
            total_debits,
            total_credits,
            debit_count,
            credit_count
        )
        SELECT 
            le.account_id,
            le.entry_date,
            0, -- Opening balance calculated in next step
            SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE -le.amount END) OVER (
                PARTITION BY le.account_id 
                ORDER BY le.entry_date 
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ),
            SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END),
            SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END),
            SUM(CASE WHEN le.entry_type = 'DEBIT' THEN 1 ELSE 0 END),
            SUM(CASE WHEN le.entry_type = 'CREDIT' THEN 1 ELSE 0 END)
        FROM ledger_entries le
        GROUP BY le.account_id, le.entry_date
        ORDER BY le.account_id, le.entry_date;
        
        SET p_daily_rows = ROW_COUNT();
        
        -- Update opening balances
        UPDATE daily_account_totals dat
        SET opening_balance = COALESCE(
            (SELECT closing_balance 
             FROM daily_account_totals dat2 
             WHERE dat2.account_id = dat.account_id 
             AND dat2.date = DATE_SUB(dat.date, INTERVAL 1 DAY)),
            0
        );
        
        -- Rebuild monthly summaries
        INSERT INTO monthly_account_summaries (
            account_id,
            year,
            month,
            opening_balance,
            closing_balance,
            total_debits,
            total_credits,
            debit_count,
            credit_count,
            avg_daily_balance
        )
        SELECT 
            account_id,
            YEAR(date),
            MONTH(date),
            (SELECT opening_balance FROM daily_account_totals d2 
             WHERE d2.account_id = daily_account_totals.account_id 
             AND YEAR(d2.date) = YEAR(daily_account_totals.date)
             AND MONTH(d2.date) = MONTH(daily_account_totals.date)
             ORDER BY d2.date ASC LIMIT 1),
            (SELECT closing_balance FROM daily_account_totals d3 
             WHERE d3.account_id = daily_account_totals.account_id 
             AND YEAR(d3.date) = YEAR(daily_account_totals.date)
             AND MONTH(d3.date) = MONTH(daily_account_totals.date)
             ORDER BY d3.date DESC LIMIT 1),
            SUM(total_debits),
            SUM(total_credits),
            SUM(debit_count),
            SUM(credit_count),
            AVG(closing_balance)
        FROM daily_account_totals
        GROUP BY account_id, YEAR(date), MONTH(date);
        
        SET p_monthly_rows = ROW_COUNT();
        
        -- Regenerate top accounts for each month
        INSERT INTO top_accounts_monthly (year, month, category, rank_position, account_id, metric_value)
        SELECT year, month, 'HIGHEST_BALANCE', 
               ROW_NUMBER() OVER (PARTITION BY year, month ORDER BY closing_balance DESC),
               account_id, closing_balance
        FROM monthly_account_summaries
        WHERE ROW_NUMBER() OVER (PARTITION BY year, month ORDER BY closing_balance DESC) <= 10;
        
        INSERT INTO top_accounts_monthly (year, month, category, rank_position, account_id, metric_value)
        SELECT year, month, 'MOST_TRANSACTIONS', 
               ROW_NUMBER() OVER (PARTITION BY year, month ORDER BY (debit_count + credit_count) DESC),
               account_id, (debit_count + credit_count)
        FROM monthly_account_summaries
        WHERE ROW_NUMBER() OVER (PARTITION BY year, month ORDER BY (debit_count + credit_count) DESC) <= 10;
        
        INSERT INTO top_accounts_monthly (year, month, category, rank_position, account_id, metric_value)
        SELECT year, month, 'HIGHEST_VOLUME', 
               ROW_NUMBER() OVER (PARTITION BY year, month ORDER BY (total_debits + total_credits) DESC),
               account_id, (total_debits + total_credits)
        FROM monthly_account_summaries
        WHERE ROW_NUMBER() OVER (PARTITION BY year, month ORDER BY (total_debits + total_credits) DESC) <= 10;
        
        -- Update job record
        UPDATE system_jobs
        SET status = 'COMPLETED',
            completed_at = NOW(),
            duration_ms = TIMESTAMPDIFF(MICROSECOND, v_start_time, NOW()) / 1000,
            result = JSON_OBJECT(
                'daily_rows', p_daily_rows,
                'monthly_rows', p_monthly_rows,
                'date_range', CONCAT(v_min_date, ' to ', v_max_date)
            )
        WHERE id = v_job_id;
        
        SET p_status = 'COMPLETED';
        SET p_message = CONCAT('Analytics rebuilt: ', p_daily_rows, ' daily rows, ', p_monthly_rows, ' monthly rows');
    END IF;
END//


DELIMITER ;

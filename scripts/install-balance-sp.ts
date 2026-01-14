/**
 * Install balance rebuild stored procedure
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mysql from 'mysql2/promise';

const getSSLConfig = () => {
    if (process.env.DATABASE_SSL !== 'true') return undefined;
    const certPath = path.join(process.cwd(), 'cert', 'DigiCertGlobalRootCA.crt');
    try {
        if (fs.existsSync(certPath)) {
            return { ca: fs.readFileSync(certPath), rejectUnauthorized: false };
        }
    } catch { /* ignore */ }
    return { rejectUnauthorized: false };
};

const dbConfig = {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'bnkcore',
    ssl: getSSLConfig(),
    multipleStatements: true,
};

async function main() {
    console.log('Installing sp_refresh_account_balances...');

    const conn = await mysql.createConnection(dbConfig);

    try {
        // Drop existing
        await conn.query('DROP PROCEDURE IF EXISTS sp_refresh_account_balances');

        // Create procedure
        const sql = `
CREATE PROCEDURE sp_refresh_account_balances(
    IN p_admin_user_id BIGINT UNSIGNED,
    OUT p_accounts_refreshed INT UNSIGNED,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(500)
)
BEGIN
    DECLARE v_start_time DATETIME;
    DECLARE v_account_count INT UNSIGNED DEFAULT 0;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = 'Balance refresh failed due to a database error';
        SET p_accounts_refreshed = 0;
    END;
    
    SET v_start_time = NOW();
    SET p_accounts_refreshed = 0;
    SET p_status = 'PENDING';
    SET p_message = '';
    
    START TRANSACTION;
    
    INSERT INTO events (event_type, aggregate_type, aggregate_id, payload) VALUES (
        'BALANCE_REBUILD_STARTED', 'SYSTEM', COALESCE(p_admin_user_id, 0),
        JSON_OBJECT('initiated_by', p_admin_user_id, 'started_at', v_start_time)
    );
    
    UPDATE account_balances
    SET available_balance = 0, pending_balance = 0, hold_balance = 0,
        last_transaction_id = NULL, last_calculated_at = NOW(), version = version + 1;
    
    UPDATE account_balances ab
    INNER JOIN (
        SELECT account_id,
            SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) -
            SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) AS computed_balance,
            MAX(transaction_id) AS last_txn_id
        FROM ledger_entries GROUP BY account_id
    ) AS computed ON ab.account_id = computed.account_id
    SET ab.available_balance = computed.computed_balance,
        ab.last_transaction_id = computed.last_txn_id,
        ab.last_calculated_at = NOW(), ab.version = ab.version + 1;
    
    SELECT COUNT(*) INTO v_account_count FROM account_balances;
    
    INSERT INTO events (event_type, aggregate_type, aggregate_id, payload) VALUES (
        'BALANCE_REBUILD_COMPLETED', 'SYSTEM', COALESCE(p_admin_user_id, 0),
        JSON_OBJECT('initiated_by', p_admin_user_id, 'accounts_refreshed', v_account_count, 'completed_at', NOW())
    );
    
    COMMIT;
    
    SET p_accounts_refreshed = v_account_count;
    SET p_status = 'COMPLETED';
    SET p_message = CONCAT('Successfully refreshed ', v_account_count, ' account balances');
END`;

        await conn.query(sql);
        console.log('✅ sp_refresh_account_balances installed successfully');

        // Verify both procedures exist
        const [procs] = await conn.query<mysql.RowDataPacket[]>(`
            SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES 
            WHERE ROUTINE_SCHEMA = ? AND ROUTINE_NAME IN ('sp_refresh_account_balances', 'sp_check_balance_consistency')
        `, [process.env.DATABASE_NAME]);

        console.log('Installed procedures:', procs.map(p => p.ROUTINE_NAME).join(', '));

    } catch (error) {
        console.error('Failed to install procedure:', error);
        throw error;
    } finally {
        await conn.end();
    }
}

main();

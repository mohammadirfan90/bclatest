/**
 * Debug script - test balance rebuild
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import mysql, { RowDataPacket } from 'mysql2/promise';

const getSSLConfig = () => {
    if (process.env.DATABASE_SSL !== 'true') return undefined;
    const certPath = path.join(process.cwd(), 'cert', 'DigiCertGlobalRootCA.crt');
    try { if (fs.existsSync(certPath)) return { ca: fs.readFileSync(certPath), rejectUnauthorized: false }; } catch { }
    return { rejectUnauthorized: false };
};

const dbConfig = {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl: getSSLConfig()
};

async function main() {
    const conn = await mysql.createConnection(dbConfig);

    console.log('=== BEFORE REBUILD ===');
    const [before] = await conn.query<RowDataPacket[]>(`
        SELECT ab.account_id, a.account_number, 
               ab.available_balance AS materialized, 
               COALESCE(c.computed, 0) AS computed,
               ab.available_balance - COALESCE(c.computed, 0) AS diff
        FROM account_balances ab 
        JOIN accounts a ON ab.account_id = a.id 
        LEFT JOIN (
            SELECT account_id, 
                   SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) - 
                   SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) AS computed 
            FROM ledger_entries GROUP BY account_id
        ) c ON ab.account_id = c.account_id`);

    console.log('Account balances:');
    for (const row of before) {
        const status = Math.abs(row.diff) < 0.01 ? '✓' : '✗';
        console.log(`  ${status} ${row.account_number}: materialized=${row.materialized}, computed=${row.computed}, diff=${row.diff}`);
    }

    console.log('\n=== RUNNING REBUILD ===');
    await conn.query('CALL sp_refresh_account_balances(1, @cnt, @status, @msg)');
    const [result] = await conn.query<RowDataPacket[]>('SELECT @cnt as cnt, @status as status, @msg as msg');
    console.log(`Result: ${result[0].status} - ${result[0].msg} (${result[0].cnt} accounts)`);

    console.log('\n=== AFTER REBUILD ===');
    const [after] = await conn.query<RowDataPacket[]>(`
        SELECT ab.account_id, a.account_number, 
               ab.available_balance AS materialized, 
               COALESCE(c.computed, 0) AS computed,
               ab.available_balance - COALESCE(c.computed, 0) AS diff
        FROM account_balances ab 
        JOIN accounts a ON ab.account_id = a.id 
        LEFT JOIN (
            SELECT account_id, 
                   SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) - 
                   SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) AS computed 
            FROM ledger_entries GROUP BY account_id
        ) c ON ab.account_id = c.account_id`);

    console.log('Account balances:');
    let allConsistent = true;
    for (const row of after) {
        const status = Math.abs(row.diff) < 0.01 ? '✓' : '✗';
        if (Math.abs(row.diff) >= 0.01) allConsistent = false;
        console.log(`  ${status} ${row.account_number}: materialized=${row.materialized}, computed=${row.computed}, diff=${row.diff}`);
    }

    console.log('\n' + (allConsistent ? '✅ ALL BALANCES CONSISTENT' : '❌ SOME BALANCES INCONSISTENT'));

    await conn.end();
}
main();

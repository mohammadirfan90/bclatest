/**
 * Quick check for unbalanced ledger entries
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

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.DATABASE_HOST,
        port: parseInt(process.env.DATABASE_PORT || '3306'),
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        ssl: getSSLConfig()
    });

    console.log('=== Checking for unbalanced transactions ===\n');

    // Find unbalanced transactions
    const [rows] = await conn.query<any[]>(`
        SELECT transaction_id, 
               SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) as total_debits,
               SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) as total_credits,
               COUNT(*) as entry_count
        FROM ledger_entries
        GROUP BY transaction_id
        HAVING ABS(total_debits - total_credits) > 0.01
    `);

    console.log(`Found ${rows.length} unbalanced transaction(s)\n`);

    for (const row of rows) {
        console.log(`Transaction ID: ${row.transaction_id}`);
        console.log(`  Debits: ${row.total_debits}, Credits: ${row.total_credits}, Entries: ${row.entry_count}`);

        // Get transaction details
        const [txn] = await conn.query<any[]>('SELECT * FROM transactions WHERE id = ?', [row.transaction_id]);
        if (txn.length > 0) {
            console.log(`  Type: ${txn[0].transaction_type_id}, Description: ${txn[0].description}`);
            console.log(`  Created: ${txn[0].created_at}`);
        }

        // Get ledger entries
        const [entries] = await conn.query<any[]>('SELECT * FROM ledger_entries WHERE transaction_id = ?', [row.transaction_id]);
        console.log('  Entries:');
        for (const e of entries) {
            console.log(`    - ${e.entry_type}: ${e.amount} on account ${e.account_id}`);
        }
        console.log('');
    }

    // Summary
    const [total] = await conn.query<any[]>('SELECT COUNT(DISTINCT transaction_id) as count FROM ledger_entries');
    console.log(`Total transactions in ledger: ${total[0].count}`);
    console.log(`Unbalanced: ${rows.length}`);
    console.log(`Balanced: ${total[0].count - rows.length}`);

    await conn.end();
}

main();

/**
 * Migration Script: Apply migration 006 - Teller Cash Accounts
 * Creates system bank customer and BANK-CASH-001 account for double-entry
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
    console.log('=== Running Migration 006: Teller Cash Accounts ===');

    const conn = await mysql.createConnection(dbConfig);

    try {
        // Read the migration SQL
        const sqlPath = path.join(process.cwd(), 'database', 'migrations', '006_teller_cash_accounts.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Execute the migration
        await conn.query(sql);
        console.log('✅ Migration 006 applied successfully');

        // Verify the account was created
        const [accounts] = await conn.query<any[]>(
            `SELECT a.account_number, a.status, ab.available_balance, c.customer_number
             FROM accounts a
             JOIN customers c ON a.customer_id = c.id
             LEFT JOIN account_balances ab ON a.id = ab.account_id
             WHERE a.account_number = 'BANK-CASH-001'`
        );

        if (accounts.length > 0) {
            console.log('\n📋 Bank Cash Account Details:');
            console.log(`   Account Number: ${accounts[0].account_number}`);
            console.log(`   Owner: ${accounts[0].customer_number}`);
            console.log(`   Status: ${accounts[0].status}`);
            console.log(`   Balance: ৳${parseFloat(accounts[0].available_balance).toLocaleString()}`);
        }

    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        await conn.end();
    }
}

main();

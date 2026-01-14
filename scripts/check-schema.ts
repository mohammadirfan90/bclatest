/**
 * Debug Script: Check accounts table schema
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

    console.log('=== Checking accounts table schema ===');

    // Check account_type column definition
    const [cols] = await conn.query<any[]>('SHOW COLUMNS FROM accounts WHERE Field = "account_type"');
    console.log('account_type column:', JSON.stringify(cols[0], null, 2));

    // Check existing account types used
    const [types] = await conn.query<any[]>('SELECT DISTINCT account_type FROM accounts');
    console.log('Existing account types:', types.map(t => t.account_type));

    // Check existing accounts
    const [accounts] = await conn.query<any[]>('SELECT id, account_number, customer_id, account_type, status FROM accounts LIMIT 10');
    console.log('Existing accounts:', accounts);

    await conn.end();
}

main();

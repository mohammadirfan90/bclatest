/**
 * Verify KYC Applications Table
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

    try {
        console.log('Checking kyc_applications table schema...');
        const [columns] = await conn.query('SHOW COLUMNS FROM kyc_applications');
        console.log('Columns:', JSON.stringify(columns, null, 2));

        console.log('\nChecking reference data...');
        const [rows] = await conn.query('SELECT COUNT(*) as count FROM kyc_applications');
        console.log('Total records:', (rows as any)[0].count);
    } catch (e: any) {
        console.error('❌ Error:', e.message);
    }

    await conn.end();
}

main();


import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

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

async function cleanup() {
    const conn = await mysql.createConnection({
        host: process.env.DATABASE_HOST,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        ssl: getSSLConfig()
    });

    console.log('Finding unbalanced transactions...');

    const [rows] = await conn.query(`
    SELECT transaction_id
    FROM ledger_entries 
    GROUP BY transaction_id 
    HAVING ABS(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) - 
               SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END)) > 0.01
  `);

    const results = rows as any[];

    if (results.length > 0) {
        const ids = results.map(r => r.transaction_id);
        console.log(`Found ${ids.length} unbalanced transactions: ${ids.join(', ')}`);

        console.log('Deleting associated ledger entries...');
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        await conn.query(`DELETE FROM ledger_entries WHERE transaction_id IN (${ids.join(',')})`);

        console.log('Deleting transactions...');
        await conn.query(`DELETE FROM transactions WHERE id IN (${ids.join(',')})`);
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');

        console.log('Cleanup complete.');
    } else {
        console.log('No unbalanced transactions found.');
    }

    await conn.end();
}
cleanup();

/**
 * Migration script to install balance rebuild stored procedures
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
    console.log('Installing balance rebuild stored procedures...');

    const connection = await mysql.createConnection(dbConfig);

    try {
        const sqlPath = path.join(process.cwd(), 'database', 'migrations', '005_balance_rebuild.sql');
        const sql = fs.readFileSync(sqlPath, 'utf-8');

        // Split by DELIMITER and execute each block
        const blocks = sql.split('DELIMITER //');

        for (const block of blocks) {
            if (block.trim().startsWith('--') || block.trim() === '') continue;

            const parts = block.split('DELIMITER ;');
            for (const part of parts) {
                const cleaned = part.replace(/\/\//g, ';').trim();
                if (cleaned && !cleaned.startsWith('--')) {
                    // Execute each statement separately
                    const statements = cleaned.split(/(?<=END);/);
                    for (const stmt of statements) {
                        const trimmed = stmt.trim();
                        if (trimmed && trimmed.length > 10) {
                            try {
                                await connection.query(trimmed);
                                console.log('  ✓ Executed statement');
                            } catch (err: unknown) {
                                const error = err as Error;
                                // Ignore certain expected errors
                                if (!error.message.includes('already exists')) {
                                    console.error('  ✗ Error:', error.message.substring(0, 100));
                                }
                            }
                        }
                    }
                }
            }
        }

        console.log('✅ Balance rebuild procedures installed successfully');

        // Verify procedures exist
        const [procs] = await connection.query<mysql.RowDataPacket[]>(
            `SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES 
             WHERE ROUTINE_SCHEMA = ? AND ROUTINE_NAME IN ('sp_refresh_account_balances', 'sp_check_balance_consistency')`,
            [process.env.DATABASE_NAME || 'bnkcore']
        );

        console.log('Installed procedures:', procs.map(p => p.ROUTINE_NAME).join(', '));

    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    } finally {
        await connection.end();
    }
}

main().catch(console.error);

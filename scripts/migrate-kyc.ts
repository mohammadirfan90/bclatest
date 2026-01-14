import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function runMigration() {
    const config = {
        host: process.env.DATABASE_HOST,
        port: parseInt(process.env.DATABASE_PORT || '3306'),
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        multipleStatements: true,
        ...(process.env.DATABASE_SSL === 'true' && {
            ssl: {
                rejectUnauthorized: true,
            },
        }),
    };

    console.log(`Connecting to ${config.host}...`);

    try {
        const connection = await mysql.createConnection(config);
        console.log('Connected to database.');

        // Check if migration already ran (optional check, but good for idempotency)
        // For now, we trust the SQL file has IF NOT EXISTS or we handle errors manually.
        // The previous run might have partially succeeded or failed completely.

        const migrationPath = path.join(process.cwd(), 'database', 'migrations', '001_kyc_onboarding.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Running migration...');
        await connection.query(sql);
        console.log('Migration completed successfully.');
        await connection.end();
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runMigration();

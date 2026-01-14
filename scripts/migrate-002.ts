import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { query, execute, closePool } from '../src/lib/db';
import fs from 'fs';
import path from 'path';

async function runMigration() {
    console.log('Running migration: 002_account_approval_workflow');

    const migrationPath = path.join(process.cwd(), 'database/migrations/002_account_approval_workflow.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    // Split by commands (simple split by semicolon for this specific file structure which avoids internal semicolons in these CREATE/ALTERs hopefully)
    // Actually, better to run the whole thing if the driver supports multiple statements or split carefully.
    // The mysql2 driver doesn't support multiple statements by default unless configured.
    // I will enable multipleStatements=true in db.ts temporarily or just existing config?
    // Let's check db.ts... it doesn't explicitly set multipleStatements: true.
    // So I should split. The file uses prepared statements which is tricky with simple split.

    // Alternative: Read file and execute commands one by one, handling the delimiter?
    // The provided SQL has prepared statements for safe drop.

    // Let's just execute the raw SQL and see if the current connection allows it. 
    // If not, I will update db.ts or use a specific connection config here.

    try {
        // The current db.ts might not allow multiple statements. 
        // I will create a temporary connection here with multipleStatements: true to be safe and simple.
        const mysql = await import('mysql2/promise');
        const connection = await mysql.createConnection({
            host: process.env.DATABASE_HOST || 'localhost',
            port: parseInt(process.env.DATABASE_PORT || '3306'),
            user: process.env.DATABASE_USER || 'root',
            password: process.env.DATABASE_PASSWORD || '',
            database: process.env.DATABASE_NAME || 'bnkcore',
            multipleStatements: true,
            // SSL configuration for Azure
            ...(process.env.DATABASE_SSL === 'true' && {
                ssl: {
                    rejectUnauthorized: true,
                },
            }),
        });

        console.log('Connected to database.');

        await connection.query(migrationSql);

        console.log('Migration executed successfully.');
        await connection.end();

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runMigration();

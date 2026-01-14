
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { RowDataPacket } from 'mysql2';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function runMigration() {
    console.log('🔌 Connecting to database...');

    // Create connection
    const connection = await mysql.createConnection({
        host: process.env.DATABASE_HOST,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME || 'banking_core',
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    });

    try {
        console.log('✅ Connected.');

        // 1. Check/Add token_version
        console.log('checking token_version...');
        const [tokenCols] = await connection.query<RowDataPacket[]>(
            `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'token_version'`
        );

        if (tokenCols.length === 0) {
            console.log('  -> Adding token_version column...');
            await connection.query(`ALTER TABLE customers ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER risk_score`);
            console.log('  -> Done.');
        } else {
            console.log('  -> token_version already exists.');
        }

        // 2. Check/Add onboarding_status
        console.log('checking onboarding_status...');
        const [onboardCols] = await connection.query<RowDataPacket[]>(
            `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'onboarding_status'`
        );

        if (onboardCols.length === 0) {
            console.log('  -> Adding onboarding_status column...');
            await connection.query(`ALTER TABLE customers ADD COLUMN onboarding_status ENUM('PENDING_SIGNUP', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED') NOT NULL DEFAULT 'PENDING_SIGNUP' AFTER kyc_status`);
            console.log('  -> Done.');
        } else {
            console.log('  -> onboarding_status already exists.');
        }

        // 3. Update password_hash to be nullable
        console.log('updating password_hash to be nullable...');
        await connection.query(`ALTER TABLE customers MODIFY COLUMN password_hash VARCHAR(255) NULL`);
        console.log('  -> Done.');

        console.log('✅ Schema fix applied successfully.');

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await connection.end();
    }
}

runMigration();

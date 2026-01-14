import dotenv from 'dotenv';
import path from 'path';

// Load environment variables FIRST
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { execute } from '../src/lib/db';

async function migrate() {
    console.log('Starting migration: 001-add-token-version...');

    try {
        // Add token_version to users table
        console.log('Adding token_version to users table...');
        try {
            await execute(`
                ALTER TABLE users 
                ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 1 
                AFTER password_changed_at
            `);
            console.log('✅ Added token_version to users table');
        } catch (error: any) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('⚠️ users.token_version already exists');
            } else {
                throw error;
            }
        }

        // Add token_version to customers table
        console.log('Adding token_version to customers table...');
        try {
            await execute(`
                ALTER TABLE customers 
                ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 1 
                AFTER risk_score
            `);
            console.log('✅ Added token_version to customers table');
        } catch (error: any) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('⚠️ customers.token_version already exists');
            } else {
                throw error;
            }
        }

        console.log('✅ Migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();

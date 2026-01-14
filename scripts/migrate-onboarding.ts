
import { execute } from '../src/lib/db';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables FIRST
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function migrate() {
    console.log('Starting migration: 002-strict-onboarding...');

    try {
        // 1. Create customer_signup_tokens table
        console.log('Creating customer_signup_tokens table...');
        await execute(`
            CREATE TABLE IF NOT EXISTS customer_signup_tokens (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                token_hash VARCHAR(255) NOT NULL,
                customer_id BIGINT UNSIGNED NOT NULL,
                account_id BIGINT UNSIGNED NOT NULL,
                created_by BIGINT UNSIGNED NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                used_at TIMESTAMP NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uk_signup_token (token_hash),
                KEY idx_signup_customer (customer_id),
                CONSTRAINT fk_signup_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
                CONSTRAINT fk_signup_account FOREIGN KEY (account_id) REFERENCES accounts(id),
                CONSTRAINT fk_signup_creator FOREIGN KEY (created_by) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('✅ Created customer_signup_tokens table');

        // 2. Modify customers table - Make password_hash nullable
        console.log('Modifying customers table (password_hash)...');
        try {
            await execute(`
                ALTER TABLE customers 
                MODIFY COLUMN password_hash VARCHAR(255) NULL
            `);
            console.log('✅ Modified password_hash to be nullable');
        } catch (error) {
            console.log('⚠️ Error modifying password_hash (might be already null):', error);
        }

        // 3. Modify customers table - Add onboarding_status
        console.log('Modifying customers table (onboarding_status)...');
        try {
            await execute(`
                ALTER TABLE customers 
                ADD COLUMN onboarding_status ENUM('PENDING_SIGNUP', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED') NOT NULL DEFAULT 'PENDING_SIGNUP' 
                AFTER token_version
            `);
            console.log('✅ Added onboarding_status column');
        } catch (error: any) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('⚠️ customers.onboarding_status already exists');
            } else {
                throw error;
            }
        }

        // 4. Update existing customers to ACTIVE if they have a password
        console.log('Updating existing customers...');
        await execute(`
            UPDATE customers 
            SET onboarding_status = 'ACTIVE' 
            WHERE password_hash IS NOT NULL AND onboarding_status = 'PENDING_SIGNUP'
        `);
        console.log('✅ Updated existing customers to ACTIVE');

        console.log('✅ Migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();

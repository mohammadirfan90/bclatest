/**
 * Script to create missing ledger_entries table and related tables
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mysql from 'mysql2/promise';

const dbConfig = {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'bnkcore',
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    multipleStatements: true,
};

async function main() {
    const conn = await mysql.createConnection(dbConfig);
    console.log('Connected to database.');

    try {
        // Check what tables exist
        const [tables] = await conn.query(`SHOW TABLES`);
        console.log('Existing tables:', tables);

        // Create ledger_entries table if not exists
        console.log('Creating ledger_entries table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS ledger_entries (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                transaction_id BIGINT UNSIGNED NOT NULL,
                account_id BIGINT UNSIGNED NOT NULL,
                entry_type ENUM('DEBIT', 'CREDIT') NOT NULL,
                amount DECIMAL(19,4) NOT NULL,
                currency CHAR(3) NOT NULL DEFAULT 'BDT',
                balance_after DECIMAL(19,4) NOT NULL,
                description VARCHAR(500) NULL,
                entry_date DATE NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_ledger_transaction (transaction_id),
                KEY idx_ledger_account (account_id),
                KEY idx_ledger_date (entry_date),
                KEY idx_ledger_account_date (account_id, entry_date),
                CONSTRAINT fk_ledger_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id),
                CONSTRAINT fk_ledger_account FOREIGN KEY (account_id) REFERENCES accounts(id),
                CONSTRAINT chk_ledger_currency CHECK (currency = 'BDT'),
                CONSTRAINT chk_ledger_amount CHECK (amount > 0),
                CONSTRAINT chk_ledger_balance CHECK (balance_after >= 0)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('ledger_entries table created.');

        // Create events table if not exists
        console.log('Creating events table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS events (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                event_type VARCHAR(100) NOT NULL,
                aggregate_type VARCHAR(50) NOT NULL,
                aggregate_id BIGINT UNSIGNED NOT NULL,
                payload JSON NOT NULL,
                metadata JSON NULL,
                version INT UNSIGNED NOT NULL DEFAULT 1,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                processed_at TIMESTAMP NULL,
                PRIMARY KEY (id),
                KEY idx_events_type (event_type),
                KEY idx_events_aggregate (aggregate_type, aggregate_id),
                KEY idx_events_created (created_at),
                KEY idx_events_processed (processed_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('events table created.');

        // Create idempotency_keys table if not exists
        console.log('Creating idempotency_keys table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS idempotency_keys (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                idempotency_key VARCHAR(64) NOT NULL,
                request_hash VARCHAR(64) NOT NULL,
                response_status INT NOT NULL,
                response_body JSON NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY uk_idempotency_key (idempotency_key),
                KEY idx_idempotency_expires (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('idempotency_keys table created.');

        console.log('All missing tables created successfully.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await conn.end();
    }
}

main();

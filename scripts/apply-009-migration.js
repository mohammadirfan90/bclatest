"use strict";
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.local' });

// Load SSL certificate for Azure MySQL
const getSSLConfig = () => {
    if (process.env.DATABASE_SSL !== 'true') return undefined;

    const certPath = path.join(process.cwd(), 'cert', 'DigiCertGlobalRootCA.crt');
    try {
        if (fs.existsSync(certPath)) {
            return {
                ca: fs.readFileSync(certPath),
                rejectUnauthorized: false,
            };
        }
    } catch {
        console.warn('[DB] SSL certificate not found, using default SSL config');
    }
    return { rejectUnauthorized: false };
};

async function runMigration() {
    const connection = await mysql.createConnection({
        host: process.env.DATABASE_HOST || 'localhost',
        port: parseInt(process.env.DATABASE_PORT || '3306'),
        user: process.env.DATABASE_USER || 'root',
        password: process.env.DATABASE_PASSWORD || '',
        database: process.env.DATABASE_NAME || 'bnkcore',
        ssl: getSSLConfig(),
        multipleStatements: true
    });

    try {
        const migrationPath = path.join(__dirname, '../database/migrations/009_reconciliation_engine.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Applying migration 009_reconciliation_engine.sql...');
        await connection.query(sql);
        console.log('Migration applied successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await connection.end();
    }
}

runMigration();

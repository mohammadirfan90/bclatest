const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function run() {
    console.log('🔄 Applying Migration 016...');
    const connection = await mysql.createConnection({
        host: process.env.DATABASE_HOST,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        ssl: { rejectUnauthorized: false },
        multipleStatements: true
    });

    try {
        const sql = fs.readFileSync(path.join(__dirname, '../database/migrations/016_remove_ledger_constraint.sql'), 'utf8');
        await connection.query(sql);
        console.log('✅ Migration 016 Applied.');
    } catch (error) {
        // Ignore if constraint doesn't exist (failed drop)
        console.error('Migration Note:', error.message);
    } finally {
        await connection.end();
    }
}

run();

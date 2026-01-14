const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function run() {
    console.log('🔄 Debug Withdrawal...');
    const connection = await mysql.createConnection({
        host: process.env.DATABASE_HOST,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        ssl: { rejectUnauthorized: false },
        multipleStatements: true
    });

    try {
        // Install SP
        const sql = fs.readFileSync(path.join(__dirname, '../database/migrations/debug_withdraw.sql'), 'utf8');
        await connection.query(sql);
        console.log('SP Created.');

        // Get Account
        const [rows] = await connection.query("SELECT id FROM accounts WHERE status='ACTIVE' LIMIT 1");
        const accId = rows[0].id;
        console.log('Testing with Account:', accId);

        // Call SP
        await connection.query('CALL sp_debug_withdraw(?, 10, "Debug Test", 1, NULL, @tx, @st, @msg)', [accId]);
        console.log('CALL Success!');

    } catch (error) {
        console.error('❌ CALL FAILED:', error.message);
        console.error('Code:', error.code);
        console.error('SqlState:', error.sqlState);
    } finally {
        await connection.end();
    }
}

run();

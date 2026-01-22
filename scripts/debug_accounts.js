
const mysql = require('mysql2/promise');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
    const config = {
        host: process.env.DATABASE_HOST,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        port: process.env.DATABASE_PORT || 3306,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    };

    let connection;
    try {
        connection = await mysql.createConnection(config);
        console.log('✅ Connected.');

        console.log('\n--- USERS ---');
        const [users] = await connection.query("SELECT id, email, first_name, last_name FROM users");
        console.table(users);

        console.log('\n--- ACCOUNTS ---');
        const [accounts] = await connection.query(`
            SELECT a.id, a.account_number, a.status, a.currency, 
                   ab.available_balance, 
                   CONCAT(u.first_name, ' ', u.last_name) as owner
            FROM accounts a
            JOIN account_balances ab ON a.id = ab.account_id
            JOIN customers c ON a.customer_id = c.id
            LEFT JOIN users u ON c.email = u.email -- heuristic join
        `);
        console.table(accounts);

    } catch (err) {
        console.error('💥 Error:', err);
    } finally {
        if (connection) await connection.end();
    }
}

main();

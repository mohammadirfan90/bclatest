
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

        console.log("Searching for 'Robart' in customers...");
        const [customers] = await connection.query("SELECT * FROM customers WHERE first_name LIKE '%Robart%' OR last_name LIKE '%Robart%' OR email LIKE '%robart%'");
        console.table(customers);

        if (customers.length > 0) {
            const customerId = customers[0].id;
            console.log(`\nChecking accounts for Customer ID ${customerId}...`);
            const [accounts] = await connection.query("SELECT * FROM accounts WHERE customer_id = ?", [customerId]);
            console.table(accounts);
        } else {
            console.log("❌ Robart not found in customers.");
            
            console.log("Searching for 'Robart' in users...");
            const [users] = await connection.query("SELECT * FROM users WHERE first_name LIKE '%Robart%' OR last_name LIKE '%Robart%' OR email LIKE '%robart%'");
            console.table(users);
        }

    } catch (err) {
        console.error('💥 Error:', err);
    } finally {
        if (connection) await connection.end();
    }
}

main();


const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
const dotenv = require('dotenv');

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
    console.log('🔌 Connecting to database...');
    const config = {
        host: process.env.DATABASE_HOST,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        port: process.env.DATABASE_PORT || 3306,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    };

    const connection = await mysql.createConnection(config);

    try {
        const email = 'alice@example.com';
        const password = 'customer123';

        console.log(`🔍 Checking customer: ${email}`);
        const [rows] = await connection.query('SELECT * FROM customers WHERE email = ?', [email]);

        if (rows.length === 0) {
            console.log('❌ Customer not found!');
            return;
        }

        const customer = rows[0];
        console.log(`✅ Customer found. Status: ${customer.status}, Hash: ${customer.password_hash.substring(0, 20)}...`);

        const match = await bcrypt.compare(password, customer.password_hash);

        if (match) {
            console.log('✅ Password "customer123" is CORRECT.');
        } else {
            console.log('❌ Password "customer123" is INCORRECT.');
            const correct = await bcrypt.hash(password, 10);
            console.log(`💡 Correct hash should be: ${correct}`);
        }

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await connection.end();
    }
}

main();

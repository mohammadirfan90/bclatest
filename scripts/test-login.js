
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
const dotenv = require('dotenv');

// Load env
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

    console.log(`🔌 Connecting to database...`);
    const connection = await mysql.createConnection(config);

    try {
        const email = 'banker1@bnkcore.com';
        const password = 'password123';

        console.log(`🔍 Checking user: ${email}`);
        const [rows] = await connection.query('SELECT * FROM users WHERE email = ?', [email]);

        if (rows.length === 0) {
            console.log('❌ User not found!');
            return;
        }

        const user = rows[0];
        console.log(`✅ User found. Hash: ${user.password_hash.substring(0, 20)}...`);

        const match = await bcrypt.compare(password, user.password_hash);

        if (match) {
            console.log('✅ Password "password123" is CORRECT.');
        } else {
            console.log('❌ Password "password123" is INCORRECT.');
            // Generate valid hash
            const newHash = await bcrypt.hash(password, 10);
            console.log(`💡 Valid hash for "password123" should be: ${newHash}`);
        }

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await connection.end();
    }
}

main();

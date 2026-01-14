const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function run() {
    console.log('🔄 Debug SP...');
    const connection = await mysql.createConnection({
        host: process.env.DATABASE_HOST,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const [rows] = await connection.query("SHOW CREATE PROCEDURE sp_teller_deposit");
        console.log(rows[0]['Create Procedure']);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await connection.end();
    }
}

run();

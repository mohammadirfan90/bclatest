import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testProfile() {
    const c = await mysql.createConnection({
        host: process.env.DATABASE_HOST,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        port: parseInt(process.env.DATABASE_PORT || '3306'),
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    });

    console.log('=== TESTING CUSTOMER PROFILE DATA ===\n');

    // Get customer ID 1 (Alice)
    const [rows] = await c.query(
        `SELECT id, first_name, last_name, email, phone, 
                national_id, date_of_birth, address_line1, address_line2, 
                city, postal_code, kyc_status, status
         FROM customers 
         WHERE id = 1`
    );

    console.log('Customer data in database:');
    console.log(JSON.stringify(rows, null, 2));

    await c.end();
}

testProfile().catch(console.error);

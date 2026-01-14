import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const config = {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'bnkcore',
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
};

async function createDummyCustomer() {
    console.log('Connecting to database...');
    const connection = await mysql.createConnection(config);

    try {
        const timestamp = Date.now();
        const email = `customer_${timestamp}@demo.local`;
        const password = 'Customer@123';
        const passwordHash = await bcrypt.hash(password, 12);
        const customerNumber = `C${timestamp.toString().slice(-10)}`;
        const phone = `+880${timestamp.toString().slice(-9)}`; // Dummy phone

        // Create customer
        const [result] = await connection.query(
            `INSERT INTO customers (customer_number, email, password_hash, first_name, last_name, phone, status, kyc_status)
             VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 'VERIFIED')`,
            [customerNumber, email, passwordHash, 'Dummy', 'User', phone]
        ) as [mysql.ResultSetHeader, unknown];

        const customerId = result.insertId;
        const accountNumber = `A${timestamp.toString().slice(-12)}`;

        // Create account
        const [accountResult] = await connection.query(
            `INSERT INTO accounts (account_number, customer_id, account_type, currency, status, opened_at, balance_locked)
             VALUES (?, ?, 'SAVINGS', 'BDT', 'ACTIVE', NOW(), FALSE)`,
            [accountNumber, customerId]
        ) as [mysql.ResultSetHeader, unknown];

        const accountId = accountResult.insertId;

        // Initialize balance
        await connection.query(
            `INSERT INTO account_balances (account_id, available_balance, currency)
             VALUES (?, ?, 'BDT')`,
            [accountId, 50000]
        );

        console.log(JSON.stringify({
            email,
            password,
            customerNumber,
            accountNumber
        }, null, 2));

    } catch (error) {
        console.error('❌ Failed to create customer:', error);
    } finally {
        await connection.end();
    }
}

createDummyCustomer();
